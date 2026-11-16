# Changelog

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

[0.2.2]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.2.2
[0.2.1]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.2.1
[0.2.0]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.2.0
[0.1.0]: https://github.com/QianChang927/dsh-quotaline/releases/tag/v0.1.0
