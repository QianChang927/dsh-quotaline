/**
 * dsh-quotaline — Host half.
 *
 * Serves the balance/quota data for the strip and the settings page through
 * same-origin webServer routes. Credentials are read through the DSH
 * `credentials` service (read-only) and never cross to the browser.
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PACKAGE_VERSION = '0.3.0'
const API = '/dsh-quotaline/api/'
const SETTINGS_VERSION = 1
const CACHE_MS = 30_000
const MAX_BODY_BYTES = 512 * 1024
const DEFAULT_TIMEOUT_MS = 10_000
const ACTIVITY_MAX_CLIENTS = 8
const ACTIVITY_HEARTBEAT_MS = 25_000
const TICK_COALESCE_MS = 1_000

export const inject = [
  'webServer',
  'credentials',
  'llm',
  'settings',
  'deepseekAccount',
  'agentDefaultModel',
]

/** Built-in templates. User settings override a template by provider id. */
export const BUILTIN_TEMPLATES = [
  {
    id: 'deepseek-account',
    label: 'DeepSeek Account',
    kind: 'account',
    providerIds: ['deepseek-account'],
    baseURLPatterns: [],
    auth: { type: 'none', credentialRefs: [] },
    extract: { items: [] },
    experimental: false,
  },
  {
    id: 'deepseek-official',
    label: 'DeepSeek API',
    kind: 'http',
    providerIds: ['deepseek-official', 'deepseek-*'],
    baseURLPatterns: ['*deepseek.com*'],
    defaultBaseURL: 'https://api.deepseek.com',
    request: { method: 'GET', url: '{baseURL}/user/balance', headers: {}, body: null },
    auth: { type: 'bearer', credentialRefs: ['DEEPSEEK_API_KEY'] },
    extract: {
      items: [
        {
          label: 'Balance',
          amountPath: 'balance_infos[*].total_balance',
          currencyPath: 'balance_infos[*].currency',
        },
      ],
    },
    experimental: false,
  },
  {
    id: 'moonshot',
    label: 'Moonshot / Kimi',
    kind: 'http',
    providerIds: ['moonshot', 'moonshot-*', 'kimi', 'kimi-*'],
    baseURLPatterns: ['*moonshot*'],
    defaultBaseURL: 'https://api.moonshot.cn',
    request: { method: 'GET', url: '{baseURL}/v1/users/me/balance', headers: {}, body: null },
    auth: { type: 'bearer', credentialRefs: ['MOONSHOT_API_KEY'] },
    extract: {
      items: [
        {
          label: 'Balance',
          amountPath: 'data.available_balance',
          currency: 'CNY',
        },
      ],
    },
    experimental: false,
  },
  {
    id: 'kimi-coding',
    label: 'Kimi Code',
    kind: 'http',
    providerIds: ['kimi', 'kimi-code', 'kimi-coding', 'kimi-code-*'],
    baseURLPatterns: ['*api.kimi.com*', '*kimi.com/coding*'],
    defaultBaseURL: 'https://api.kimi.com/coding',
    request: { method: 'GET', url: '{baseURL}/v1/usages', headers: {}, body: null },
    auth: { type: 'bearer', credentialRefs: ['KIMI_CODE_API_KEY', 'KIMI_API_KEY'] },
    extract: { items: [] },
    parser: 'kimi',
    experimental: false,
  },
  {
    id: 'zhipu',
    label: 'Zhipu GLM',
    kind: 'http',
    providerIds: ['zhipu', 'glm', 'bigmodel', 'zhipu-*'],
    baseURLPatterns: ['*bigmodel.cn*', '*zhipu*'],
    defaultBaseURL: 'https://open.bigmodel.cn',
    request: { method: 'GET', url: '{baseURL}/api/paas/v4/balance', headers: {}, body: null },
    auth: { type: 'bearer', credentialRefs: ['ZHIPU_API_KEY'] },
    extract: {
      items: [
        {
          label: 'Balance',
          amountPath: 'data.balance',
          currency: 'CNY',
        },
      ],
    },
    experimental: true,
  },
  {
    id: 'glm-coding',
    label: 'GLM Coding Plan',
    kind: 'http',
    providerIds: ['glm-coding', 'zhipu-coding', 'bigmodel-coding', 'glm-*'],
    baseURLPatterns: ['*anthropic*', '*coding*'],
    defaultBaseURL: 'https://open.bigmodel.cn',
    request: { method: 'GET', url: '{origin}/api/monitor/usage/quota/limit', headers: {}, body: null },
    auth: { type: 'bearer', credentialRefs: ['ZHIPU_API_KEY', 'GLM_API_KEY'] },
    extract: { items: [] },
    parser: 'glm',
    experimental: true,
  },
]

/** Resolve the settings file path without any hard-coded OS path. */
export function settingsPath(env = {}, homeDir = homedir()) {
  const dshHome =
    typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim() !== ''
      ? env.DSH_HOME
      : join(homeDir, '.dsh')
  return join(dshHome, 'dsh-quotaline', 'settings.json')
}

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    refreshSeconds: 60,
    language: 'auto',
    limitMode: 'used',
    liveRefresh: true,
    enabled: true,
    providers: {},
  }
}

