# dsh-quotaline 架构设计

> 本文描述 dsh-quotaline 的模块边界、数据流、接口契约与扩展方式。
> 目标读者是维护者和希望新增供应商模板的贡献者。

## 1. 目标与非目标

**目标**

- 在 DSH 输入框上方（`conversation.input.dock`）展示当前模型对应供应商的余额或订阅限额。
- 余额与限额都可能来自不同端点：DeepSeek Account 走 Host 的 OAuth 服务，DeepSeek API / Kimi / GLM 走 HTTP 查询。
- 凭证只从本地 `ctx.credentials` 读取，进程内使用，不出 Host、不进日志、不出现在任何响应里。
- 内置常见供应商模板，并允许用户在设置页用声明式 HTTP 模板扩展。

**非目标**

- 不代理模型请求、不修改 DSH 凭证文件、不提供 API Key 输入框。
- 不做跨设备同步；所有配置与查询都在本机完成。
- 不在 Client 侧解析 YAML、保存 key 或发起带密钥的第三方请求。

## 2. 运行边界

```
┌────────────────────────── DSH Web GUI (browser / Electron renderer) ──────────────────────────┐
│  conversation.input.dock                         settings.section                              │
│  └─ QuotaStrip ── GET /dsh-quotaline/api/status    └─ QuotaSettings ── GET/POST /settings      │
│                     POST /probe                                                                │
│  只持有 provider/model、展示状态、刷新间隔；没有任何凭证                                         │
└───────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                            │ 同源 HTTP（loopback）
┌───────────────────────────────────────────▼───────────────────────────────────────────────────┐
│  DSH Host（插件 index.js）                                                                     │
│  webServer 路由 → computeStatus → 模板匹配 → ctx.credentials 解析 key → fetch 供应商端点        │
│                                 ↘ deepseekAccount.getBalance()（Account OAuth）                 │
│  设置读写：$DSH_HOME/dsh-quotaline/settings.json（原子写）                                      │
└───────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                            │ HTTPS + Authorization
                                   供应商余额 / 限额端点
```

职责划分：

| 关注点 | Host（`index.js`） | Client（`client.js`） |
| --- | --- | --- |
| 当前模型 | 可选回退到 `agentDefaultModel` | 从 session 投影 `modelSelection` 读取 |
| 凭证 | 只读解析、只在本进程使用 | 完全不可见 |
| 供应商调用 | `fetch` + 超时 + 响应上限 | 不直接调用 |
| 模板匹配 | 打分、回退、缓存 | 只展示 `status` 结果 |
| 设置 | 校验、落盘、读写 | 表单、CRUD、测试按钮 |
| 展示 | 归一化 `items[]` | 主题、i18n、滚动、颜色分级 |

## 3. 仓库结构

```
dsh-quotaline/
├─ index.js                 # Host 半：路由、模板引擎、凭证解析、设置持久化
├─ client.js                # Client 半：无构建，window.__ModuleLoader__.load 工厂
├─ cordis.patch.yml         # bundle 激活行（id: dsh-quotaline）
├─ package.json             # 包元数据、exports、dsh.bundle / dsh.client
├─ locale/{en,zh}.json      # 插件标题、描述、详情路径
├─ icon.svg                 # 插件图标
├─ docs/
│  ├─ ARCHITECTURE.md       # 本文
│  ├─ DETAIL.md             # 插件详情页文档
│  ├─ CHANGELOG.md          # 版本变更记录（Keep a Changelog）
│  ├─ README.zh-CN.md       # 中文 README
│  ├─ preview-light-account.svg  # 浅色 · 余额/赠送预览
│  ├─ preview-light-limit.svg    # 浅色 · 5h/周/月限额预览
│  ├─ preview-dark-account.svg   # 深色 · 余额/赠送预览
│  └─ preview-dark-limit.svg     # 深色 · 5h/周/月限额预览
├─ README.md
└─ LICENSE

本地开发专用（git-ignored，不随包发布）：test/（node:test，28 个用例）、AGENTS.md、CLAUDE.md、PUBLISHING.md。
```

`package.json` 关键字段：

- `exports`: `.` → `index.js`，`./client` → `client.js`，`./locale/*.json`，`./icon`。
- `dsh.bundle.patch`: `./cordis.patch.yml` —— 安装后插入 `dsh-quotaline` 行。
- `dsh.client`: `{ platform: 'web', immediately: true, inject: ['@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-settings'] }`。

