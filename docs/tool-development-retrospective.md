# Toolbag 新工具开发复盘

本文记录 v0.2 插件化框架收尾，以及第一个外部插件 `Hash & Base64` 从开发、发布、安装到修复过程中遇到的问题。目标是给后续工具开发留一份可复用的排错和流程参考。

涉及仓库：

- 主程序：`LFenX/Toolbag-Windows`
- Registry：`LFenX/Toolbag-Registry`
- 示例插件：`LFenX/toolbag-plugin-HashAndBase64`

涉及本地目录：

- 主程序：`D:\appmy\toolbag`
- Registry：`D:\appmy\Toolbag-Registry`
- 插件：`D:\appmy\Toolbag-Plugins\toolbag-plugin-HashAndBase64`

## 1. 密钥和签名链路

### 1.1 Tauri 更新签名和插件签名不是一回事

过程中容易混淆两个签名体系：

- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` / `TAURI_UPDATER_PUBKEY`
  用于 Toolbag 主程序更新包。
- `TOOLBAG_PLUGIN_PRIVKEY` / `TOOLBAG_PLUGIN_PRIVKEY_PASSWORD` / `TOOLBAG_PLUGIN_PUBKEY`
  用于 `.tbpkg` 插件包 minisign 签名。

经验：

- Tauri updater key 由 `tauri signer generate` 生成。
- 插件 key 由 `minisign -G` 生成。
- 插件 release 构建必须有 `.tbpkg.sig`，否则 release 版 Toolbag 会拒绝安装。

### 1.2 生成 Tauri key 时必须在主仓执行

错误做法：

```powershell
cd C:\Users\LFen
corepack pnpm tauri signer generate -w "$env:USERPROFILE\.tauri\toolbag.key"
```

会失败，因为当前目录没有 `package.json`。

正确做法：

```powershell
cd D:\appmy\toolbag
corepack pnpm tauri signer generate -w "$env:USERPROFILE\.tauri\toolbag.key"
```

另外，当前 Tauri CLI 使用：

```powershell
corepack pnpm tauri signer generate -w "<path>"
```

不是：

```powershell
corepack pnpm tauri signer generate -- -w "<path>"
```

### 1.3 minisign 不一定已安装

如果出现：

```text
minisign : 无法将“minisign”项识别为 cmdlet
```

说明本机没有安装 minisign 或 PATH 不包含它。发布 workflow 里后来改成直接下载 `jedisct1/minisign` Windows zip，避免依赖 Chocolatey。

### 1.4 忘记 minisign 密码时如何确认

可以用一次测试签名验证密码是否正确：

```powershell
minisign -S `
  -m "$env:USERPROFILE\.toolbag-keys\toolbag-plugin.pub" `
  -s "$env:USERPROFILE\.toolbag-keys\toolbag-plugin.sec" `
  -x "$env:TEMP\test.minisig"
```

如果能完成 `Deriving a key ... done`，说明密码正确。

## 2. GitHub 配置和自动化

### 2.1 GitHub Webhook 不是 GitHub 插件连接入口

一开始误进了 GitHub 仓库 Settings -> Webhooks。那个页面需要填 `Payload URL`，不能填邮箱，也不是给 Codex/GitHub 插件用的。

后续开发一般不需要手动配置 Webhook。Toolbag 的自动化主要靠：

- GitHub Actions
- Repository Secrets / Variables
- `peter-evans/create-pull-request`
- GitHub Pages

### 2.2 插件仓必须配置的 secrets

插件仓 `LFenX/toolbag-plugin-HashAndBase64` 需要：

```text
TOOLBAG_PLUGIN_PRIVKEY
TOOLBAG_PLUGIN_PRIVKEY_PASSWORD
REGISTRY_PR_TOKEN
```

推荐配置 variable：

```text
TOOLBAG_PLUGIN_PUBKEY
```

用途：

- `TOOLBAG_PLUGIN_PRIVKEY`：minisign 私钥全文。
- `TOOLBAG_PLUGIN_PRIVKEY_PASSWORD`：私钥密码。
- `REGISTRY_PR_TOKEN`：对 `LFenX/Toolbag-Registry` 有 Contents write 和 Pull requests write 权限的 PAT。
- `TOOLBAG_PLUGIN_PUBKEY`：CI 签名后做一次验签冒烟测试。

### 2.3 release workflow 应该强制签名

早期风险：如果签名 secret 缺失，workflow 可能静默跳过签名，最后发布未签名包。

修复策略：

- release workflow 开头预检 `TOOLBAG_PLUGIN_PRIVKEY`。
- 缺失就 fail。
- 签名步骤无条件执行。
- 签名后检查 `.sig` 文件确实存在。
- 如果配置了公钥变量，再执行一次 `minisign -V`。

