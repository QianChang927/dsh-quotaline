# Changelog

## [Unreleased]

### 中文

新增可选的「显示位置」设置。默认行为完全不变：仍是在输入框上方显示整条额度条，
现有配置和升级后的表现一致。把 `placement` 设为 `inline` 后，同样的数据收成输入框
工具栏里、模型选择器左侧的一行读数：只显示一个读数（余额优先，否则已用比例最高的
限额窗口），悬停提示与无障碍名称列出全部读数与更新时间，点击立即刷新。

两个位置始终注册、按设置自我过滤，所以改设置即时生效；未选中的位置返回 `null`，
并通过 `useQuotaStatus` 的 `enabled: false` 跳过请求、轮询与 SSE。

#### 新增

- `settings.placement`：`dock`（默认）或 `inline`，随 `GET | POST /settings` 读写，
  未知值回退 `dock`；旧 `settings.json` 缺该字段时按默认处理，不需要迁移。
- 设置页「显示位置」下拉框，以及 `conversation.input.right` 的行内读数组件、中英文
  文案与无障碍名称。
- `docs/ARCHITECTURE.md` 补充行内读数的注册、样式与 `enabled` 语义。

### English

Adds an optional **Placement** setting. The default is unchanged: the full-width strip
above the composer, so existing configurations and upgrades behave exactly as before.
With `placement: inline`, the same data collapses into one reading in the composer tool
row, immediately left of the model selector: a single reading (balance first, otherwise
the most constrained limit window), every reading and the update time in the tooltip and
accessible name, and a click to refresh.

Both seats stay registered and filter themselves by the setting, so changing it applies
immediately; the hidden seat returns `null` and skips requests, polling, and SSE through
`useQuotaStatus`'s `enabled: false`.

#### Added

- `settings.placement`: `dock` (default) or `inline`, read and written through
  `GET | POST /settings`; unknown values fall back to `dock`, and an older `settings.json`
  without the field keeps the default, so no migration is needed.
- A **Placement** select in the settings page, the inline reading component in
  `conversation.input.right`, its Chinese and English copy, and its accessible name.
- `docs/ARCHITECTURE.md` notes for the inline registration, its styling, and the
  `enabled` semantics.

## [0.3.1] - 2026-11-18

### 中文

本次发布为插件市场收录补齐素材，并统一文档与文案：新增市场图标、八张真实界面
预览图与中文详情页，同时把 DSH 账号界面的「赠金」称呼同步到插件文案，并让余额与
限额的显示舍入更严谨。运行时变化只有文案与百分比显示两处。

#### 新增

- 新增八张 1600×480 预览图至 `docs/previews/`，覆盖账户余额与用量窗口两类形态、
  明暗两套主题、中英两种语言；均由真实 `dsh web` 界面渲染截取，用量窗口一类通过
  本地模拟的智谱额度接口驱动真实解析与渲染。
- 新增 `docs/DETAIL.zh-CN.md`，并把 `locale/zh.json` 的 `meta.detail` 指向它：
  中文用户的详情页不再显示英文内容。
- 新增仓库根 `icon.png`（256×256，市场图标，由 `icon.svg` 渲染）与
  `screenshots.json`（四条英文截图路径），供插件市场抓取。

#### 变更

- 中文「赠送余额」改为「赠金」，与 DSH 账号界面用词一致；`translateLabel` 继续
  接受 `赠送余额`、`赠金` 与 `bonus`，旧模板与缓存不受影响。
- `docs/ARCHITECTURE.md` 的仓库结构树与 `README.md`、`docs/README.zh-CN.md`、
  `docs/DETAIL.md` 的图片引用同步更新。
- 金额与百分比的显示规则写进 `README.md` 与 `docs/README.zh-CN.md` 的
  `## 数值与舍入` / `## Numbers and rounding` 一节，并把舍入改为在十进制字符串上
  完成：`0.005` 不再被浮点误差抹成 `0.00`；限额取整数百分比，`100%` 与 `0%`
  只在真实边界出现。

#### 移除

