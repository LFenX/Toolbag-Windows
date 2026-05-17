# 新增工具 / 插件

从 v0.2 起 Toolbag 的工具是**运行时可加载的插件**（`.tbpkg`），通过 GitHub Release + 中央 Registry 分发。一个工具有三种形态：

| `runtime.kind` | 谁负责执行 | 谁负责 UI | 用途 |
|---|---|---|---|
| `none` | 前端 SchemaForm | 前端 SchemaForm + ResultRenderer | 纯计算 / 文本变换工具 |
| `sidecar` | 原生子进程（任何语言） | 前端 SchemaForm + ResultRenderer | 大多数工具：执行系统命令、调用 API、处理文件 |
| `builtin` | 主进程内 Rust 函数 | 应用内编译的 React 组件 | 仅限官方仓库内置，迁移期遗留通道 |

本文先讲**作为插件作者**怎么发布一个新工具。如果你在 Toolbag 主仓改"内置工具"，跳到底部的"内置插件"章节。

---

## 1. 插件包结构

```
toolbag-plugin-<id>-<version>.tbpkg          # 实质是 zip
toolbag-plugin-<id>-<version>.tbpkg.sig      # minisign 签名（release 强制）
toolbag-plugin-<id>-<version>.tbpkg.sha256   # 完整性双保险
```

包内：

```
/
├── tool.json                              # 必需：清单
├── ui.json                                # runtime.kind != "builtin" 时必需
├── icon.svg                               # 可选；优先 SVG
├── README.md                              # 可选
├── changelog.md                           # 可选
├── bin/sidecar-windows-x64.exe            # runtime.kind = "sidecar" 时必需
└── assets/                                # 可选；插件运行时只读访问
```

## 2. tool.json

```json
{
  "$schema": "https://toolbag.lfen.dev/schemas/plugin/1.json",
  "id": "com.example.tools.hash",
  "name": "哈希计算",
  "version": "1.0.0",
  "category": "实用",
  "tags": ["实用", "加密"],
  "description": "对文件或文本计算 MD5/SHA1/SHA256/SHA512。",
  "detailDescription": "更详细的说明（可多行）。",
  "author": { "name": "Your Name", "url": "https://github.com/you" },
  "license": "MIT",
  "homepage": "https://github.com/you/toolbag-plugin-hash",
  "minAppVersion": "0.2.0",
  "riskLevel": "safe",
  "requiresElevation": false,
  "permissionRequirement": "普通权限",
  "dataAccess": "用户选择的文件 / 文本",
  "icon": "icon.svg",
  "runtime": {
    "kind": "sidecar",
    "binary": "bin/sidecar-windows-x64.exe",
    "args": [],
    "env": {},
    "startupTimeoutMs": 3000,
    "shutdownTimeoutMs": 1500
  },
  "commands": [
    { "id": "hash.file", "label": "哈希文件", "permissions": ["fs.read"] },
    { "id": "hash.text", "label": "哈希文本", "permissions": [] }
  ],
  "ui": "ui.json"
}
```

约束：

- `id` 必须是反域名（`^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$`），全局唯一。
- `version` 严格 semver。
- `riskLevel`：`safe | caution | elevated`。任何会写文件、改注册表、操作服务或 hosts 的工具应至少 `caution`。
- `commands[i].permissions` 是该命令真正用到的最小权限子集，必须是已知集合：`fs.read fs.write net shell registry process.list services.read`。

## 3. ui.json（声明式 UI）