### 2.4 tag 版本必须和 `tool.json.version` 一致

发布时必须保证：

```text
git tag v0.1.2
tool.json version = 0.1.2
sidecar/Cargo.toml version = 0.1.2
changelog.md 有 0.1.2 条目
```

workflow 已加保护：tag 和 manifest version 不一致就 fail。

## 3. Registry 和 GitHub Pages

### 3.1 GitHub Pages 需要 Source = GitHub Actions

Registry 初次部署时 `actions/configure-pages@v5` 报：

```text
Resource not accessible by integration
```

处理方式：

- 在 Registry 仓 Settings -> Pages，把 Source 设置为 `GitHub Actions`。
- workflow 权限包含：

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

### 3.2 Registry 输出格式要和客户端结构一致

线上 `index.json` 曾经失败：

```text
注册中心 JSON 解析失败：invalid type: map, expected a string at line 74 column 16
```

原因：

```json
"author": {
  "name": "LFen",
  "url": "https://github.com/LFenX"
}
```

但主程序 `RegistryEntry.author` 当时只接受字符串。

修复：

- Registry `scripts/build-index.mjs` 归一化作者字段，输出字符串：

```json
"author": "LFen"
```

- 主程序也做了兼容，允许 Registry author 是字符串或对象。

经验：

- Registry 的扁平 `index.json` 是客户端直接消费的稳定接口。
- 插件原始 `tool.json` 可以更丰富，但输出到 `index.json` 时要做兼容归一化。

### 3.3 release 包本地 SHA 和 CI SHA 不一定一样

同样源码，本地 `.tbpkg` 和 CI `.tbpkg` 的 SHA 可能不同，因为：

- zip 文件时间戳不同
- Windows runner 打包细节不同
- sidecar release 构建环境不同

Registry 必须使用 CI release workflow 产出的 SHA，而不是本地包 SHA。

### 3.4 自动 Registry PR 是可行的

插件 release workflow 已实现：

1. 构建 sidecar。
2. 打包 `.tbpkg`。
3. 生成 `.sha256`。
4. minisign 签名生成 `.sig`。
5. 创建 GitHub Release。
6. checkout `LFenX/Toolbag-Registry`。
7. 运行 `.github/scripts/update-registry.mjs`。
8. 创建 `bump/<id>-<version>` 分支并开 PR。

这条链路已经验证过 `0.1.0`、`0.1.1`、`0.1.2`。

## 4. Marketplace 下载和网络问题

### 4.1 Registry 能显示，不代表 Release 包一定能下载

曾遇到：

```text
下载失败：https://github.com/...tbpkg: Connection Failed: Connect error: connection timed out
```

排查结果：

- `index.json` 正常。
- release URL 正常。
- `.tbpkg` 和 `.sig` 都存在。
- 本机 PowerShell 可下载。
- 最终原因是本机代理/流量端口配置不对。

经验：

- 如果 Marketplace 能看到插件，但安装下载超时，优先检查 GitHub Release 下载链路和代理端口。
- Toolbag 设置里的 HTTP Proxy 应填写当前可用端口，例如：

```text
http://127.0.0.1:7890
```

### 4.2 本地安装和 Marketplace 安装的签名要求不同

release 构建如果启用了插件公钥，安装本地未签名包会被拒绝。

调试选择：

- 用 dev 构建测试未签名包。
- 或本地也生成 `.sig`，从文件安装时同时提供签名。
- 或直接发布到 GitHub Release，从 Marketplace 走正式签名链路。

## 5. UI Schema 遇到的问题

### 5.1 `visibleWhen` 字符串必须加引号

错误写法：

```json
"visibleWhen": "mode==hash"
```

原因：

- `hash` 会被表达式引擎当成变量名。
- 初始 `mode` 和未定义变量 `hash` 都是 `undefined`，结果误判为 true，所有字段都显示。
- 切换 mode 后，`mode` 变成字符串，但 `hash` 仍是 undefined，结果字段全部隐藏。

正确写法：

```json
"visibleWhen": "mode == 'hash'"
```

### 5.2 初始默认值不能只依赖字段 `default`

问题：

- `tabs` 字段里写了 `"default": "hash"`。
- 但主程序旧逻辑没有把默认值写进初始 `formState`。
- 因此刚进工具时 `mode` 实际是 `undefined`。

临时兼容写法：

```json
"visibleWhen": "!mode || mode == 'hash'"
```

框架修复：

- 主程序 `ToolPage.tsx` 增加 `buildDefaultFormState()`。
- 渲染 Schema 工具时，把所有字段的 `default` 和 hidden `value` 写入初始表单状态。
- reset 时也恢复到默认状态，而不是 `{}`。

经验：

- 插件作者仍建议对默认 tab 做 `!mode || mode == 'xxx'` 兼容。
- 框架也必须初始化默认值，避免所有插件重复踩坑。