- 移除 `docs/preview-{light,dark}-{account,limit}.svg` 四个手绘预览图，由 PNG 取代。

### English

This release fills in the assets the plugin marketplace expects and aligns the
docs and wording: a marketplace icon, eight real-interface previews, and a
Chinese detail page, plus the "granted balance" wording the DSH account screen
uses and stricter display rounding for balances and limits. Only the wording and
the percentage display change at runtime.

#### Added

- Eight 1600×480 previews under `docs/previews/`, covering account balance and
  usage windows, light and dark themes, and English and Chinese; each is captured
  from a real `dsh web` window, and the usage previews are driven by a local mock
  of the Zhipu quota endpoint so the real parser and renderer produce them.
- `docs/DETAIL.zh-CN.md`, now the target of `meta.detail` in `locale/zh.json`, so
  Chinese users no longer land on an English detail page.
- A repository-root `icon.png` (256×256 marketplace icon rendered from
  `icon.svg`) and `screenshots.json` (four English screenshot paths) for the
  marketplace to pick up.

#### Changed

- The Chinese label for bonus balance is now 「赠金」, matching the DSH account
  screen; `translateLabel` still accepts `赠送余额`, `赠金`, and `bonus`, so older
  templates and caches keep working.
- The repository tree in `docs/ARCHITECTURE.md` and the image references in
  `README.md`, `docs/README.zh-CN.md`, and `docs/DETAIL.md` were updated.
- The rounding rules for amounts and percentages are now documented in
  `## Numbers and rounding` in `README.md` and `docs/README.zh-CN.md`, and the
  rounding itself runs on decimal strings: `0.005` no longer collapses to `0.00`
  through floating-point error. Limits show whole percentages, and `100%` / `0%`
  appear only at the real boundary.

#### Removed

- The four hand-drawn SVGs `docs/preview-{light,dark}-{account,limit}.svg`,
  replaced by the PNG previews.

## [0.3.0] - 2026-11-16

### 中文

新增“任务运行时自动刷新”：Agent 每次模型响应完成后，Host 通过同源 SSE 通道
推送一个匿名 tick，额度条据此刷新（最少间隔 8 秒）；tick 带 provider 身份，
子代理使用不同 provider 时不会刷新主条带。事件流不可用时回退轮询（在线 60 秒、
离线 15 秒），该行为可在设置页关闭。

#### 新增

- 设置项 `liveRefresh`（默认开启）；旧版设置文件缺少该字段时按开启处理。
- Host 订阅 `session/event` 的 `assistant/message`，按 provider 1 秒合并后通过 `GET /dsh-quotaline/api/activity`（SSE）推送 `{provider, model, at}`；不含会话 id、余额或密钥。
- 客户端按 provider 过滤 tick，8 秒节流并尾随补刷；SSE 断线按 1/2/5/10/30 秒退避重连。
- 运行中兜底：事件流在线但长时间无事件 60 秒、事件流断开 15 秒；关闭开关后只按空闲间隔。
- 设置页新增“任务运行时自动刷新 / Live refresh during runs”开关，中英文案齐全。

### English

Adds live refresh during runs: after each completed model response the Host
announces an anonymous tick over a same-origin SSE stream and the strip
refreshes from it (at most once every 8 seconds). Ticks carry the provider
identity, so a subagent running on a different provider never refreshes the
main strip. When the stream is unavailable the client falls back to polling
(60 s while connected but quiet, 15 s while down). The behavior can be turned
off in Settings.

#### Added

- A `liveRefresh` setting (enabled by default); older settings files without the
  field are treated as enabled.
- The Host listens to `session/event` `assistant/message`, coalesces ticks per
  provider for one second, and publishes `{provider, model, at}` over
  `GET /dsh-quotaline/api/activity`; no session id, balance, or credential is sent.
- The client filters ticks by provider, throttles to one refresh every 8 seconds
  with a trailing refresh, and reconnects the stream with 1/2/5/10/30 s backoff.
- Run-time fallbacks: 60 seconds while the stream is connected but quiet, 15
  seconds while it is down; turning the setting off leaves only the idle interval.