## 4. 数据流

### 4.1 条带刷新

1. `QuotaStrip` 挂载后通过 `ctx.sessions.binding(sessionId)` 取得 session 投影 `modelSelection`。
2. 读取 `ModelSelectionProjection.next`；新会话为空时回退到 `ctx.remote.session.modelCatalog().default`。
3. provider 或 model 变化时：中止上一条请求（`AbortController`），立即 `GET /status?provider=&model=&refresh=1`。
4. 定时器按 `refreshSeconds` 轮询；`document.visibilityState !== 'visible'` 时暂停，重新可见时补一次。
5. 设置页保存后派发 `window` 事件 `dsh-quotaline:settings-changed`，条带重读 settings 并刷新。

### 4.2 状态计算（Host）

1. 读取设置；`provider` 为空时回退 `agentDefaultModel.currentSelection().provider`。
2. `matchTemplates()` 打分选出候选，主候选为 `account` 模板时调用 `deepseekAccount.getBalance()`。
3. HTTP 模板：按顺序解析 baseURL 与凭证；自定义模板独占，内置模板最多尝试 3 个候选。
4. 结果归一化为 `items[]` 并写入 30 秒缓存（按 provider 维度）；`refresh=1` 绕过缓存。
5. `credentials/record-updated`、`credentials/reference-updated`、`llm/adapters-updated`、`llm/models-updated` 触发 `cache.clear()`。

## 5. HTTP 契约

所有路由前缀 `/dsh-quotaline/api/`，仅同源访问；POST 要求 `content-type: application/json` 且 Origin 与 `webServer.getOrigin()` 一致。

### 5.1 `GET /status`

查询参数：

| 参数 | 说明 |
| --- | --- |
| `provider` | 供应商 id（如 `deepseek-account`、`deepseek-official`、`kimi-coding`） |
| `model` | 模型 id，仅回显到响应 `model` 字段 |
| `refresh` | `1` 时跳过 30 秒缓存 |

响应体：

```json
{
  "status": "ok | no-credential | signed-out | unsupported | error",
  "provider": "deepseek-official",
  "displayName": "DeepSeek API",
  "model": "deepseek-chat",
  "items": [
    { "label": "Balance", "amount": "128.4", "currency": "CNY" },
    { "label": "5h", "percent": 42 }
  ],
  "refreshSeconds": 60,
  "updatedAt": "2026-11-16T08:42:05.000Z",
  "source": "builtin | custom | account",
  "message": "可选：错误详情"
}
```

`items` 有两种形态：

- 金额：`{ label, amount, currency }`；
- 限额：`{ label, percent }`，`percent` 为 0–100 的已用百分比。

金额由 Client 统一格式化为两位小数；百分比整数不带小数、非整数保留一位，`>=70` 用 warn 色、`>=90` 用 error 色。

### 5.2 `GET | POST /settings`

GET 返回：

```json
{
  "version": 1,
  "refreshSeconds": 60,
  "language": "auto",
  "enabled": true,
  "builtins": [ ... ],
  "providers": { "<id>": { "enabled": true, "template": { ... } } }
}
```

POST 接受 `{ refreshSeconds, language, enabled, providers }`；`language` 只允许 `auto | zh | en`；`providers.<id>` 必须匹配 `^[a-z0-9][a-z0-9._-]{0,63}$`。校验失败返回 400 + `{ error: 'invalid-settings', message }`；非 JSON 返回 415。

### 5.3 `POST /probe`

请求：`{ provider, template }`，其中 `template` 与设置页自定义模板相同。返回：

```json
{ "status": "ok", "provider": "…", "httpStatus": 200, "extracted": [ ... ], "sample": "前 4000 字符" }
```

失败时返回 `status: "error"`、`code`、`httpStatus`、`message`、`sample`；找不到 key 时返回 `status: "no-credential"`。probe 不落盘，仅用于验证模板。

## 6. 模板模型

### 6.1 字段

