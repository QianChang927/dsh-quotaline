/**
 * dsh-quotaline — Client half (no build step).
 *
 * A full-width strip in `conversation.input.dock` that follows the current
 * session model, plus a `settings.section` page for refresh interval and
 * custom query templates.
 */
window.__ModuleLoader__.load({
  id: 'dsh-quotaline',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const API = '/dsh-quotaline/api/'
    const SETTINGS_EVENT = 'dsh-quotaline:settings-changed'
    const DOCK_SLOT = 'conversation.input.dock'
    const SETTINGS_SLOT = 'settings.section'

    const MESSAGES = {
      zh: {
        unknown: '额度',
        loading: '额度 · 查询中…',
        okUpdated: '更新于',
        refresh: '刷新',
        balance: '余额',
        topUp: '充值余额',
        bonus: '赠送余额',
        available: '可用余额',
        fiveHour: '5小时',
        weekly: '每周',
        monthly: '每月',
        noCredential: '未配置密钥',        unsupported: '暂无查询模板',
        signedOut: '未登录',
        error: '查询失败',
        hint: '在 设置 → 额度条 中添加模板',
        settingsTitle: '额度条',
        globalTitle: '全局',
        refreshSeconds: '刷新间隔（秒）',
        refreshHint: '范围 10–3600，切换模型时会立即刷新。',
        language: '界面语言',
        languageHint: '跟随 DSH 语言，或单独固定为中文 / English。',
        languageAuto: '跟随 DSH',
        languageZh: '中文',
        languageEn: 'English',
        limitMode: '限额显示',
        limitModeHint: '控制 5h / 周 / 月限额显示已用还是剩余；余额气泡不受影响。',
        limitModeUsed: '已用',
        limitModeLeft: '剩余',
        usedSuffix: '已用',
        leftSuffix: '剩余',
        builtinsTitle: '内置模板',
        builtinsHint: '内置模板随插件提供；自定义模板按供应商 id 匹配，同分时优先自定义。',
        customTitle: '自定义查询',
        addTemplate: '新增模板',
        noTemplates: '还没有自定义模板。',
        providerId: '匹配供应商 id',
        providerIdHint: '逗号或空格分隔，支持通配符 *，例如 moonshot, kimi-*',
        label: '显示名称',
        method: '方法',
        url: '请求地址',
        urlHint: '可用 {baseURL} 占位，例如 {baseURL}/user/balance',
        authType: '认证方式',
        credentialRefs: '凭证引用（可选）',
        credentialRefsHint: '环境风格引用名，逗号分隔；留空则自动从供应商设置和凭证记录中查找。',
        amountPath: '余额字段路径',
        amountPathHint: 'JSON 路径，支持 [*] 展开多条，例如 balance_infos[*].total_balance',
        currency: '货币',
        currencyPath: '货币字段路径（可选）',
        baseURLPatterns: '基础地址匹配（可选）',
        enabled: '启用',
        remove: '删除',
        test: '测试',
        testing: '测试中…',
        save: '保存',
        saving: '保存中…',
        saved: '已保存',
        probeOk: '测试成功',
        probeFail: '测试失败',
        sample: '响应样例',
        loadFail: '读取设置失败',
        saveFail: '保存失败',
        invalidPath: '请先填写余额字段路径',
        privacy: '仅读取本地凭证，不上传、不写回；余额由本机 Host 直接查询。',
      },
      en: {
        unknown: 'Quota',
        loading: 'Quota · loading…',
        okUpdated: 'updated',
        refresh: 'Refresh',
        balance: 'Balance',
        topUp: 'Top-up',
        bonus: 'Bonus',
        available: 'Available',
        fiveHour: '5h',
        weekly: 'Weekly',
        monthly: 'Monthly',
        noCredential: 'No credential',
        unsupported: 'No template',
        signedOut: 'Signed out',
        error: 'Query failed',
        hint: 'Add a template in Settings → Quota Line',
        settingsTitle: 'Quota Line',
        globalTitle: 'General',
        refreshSeconds: 'Refresh interval (seconds)',
        refreshHint: '10–3600. Switching models refreshes immediately.',
        language: 'Language',
        languageHint: 'Follow DSH, or pin this page to Chinese / English.',
        languageAuto: 'Follow DSH',
        languageZh: '中文',
        languageEn: 'English',
        limitMode: 'Limit display',
        limitModeHint: 'Show limit chips as used or left. Balance chips are unaffected.',
        limitModeUsed: 'Used',
        limitModeLeft: 'Left',
        usedSuffix: 'used',
        leftSuffix: 'left',
        builtinsTitle: 'Built-in templates',
        builtinsHint: 'Bundled templates. Custom templates win ties by provider id.',
        customTitle: 'Custom queries',
        addTemplate: 'Add template',
        noTemplates: 'No custom templates yet.',
        providerId: 'Provider id match',
        providerIdHint: 'Comma or space separated, * allowed, e.g. moonshot, kimi-*',
        label: 'Display name',
        method: 'Method',
        url: 'Request URL',
        urlHint: 'May use {baseURL}, e.g. {baseURL}/user/balance',
        authType: 'Auth',
        credentialRefs: 'Credential refs (optional)',
        credentialRefsHint: 'Env-style reference names, comma separated. Leave empty to auto-detect.',
        amountPath: 'Balance path',
        amountPathHint: 'JSON path, [*] expands, e.g. balance_infos[*].total_balance',
        currency: 'Currency',
        currencyPath: 'Currency path (optional)',
        baseURLPatterns: 'Base URL patterns (optional)',
        enabled: 'Enabled',
        remove: 'Remove',
        test: 'Test',
        testing: 'Testing…',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved',
        probeOk: 'Test passed',
        probeFail: 'Test failed',
        sample: 'Response sample',
        loadFail: 'Failed to load settings',
        saveFail: 'Failed to save settings',
        invalidPath: 'Fill the balance path first',
        privacy: 'Reads local credentials only. Nothing is uploaded or written back; balances are fetched by the local Host.',
      },
    }

    function readLocale(ctx) {
      try {
        const value = ctx.locale?.getLocale?.()
        const locale = typeof value === 'string' ? value : value?.locale
        if (typeof locale === 'string' && locale.toLowerCase().startsWith('zh')) return 'zh'
      } catch {
        /* ignore */
      }
      const nav = typeof navigator !== 'undefined' ? navigator.language : ''
      return nav && nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    function useStrings(ctx, preference) {
      const [dsLang, setDsLang] = useState(() => readLocale(ctx))
      useEffect(() => {
        let off
        try {
          off = ctx.locale?.subscribe?.(() => setDsLang(readLocale(ctx)))
        } catch {
          off = undefined
        }
        return () => {
          if (typeof off === 'function') off()
        }
      }, [ctx])
      const lang = preference === 'zh' || preference === 'en' ? preference : dsLang
      const dict = MESSAGES[lang] || MESSAGES.en
      const t = useCallback((key) => dict[key] ?? MESSAGES.en[key] ?? key, [dict])
      return { lang, t }
    }

    async function api(path, init) {
      const response = await fetch(API + path, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...init,
      })
      const text = await response.text()
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        payload = undefined
      }
      if (!response.ok) {
        const message = payload && payload.message ? payload.message : `HTTP ${response.status}`
        const error = new Error(message)
        error.code = payload && payload.error
        throw error
      }
      return payload
    }

    function symbolFor(currency) {
      if (currency === 'CNY') return '¥'
      if (currency === 'USD') return '$'
      return ''
    }

    function translateLabel(label, t) {
      if (typeof label !== 'string' || label === '') return ''
      const key = label.trim().toLowerCase()
      if (key === '余额' || key === 'balance') return t('balance')
      if (key === '充值余额' || key === 'top-up' || key === 'topup') return t('topUp')
      if (key === '赠送余额' || key === 'bonus') return t('bonus')
      if (key === '可用余额' || key === 'available') return t('available')
      if (key === '5h' || key === '5小时' || key === '5 小时') return t('fiveHour')
      if (key === 'weekly' || key === '周' || key === '每周') return t('weekly')
      if (key === 'monthly' || key === '月' || key === '每月') return t('monthly')
      return label
    }

    function formatAmount(amount, currency) {
      const raw = String(amount)
      const value = Number(raw)
      if (!Number.isFinite(value)) return raw
      const formatted = value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      return `${symbolFor(currency)}${formatted}`
    }

    function formatPercent(percent) {
      const value = Number(percent)
      if (!Number.isFinite(value)) return ''
      const rounded = Math.round(value * 10) / 10
      return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`
    }

    function formatTime(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }

    function useModelSelection(ctx, sessionId) {
      const [selection, setSelection] = useState(null)
      useEffect(() => {
        if (!sessionId) {
          setSelection(null)
          return undefined
        }
        let binding
        try {
          binding = ctx.sessions?.binding?.(sessionId)
        } catch {
          binding = undefined
        }
        if (!binding) {
          setSelection(null)
          return undefined
        }
        let face
        try {
          face = binding.session.projections.faceOf('modelSelection')
        } catch {
          face = undefined
        }
        if (!face) return undefined
        const read = () => {
          try {
            const snapshot = face.getSnapshot()
            const next = snapshot && snapshot.next ? snapshot.next : null
            setSelection(next && typeof next === 'object' ? { provider: next.provider, model: next.model } : null)
          } catch {
            setSelection(null)
          }
        }
        read()
        let off
        try {
          off = face.subscribe(read)
        } catch {
          off = undefined
        }
        return () => {
          if (typeof off === 'function') off()
        }
      }, [ctx, sessionId])
      return selection
    }

    function useQuotaStatus(ctx, selection) {
      const provider = selection?.provider || ''
      const model = selection?.model || ''
      const [state, setState] = useState({ status: 'loading' })
      const [tick, setTick] = useState(0)
      const reload = useCallback(() => setTick((value) => value + 1), [])

      useEffect(() => {
        let disposed = false
        let controller
        let timer

        const schedule = (seconds) => {
          if (timer) clearTimeout(timer)
          const delay = Math.min(3600, Math.max(10, Number(seconds) || 60)) * 1000
          timer = setTimeout(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
              void load(true)
            } else {
              schedule(seconds)
            }
          }, delay)
        }

        const load = async (force) => {
          if (controller) controller.abort()
          controller = new AbortController()
          try {
            const query = new URLSearchParams()
            if (provider) query.set('provider', provider)
            if (model) query.set('model', model)
            if (force) query.set('refresh', '1')
            const data = await api(`status?${query.toString()}`, { signal: controller.signal })
            if (disposed) return
            setState(data && typeof data === 'object' ? data : { status: 'error' })
            if (data && data.refreshSeconds) schedule(data.refreshSeconds)
          } catch (error) {
            if (disposed || error?.name === 'AbortError') return
            setState({ status: 'error', message: error?.message || String(error) })
            schedule(60)
          }
        }

        const onVisibility = () => {
          if (document.visibilityState === 'visible') void load(true)
        }
        const onSettings = () => {
          void load(true)
        }
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener(SETTINGS_EVENT, onSettings)
        void load(true)

        return () => {
          disposed = true
          if (controller) controller.abort()
          if (timer) clearTimeout(timer)
          document.removeEventListener('visibilitychange', onVisibility)
          window.removeEventListener(SETTINGS_EVENT, onSettings)
        }
      }, [ctx, provider, model, tick])

      return [state, reload]
    }

    const dockStyle = {
      boxSizing: 'border-box',
      width: 'calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset))',
      margin: '0 auto',
    }

    const stripStyle = {
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      maxWidth: 'calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset))',
      height: '36px',
      margin: '0 auto',
      padding: '4px 6px 4px 12px',
      borderRadius: 'var(--dsw-radius-md)',
      border: 0,
      background: 'var(--dsw-specific-menu)',
      backdropFilter: 'var(--dsw-menu-backdrop-filter)',
      boxShadow: 'var(--dsw-elevation-panel)',
      color: 'var(--dsw-alias-label-primary)',
      fontSize: '13px',
      lineHeight: '20px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    }

    const scrollWrapStyle = {
      position: 'relative',
      flex: '1 1 auto',
      minWidth: 0,
      height: '100%',
    }

    const scrollerStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      height: '100%',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none',
      whiteSpace: 'nowrap',
    }

    const nameStyle = {
      flex: '0 0 auto',
      fontWeight: 600,
      color: 'var(--dsw-alias-label-primary)',
      whiteSpace: 'nowrap',
    }

    const mutedStyle = { color: 'var(--dsw-alias-label-secondary)' }

    const TONE_COLOR = {
      info: '#0EA5E9',
      brand: '#0EA5E9',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      danger: 'var(--dsw-alias-state-error-primary)',
      neutral: 'var(--dsw-alias-label-secondary)',
    }

    function itemTone(item) {
      const label = String((item && item.label) || '').toLowerCase()
      if (/bonus|赠送/.test(label)) return 'success'
      if (/weekly|week|周/.test(label)) return 'success'
      if (/monthly|month|月/.test(label)) return 'warn'
      if (/5h|fivehour|5小时/.test(label)) return 'info'
      if (/top-?up|充值|balance|余额|available|可用/.test(label)) return 'info'
      return 'neutral'
    }

    function isRenderableItem(item) {
      if (!item || typeof item.label !== 'string' || !item.label.trim()) return false
      if (typeof item.percent === 'number') return Number.isFinite(item.percent)
      return item.amount !== undefined && item.amount !== null && item.amount !== ''
    }

    function chipStyle(tone) {
      const tint = TONE_COLOR[tone] || TONE_COLOR.neutral
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        flex: '0 0 auto',
        height: '24px',
        padding: '0 8px',
        borderRadius: '999px',
        background: `color-mix(in srgb, ${tint} 14%, var(--dsw-alias-bg-layer-2))`,
        border: `1px solid color-mix(in srgb, ${tint} 34%, var(--dsw-alias-border-l1))`,
        whiteSpace: 'nowrap',
      }
    }

    function QuotaStrip(props) {
      const ctx = props.ctx
      const sessionId = props.sessionId
      const [language, setLanguage] = useState('auto')
      const [limitMode, setLimitMode] = useState('used')
      useEffect(() => {
        let disposed = false
        const load = () => {
          api('settings')
            .then((payload) => {
              if (disposed || !payload) return
              if (typeof payload.language === 'string') setLanguage(payload.language)
              setLimitMode(payload.limitMode === 'left' ? 'left' : 'used')
            })
            .catch(() => {})
        }
        load()
        const onSettings = () => load()
        window.addEventListener(SETTINGS_EVENT, onSettings)
        return () => {
          disposed = true
          window.removeEventListener(SETTINGS_EVENT, onSettings)
        }
      }, [])
      const { t } = useStrings(ctx, language)
      const selection = useModelSelection(ctx, sessionId)
      const [status, reload] = useQuotaStatus(ctx, selection)
      const scrollerRef = useRef(null)
      const [thumb, setThumb] = useState({ left: 0, width: 0, visible: false })
      const scrollTimer = useRef(null)

      const onScroll = useCallback(() => {
        const el = scrollerRef.current
        if (el) {
          const clientWidth = el.clientWidth
          const scrollWidth = el.scrollWidth
          if (scrollWidth > clientWidth + 1) {
            const width = Math.max(12, (clientWidth / scrollWidth) * 100)
            const maxLeft = scrollWidth - clientWidth
            const left = maxLeft > 0 ? (el.scrollLeft / maxLeft) * (100 - width) : 0
            setThumb({ left, width, visible: true })
          } else {
            setThumb((value) => (value.visible ? { ...value, visible: false } : value))
          }
        }
        if (scrollTimer.current) clearTimeout(scrollTimer.current)
        scrollTimer.current = setTimeout(() => setThumb((value) => ({ ...value, visible: false })), 900)
      }, [])

      useEffect(() => () => {
        if (scrollTimer.current) clearTimeout(scrollTimer.current)
      }, [])

      const name = status?.displayName || selection?.provider || t('unknown')
      const items = Array.isArray(status?.items) ? status.items : []

      let dotColor = 'var(--dsw-alias-state-idle-primary)'
      if (status?.status === 'ok') dotColor = 'var(--dsw-alias-state-success-primary)'
      else if (status?.status === 'error') dotColor = 'var(--dsw-alias-state-error-primary)'
      else if (status?.status === 'no-credential' || status?.status === 'signed-out') {
        dotColor = 'var(--dsw-alias-state-warn-primary)'
      }

      const content = []
      content.push(
        h('span', {
          key: 'dot',
          style: {
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: dotColor,
            flex: '0 0 auto',
          },
        }),
        h('span', { key: 'name', style: nameStyle }, name),
      )

      if (status?.status === 'loading') {
        content.push(h('span', { key: 'loading', style: mutedStyle }, t('loading')))
      } else if (status?.status === 'ok' && items.length > 0) {
        items.forEach((item, index) => {
          if (!isRenderableItem(item)) return
          const currency = item && item.currency
          const percent = item && typeof item.percent === 'number' ? item.percent : null
          const suffix = limitMode === 'left' ? t('leftSuffix') : t('usedSuffix')
          const shownPercent =
            percent !== null && limitMode === 'left' ? Math.max(0, Math.min(100, 100 - percent)) : percent
          const tone = itemTone(item)
          content.push(
            h(
              'span',
              { key: `item-${index}`, style: chipStyle(tone), 'data-quotaline-tone': tone },
              h('span', { style: mutedStyle }, translateLabel(item.label, t)),
              h('span', null, percent !== null ? `${formatPercent(shownPercent)} ${suffix}` : formatAmount(item.amount, currency)),
            ),
          )
        })
      } else if (status?.status === 'no-credential') {
        content.push(h('span', { key: 'nocred', style: { color: 'var(--dsw-alias-state-warn-primary)' } }, t('noCredential')))
      } else if (status?.status === 'signed-out') {
        content.push(h('span', { key: 'signedout', style: { color: 'var(--dsw-alias-state-warn-primary)' } }, t('signedOut')))
      } else if (status?.status === 'unsupported') {
        content.push(h('span', { key: 'unsupported', style: mutedStyle }, t('unsupported')), h('span', { key: 'hint', style: mutedStyle }, `· ${t('hint')}`))
      } else if (status?.status === 'error') {
        content.push(h('span', { key: 'error', style: { color: 'var(--dsw-alias-state-error-primary)' } }, `${t('error')}${status.message ? `: ${status.message}` : ''}`))
      }

      const updated = formatTime(status?.updatedAt)

      return h(
        'div',
        { style: dockStyle, 'data-dsh-quotaline': 'dock' },
        h(
          'div',
          { style: stripStyle, 'data-dsh-quotaline': 'strip' },
          h(
            'div',
            { style: scrollWrapStyle, 'data-dsh-quotaline': 'scroll-wrap' },
            h(
              'div',
              {
                ref: scrollerRef,
                style: scrollerStyle,
                onScroll,
                'data-dsh-quotaline': 'scroll',
              },
              content,
            ),
            h('div', {
              'data-dsh-quotaline': 'thumb',
              style: {
                position: 'absolute',
                bottom: 0,
                left: `${thumb.left}%`,
                width: `${thumb.width}%`,
                height: '3px',
                borderRadius: '999px',
                background: 'var(--dsw-alias-scrollbar-bg-l2)',
                opacity: thumb.visible ? 0.85 : 0,
                transition: 'opacity 240ms ease',
                pointerEvents: 'none',
              },
            }),
          ),
          updated ? h('span', { key: 'updated', style: { ...mutedStyle, flex: '0 0 auto' } }, `${t('okUpdated')} ${updated}`) : null,
          h(
            'button',
            {
              key: 'refresh',
              type: 'button',
              title: t('refresh'),
              onClick: reload,
              style: {
                flex: '0 0 auto',
                height: '24px',
                boxSizing: 'border-box',
                border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, var(--dsw-alias-border-l1))',
                background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, var(--dsw-alias-bg-layer-2))',
                color: 'var(--dsw-alias-label-primary)',
                borderRadius: '999px',
                padding: '0 8px',
                fontSize: '13px',
                lineHeight: '20px',
                cursor: 'pointer',
              },
            },
            t('refresh'),
          ),
        ),
      )
    }

    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }
    const labelStyle = { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' }
    const inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '6px 8px',
      fontSize: '12px',
      borderRadius: '6px',
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-2)',
      color: 'var(--dsw-alias-label-primary)',
    }
    const buttonStyle = {
      padding: '5px 12px',
      fontSize: '12px',
      borderRadius: '6px',
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-2)',
      color: 'var(--dsw-alias-label-primary)',
      cursor: 'pointer',
    }
    const primaryButtonStyle = { ...buttonStyle, background: 'var(--dsw-alias-brand-primary)', color: '#fff', borderColor: 'transparent' }
    const sectionStyle = { marginBottom: '18px' }
    const headingStyle = { fontSize: '13px', fontWeight: 600, margin: '0 0 6px', color: 'var(--dsw-alias-label-primary)' }
    const noteStyle = { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', margin: '2px 0 0' }
    const cardStyle = {
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: '10px',
      padding: '12px',
      marginBottom: '12px',
      background: 'var(--dsw-alias-bg-layer-1)',
    }

    function splitList(value) {
      return String(value || '')
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    }

    function draftFromEntry(id, entry) {
      const template = entry && entry.template ? entry.template : {}
      const match = template.match || {}
      const request = template.request || {}
      const auth = template.auth || {}
      const item = (template.extract && template.extract.items && template.extract.items[0]) || {}
      return {
        id,
        enabled: !entry || entry.enabled !== false,
        label: template.label || id,
        providerIds: Array.isArray(match.providerIds) ? match.providerIds.join(', ') : id,
        baseURLPatterns: Array.isArray(match.baseURLPatterns) ? match.baseURLPatterns.join(', ') : '',
        method: request.method || 'GET',
        url: request.url || '{baseURL}/user/balance',
        authType: auth.type || 'bearer',
        credentialRefs: Array.isArray(auth.credentialRefs) ? auth.credentialRefs.join(', ') : '',
        amountPath: item.amountPath || '',
        currency: item.currency || 'CNY',
        currencyPath: item.currencyPath || '',
      }
    }

    function entryFromDraft(draft) {
      return {
        enabled: draft.enabled,
        template: {
          id: draft.id,
          label: draft.label || draft.id,
          match: {
            providerIds: splitList(draft.providerIds),
            baseURLPatterns: splitList(draft.baseURLPatterns),
          },
          request: { method: draft.method, url: draft.url, headers: {}, body: null },
          auth: { type: draft.authType, credentialRefs: splitList(draft.credentialRefs) },
          extract: {
            items: [
              {
                label: '余额',
                amountPath: draft.amountPath,
                ...(draft.currency ? { currency: draft.currency } : {}),
                ...(draft.currencyPath ? { currencyPath: draft.currencyPath } : {}),
              },
            ],
          },
          timeoutMs: 10000,
        },
      }
    }

    function Labeled(props) {
      return h(
        'label',
        { style: fieldStyle },
        h('span', { style: labelStyle }, props.label),
        props.children,
        props.hint ? h('span', { style: noteStyle }, props.hint) : null,
      )
    }

    function ProviderEditor(props) {
      const { draft, t, onChange, onRemove, onTest, probe, testing } = props
      const set = (patch) => onChange({ ...draft, ...patch })
      return h(
        'div',
        { style: cardStyle },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
          h(
            'label',
            { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' } },
            h('input', {
              type: 'checkbox',
              checked: draft.enabled,
              onChange: (event) => set({ enabled: event.target.checked }),
            }),
            t('enabled'),
          ),
          h('span', { style: { flex: '1 1 auto' } }),
          h('button', { type: 'button', style: buttonStyle, onClick: onTest, disabled: testing }, testing ? t('testing') : t('test')),
          h('button', { type: 'button', style: buttonStyle, onClick: onRemove }, t('remove')),
        ),
        h(Labeled, { label: t('providerId'), hint: t('providerIdHint') }, h('input', { style: inputStyle, value: draft.providerIds, onChange: (event) => set({ providerIds: event.target.value }) })),
        h(Labeled, { label: t('label') }, h('input', { style: inputStyle, value: draft.label, onChange: (event) => set({ label: event.target.value }) })),
        h(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          h(Labeled, { label: t('method') }, h('select', { style: { ...inputStyle, width: '90px' }, value: draft.method, onChange: (event) => set({ method: event.target.value }) }, h('option', { value: 'GET' }, 'GET'), h('option', { value: 'POST' }, 'POST'))),
          h(Labeled, { label: t('authType') }, h('select', { style: { ...inputStyle, width: '130px' }, value: draft.authType, onChange: (event) => set({ authType: event.target.value }) }, h('option', { value: 'bearer' }, 'Bearer'), h('option', { value: 'x-api-key' }, 'x-api-key'), h('option', { value: 'none' }, 'none'))),
        ),
        h(Labeled, { label: t('url'), hint: t('urlHint') }, h('input', { style: inputStyle, value: draft.url, onChange: (event) => set({ url: event.target.value }) })),
        h(Labeled, { label: t('credentialRefs'), hint: t('credentialRefsHint') }, h('input', { style: inputStyle, value: draft.credentialRefs, onChange: (event) => set({ credentialRefs: event.target.value }) })),
        h(Labeled, { label: t('baseURLPatterns') }, h('input', { style: inputStyle, value: draft.baseURLPatterns, onChange: (event) => set({ baseURLPatterns: event.target.value }) })),
        h(Labeled, { label: t('amountPath'), hint: t('amountPathHint') }, h('input', { style: inputStyle, value: draft.amountPath, onChange: (event) => set({ amountPath: event.target.value }) })),
        h(
          'div',
          { style: { display: 'flex', gap: '8px' } },
          h(Labeled, { label: t('currency') }, h('input', { style: { ...inputStyle, width: '90px' }, value: draft.currency, onChange: (event) => set({ currency: event.target.value }) })),
          h(Labeled, { label: t('currencyPath') }, h('input', { style: inputStyle, value: draft.currencyPath, onChange: (event) => set({ currencyPath: event.target.value }) })),
        ),
        probe
          ? h(
              'div',
              { style: { marginTop: '6px', fontSize: '11px', color: probe.status === 'ok' ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' } },
              `${probe.status === 'ok' ? t('probeOk') : t('probeFail')}${probe.message ? `: ${probe.message}` : ''}`,
              probe.sample ? h('pre', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '140px', overflow: 'auto', fontSize: '10px', color: 'var(--dsw-alias-label-secondary)' } }, `${t('sample')}:\n${probe.sample}`) : null,
            )
          : null,
      )
    }

    function QuotaSettings(props) {
      const ctx = props.ctx
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [refreshSeconds, setRefreshSeconds] = useState(60)
      const [language, setLanguage] = useState('auto')
      const [limitMode, setLimitMode] = useState('used')
      const [builtins, setBuiltins] = useState([])
      const [drafts, setDrafts] = useState([])
      const [saving, setSaving] = useState(false)
      const [savedAt, setSavedAt] = useState(0)
      const [testingId, setTestingId] = useState('')
      const [probes, setProbes] = useState({})
      const nextId = useRef(1)
      const { t } = useStrings(ctx, language)

      useEffect(() => {
        let disposed = false
        api('settings')
          .then((payload) => {
            if (disposed || !payload) return
            setRefreshSeconds(payload.refreshSeconds || 60)
            setLanguage(payload.language === 'zh' || payload.language === 'en' ? payload.language : 'auto')
            setLimitMode(payload.limitMode === 'left' ? 'left' : 'used')
            setBuiltins(Array.isArray(payload.builtins) ? payload.builtins : [])
            const providers = payload.providers && typeof payload.providers === 'object' ? payload.providers : {}
            setDrafts(Object.keys(providers).map((id) => draftFromEntry(id, providers[id])))
            setLoading(false)
          })
          .catch((err) => {
            if (disposed) return
            setError(err?.message || String(err))
            setLoading(false)
          })
        return () => {
          disposed = true
        }
      }, [])

      const updateDraft = useCallback((id, next) => {
        setDrafts((current) => current.map((draft) => (draft.id === id ? next : draft)))
      }, [])

      const removeDraft = useCallback((id) => {
        setDrafts((current) => current.filter((draft) => draft.id !== id))
      }, [])

      const addDraft = useCallback(() => {
        const id = `custom-${Date.now().toString(36)}-${nextId.current++}`
        setDrafts((current) => [
          ...current,
          {
            id,
            enabled: true,
            label: id,
            providerIds: id,
            baseURLPatterns: '',
            method: 'GET',
            url: '{baseURL}/user/balance',
            authType: 'bearer',
            credentialRefs: '',
            amountPath: 'data.balance',
            currency: 'CNY',
            currencyPath: '',
          },
        ])
      }, [])

      const testDraft = useCallback(
        async (draft) => {
          if (!draft.amountPath) {
            setProbes((current) => ({ ...current, [draft.id]: { status: 'error', message: t('invalidPath') } }))
            return
          }
          setTestingId(draft.id)
          try {
            const payload = await api('probe', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ provider: splitList(draft.providerIds)[0] || draft.id, template: entryFromDraft(draft).template }),
            })
            setProbes((current) => ({ ...current, [draft.id]: payload || { status: 'error' } }))
          } catch (err) {
            setProbes((current) => ({ ...current, [draft.id]: { status: 'error', message: err?.message || String(err) } }))
          } finally {
            setTestingId('')
          }
        },
        [t],
      )

      const save = useCallback(async () => {
        setSaving(true)
        setError('')
        try {
          const providers = {}
          for (const draft of drafts) {
            const id = String(draft.id || '').trim()
            if (!id) continue
            providers[id] = entryFromDraft({ ...draft, id })
          }
          const payload = await api('settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshSeconds: Number(refreshSeconds) || 60, language, limitMode, providers }),
          })
          if (payload && payload.settings) {
            setRefreshSeconds(payload.settings.refreshSeconds || 60)
            if (typeof payload.settings.language === 'string') setLanguage(payload.settings.language)
            setLimitMode(payload.settings.limitMode === 'left' ? 'left' : 'used')
          }
          setSavedAt(Date.now())
          window.dispatchEvent(new CustomEvent(SETTINGS_EVENT))
        } catch (err) {
          setError(err?.message || String(err))
        } finally {
          setSaving(false)
        }
      }, [drafts, refreshSeconds, language, limitMode])

      if (loading) {
        return h('div', { style: { padding: '12px', color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' } }, '…')
      }

      return h(
        'div',
        { style: { padding: '4px 2px 24px', maxWidth: '720px' } },
        h('h2', { style: { fontSize: '16px', margin: '0 0 4px', color: 'var(--dsw-alias-label-primary)' } }, t('settingsTitle')),
        h('p', { style: noteStyle }, t('privacy')),

        h(
          'section',
          { style: sectionStyle },
          h('h3', { style: headingStyle }, t('globalTitle')),
          h(
            Labeled,
            { label: t('refreshSeconds'), hint: t('refreshHint') },
            h('input', {
              type: 'number',
              min: 10,
              max: 3600,
              style: { ...inputStyle, width: '120px' },
              value: refreshSeconds,
              onChange: (event) => setRefreshSeconds(event.target.value),
            }),
          ),
          h(
            Labeled,
            { label: t('language'), hint: t('languageHint') },
            h(
              'select',
              {
                style: { ...inputStyle, width: '200px' },
                value: language,
                onChange: (event) => setLanguage(event.target.value),
              },
              h('option', { value: 'auto' }, t('languageAuto')),
              h('option', { value: 'zh' }, t('languageZh')),
              h('option', { value: 'en' }, t('languageEn')),
            ),
          ),
          h(
            Labeled,
            { label: t('limitMode'), hint: t('limitModeHint') },
            h(
              'select',
              {
                style: { ...inputStyle, width: '200px' },
                value: limitMode,
                onChange: (event) => setLimitMode(event.target.value),
              },
              h('option', { value: 'used' }, t('limitModeUsed')),
              h('option', { value: 'left' }, t('limitModeLeft')),
            ),
          ),
        ),

        h(
          'section',
          { style: sectionStyle },
          h('h3', { style: headingStyle }, t('builtinsTitle')),
          h('p', { style: noteStyle }, t('builtinsHint')),
          h(
            'ul',
            { style: { margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
            builtins.map((template) =>
              h('li', { key: template.id }, `${template.label || template.id} · ${template.id}${template.experimental ? ' (experimental)' : ''}`),
            ),
          ),
        ),

        h(
          'section',
          { style: sectionStyle },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('h3', { style: headingStyle }, t('customTitle')),
            h('span', { style: { flex: '1 1 auto' } }),
            h('button', { type: 'button', style: buttonStyle, onClick: addDraft }, t('addTemplate')),
          ),
          drafts.length === 0 ? h('p', { style: noteStyle }, t('noTemplates')) : null,
          drafts.map((draft) =>
            h(ProviderEditor, {
              key: draft.id,
              draft,
              t,
              onChange: (next) => updateDraft(draft.id, next),
              onRemove: () => removeDraft(draft.id),
              onTest: () => testDraft(draft),
              probe: probes[draft.id],
              testing: testingId === draft.id,
            }),
          ),
        ),

        error ? h('p', { style: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)' } }, error) : null,
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('button', { type: 'button', style: primaryButtonStyle, onClick: save, disabled: saving }, saving ? t('saving') : t('save')),
          savedAt ? h('span', { style: noteStyle }, t('saved')) : null,
        ),
      )
    }

    function withContext(Component, ctx) {
      return function ContextualComponent(props) {
        return h(Component, { ...props, ctx })
      }
    }

    function apply(ctx) {
      const Strip = withContext(QuotaStrip, ctx)
      const Settings = withContext(QuotaSettings, ctx)
      const navLabel = 'Quota Line'

      ctx.slots.inject(DOCK_SLOT, () =>
        ctx.slots.register(
          { name: DOCK_SLOT, id: 'dsh-quotaline', order: 30, label: navLabel },
          Strip,
        ),
      )

      ctx.slots.inject(SETTINGS_SLOT, () =>
        ctx.slots.register(
          { name: SETTINGS_SLOT, id: 'dsh-quotaline', order: 12, label: navLabel },
          Settings,
        ),
      )
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply,
    }
  },
})