- A **Live refresh during runs** toggle on the settings page, with English and
  Simplified Chinese copy.

## [0.2.2] - 2026-11-16

### 中文

文档一致性补丁：修正 0.2.1 的版本记录，使 npm 包与 GitHub 仓库携带同一份
CHANGELOG。此版本不包含代码行为变更。

#### 修复

- 移除 0.2.1 条目上方空的 `[Unreleased]` 小节，已发布版本不再出现在未发布区域。
- 版本链接指向 `v0.2.2` 标签，`0.2.1` 保留标签链接。

### English

Documentation consistency patch: corrects the 0.2.1 release record so the npm
package and the GitHub repository carry the same CHANGELOG. No runtime behavior
changes.

#### Fixed

- Removed the empty `[Unreleased]` section above 0.2.1 so released versions no
  longer sit under the unreleased area.
- Version links point at the `v0.2.2` tag, with 0.2.1 tag links retained.

## [0.2.1] - 2026-11-16

### 中文

调整插件管理页里的组件标识：额度条组件现在显示为 `quota-line`，不再与包名
`dsh-quotaline` 重复。

#### 变更

- `cordis.patch.yml` 中的组件 id 由 `dsh-quotaline` 改为 `quota-line`；模块名仍是
  `dsh-quotaline`。

### English

Adjusts the component identity in the plugin manager: the strip component now reads
`quota-line` instead of repeating the package name `dsh-quotaline`.

#### Changed

- The component id in `cordis.patch.yml` is now `quota-line`; the module name remains
  `dsh-quotaline`.

## [0.2.0] - 2026-11-16

### 中文

新增限额显示方式设置：限额气泡可以显示“已用”，也可以切换为“剩余”；气泡文本改为
百分比加后缀，后缀随界面语言显示。

#### 新增

- 设置新增 **限额显示**：`已用`（默认）或 `剩余`。余额气泡不参与换算。
- 限额气泡文本由 `{percent}%` 改为 `{percent}% {suffix}`：中文显示 `已用` / `剩余`，
  英文显示 `used` / `left`；选择 `剩余` 时数值为 `100 − 已用`。
- 设置文件新增 `limitMode` 字段（`used` / `left`）；读取旧配置时自动补为 `used`。

### English

Adds a limit display setting: limit chips can show usage as used or left, and the
chip text now appends the mode suffix after the percentage.

#### Added

- New **Limit display** setting: `Used` (default) or `Left`. Balance chips are not
  converted.
- Limit chip text changed from `{percent}%` to `{percent}% {suffix}`: Chinese shows
  `已用` / `剩余`, English shows `used` / `left`; choosing `Left` displays
  `100 − used`.
- New `limitMode` field (`used` / `left`) in the settings file; older settings are
  upgraded to `used` automatically.

## [0.1.0] - 2026-11-16

### 中文

首个公开版本：在输入框上方常驻一条与输入框等宽的额度条，跟随当前模型显示余额或
订阅用量；凭证只从本地读取，不上传、不改写，也从不索要 API Key。

#### 新增

- 在 `conversation.input.dock` 注册整宽额度条，位于输入框上方、模式行下方。
- 自动跟随模型：读取会话的 `modelSelection` projection，空白会话回退到 profile
  默认模型；供应商或模型切换时立即中止旧请求并重新查询。
- 内置 DeepSeek Account 余额，通过 DSH 的 OAuth 账号服务读取充值余额与赠送余额。
- 内置 DeepSeek API 余额（`GET {baseURL}/user/balance`）与 Moonshot / Kimi 余额
  （`GET {baseURL}/v1/users/me/balance`）。
- 内置 Kimi Code 用量窗口（`GET {baseURL}/v1/usages`），同时兼容旧版
  `limits[]` + `usage` 与新版 `usages.limit_5h / limit_7d / limit_month_*` 响应。
- 内置智谱余额（`GET {baseURL}/api/paas/v4/balance`）与 GLM Coding Plan 用量窗口
  （`GET {origin}/api/monitor/usage/quota/limit`；`unit=3` 折算为小时、
  `unit=6` 折算为周、`TIME_LIMIT` 折算为月）。