```js
{
  id: 'deepseek-official',
  label: 'DeepSeek API',
  kind: 'http',                         // 内置模板可用 'account'
  match: {
    providerIds: ['deepseek-official', 'deepseek-*'],
    baseURLPatterns: ['*api.deepseek.com*'],
  },
  request: {
    method: 'GET',
    url: '{baseURL}/user/balance',      // 支持 {baseURL} 与 {origin}
    headers: {},
    body: null,
  },
  auth: {
    type: 'bearer',                     // bearer | x-api-key | none
    credentialRefs: ['DEEPSEEK_API_KEY'],
  },
  extract: {
    items: [
      { label: 'Balance', amountPath: 'balance_infos[*].total_balance', currencyPath: 'balance_infos[*].currency' },
    ],
  },
  timeoutMs: 10000,
  defaultBaseURL: 'https://api.deepseek.com',
  parser: 'kimi',                       // 仅内置模板：自定义 parser 实现
  experimental: true,
}
```

- `[ * ]` 与 `[n]` 可出现在路径的任意一段；`[*]` 会把数组展开为多个候选值。
- 自定义模板（设置页保存）只支持 `amountPath`-型提取，即金额；不会接受 `parser`。
- 限额解析由 Host 内置解析器完成：`kimiQuotaItems()` 与 `glmQuotaItems()`。

### 6.2 匹配打分

```
score = providerMatch × 2 + baseURLMatch
      + (2 当 provider 精确等于某个 providerIds 元素)
      + (3 当候选来自自定义模板)
```

按分数降序；分数相同自定义模板优先；都相同保持内置声明顺序。`providerMatch`/`baseURLMatch` 走 `globToRegExp`（`*` 通配）。完全无匹配则返回 `unsupported`。

### 6.3 回退策略

- 自定义模板：唯一候选，绝不回退到内置模板，避免覆盖用户的显式选择。
- 内置模板：候选最多 3 个；仅当错误为 `extract-empty`、`invalid-response` 或 HTTP 400/401/403/404 时尝试下一个。
- 如果所有候选都没有 key，返回 `no-credential`；否则抛出最后一次错误。
- 典型场景：GLM Coding Plan key 打到编码端点成功；普通 Zhipu key 被拒后回退到标准余额端点。

### 6.4 baseURL 与凭证解析顺序

baseURL：

1. 供应商设置里的 `baseURL`（通过 `llm.listConfigurableProviders().settingsNs` + `settings.describe()` 读取）；
2. `llm` 返回的 `defaultBaseURL`；
3. `baseURLEnv` 指向的环境变量；
4. 模板的 `defaultBaseURL`。

凭证（只读）：

1. 模板 `auth.credentialRefs`；
2. 供应商 `nativeAuth.env`；
3. 供应商设置里的 `apiKeyEnv`；
4. `baseURLEnv` 指向的环境变量；
5. `ctx.credentials.listRecords()` 中 scope 等于 provider id 的 `api-key` 记录；
6. 记录内 `env` 引用。

任一来源解析到非空字符串即停止。绝不调用 `set`/`unset`/`modifyRecord`/`deleteRecord`。

## 7. 设置持久化

- 路径：`settingsPath(process.env)`，默认 `<DSH_HOME>/dsh-quotaline/settings.json`；`DSH_HOME` 未设置时回退 `os.homedir()/.dsh`，不出现硬编码盘符。
- 写入：先写临时文件再 rename；Windows 上 rename 被占用时先 unlink 再重试。
- 内容始终由 `sanitizeSettings()` 归一化后落盘；缺字段回退默认值；`refreshSeconds` 夹在 10–3600 秒。
- 读取失败或 JSON 损坏时回退默认设置，不阻塞条带。

## 8. 安全与隐私

- 凭证只在 Host 内存里短暂存在，用于构造请求头；不写日志、不返回、不缓存到磁盘。
- Client 只收到 `label`/`amount`/`currency`/`percent`，收不到 key，也收不到供应商原始响应（probe 除外，且 sample 截断到 4000 字符）。
- 设置页无法输入 API Key；key 来自用户在 DSH「设置 → 模型」中配置的凭证。
- POST 路由校验 Origin 与 JSON Content-Type；路由只监听同源 loopback。
- 模型切换后旧请求会被 abort，避免旧供应商的响应覆盖新供应商的状态。
- `.credentials.yaml` 由 DSH 的 credentials provider 管理，本插件只读。

## 9. Client UI 约定