export class QuotaError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'QuotaError'
    this.code = code
    Object.assign(this, extra)
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRefreshSeconds(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 60
  return Math.min(3600, Math.max(10, Math.round(n)))
}

function globToRegExp(pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

function matchAny(text, patterns) {
  if (!text) return 0
  let best = 0
  for (const pattern of patterns || []) {
    if (typeof pattern !== 'string' || pattern === '') continue
    const regex = globToRegExp(pattern)
    if (!regex.test(text)) continue
    best = Math.max(best, pattern.includes('*') ? 1 : 2)
  }
  return best
}

/**
 * Rank every matching template. User templates win over built-ins at equal
 * specificity; more specific matches rank first so the caller can fall back.
 */
export function matchTemplates({ provider, baseURL, builtins = BUILTIN_TEMPLATES, custom = {} }) {
  const candidates = []
  for (const template of builtins) {
    candidates.push({ template, source: 'builtin' })
  }
  for (const [id, entry] of Object.entries(custom || {})) {
    if (!entry || entry.enabled === false || !isPlainObject(entry.template)) continue
    candidates.push({
      template: { ...entry.template, id: entry.template.id || id, kind: 'http' },
      source: 'custom',
    })
  }
  const scored = []
  for (const candidate of candidates) {
    const t = candidate.template
    const providerIds = Array.isArray(t.match?.providerIds) ? t.match.providerIds : t.providerIds || []
    const baseURLPatterns = Array.isArray(t.match?.baseURLPatterns)
      ? t.match.baseURLPatterns
      : t.baseURLPatterns || []
    const providerScore = matchAny(provider, providerIds)
    const baseScore = matchAny(baseURL, baseURLPatterns)
    let score = providerScore * 2 + baseScore
    if (provider && providerIds.includes(provider)) score += 2
    if (score === 0) continue
    score += candidate.source === 'custom' ? 3 : 0
    scored.push({ ...candidate, score })
  }
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    if (left.source !== right.source) return left.source === 'custom' ? -1 : 1
    return 0
  })
  return scored
}

/** Choose the best template for a provider. Returns `{ template, source }` or null. */
export function matchTemplate(args) {
  const [winner] = matchTemplates(args)
  return winner ? { template: winner.template, source: winner.source } : null
}

function tokenizePath(path) {
  if (typeof path !== 'string' || path.trim() === '') return []
  const tokens = []
  for (const part of path.split('.')) {
    const match = /^([^[\]]+)(?:\[(\*|\d+)\])?$/.exec(part.trim())
    if (!match) return null
    tokens.push({ key: match[1], index: match[2] === undefined ? undefined : match[2] })
  }
  return tokens
}

function walkPath(node, tokens) {
  if (tokens.length === 0) return [node]
  const [token, ...rest] = tokens
  if (node === null || typeof node !== 'object') return []
  const value = Array.isArray(node) ? node[token.key] : node[token.key]
  if (token.index === undefined) return walkPath(value, rest)
  if (token.index === '*') {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => walkPath(item, rest))
  }
  const index = Number(token.index)
  if (!Array.isArray(value)) return []
  return walkPath(value[index], rest)
}

/** Flatten a payload through a path, expanding `[*]` into multiple values. */
export function pathValues(payload, path) {
  const tokens = tokenizePath(path)
  if (tokens === null) return []
  return walkPath(payload, tokens)
}

const KIMI_USAGE_LABELS = {
  limit_5h: '5h',
  limit_7d: 'Weekly',
  limit_week: 'Weekly',
  limit_weekly: 'Weekly',
  limit_month: 'Monthly',
  limit_month_total: 'Monthly',
  limit_month_code: 'Monthly code',
}