- 声明式自定义模板：支持通配符的供应商 id 匹配、HTTP 方法与 URL、
  `{baseURL}` / `{origin}` 占位符、bearer / `x-api-key` / 无认证及凭证引用、
  支持 `[*]` 展开的 JSON 提取路径、币种路径与超时。
- 设置页 **设置 → Quota Line**：刷新间隔（10–3600 秒）、界面语言
  （跟随 DSH / 中文 / English）、内置模板只读列表、自定义模板增删改，
  以及实时 **测试** 请求。
- 气泡按语义着色并适配浅色与深色主题；Refresh 为淡红色胶囊，
  与余额气泡同高同字号。
- 赠送余额为 0 时仍然显示；接口未返回的 5h / 周 / 月窗口自动隐藏。
- 通过 Host `credentials` 服务只读本地凭证：不索要 Key、不同步、不上传，
  也从不改写 `.credentials.yaml`。
- 提供同源 `/dsh-quotaline/api/*` 路由用于查询状态、读写设置与测试模板；
  响应中永远不包含凭证。
- 设置保存在 `$DSH_HOME/dsh-quotaline/settings.json`，在 Windows、macOS、
  Linux 上于运行期解析路径。
- 提供英文与简体中文界面文案、插件元数据，以及包含浅色/深色预览的文档。

### English

Initial public release: a permanent, full-width quota strip above the composer
that follows the current model and shows either a balance or subscription usage.
Credentials are read locally only — never uploaded, rewritten, or requested.

#### Added

- Full-width quota strip registered in `conversation.input.dock`, directly above
  the composer and below the mode row.
- Automatic model following: reads the session `modelSelection` projection, falls
  back to the profile default for blank sessions, and aborts/re-queries
  immediately when the provider or model changes.
- Built-in DeepSeek Account balance via DSH's OAuth account service (top-up and
  bonus wallets).
- Built-in DeepSeek API balance (`GET {baseURL}/user/balance`) and
  Moonshot / Kimi balance (`GET {baseURL}/v1/users/me/balance`).
- Built-in Kimi Code usage windows (`GET {baseURL}/v1/usages`), parsing both
  legacy `limits[]` + `usage` payloads and the newer
  `usages.limit_5h / limit_7d / limit_month_*` shape.
- Built-in Zhipu balance (`GET {baseURL}/api/paas/v4/balance`) and GLM Coding Plan
  usage windows (`GET {origin}/api/monitor/usage/quota/limit`, `unit=3` → hours,
  `unit=6` → weeks, `TIME_LIMIT` → monthly).
- Declarative custom templates: provider-id matching with wildcards, HTTP
  method/URL, `{baseURL}`/`{origin}` placeholders, bearer / `x-api-key` / none auth
  with credential references, JSON extraction paths with `[*]` expansion,
  currency path, and timeout.
- Settings page at **Settings → Quota Line**: refresh interval (10–3600 s),
  interface language (follow DSH / 中文 / English), read-only built-in template
  list, custom template CRUD, and a live **Test** probe.
- Semantic chip colors with light and dark theme support; the Refresh action is a
  soft red capsule at the same height and font size as the balance chips.
- Zero bonus amounts stay visible, while 5h / weekly / monthly windows that the
  provider did not return are omitted.
- Read-only local credentials through the Host `credentials` service: no key
  prompts, no sync, no upload, and `.credentials.yaml` is never rewritten.
- Same-origin `/dsh-quotaline/api/*` routes for status, settings, and probe;
  responses never contain credentials.
- Cross-platform settings storage under `$DSH_HOME/dsh-quotaline/settings.json`,
  resolved at runtime on Windows, macOS, and Linux.
- English and Simplified Chinese UI strings, plugin metadata, and documentation
  with light/dark previews.

[0.3.1]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.3.1
[0.3.0]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.3.0
[0.2.2]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.2.2
[0.2.1]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.2.1
[0.2.0]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.2.0
[0.1.0]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.1.0