- 条带注册：`slots.inject('conversation.input.dock', () => slots.register({ name: 'conversation.input.dock', id: 'dsh-quotaline', order: 30 }, QuotaStrip))`。
- 设置页注册：`slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: 'dsh-quotaline', order: 12 }, QuotaSettings))`。
- 宽度对齐 composer：外层 `calc(100% - 2*var(--dsh-composer-side-clearance) - 4*var(--dsh-composer-dock-inset))`，内层 `maxWidth: calc(var(--dsh-composer-card-max-width) - 4*var(--dsh-composer-dock-inset))`。
- 单行显示；内容超宽时横向滚动，原生滚动条隐藏，改用 3px 悬浮指示条（滚动时出现，900ms 后淡出）。
- 气泡底色按语义着色，用 `color-mix()` 混入 `--dsw-alias-bg-layer-2`，因此 light/dark 自动适配：
  - Balance / Top-up / Available / 5h 窗口 → info（天蓝 `#0EA5E9`，DSH 主题没有蓝色 alias，故用插件常量）；
  - Bonus / Weekly 窗口 → success；
  - Monthly 窗口 → warn；
  - Refresh → error 系淡红色（`--dsw-alias-state-error-primary` 12% 填充 / 30% 描边），且与数值气泡同为 24px 高、13px 字号；
  - 其他未知项 → neutral。
- 渲染前用 `isRenderableItem()` 过滤：限额项必须有有限数值的 `percent`，余额项必须有非空 `amount`；取不到的 5h / 周 / 月窗口直接不显示，不占位。
- 赠送余额常驻显示，为 0 也保留（不再有 `isZeroBonus`）。
- 百分比数值统一使用主文字色，不再按阈值改色；颜色语义由气泡底色表达。
- i18n：`language` 支持 `auto | zh | en`；文案集中在 `MESSAGES`，条带与设置页共享。
- 不使用 `document.body`、不读取其他插件的 DOM、不 import Harness Client 包。

## 10. 测试

- `test/` 是本地开发目录，已在 `.gitignore` 排除，也不在 `package.json` 的 `files` 里（不随仓库/包发布）。
- 命令：`node --test --test-isolation=none "test/*.test.mjs"`（`--test-isolation=none` 让用例在单进程运行，避免 Windows 沙箱禁止子进程 pipe 导致的 `spawn EPERM`；不要写成 `node --test test`）。
- `test/paths.test.mjs`：路径展开、畸形路径、跨平台 `settingsPath`。
- `test/extract.test.mjs`：金额提取、币种、auth 头。
- `test/match.test.mjs`：模板匹配优先级、内置模板选择、语言校验。
- `test/quota-windows.test.mjs`：Kimi 新旧响应、GLM 时间窗、回退顺序。
- 手工验收：模型切换 1 秒内刷新、Account/Official 显示正确、设置页增删改 + 测试按钮、刷新间隔生效、`.credentials.yaml` 的 SHA256 与 mtime 不变。

## 11. 新增供应商模板

**内置模板**（代码级）：

1. 在 `index.js` 的 `BUILTIN_TEMPLATES` 增加模板；金额型提供 `extract.items`，限额型提供 `parser` 并在 `extractItems()` 注册解析函数。
2. 补本地 `test/match.test.mjs` 或 `test/quota-windows.test.mjs` 的样例响应断言（测试目录不提交）。
3. 更新 README「内置模板」与 docs/DETAIL.md。
4. Host 改动后需要 `plugin_manager set_plugin` 先禁用再启用，或重启 DSH。

**用户自定义模板**（设置页）：填写 provider id 匹配、显示名、方法、URL、认证方式与凭证引用、金额路径、币种（固定值或路径）、超时；保存前用「测试」验证。若供应商使用非金额型限额，目前需要贡献内置解析器。

## 12. 发布

- 包名：`dsh-quotaline`（npm 上可用，2026-11-16 校验）。
- npm：`npm login` → `npm publish`；账号与 2FA 由仓库所有者本人操作。
- GitHub：`QianChang927/dsh-quotaline`；初始化仓库后 push，并为每个版本打 tag / 建 Release。
- 安装验证：`dsh plugin --profile desktop add dsh-quotaline`，随后检查 dock 与设置页 occupant 是否 active。
- 版本变更时同步 `package.json` 的 `version` 与 `PACKAGE_VERSION`（`index.js` 顶部）。