function humanizeKey(key) {
  return String(key)
    .replace(/^limit_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

/** Label a Kimi rate window such as `{duration: 300, timeUnit: 'TIME_UNIT_MINUTE'}`. */
function windowLabel(window) {
  const duration = Number(window?.duration)
  const unit = String(window?.timeUnit || '').toUpperCase()
  if (!Number.isFinite(duration) || duration <= 0) return 'Rate'
  if (unit.includes('MINUTE')) {
    const minutes = Math.round(duration)
    if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`
    return `${minutes}m`
  }
  if (unit.includes('HOUR')) return `${Math.round(duration)}h`
  if (unit.includes('SECOND')) return `${Math.round(duration)}s`
  return `${Math.round(duration)}`
}

function toPercent(value, { ratio = false } = {}) {
  if (value === undefined || value === null || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const percent = ratio ? numeric * 100 : numeric
  return Math.min(100, Math.max(0, Math.round(percent * 100) / 100))
}

function percentItem(label, value, options = {}) {
  const percent = toPercent(value, options)
  if (percent === null) return null
  return { label, percent }
}

/**
 * Kimi Code `/coding/v1/usages` — both response generations:
 * legacy (`limits[]` + top-level `usage` + `boosterWallet`) and plan-ratio
 * (`usages.limit_5h / limit_7d / limit_month_total / limit_month_code`).
 */
export function kimiQuotaItems(payload) {
  const items = []
  const seen = new Set()
  const push = (label, value, options) => {
    const key = String(label || '').trim().toLowerCase()
    if (!key || seen.has(key)) return
    const item = percentItem(label, value, options)
    if (!item) return
    seen.add(key)
    items.push(item)
  }

  if (isPlainObject(payload?.usages)) {
    for (const [key, entry] of Object.entries(payload.usages)) {
      if (!isPlainObject(entry)) continue
      push(KIMI_USAGE_LABELS[key] || humanizeKey(key), entry.used_ratio, { ratio: true })
    }
  }

  const blocks = Array.isArray(payload?.limits)
    ? payload.limits
    : isPlainObject(payload?.limits)
      ? [payload.limits]
      : []
  for (const block of blocks) {
    if (!isPlainObject(block)) continue
    const detail = isPlainObject(block.detail) ? block.detail : {}
    const label =
      (typeof block.scope === 'string' && block.scope.trim()) ||
      (typeof block.window === 'string' && block.window.trim()) ||
      windowLabel(block.window)
    const used = block.used ?? detail.used
    const limit = block.limit ?? detail.limit
    const remaining = block.remaining ?? detail.remaining
    if (limit == null || Number(limit) <= 0) continue
    if (used != null) push(label, (Number(used) / Number(limit)) * 100)
    else if (remaining != null) push(label, (1 - Number(remaining) / Number(limit)) * 100)
  }

  if (isPlainObject(payload?.usage)) {
    const detail = isPlainObject(payload.usage.detail) ? payload.usage.detail : payload.usage
    if (detail.limit != null && Number(detail.limit) > 0) {
      if (detail.used != null) push('Weekly', (Number(detail.used) / Number(detail.limit)) * 100)
      else if (detail.remaining != null) {
        push('Weekly', (1 - Number(detail.remaining) / Number(detail.limit)) * 100)
      }
    }
  }

  if (isPlainObject(payload?.boosterWallet)) {
    const wallet = payload.boosterWallet
    if (wallet.monthlyChargeLimit != null && Number(wallet.monthlyChargeLimit) > 0 && wallet.monthlyUsed != null) {
      push('Monthly', (Number(wallet.monthlyUsed) / Number(wallet.monthlyChargeLimit)) * 100)
    }
  }

  return items
}

/**
 * GLM Coding Plan `/api/monitor/usage/quota/limit`. `data.limits[]` entries use
 * `unit`/`number` (3 = hours → the rolling 5h window, 6 = weeks → weekly) and
 * `percentage`; `TIME_LIMIT` rows are the monthly counter.
 */
export function glmQuotaItems(payload) {
  const items = []
  const seen = new Set()
  const push = (label, value) => {
    const key = String(label || '').trim().toLowerCase()
    if (!key || seen.has(key)) return
    const item = percentItem(label, value)
    if (!item) return
    seen.add(key)
    items.push(item)
  }

  const limits = payload?.data?.limits ?? payload?.limits
  const list = Array.isArray(limits) ? limits : isPlainObject(limits) ? [limits] : []
  for (const entry of list) {
    if (!isPlainObject(entry)) continue
    const type = String(entry.type || '').toUpperCase()
    const unit = Number(entry.unit)
    const number = Number(entry.number)
    let label
    if (type === 'TIME_LIMIT') label = 'Monthly'
    else if (unit === 3) label = number > 0 ? `${number}h` : '5h'
    else if (unit === 6) label = 'Weekly'
    else label = humanizeKey(type || 'Limit')

    let percent = entry.percentage
    if (percent == null && entry.limit != null && Number(entry.limit) > 0 && entry.used != null) {
      percent = (Number(entry.used) / Number(entry.limit)) * 100
    }
    push(label, percent)
  }

  return items
}

/**
 * Extract display items from a JSON payload using a template's extract block.
 * `amountPath` may expand to several values; a `currencyPath` with the same
 * number of expansions is paired by index.
 */
export function extractItems(payload, template) {
  if (template?.parser === 'kimi') return kimiQuotaItems(payload)
  if (template?.parser === 'glm') return glmQuotaItems(payload)
  const items = []
  const specs = template?.extract?.items
  if (!Array.isArray(specs)) return items
  for (const spec of specs) {
    if (!isPlainObject(spec) || typeof spec.amountPath !== 'string') continue
    const amounts = pathValues(payload, spec.amountPath)
    const currencies = typeof spec.currencyPath === 'string'
      ? pathValues(payload, spec.currencyPath)
      : []
    amounts.forEach((amount, index) => {
      if (amount === undefined || amount === null) return
      if (typeof amount === 'object') return
      const currency =
        currencies.length === amounts.length
          ? currencies[index]
          : spec.currency
      items.push({
        label: typeof spec.label === 'string' && spec.label !== '' ? spec.label : 'Balance',
        amount: String(amount),
        currency: typeof currency === 'string' && currency !== '' ? currency : undefined,
      })
    })
  }
  return items
}

export function authHeaders(template, key) {
  const headers = { ...(isPlainObject(template?.request?.headers) ? template.request.headers : {}) }
  const auth = template?.auth || {}
  if (typeof key === 'string' && key !== '') {
    if (auth.type === 'bearer') headers.authorization = `Bearer ${key}`
    if (auth.type === 'x-api-key') headers['x-api-key'] = key
  }
  return headers
}

function trimSlashes(value) {
  return String(value).replace(/\/+$/, '')
}

function pickProviderConfig(value, provider) {
  if (!isPlainObject(value)) return undefined
  const queue = [value]
  if (isPlainObject(value.providers)) queue.push(value.providers)
  for (const candidate of queue) {
    if (isPlainObject(candidate[provider])) return candidate[provider]
  }
  return value
}

export function validateTemplate(input, { allowId = false } = {}) {
  if (!isPlainObject(input)) throw new QuotaError('invalid-template', '查询模板必须是对象')
  const match = isPlainObject(input.match) ? input.match : {}
  const providerIds = Array.isArray(match.providerIds)
    ? match.providerIds.filter((id) => typeof id === 'string' && id.trim() !== '')
    : []
  const baseURLPatterns = Array.isArray(match.baseURLPatterns)
    ? match.baseURLPatterns.filter((p) => typeof p === 'string' && p.trim() !== '')
    : []
  const request = isPlainObject(input.request) ? input.request : {}
  const method = typeof request.method === 'string' ? request.method.toUpperCase() : 'GET'
  if (method !== 'GET' && method !== 'POST') {
    throw new QuotaError('invalid-template', '请求方法只支持 GET 或 POST')
  }
  if (typeof request.url !== 'string' || request.url.trim() === '') {
    throw new QuotaError('invalid-template', '请求 URL 不能为空')
  }
  const rawURL = request.url.replace('{baseURL}', 'https://example.invalid')
  let parsed
  try {
    parsed = new URL(rawURL)
  } catch {
    throw new QuotaError('invalid-template', '请求 URL 不是合法地址')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new QuotaError('invalid-template', '请求 URL 只支持 http/https')
  }
  const auth = isPlainObject(input.auth) ? input.auth : {}
  const authType = typeof auth.type === 'string' ? auth.type : 'bearer'
  if (!['bearer', 'x-api-key', 'none'].includes(authType)) {
    throw new QuotaError('invalid-template', 'auth.type 只支持 bearer / x-api-key / none')
  }
  const credentialRefs = Array.isArray(auth.credentialRefs)
    ? auth.credentialRefs.filter((ref) => typeof ref === 'string' && ref.trim() !== '')
    : []
  const extract = isPlainObject(input.extract) ? input.extract : {}
  const items = Array.isArray(extract.items)
    ? extract.items
        .filter((item) => isPlainObject(item) && typeof item.amountPath === 'string')
        .map((item) => ({
          label: typeof item.label === 'string' ? item.label : 'Balance',
          amountPath: item.amountPath,
          currency: typeof item.currency === 'string' ? item.currency : undefined,
          currencyPath: typeof item.currencyPath === 'string' ? item.currencyPath : undefined,
        }))
    : []
  if (items.length === 0) {
    throw new QuotaError('invalid-template', '至少需要一个余额提取路径')
  }
  const headers = {}
  if (isPlainObject(request.headers)) {
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers[name] = value
    }
  }
  const timeoutMs = Number.isFinite(Number(input.timeoutMs))
    ? Math.min(30_000, Math.max(1_000, Number(input.timeoutMs)))
    : DEFAULT_TIMEOUT_MS
  return {
    ...(allowId && typeof input.id === 'string' ? { id: input.id } : {}),
    label: typeof input.label === 'string' && input.label !== '' ? input.label : '自定义供应商',
    match: { providerIds, baseURLPatterns },
    request: { method, url: request.url, headers, body: request.body ?? null },
    auth: { type: authType, credentialRefs },
    extract: { items },
    timeoutMs,
    ...(typeof input.defaultBaseURL === 'string' ? { defaultBaseURL: input.defaultBaseURL } : {}),
  }
}

export function sanitizeSettings(input) {
  if (!isPlainObject(input)) throw new QuotaError('invalid-settings', '配置必须是对象')
  const settings = defaultSettings()
  settings.refreshSeconds = normalizeRefreshSeconds(input.refreshSeconds)
  if (typeof input.language === 'string' && ['auto', 'zh', 'en'].includes(input.language)) {
    settings.language = input.language
  }
  if (input.limitMode === 'used' || input.limitMode === 'left') {
    settings.limitMode = input.limitMode
  }
  if (typeof input.liveRefresh === 'boolean') settings.liveRefresh = input.liveRefresh
  if (typeof input.enabled === 'boolean') settings.enabled = input.enabled
  if (isPlainObject(input.providers)) {
    for (const [id, entry] of Object.entries(input.providers)) {
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) {
        throw new QuotaError('invalid-settings', `供应商 id 不合法: ${id}`)
      }
      if (!isPlainObject(entry) || !isPlainObject(entry.template)) continue
      settings.providers[id] = {
        enabled: entry.enabled !== false,
        template: validateTemplate(entry.template, { allowId: true }),
      }
    }
  }
  return settings
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 256 * 1024) {
        reject(new QuotaError('payload-too-large', '请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new QuotaError('invalid-json', '请求体不是合法 JSON'))
      }
    })
  })
}

/**
 * Extract the model identity from a committed `assistant/message` session event.
 * Returns null for every other event, for messages without a model source, and
 * for malformed payloads. The returned tick is anonymous: it carries no session
 * id, no content, and no credentials.
 */
export function tickFromSessionEvent(event) {
  if (!event || typeof event !== 'object' || event.type !== 'assistant/message') return null
  const message = event.data && event.data.message
  const source = message && message.source
  if (!source || source.kind !== 'model') return null
  if (typeof source.provider !== 'string' || source.provider === '') return null
  return {
    provider: source.provider,
    model: typeof source.model === 'string' ? source.model : '',
    at: new Date().toISOString(),
  }
}

/**
 * Collapse bursts of activity ticks per provider. Multi-step turns and parallel
 * subagents can append many assistant messages within a second; subscribers only
 * need to know that a provider produced a response, not each individual step.
 */
export function createTickCoalescer(options = {}) {
  const minIntervalMs = Number.isFinite(options.minIntervalMs)
    ? Math.max(0, options.minIntervalMs)
    : TICK_COALESCE_MS
  const sentAt = new Map()
  return {
    accept(tick, now = Date.now()) {
      if (!tick || typeof tick !== 'object' || typeof tick.provider !== 'string' || tick.provider === '') {
        return false
      }
      const last = sentAt.get(tick.provider)
      if (last !== undefined && now - last < minIntervalMs) return false
      sentAt.set(tick.provider, now)
      return true
    },
    reset() {
      sentAt.clear()
    },
  }
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  const credentials = ctx.get('credentials')
  const llm = ctx.get('llm')
  const settingsService = ctx.get('settings')
  const account = ctx.get('deepseekAccount')
  const defaultModel = ctx.get('agentDefaultModel')

  if (!webServer) throw new Error('dsh-quotaline requires the webServer service')

  const cache = new Map()

  const configPath = () => settingsPath(process.env)

  async function loadSettings() {
    try {
      const text = await readFile(configPath(), 'utf8')
      const parsed = JSON.parse(text)
      return sanitizeSettings(parsed)
    } catch (error) {
      if (error && error.code === 'ENOENT') return defaultSettings()
      if (error instanceof QuotaError) throw error
      throw new QuotaError('invalid-settings', `读取设置失败: ${error.message}`)
    }
  }

  async function saveSettings(settings) {
    const path = configPath()
    await mkdir(join(path, '..'), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    try {
      await rename(tmp, path)
    } catch (error) {
      if (error && (error.code === 'EEXIST' || error.code === 'EPERM')) {
        await unlink(path).catch(() => {})
        await rename(tmp, path)
      } else {
        await unlink(tmp).catch(() => {})
        throw error
      }
    }
  }

  function providerInfo(provider) {
    try {
      const providers = llm?.listProviders?.() ?? []
      const found = providers.find((entry) => entry && entry.id === provider)
      if (found) return found
    } catch {
      /* ignore */
    }
    return { id: provider, name: provider }
  }

  function configurableProvider(provider) {
    try {
      const providers = llm?.listConfigurableProviders?.() ?? []
      return providers.find((entry) => entry && entry.provider === provider)
    } catch {
      return undefined
    }
  }

  function settingsDescriptorValue(info, provider) {
    if (!settingsService || !info) return undefined
    try {
      const descriptors = settingsService.describe()
      const descriptor = descriptors.find((entry) => entry && entry.ns === info.settingsNs)
      if (!descriptor) return undefined
      let value = descriptor.value
      if (info.settingsPath) {
        for (const segment of String(info.settingsPath).split('.')) {
          if (!isPlainObject(value) && !Array.isArray(value)) break
          value = value[segment]
        }
      }
      return pickProviderConfig(value, provider)
    } catch {
      return undefined
    }
  }

  function baseURLFor(provider, template) {
    const info = configurableProvider(provider)
    const configured = settingsDescriptorValue(info, provider)
    if (configured && typeof configured.baseURL === 'string' && configured.baseURL !== '') {
      return trimSlashes(configured.baseURL)
    }
    if (info && typeof info.defaultBaseURL === 'string' && info.defaultBaseURL !== '') {
      return trimSlashes(info.defaultBaseURL)
    }
    if (info && typeof info.baseURLEnv === 'string' && process.env[info.baseURLEnv]) {
      return trimSlashes(process.env[info.baseURLEnv])
    }
    if (template && typeof template.defaultBaseURL === 'string') {
      return trimSlashes(template.defaultBaseURL)
    }
    return ''
  }

  async function resolveCredentialRefs(provider, template) {
    const refs = []
    const push = (ref) => {
      if (typeof ref === 'string' && ref.trim() !== '' && !refs.includes(ref.trim())) {
        refs.push(ref.trim())
      }
    }
    const configuredRefs = template?.auth?.credentialRefs
    if (Array.isArray(configuredRefs)) configuredRefs.forEach(push)
    const info = configurableProvider(provider)
    if (info?.nativeAuth?.env) info.nativeAuth.env.forEach(push)
    const configured = settingsDescriptorValue(info, provider)
    if (configured && typeof configured.apiKeyEnv === 'string') push(configured.apiKeyEnv)
    if (info && typeof info.baseURLEnv === 'string' && process.env[info.baseURLEnv]) push(info.baseURLEnv)
    return refs
  }

  async function resolveKey(provider, template) {
    const refs = await resolveCredentialRefs(provider, template)
    if (credentials) {
      for (const ref of refs) {
        try {
          const resolved = await credentials.resolve(ref)
          if (resolved && typeof resolved.value === 'string' && resolved.value !== '') {
            return { key: resolved.value, source: 'ref' }
          }
        } catch {
          /* not configured */
        }
      }
      try {
        const entries = await credentials.listRecords()
        for (const entry of entries) {
          if (!entry || entry.kind !== 'api-key') continue
          const key = String(entry.key)
          const scope = key.split('/')[0]
          if (scope !== provider) continue
          const record = await credentials.readRecord(entry.key)
          if (!record) continue
          if (typeof record.key === 'string' && record.key !== '') {
            return { key: record.key, source: 'record' }
          }
          if (isPlainObject(record.env)) {
            for (const ref of Object.values(record.env)) {
              if (typeof ref !== 'string') continue
              try {
                const resolved = await credentials.resolve(ref)
                if (resolved && typeof resolved.value === 'string' && resolved.value !== '') {
                  return { key: resolved.value, source: 'ref' }
                }
              } catch {
                /* ignore */
              }
            }
          }
        }
      } catch {
        /* records unavailable */
      }
    }
    return null
  }

  async function fetchBalance(template, baseURL, key) {
    let origin = ''
    try {
      origin = new URL(baseURL).origin
    } catch {
      origin = ''
    }
    const url = String(template.request.url)
      .replaceAll('{baseURL}', baseURL)
      .replaceAll('{origin}', origin || baseURL)
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw new QuotaError('invalid-url', `查询地址不合法: ${url}`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new QuotaError('invalid-url', '查询地址只允许 http/https')
    }
    const headers = authHeaders(template, key)
    const init = {
      method: template.request.method,
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(template.timeoutMs || DEFAULT_TIMEOUT_MS),
    }
    if (template.request.method === 'POST' && template.request.body != null) {
      if (!headers['content-type'] && !headers['Content-Type']) {
        headers['content-type'] = 'application/json'
      }
      init.body = JSON.stringify(template.request.body)
    }
    const response = await fetch(parsed, init)
    const text = await response.text()
    const sample = text.length > 4000 ? `${text.slice(0, 4000)}…` : text
    if (!response.ok) {
      throw new QuotaError('http-error', `供应商返回 HTTP ${response.status}`, {
        httpStatus: response.status,
        sample,
      })
    }
    let payload
    try {
      payload = JSON.parse(text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text)
    } catch {
      throw new QuotaError('invalid-response', '供应商响应不是 JSON', { sample })
    }
    const items = extractItems(payload, template)
    if (items.length === 0) {
      throw new QuotaError('extract-empty', '响应中未提取到余额或限额，可在设置页修正提取路径', {
        sample,
      })
    }
    return { items, sample, httpStatus: response.status }
  }

  async function accountBalance() {
    if (!account) {
      throw new QuotaError('unsupported', '当前 profile 未启用 DeepSeek Account 服务')
    }
    const locale =
      (typeof Intl !== 'undefined' &&
        Intl.DateTimeFormat &&
        Intl.DateTimeFormat().resolvedOptions().locale) ||
      'en'
    const balance = await account.getBalance({
      version: PACKAGE_VERSION,
      locale,
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    })
    if (!balance) {
      return { status: 'signed-out', message: '未登录 DeepSeek 账号，或账号授权已变更' }
    }
    if (balance.status === 'failed') {
      throw new QuotaError('account-failed', 'DeepSeek 账号余额查询失败')
    }
    const items = []
    for (const wallet of balance.value || []) {
      items.push({ label: 'Balance', amount: wallet.balance, currency: wallet.currency })
    }
    for (const wallet of balance.bonusWallets || []) {
      items.push({ label: 'Bonus', amount: wallet.balance, currency: wallet.currency })
    }
    return { items }
  }

  function isFallbackError(error) {
    if (!(error instanceof QuotaError)) return false
    if (error.code === 'extract-empty' || error.code === 'invalid-response') return true
    if (error.code === 'http-error') {
      return [400, 401, 403, 404].includes(Number(error.httpStatus))
    }
    return false
  }

  async function computeStatus(provider, model, { refresh = false } = {}) {
    const selected = provider || defaultModel?.currentSelection?.()?.provider
    if (!selected) {
      return {
        status: 'unsupported',
        message: '还没有选择模型',
        refreshSeconds: normalizeRefreshSeconds(60),
      }
    }
    const now = Date.now()
    if (!refresh) {
      const hit = cache.get(selected)
      if (hit && now - hit.at < CACHE_MS) return hit.value
    }
    let value
    try {
      const settings = await loadSettings()
      const info = configurableProvider(selected)
      const baseURL = baseURLFor(selected, null)
      const candidates = matchTemplates({
        provider: selected,
        baseURL,
        custom: settings.providers,
      })
      const primary = candidates[0]
      if (!primary) {
        value = {
          status: 'unsupported',
          provider: selected,
          displayName: providerInfo(selected).name || selected,
          message: '该供应商暂无额度查询模板，可在设置页添加自定义查询',
          refreshSeconds: settings.refreshSeconds,
          updatedAt: new Date().toISOString(),
        }
      } else if (primary.template.kind === 'account') {
        const result = await accountBalance()
        if (result.status === 'signed-out') {
          value = {
            ...result,
            provider: selected,
            displayName: info?.name || 'DeepSeek Account',
            refreshSeconds: settings.refreshSeconds,
            updatedAt: new Date().toISOString(),
          }
        } else {
          value = {
            status: 'ok',
            provider: selected,
            displayName: info?.name || 'DeepSeek Account',
            model: model || undefined,
            items: result.items,
            refreshSeconds: settings.refreshSeconds,
            updatedAt: new Date().toISOString(),
            source: 'account',
          }
        }
      } else {
        // A custom template is authoritative. Built-ins fall back to the next
        // candidate when an endpoint rejects the key or returns no quota rows
        // (e.g. a standard API key against a coding-plan usage endpoint).
        const httpCandidates =
          primary.source === 'custom'
            ? [primary]
            : candidates.filter((candidate) => candidate.template.kind !== 'account').slice(0, 3)
        let lastError
        let result
        let used
        for (const candidate of httpCandidates) {
          const template = candidate.template
          const base = baseURLFor(selected, template)
          const key = await resolveKey(selected, template)
          used = candidate
          if (template.auth?.type !== 'none' && !key) continue
          try {
            result = await fetchBalance(template, base, key ? key.key : '')
            break
          } catch (error) {
            lastError = error
            if (!isFallbackError(error)) throw error
          }
        }
        if (result) {
          value = {
            status: 'ok',
            provider: selected,
            displayName: info?.name || used.template.label || selected,
            model: model || undefined,
            items: result.items,
            refreshSeconds: settings.refreshSeconds,
            updatedAt: new Date().toISOString(),
            source: used.source,
          }
        } else if (lastError) {
          throw lastError
        } else {
          value = {
            status: 'no-credential',
            provider: selected,
            displayName: info?.name || primary?.template?.label || selected,
            message: '未在本地凭证中找到该供应商的 key',
            refreshSeconds: settings.refreshSeconds,
            updatedAt: new Date().toISOString(),
          }
        }
      }
    } catch (error) {
      value = {
        status: error?.code === 'unsupported' ? 'unsupported' : 'error',
        provider: selected,
        displayName: providerInfo(selected).name || selected,
        message: error?.message || String(error),
        refreshSeconds: 60,
        updatedAt: new Date().toISOString(),
      }
    }
    cache.set(selected, { at: Date.now(), value })
    return value
  }

  function settingsPayload(settings) {
    return {
      version: SETTINGS_VERSION,
      refreshSeconds: settings.refreshSeconds,
      language: settings.language,
      limitMode: settings.limitMode,
      liveRefresh: settings.liveRefresh,
      enabled: settings.enabled,
      builtins: BUILTIN_TEMPLATES.map((template) => ({ ...template })),
      providers: settings.providers,
    }
  }

  function handleError(res, error) {
    if (error instanceof QuotaError) {
      json(res, error.code === 'invalid-settings' ? 400 : 400, {
        error: error.code,
        message: error.message,
      })
      return
    }
    json(res, 500, { error: 'internal', message: error?.message || String(error) })
  }

  function checkOrigin(req) {
    const origin = req.headers.origin
    if (!origin) return true
    try {
      return origin === webServer.getOrigin()
    } catch {
      return false
    }
  }

  async function handleStatus(req, res) {
    if (req.method !== 'GET') return json(res, 405, { error: 'method-not-allowed' })
    try {
      const url = new URL(req.url, 'http://localhost')
      const provider = url.searchParams.get('provider') || undefined
      const model = url.searchParams.get('model') || undefined
      const refresh = url.searchParams.get('refresh') === '1'
      json(res, 200, await computeStatus(provider, model, { refresh }))
    } catch (error) {
      handleError(res, error)
    }
  }

  async function handleSettings(req, res) {
    try {
      if (req.method === 'GET') {
        const settings = await loadSettings()
        json(res, 200, settingsPayload(settings))
        return
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'method-not-allowed' })
      if (!checkOrigin(req)) return json(res, 403, { error: 'origin-not-allowed' })
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        return json(res, 415, { error: 'json-required' })
      }
      const body = await readJSON(req)
      const settings = sanitizeSettings(body)
      await saveSettings(settings)
      cache.clear()
      json(res, 200, { ok: true, settings: settingsPayload(settings) })
    } catch (error) {
      handleError(res, error)
    }
  }

  async function handleProbe(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method-not-allowed' })
    try {
      if (!checkOrigin(req)) return json(res, 403, { error: 'origin-not-allowed' })
      const body = await readJSON(req)
      const provider = typeof body.provider === 'string' ? body.provider : ''
      if (provider === '') {
        return json(res, 400, { error: 'provider-required', message: '缺少 provider' })
      }
      const template = validateTemplate(body.template, { allowId: true })
      if (template.match.providerIds.length === 0) {
        template.match.providerIds = [provider]
      }
      let base = baseURLFor(provider, template)
      if (base === '') {
        const builtin = matchTemplate({ provider, baseURL: '', builtins: BUILTIN_TEMPLATES, custom: {} })
        if (builtin && typeof builtin.template.defaultBaseURL === 'string') {
          base = trimSlashes(builtin.template.defaultBaseURL)
        }
      }
      const key = await resolveKey(provider, template)
      if (template.auth.type !== 'none' && !key) {
        json(res, 200, {
          status: 'no-credential',
          message: '未在本地凭证中找到该供应商的 key',
        })
        return
      }
      const result = await fetchBalance(template, base, key ? key.key : '')
      json(res, 200, {
        status: 'ok',
        provider,
        httpStatus: result.httpStatus,
        extracted: result.items,
        sample: result.sample,
      })
    } catch (error) {
      if (error instanceof QuotaError) {
        json(res, 200, {
          status: 'error',
          code: error.code,
          httpStatus: error.httpStatus,
          message: error.message,
          sample: error.sample,
        })
        return
      }
      handleError(res, error)
    }
  }

  const activityClients = new Set()
  const activityCoalescer = createTickCoalescer({ minIntervalMs: TICK_COALESCE_MS })
  let activityHeartbeat

  function dropActivityClient(res) {
    activityClients.delete(res)
    try {
      res.end()
    } catch {
      /* already closed */
    }
  }

  function publishActivity(tick) {
    if (!tick || activityClients.size === 0) return
    if (!activityCoalescer.accept(tick)) return
    const line = `data: ${JSON.stringify(tick)}\n\n`
    for (const client of [...activityClients]) {
      try {
        client.write(line)
      } catch {
        dropActivityClient(client)
      }
    }
  }

  function ensureActivityHeartbeat() {
    if (activityHeartbeat !== undefined) return
    activityHeartbeat = setInterval(() => {
      if (activityClients.size === 0) {
        clearInterval(activityHeartbeat)
        activityHeartbeat = undefined
        return
      }
      for (const client of [...activityClients]) {
        try {
          client.write(': ping\n\n')
        } catch {
          dropActivityClient(client)
        }
      }
    }, ACTIVITY_HEARTBEAT_MS)
    activityHeartbeat.unref?.()
  }

  function handleActivity(req, res) {
    if (req.method !== 'GET') return json(res, 405, { error: 'method-not-allowed' })
    if (!checkOrigin(req)) return json(res, 403, { error: 'origin-not-allowed' })
    if (activityClients.size >= ACTIVITY_MAX_CLIENTS) {
      return json(res, 429, { error: 'too-many-connections' })
    }
    res.statusCode = 200
    res.setHeader('content-type', 'text/event-stream; charset=utf-8')
    res.setHeader('cache-control', 'no-cache, no-transform')
    res.setHeader('connection', 'keep-alive')
    res.setHeader('x-accel-buffering', 'no')
    res.flushHeaders?.()
    res.write(': connected\n\n')
    activityClients.add(res)
    const cleanup = () => {
      activityClients.delete(res)
      if (activityClients.size === 0 && activityHeartbeat !== undefined) {
        clearInterval(activityHeartbeat)
        activityHeartbeat = undefined
      }
    }
    res.on('close', cleanup)
    res.on('error', cleanup)
    ensureActivityHeartbeat()
  }

  const invalidate = () => cache.clear()

  ctx.effect(() => {
    const disposers = [
      webServer.register({ kind: 'exact', path: `${API}status`, handler: handleStatus }),
      webServer.register({ kind: 'exact', path: `${API}settings`, handler: handleSettings }),
      webServer.register({ kind: 'exact', path: `${API}probe`, handler: handleProbe }),
      webServer.register({ kind: 'exact', path: `${API}activity`, handler: handleActivity }),
    ]
    try {
      disposers.push(
        ctx.on('session/event', (session, event) => {
          try {
            publishActivity(tickFromSessionEvent(event))
          } catch {
            /* never break the session event bus */
          }
        }),
      )
    } catch {
      /* session events are unavailable on this profile */
    }
    const events = ['credentials/record-updated', 'credentials/reference-updated', 'llm/adapters-updated', 'llm/models-updated']
    for (const event of events) {
      try {
        disposers.push(ctx.on(event, invalidate))
      } catch {
        /* event not available on this profile */
      }
    }
    return () => {
      for (const dispose of disposers) {
        try {
          if (typeof dispose === 'function') dispose()
        } catch {
          /* ignore */
        }
      }
      if (activityHeartbeat !== undefined) {
        clearInterval(activityHeartbeat)
        activityHeartbeat = undefined
      }
      for (const client of [...activityClients]) dropActivityClient(client)
      activityCoalescer.reset()
    }
  })
}