```json
{
  "$schema": "https://toolbag.lfen.dev/schemas/ui/1.json",
  "layout": "split",
  "left": {
    "title": "输入",
    "fields": [
      { "key": "mode", "type": "tabs",
        "options": [
          { "value": "file", "label": "文件" },
          { "value": "text", "label": "文本" }
        ],
        "default": "file"
      },
      { "key": "filePath", "type": "filePicker", "visibleWhen": "mode==file" },
      { "key": "text", "type": "textarea", "rows": 6, "visibleWhen": "mode==text" },
      { "key": "algo", "type": "select",
        "options": ["md5","sha1","sha256","sha512"].map(v => ({ value: v })),
        "default": "sha256"
      }
    ],
    "actions": [
      { "id": "run", "label": "计算", "primary": true, "command": "hash.file" },
      { "id": "cancel", "label": "取消", "kind": "cancel" },
      { "id": "clear", "label": "清空", "kind": "reset" }
    ]
  },
  "right": {
    "kind": "result",
    "title": "结果",
    "renderers": [
      { "type": "progress", "showWhen": "$running" },
      { "type": "keyValue", "source": "$result" },
      { "type": "log", "source": "$logs", "level": "info" }
    ]
  }
}
```

字段类型 v1：`text textarea number switch select multiSelect radioGroup tabs filePicker folderPicker tagInput hidden`。

结果渲染器 v1：`text code keyValue table list log progress status`。

`visibleWhen` / `disabledWhen` 是 mini DSL：支持 `==`, `!=`, `&&`, `||`, `!`、括号、字符串字面量、`true/false/null`。例：`"mode==file && algo!=md5"`。

## 4. Sidecar IPC

子进程通过 stdin/stdout 用 NDJSON 通信。

请求（应用 → sidecar）：

```
{ "type": "request", "id": "<uuid>", "command": "hash.file", "params": { ... } }
{ "type": "cancel", "id": "<uuid>" }
{ "type": "shutdown" }
```

响应（sidecar → 应用）：

```
{ "type": "ready", "protocol": 1, "capabilities": ["streaming"] }
{ "type": "progress", "id": "<uuid>", "value": 0.42, "stage": "reading", "message": "..." }
{ "type": "log", "id": "<uuid>", "level": "info|warn|error|debug", "message": "..." }
{ "type": "result", "id": "<uuid>", "data": { ... } }
{ "type": "error", "id": "<uuid>", "code": "...", "message": "..." }
```

约束：单帧 ≤ 1 MiB，超时未发送 `result`/`error` 视为协议错误。

## 5. 权限模型

`permissions` 在 `tool.json` 里声明，安装时一次性确认。运行时仍可在「已安装」页面撤销。撤销后调用对应命令会失败（`E_PERM`）。

## 6. 发布

1. 编译 sidecar（任何语言 → Windows x64 可执行）。
2. 用 `tools/sign-plugin.ps1` 打包 + 生成 minisign 签名 + sha256。
3. 推 `vX.Y.Z` tag 到工具仓，CI 把产物上传到 GitHub Release。
4. CI 自动向 `LFenX/Toolbag-Registry` 仓提 PR 更新 `plugins/<id>.json`。
5. PR 合并 → Pages 部署 → 客户端下次扫描即可看到。

发布管线模板：见 `docs/release.md` 的"插件发布"小节（与应用本体共用密钥）。

---

## 内置插件（仅限主仓维护者）

`runtime.kind = "builtin"` 的工具只用于迁移期遗留模块（当前只有 `environment-overview`）。新增内置工具的步骤：

1. 在 `src-tauri/resources/bundled-plugins/<id>/tool.json` 写清单（设置 `runtime.kind = "builtin"`, `builtinRenderer = "<key>"`）。
2. 在 `src-tauri/resources/bundled-plugins/<id>/ui.json` 写 `{ "layout": "builtin", "builtinRenderer": "<key>" }`。
3. 在 `src-tauri/src/plugins/builtin.rs` 注册 `BundledPlugin` 元数据和 Rust 命令处理器。
4. 在 `src/features/tools/registry.ts` 的 `builtinRegistry` 注册前端组件（key 必须与 `builtinRenderer` 一致）。
5. 测试：
   - Rust：在 `plugins/manifest.rs` 校验 manifest 解析。
   - 前端：`registry.test.ts` 验证 builtin key 被映射到组件。

强烈建议新工具用插件形态而不是 builtin —— 它给用户更好的"无需升级应用即可获得新工具"体验，也避免框架膨胀。