### 5.3 不要给不同模式共用同一个输入 key

早期 Base64 编码和解码都用：

```json
"key": "b64_input"
```

问题：

- 从编码切到解码时，原文留在输入框里，被当成 Base64。
- 用户容易困惑。

修复：

```json
"key": "b64_plain"
"key": "b64_encoded"
```

sidecar 为兼容旧参数，同时接受：

```text
b64_plain / b64_encoded / b64_input / text
```

### 5.4 Tabs 标签不要太长

截图中 `Base64 编码`、`Base64 解码` 在窄面板里折行，观感一般。

后续建议：

- 表单左栏宽度有限时，tabs label 控制在 4-6 个汉字以内。
- 可以用 `编码` / `解码`，在标题或 help 里解释是 Base64。
- 或者改成 `select`，让 tab 只承担大类切换。

### 5.5 插件 UI 太复杂时，不要强塞一个通用表单

SchemaForm 适合快速工具，但它的表达力有限。

如果一个工具需要：

- 多输入区联动
- 多结果卡片
- 内联复制按钮
- 历史记录
- 示例填充
- 高级选项折叠
- 可视化 diff 或表格

应考虑：

- 扩展 SchemaForm 字段和 ResultRenderer。
- 或把工具做成 builtin/custom renderer。

## 6. ResultRenderer 和复制结果

### 6.1 输出结构应统一

早期不同功能输出结构不同：

- Hash: `data.hash`
- Base64: `data.output`
- HMAC: `data.hex`
- JWT: `data.header` / `data.payload`

导致复制按钮和结果区难统一。

现在统一为：

```json
{
  "summary": {
    "任务": "Hash",
    "算法": "SHA-256"
  },
  "data": {
    "result": "...",
    "details": {}
  }
}
```

UI 复制核心结果：

```json
{
  "kind": "copy",
  "source": "$result.data.result"
}
```

经验：

- `summary` 给人看，走 `keyValue`。
- `data.result` 是最常用输出，给复制按钮。
- `data.details` 保留完整机器可读信息。

### 6.2 主程序 ResultRenderer 还比较基础

当前结果区仍然偏简洁：

- status 文案固定。
- code 区没有标题。
- keyValue 和 code 之间层次弱。
- 缺少 per-result copy button。

后续可改进：

- 增加 result renderer 的 `title`、`emptyText`、`copyable`。
- 支持 `code` renderer 指定展示高度。
- 支持 `jsonTree` 或更漂亮的 JSON viewer。
- 支持多个 result block 的间距和标题。

## 7. SchemaForm 框架修复

本轮主程序已修：

1. 去掉字段右上角的开发者类型徽标。

早期 UI 会显示：

```text
Textarea
RadioGroup
Text
```

这对用户没有意义，只会让工具显得像调试界面。

2. `textarea` 支持 `placeholder`。

之前 `ui.json` 写了 placeholder，但主程序没有传给 `<textarea>`，所以用户看不到提示。

3. 初始化字段默认值。

`tabs.default = "hash"` 现在会写入初始 `formState`。

4. reset 恢复默认值。

点击清空后不再回到空对象，而是回到 schema 默认状态。

## 8. sidecar 开发经验

### 8.1 sidecar 要支持直接命令，也要支持统一 `run`

保留：

```text
run
hash.text
base64.encode
base64.decode
hmac.sha256
jwt.decode
```

`run` 根据 `params.mode` 分发。这样当前 UI 简单，未来其他前端或命令面板也能直接调用具体命令。

### 8.2 错误信息要面向用户

早期错误偏协议层：

```text
missing field: hash_input
unknown mode
```

现在改为：

```text
请输入要计算 Hash 的文本。
请输入要解码的 Base64。
JWT 必须包含 header.payload.signature 三段。
```

经验：

- sidecar 错误会直接出现在 Toolbag UI。
- 错误文案应当用户可理解，而不是只给开发者看。

### 8.3 保留兼容字段名

Base64 从 `b64_input` 拆成：

```text
b64_plain
b64_encoded
```

但 sidecar 仍接受旧的 `b64_input`，这样历史 UI 或其他调用方不会马上坏。

### 8.4 给 sidecar 加最小测试

已加测试：

- 默认模式能走 Hash。
- Base64 编码/解码 round-trip。
- JWT `iat` 时间格式化正确。

后续每个插件至少应覆盖：

- 默认参数。
- 每个 mode 的 happy path。
- 关键错误输入。
- 输出结构是否含 `summary` 和 `data.result`。

## 9. 发布和更新流程

### 9.1 插件修复发布标准流程

1. 修改插件代码：

```powershell
cd D:\appmy\Toolbag-Plugins\toolbag-plugin-HashAndBase64
```

2. 更新版本：

```text
tool.json
sidecar/Cargo.toml
changelog.md
```

3. 本地验证：

```powershell
cd sidecar
cargo test
cargo clippy --all-targets -- -D warnings
cargo build --release
```

4. 本地打包 `.tbpkg` 冒烟测试。

5. 提交并推送：

```powershell
git add .
git commit -m "fix: ..."
git push origin main
```

6. 打 tag：

```powershell
git tag v0.1.2
git push origin v0.1.2
```

7. 等 release workflow 成功。

8. 合并 Registry 自动 PR，或快进合并自动分支。

9. 等 Pages 更新。

10. 在 Toolbag Marketplace 刷新并更新插件。

### 9.2 主程序框架修复流程

如果插件暴露出框架问题，例如：

- SchemaForm 不初始化 default。
- textarea 不显示 placeholder。
- ResultRenderer 能力不够。
- Registry 解析类型太窄。

则改主仓：

```powershell
cd D:\appmy\toolbag
```

验证：

```powershell
corepack pnpm lint
corepack pnpm test
corepack pnpm build
cargo test --lib
cargo clippy --all-targets -- -D warnings
```

如果需要本地安装包：

```powershell
$env:TOOLBAG_PLUGIN_PUBKEY = Get-Content -Raw "$env:USERPROFILE\.toolbag-keys\toolbag-plugin.pub"
corepack pnpm tauri:build
```

产物：

```text
D:\appmy\toolbag\src-tauri\target\release\bundle\nsis\Toolbag_0.2.0_x64-setup.exe
```

## 10. 版本记录

`Hash & Base64` 发布过的关键版本：

### 0.1.0

- 第一个正式外部插件。
- 验证了插件 release、签名、Registry PR、Marketplace 安装链路。

### 0.1.1

- 修复 mode 切换后空白。
- Base64 拆成编码/解码两个 tab。
- 输出统一到 `data.result`。
- 复制按钮改为复制核心结果。
- sidecar 错误文案更用户友好。

### 0.1.2

- 修复首次进入工具时仍然空白的问题。
- 插件兼容 `mode` 未初始化：`!mode || mode == 'hash'`。
- 主程序修复 SchemaForm 默认值初始化。

## 11. 后续改进建议

### 11.1 UI 体验

当前工具仍可继续增强：

- 缩短 tab 文案，避免换行。
- 增加示例按钮，例如“填入 JWT 示例”。
- 增加自动执行选项：输入后延迟计算。
- 增加每个结果块的独立复制按钮。
- Hash 支持大小写输出。
- Base64 支持 URL-safe 编码、补 padding、去换行。
- HMAC 支持 SHA-1、SHA-256、SHA-512。
- JWT 支持过期状态高亮。

### 11.2 框架能力

建议后续补：

- `visibleWhen` 支持更清晰的错误提示。
- 启动时在 dev console 输出每个字段的可见性求值结果。
- UI schema schema 文件补充 `textarea.placeholder`。
- `UiAction.kind` 命名统一，避免 schema 里 `open-url` 和 TS 里 `openUrl` 不一致。
- ResultRenderer 增加 `copyable`、`title`、`emptyText`。
- SchemaForm 支持 section、divider、inline help、example buttons。

### 11.3 发布链路

建议：

- release workflow 自动等待或提示 Registry PR URL。
- Registry build 加 schema 校验，提前发现 author 类型不匹配。
- Registry index 增加 `schemaVersion` 兼容策略。
- Marketplace 下载加重试和更清晰的代理错误提示。

## 12. 快速排错表

| 现象 | 可能原因 | 处理 |
|---|---|---|
| Marketplace 空白 | Registry JSON 解析失败 | 看日志，检查 `index.json` 字段类型 |
| 插件能显示但下载失败 | GitHub Release 下载超时或代理端口错 | 检查 Toolbag HTTP Proxy 和 release URL |
| 本地安装包被拒 | release 构建启用了签名校验但包未签名 | 提供 `.sig` 或用 dev 构建 |
| 刚进工具表单空白 | `mode` 未初始化，visibleWhen 不匹配 | 插件用 `!mode || mode == 'hash'`，框架初始化 default |
| 切换 mode 后空白 | `visibleWhen` 字符串没加引号 | 使用 `mode == 'hash'` |
| 所有字段一起显示 | 未定义变量比较误判 | 检查表达式右侧是否写成字符串字面量 |
| 复制结果是一大段 JSON | copy source 指向 `$result` | 改成 `$result.data.result` |
| tab 文案换行难看 | 左栏宽度不足、label 太长 | 缩短 label 或改 select |
| release workflow 没有签名 | signing secret 缺失或被跳过 | workflow 预检并强制签名 |
| tag 发布失败 | tag 和 `tool.json.version` 不一致 | 同步版本后重新 tag |

