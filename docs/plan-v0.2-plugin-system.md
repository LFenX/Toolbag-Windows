# Toolbag v0.2 方案：插件化与专业化升级

> 状态：草案 · 2026-05-17
> 作者：LFen + Claude
> 适用版本：当前 0.1.0 → 目标 0.2.0
> 阅读顺序：1 → 14（含跳转目录）

## 目录

1. [背景与目标](#1-背景与目标)
2. [核心决策](#2-核心决策)
3. [总体架构](#3-总体架构)
4. [插件包格式（.tbpkg）](#4-插件包格式tbpkg)
5. [声明式 UI Schema](#5-声明式-ui-schema)
6. [Sidecar IPC 契约](#6-sidecar-ipc-契约)
7. [权限模型](#7-权限模型)
8. [Registry 注册中心](#8-registry-注册中心)
9. [客户端实现](#9-客户端实现)
10. [签名与信任](#10-签名与信任)
11. [应用本体更新通道](#11-应用本体更新通道)
12. [UI / UX 升级方案](#12-ui--ux-升级方案)
13. [已发现的框架问题清单](#13-已发现的框架问题清单)
14. [迁移、路线图、风险](#14-迁移路线图风险)

---

## 1. 背景与目标

当前形态：工具是**编译期模块**——`src/shared/tools/manifest.json` 静态元数据 + `src/features/tools/registry.ts` 组件映射，Rust 端 `include_str!` 嵌入 JSON。新增/升级工具必须发版整个 NSIS 安装包。

目标形态：

- 工具是**运行时可加载包**，用户在应用内扫描 GitHub 索引即可发现/安装/升级/回滚/卸载/重装。
- 应用本体走独立的 `tauri-plugin-updater` 通道，与插件升级解耦。
- 工具类型不被框架限制：命令行包装、文件处理、HTTP 调用、系统设置、计算工具、流式任务……都能用同一套机制承载。
- 强制 minisign 签名验证，杜绝供应链投毒。
- UI 升级到专业工具台水准（VS Code / Linear / Raycast 审美），补齐交互细节。

**非目标**：浏览器扩展式 JS 沙箱、跨平台、远端账号体系、自动发现局域网工具。

---

## 2. 核心决策

| # | 决策 | 选择 |
|---|---|---|
| D1 | 插件形态 | **声明式 UI Schema + 原生 sidecar**（前端用通用渲染器，Rust 调度 sidecar） |
| D2 | GitHub 分发组织 | **中央索引仓 `LFenX/Toolbag-Registry` + 各工具独立仓** |
| D3 | 签名 | **强制 minisign**，公钥硬编码进应用 |
| D4 | 本期产出 | 先出方案文档（本文件），实施分阶段执行 |

---

## 3. 总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Toolbag.exe（NSIS 安装 / 用户自身权限运行）                          │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐   │
│  │ Webview (React 19)       │   │ Rust core                    │   │
│  │  ├ AppShell / Router     │   │  ├ command dispatch          │   │
│  │  ├ Marketplace UI        │◀─▶│  ├ plugin loader/runner      │   │
│  │  ├ Plugins UI            │   │  ├ signature verify          │   │
│  │  ├ SchemaForm renderer   │   │  ├ sqlite                    │   │
│  │  ├ ResultRenderer        │   │  ├ registry http+cache       │   │
│  │  └ Command Palette       │   │  └ tauri-plugin-updater      │   │
│  └─────────────────────────┘   └──────────────┬───────────────┘   │
└────────────────────────────────────────────────┼──────────────────┘
                                                 │ spawn / NDJSON
                            ┌────────────────────▼────────────────────┐
                            │  Plugin sidecar.exe（每个工具一个，按需 │
                            │  spawn；任何语言编译为 Win x64）         │
                            └─────────────────────────────────────────┘

  网络流量（HTTPS）：
   ─▶ https://toolbag.lfen.dev/index.json        （registry，GitHub Pages + jsdelivr 兜底）
   ─▶ https://github.com/<author>/<plugin>/releases/.../<id>.tbpkg + .sig
   ─▶ https://github.com/LFenX/Toolbag-Windows/releases/.../latest.json  （应用更新）
```

关键边界：
- 前端不再直接 `invoke` 工具相关命令，统一通过 `src/shared/tauri/plugins.ts` 包装层。
- 任何系统能力调用都发生在 Rust 主进程，sidecar 通过 `$host/*` RPC 申请，主进程基于 `tool.json.permissions` 做白名单校验。

---

## 4. 插件包格式（.tbpkg）

`.tbpkg` 是后缀重命名的 zip，无加密。同一目录附带签名与摘要：

```
toolbag-plugin-<id>-<version>.tbpkg
toolbag-plugin-<id>-<version>.tbpkg.sig      # minisign
toolbag-plugin-<id>-<version>.tbpkg.sha256   # 完整性双保险
```

包内结构：

```
/
├── tool.json                              # 必需
├── ui.json                                # 当 runtime.kind != "builtin" 时必需
├── icon.svg                               # 可选；优先 SVG，回退 PNG 128×128
├── README.md                              # 可选
├── changelog.md                           # 可选；Markdown
├── bin/
│   └── sidecar-windows-x64.exe            # runtime.kind = "sidecar" 时必需
└── assets/                                # 可选；插件运行时只读访问
```

### 4.1 tool.json

```json
{
  "$schema": "https://toolbag.lfen.dev/schemas/plugin/1.json",
  "id": "com.lfen.toolbag.example-hash",
  "name": "哈希计算",
  "version": "1.2.3",
  "category": "实用",
  "tags": ["实用", "加密"],
  "description": "对文件或文本计算 MD5/SHA1/SHA256/SHA512。",
  "detailDescription": "支持拖拽文件、批量、流式进度。",
  "author": { "name": "LFen", "url": "https://github.com/LFenX" },
  "license": "MIT",
  "homepage": "https://github.com/LFenX/toolbag-plugin-hash",
  "minAppVersion": "0.2.0",
  "maxAppVersion": null,
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

字段规范：
- `id`：反域名形式（`^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$`），全局唯一。
- `version`：严格 semver。`minAppVersion`/`maxAppVersion` 同。
- `riskLevel`：`safe | caution | elevated`（沿用现有 `RiskLevel` 枚举）。
- `runtime.kind`：
  - `none`：纯前端（schema + 内置函数，比如 base64、UUID 生成等）。
  - `sidecar`：spawn 子进程，NDJSON 通信。
  - `builtin`：保留通道，框架内编译期渲染器，仅用于迁移期的 `environment-overview`，不对外开放。
- `commands[].permissions`：可声明权限的子集（见 §7），用于命令级最小权限。

### 4.2 校验流程

1. 解压前：校验 `.tbpkg.sig` 与 `.tbpkg.sha256`。
2. 解压到 `staging/`，校验 `tool.json` 通过 JSON Schema。
3. 校验 `tool.json.id` 与所在目录命名一致。
4. 校验 `runtime.binary`（若声明）真实存在且可执行。
5. 校验 `ui` 字段指向的文件存在并通过 UI Schema。
6. 全部通过后原子地 move 到 `plugins/<id>/<version>/`，更新 `plugins/<id>/current.txt`。

---

## 5. 声明式 UI Schema

UI Schema 描述"输入区 + 操作 + 输出区"。客户端 `SchemaForm` 把它渲染成 React 组件，绑定 Zustand store；操作触发 `start_plugin_command`，结果通过 Tauri Event 流式回到 `ResultRenderer`。

### 5.1 顶层

```json
{
  "$schema": "https://toolbag.lfen.dev/schemas/ui/1.json",
  "layout": "split",
  "left": { ... },    // 输入区
  "right": { ... },   // 输出区
  "header": { "showVersion": true, "showRisk": true, "showLastRun": true }
}
```

支持 `layout`：
- `split`：默认左右双栏（输入 / 输出）。
- `stack`：上下，移动断点自动切换。
- `single`：仅输出区（用于"环境扫描"这种无输入的工具——但首版仍走 builtin 通道）。

### 5.2 字段类型（v1）

| 类型 | 用途 | 关键属性 |
|---|---|---|
| `text` | 单行文本 | `placeholder`, `pattern`, `maxLength` |
| `textarea` | 多行文本 | `rows`, `monospace` |
| `number` | 数字 | `min`, `max`, `step` |
| `switch` | 布尔 | — |
| `select` | 下拉单选 | `options`, `default` |
| `multiSelect` | 多选 chip | `options`, `max` |
| `radioGroup` | 单选 chip | `options` |
| `tabs` | 子模式切换（常配合 `visibleWhen` 切字段集） | `options` |
| `filePicker` | 选文件 | `filters`, `multiple` |
| `folderPicker` | 选目录 | — |
| `tagInput` | 任意 tag | `suggestions` |
| `hidden` | 用于传常量 | `value` |

每个字段统一支持：
- `key`（必需，存到 form state）
- `label` / `help`（说明）
- `default`
- `required`
- `visibleWhen` / `disabledWhen`：MiniDSL 表达式（仅支持 `==`, `!=`, `&&`, `||`, `!`，例如 `"mode==file && algo!=md5"`）

### 5.3 操作（actions）

```json
"actions": [
  { "id": "run",    "label": "计算",   "primary": true,  "command": "hash.file" },
  { "id": "cancel", "label": "取消",   "kind": "cancel"  },
  { "id": "clear",  "label": "清空",   "kind": "reset"   }
]
```

`kind`：
- `command`（默认，触发 sidecar 命令）
- `cancel`（向 runner 发送 cancel）
- `reset`（清空 form state）
- `open-url`（`url` 字段）
- `copy`（`source` 字段，结果区某 key 的值）

### 5.4 结果渲染器（renderers）

```json
"right": {
  "title": "结果",
  "renderers": [
    { "type": "progress", "showWhen": "$running" },
    { "type": "keyValue", "source": "$result" },
    { "type": "log",      "source": "$logs", "level": "info" }
  ]
}
```

可用 renderer：
- `text` / `code`（带语言高亮，可选 `wrap`）
- `keyValue`：表单式键值对
- `table`：列定义 + 行数据
- `list`：行模板
- `log`：流式 NDJSON 日志，附行号、级别筛选、复制/导出
- `progress`：进度条 + 阶段文字
- `status`：成功 / 失败 / 取消 大色块

数据源约定：`$result`/`$logs`/`$running`/`$lastError` 是渲染器可访问的 reactive 状态。

---

## 6. Sidecar IPC 契约

子进程通过 stdin 接收请求、stdout 写响应，**每行一条 JSON**（NDJSON）。stderr 仅作启动期错误输出，不参与协议。

### 6.1 帧定义

请求（应用 → sidecar）：

```json
{ "type": "request",  "id": "uuid-v4", "command": "hash.file", "params": { "...": "..." } }
{ "type": "cancel",   "id": "uuid-v4" }
{ "type": "shutdown" }
{ "type": "host-response", "id": "rpc-uuid", "ok": true, "data": { ... } }
```

响应（sidecar → 应用）：

```json
{ "type": "ready",    "protocol": 1, "capabilities": ["streaming"] }
{ "type": "progress", "id": "uuid-v4", "value": 0.42, "stage": "reading", "message": "..." }
{ "type": "log",      "id": "uuid-v4", "level": "info|warn|error|debug", "message": "..." }
{ "type": "result",   "id": "uuid-v4", "data": { ... } }
{ "type": "error",    "id": "uuid-v4", "code": "...", "message": "..." }
{ "type": "host-request", "id": "rpc-uuid", "command": "$host/fs.read", "params": { "path": "..." } }
```

约束：
- 每行 ≤ 1 MiB，超出 runner 立即 kill 进程并报 `E_PROTOCOL`。
- `progress` 限流：runner 在转发到前端时合并同 `id` 1 秒内的多帧（取最后一帧 + 累计计数）。
- sidecar 在收到 `shutdown` 后 `shutdownTimeoutMs` 内未退出，runner 发 `Process::kill`。

### 6.2 `$host/*` 命令（白名单）

sidecar 通过 `host-request` 向主进程申请系统能力；主进程查 `tool.json.permissions` 决定放行。首版命令集：

| 命令 | 权限 | 参数 | 返回 |
|---|---|---|---|
| `$host/fs.read` | `fs.read` | `{ path, encoding? }` | `{ bytes, base64? }` |
| `$host/fs.write` | `fs.write` | `{ path, data, encoding?, overwrite? }` | `{ bytesWritten }` |
| `$host/fs.list` | `fs.read` | `{ path, glob? }` | `{ entries: [...] }` |
| `$host/net.http` | `net` | `{ method, url, headers?, body?, timeoutMs? }` | `{ status, headers, body }` |
| `$host/shell.run` | `shell` | `{ program, args, cwd?, env?, timeoutMs? }` | `{ exitCode, stdout, stderr }` |
| `$host/registry.read` | `registry` | `{ hive, key, value? }` | `{ value, kind }` |
| `$host/notify` | （免授权） | `{ title, body, level? }` | `{ ok: true }` |

权限超集（在 `tool.json` 声明），路径访问可附 `pathScope`（允许的目录前缀）做更细粒度限制（v2）。

### 6.3 SDK

首版提供 Rust SDK `crates/sidecar-sdk`：

```rust
toolbag_sidecar::serve(|cmd, params, ctx| async move {
    match cmd {
        "hash.file" => {
            ctx.progress(0.1, "opening").await?;
            let bytes = ctx.host_call("$host/fs.read", json!({ "path": params["filePath"] })).await?;
            // ...
            Ok(json!({ "sha256": "..." }))
        }
        _ => Err(SidecarError::unknown_command()),
    }
});
```

未来增 Go / Python SDK。

---

## 7. 权限模型

### 7.1 权限集（首版）

`fs.read` · `fs.write` · `net` · `shell` · `registry` · `process.list` · `services.read`

### 7.2 授予时机

- **安装时**：弹窗展示插件声明的全部权限，用户一次性同意（如 VS Code 扩展）。
- **命令级**：每个 `commands[i].permissions` 是该命令真正用到的子集；首次触发某高风险命令（`shell`/`registry`/`fs.write`/`net`）时再次确认（可"本次会话不再询问"）。
- **撤销**：在 `/plugins/<id>` 详情里逐项撤销；撤销后下次调用对应命令会失败。

### 7.3 强制执行

- 主进程是唯一系统能力出口，sidecar 直接调用系统能力技术上无法完全拦截（无法跑 OS 级 sandbox），但：
  - sidecar 进程由 Job Object 包裹（限制创建子进程、限制网络？Windows JOB_OBJECT 不支持 net，net 限制留 v2 用 Windows Firewall API）。
  - 数据目录 ACL 仅允许 `%APPDATA%/Toolbag` 与 `assets/` 只读。
  - 监控异常退出 / 高 CPU / 长时阻塞，记录到日志并 UI 红条提示。
- 红线：未签名插件**默认拒绝加载**（开发者可在设置→插件→"允许加载未签名包"开关里临时打开，仅 debug build 显示该开关；release build 隐藏）。

---

## 8. Registry 注册中心

独立仓库 `LFenX/Toolbag-Registry`（公开），用 GitHub Pages 部署。

### 8.1 仓库结构

```
plugins/
  com.lfen.toolbag.example-hash.json
  com.lfen.toolbag.bytes-counter.json
index.json                 # 由 CI 生成
categories.json            # 分类元数据（label/icon-key/order）
app-versions.json          # 当前 / 历史应用版本（minAppVersion 校验依赖）
README.md
schemas/
  plugin.json
  ui.json
.github/workflows/build-index.yml
```

### 8.2 `plugins/<id>.json`

单工具入口，列出全部历史版本：

```json
{
  "id": "com.lfen.toolbag.example-hash",
  "repo": "LFenX/toolbag-plugin-hash",
  "name": "哈希计算",
  "description": "对文件或文本计算 MD5/SHA1/SHA256/SHA512。",
  "category": "实用",
  "tags": ["实用", "加密"],
  "iconUrl": "https://raw.githubusercontent.com/LFenX/toolbag-plugin-hash/v1.2.3/icon.svg",
  "releases": [
    {
      "version": "1.2.3",
      "minAppVersion": "0.2.0",
      "publishedAt": "2026-05-15T03:14:00Z",
      "downloadUrl": "https://github.com/LFenX/toolbag-plugin-hash/releases/download/v1.2.3/toolbag-plugin-hash-1.2.3.tbpkg",
      "signatureUrl": "https://github.com/LFenX/toolbag-plugin-hash/releases/download/v1.2.3/toolbag-plugin-hash-1.2.3.tbpkg.sig",
      "sha256": "<hex>",
      "size": 184320,
      "changelog": "..."
    },
    { "version": "1.2.2", "...": "..." }
  ]
}
```

### 8.3 `index.json`（CI 生成）

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-17T12:00:00Z",
  "appVersion": { "stable": "0.2.0", "beta": "0.2.1-beta.1" },
  "categories": [
    { "key": "system",   "label": "系统",  "icon": "monitor", "order": 1 },
    { "key": "network",  "label": "网络",  "icon": "globe",   "order": 2 }
  ],
  "plugins": [
    {
      "id": "com.lfen.toolbag.example-hash",
      "name": "哈希计算",
      "description": "...",
      "category": "utility",
      "tags": ["实用","加密"],
      "latestVersion": "1.2.3",
      "minAppVersion": "0.2.0",
      "riskLevel": "safe",
      "downloadUrl": "...",
      "signatureUrl": "...",
      "sha256": "...",
      "iconUrl": "...",
      "publishedAt": "2026-05-15T03:14:00Z"
    }
  ]
}
```

部署目标：
- 主：`https://toolbag.lfen.dev/index.json`（GitHub Pages + 自定义域名）
- 兜底：`https://cdn.jsdelivr.net/gh/LFenX/Toolbag-Registry@gh-pages/index.json`

客户端默认请求主域，5s 超时切兜底。

### 8.4 CI

`.github/workflows/build-index.yml`：

```yaml
on:
  push:
    branches: [main]
    paths: [plugins/**, categories.json, app-versions.json]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node scripts/build-index.mjs
      - uses: peaceiris/actions-gh-pages@v3
        with: { publish_dir: ./public }
```

`scripts/build-index.mjs` 合并 `plugins/*.json` → `public/index.json`，复制 `categories.json`/`app-versions.json` 到 `public/`。

### 8.5 工具仓的发布回流

每个工具仓 `release.yml` 在 release publish 后自动向 Registry 仓发 PR 更新 `plugins/<id>.json`（追加新 release 条目）。模板放 `tools/templates/plugin-release.yml`。

---

## 9. 客户端实现

### 9.1 数据目录布局

```
%APPDATA%\Toolbag\
├── toolbag.sqlite3
├── plugins\
│   ├── com.lfen.toolbag.example-hash\
│   │   ├── 1.2.3\                    # 当前
│   │   │   ├── tool.json
│   │   │   ├── ui.json
│   │   │   ├── icon.svg
│   │   │   └── bin\sidecar-windows-x64.exe
│   │   ├── 1.2.2\                    # 上一版，保留用于回滚
│   │   └── current.txt               # 内容："1.2.3"
│   └── ...
├── cache\
│   └── registry\
│       ├── index.json
│       └── etag.json
├── staging\                           # 安装过程的临时目录
└── log-exports\                       # 已有
```

### 9.2 SQLite 迁移（v3）

```sql
-- 新表
CREATE TABLE installed_plugins (
  id              TEXT PRIMARY KEY,
  current_version TEXT NOT NULL,
  installed_at    TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  bundled         INTEGER NOT NULL DEFAULT 0,
  disabled        INTEGER NOT NULL DEFAULT 0,
  pinned          INTEGER NOT NULL DEFAULT 0,
  granted_perms   TEXT NOT NULL DEFAULT '[]'  -- JSON array
);

CREATE TABLE plugin_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id    TEXT NOT NULL,
  command_id   TEXT NOT NULL,
  status       TEXT NOT NULL,         -- success | failed | cancelled
  duration_ms  INTEGER,
  message      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_plugin_runs_plugin_id ON plugin_runs(plugin_id);

CREATE TABLE registry_cache (
  url        TEXT PRIMARY KEY,
  etag       TEXT,
  body       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

-- 兼容：保留 tool_runs，前端 summary 读 plugin_runs，迁移时复制一次
INSERT INTO plugin_runs (plugin_id, command_id, status, duration_ms, message, created_at)
  SELECT tool_id, '__legacy__', status, duration_ms, message, created_at FROM tool_runs;

INSERT OR IGNORE INTO schema_migrations (version) VALUES (3);
```

### 9.3 Rust 端目录新增

```
src-tauri/src/
├── plugins/
│   ├── mod.rs               # 公开 API
│   ├── manifest.rs          # tool.json/ui.json 解析与 JSON Schema 校验
│   ├── registry.rs          # 拉 index.json + ETag 缓存 + jsdelivr 兜底
│   ├── installer.rs         # 下载 → 校验 → 解压 → 落盘 → 切版本
│   ├── runner.rs            # sidecar 进程池、NDJSON IPC、流式事件、Job Object
│   ├── perms.rs             # 授予 / 撤销 / 校验
│   └── signature.rs         # minisign 验证
├── errors.rs                # 扩展为 AppError::Code { code, message }
└── ...（其余保持）
```

### 9.4 新增 invoke 命令

```
// Registry
list_registry_plugins(force_refresh: bool) -> RegistryIndex

// Lifecycle
list_installed_plugins() -> Vec<InstalledPlugin>
install_plugin(id: String, version: Option<String>) -> InstalledPlugin
update_plugin(id: String) -> InstalledPlugin
uninstall_plugin(id: String) -> ()
rollback_plugin(id: String, to_version: String) -> InstalledPlugin
toggle_plugin(id: String, disabled: bool) -> InstalledPlugin
import_plugin_from_file(path: String) -> InstalledPlugin   // 本地安装

// Permissions
grant_plugin_permission(id: String, perm: String) -> ()
revoke_plugin_permission(id: String, perm: String) -> ()

// Execution
start_plugin_command(plugin_id, command_id, params: Value) -> job_id
cancel_plugin_command(job_id: String) -> bool

// Metadata
get_plugin_changelog(id: String, version: String) -> String
get_plugin_history(id: String) -> Vec<PluginRunRecord>
```

事件：
- `plugin://job-progress` `{ jobId, value, stage, message }`
- `plugin://job-log` `{ jobId, level, message }`
- `plugin://job-result` `{ jobId, data }`
- `plugin://job-error` `{ jobId, code, message }`
- `plugin://job-done` `{ jobId, durationMs }`
- `registry://index-updated`
- `plugin://update-available` `{ id, currentVersion, latestVersion }`

### 9.5 前端结构

```
src/
├── app/shell/
│   ├── AppShell.tsx                  # 重做（见 §12）
│   ├── StatusBar.tsx                 # 新增
│   └── CommandPalette.tsx            # 新增
├── features/
│   ├── marketplace/
│   │   ├── MarketplacePage.tsx
│   │   ├── PluginCard.tsx
│   │   ├── PluginDetailDrawer.tsx
│   │   └── useRegistry.ts
│   ├── plugins/
│   │   ├── PluginsPage.tsx
│   │   ├── PluginRow.tsx
│   │   └── PermissionDialog.tsx
│   ├── tools/
│   │   ├── ToolPage.tsx              # 重写：根据 pluginId 拉 ui.json 渲染
│   │   ├── runtime/
│   │   │   ├── SchemaForm.tsx
│   │   │   ├── ResultRenderer.tsx
│   │   │   ├── expr.ts               # visibleWhen / disabledWhen
│   │   │   └── builtin/
│   │   │       └── EnvironmentOverviewRenderer.tsx   # 迁移壳
│   │   └── ErrorBoundary.tsx
│   └── settings/
│       └── SettingsPage.tsx           # 重做（见 §12.4）
└── shared/
    └── tauri/
        └── plugins.ts                  # 上述 invoke 包装
```

---

## 10. 签名与信任

- 一把**官方 minisign 主密钥**。私钥放离线 + 1Password；GitHub Action 通过 Secret 注入。
- 公钥硬编码进 `src-tauri/src/plugins/signature.rs`（用 `const OFFICIAL_PUBKEY: &str = "..."`）。
- 签名算法：minisign（与 `tauri-plugin-updater` 一致，可复用 `minisign-verify` crate）。
- 校验：
  - 安装时强制；失败立即清除 staging，记录日志，UI 红条提示"签名无效"。
  - SHA256 双校验：从 `plugins/<id>.json` 拿到的 hash 与下载文件的 hash 必须一致；防 release 端被替换。
- 公钥轮换：
  - 应用本体下个版本带新公钥（同时支持旧公钥过渡 90 天）。
  - 在 README、Release Notes、`/about` 页提示。
  - Registry 仓 root 文件 `TRUSTED_KEYS.md` 同步。

工具脚本：
- `tools/sign-plugin.ps1`：本机签名（开发者）
- `tools/verify-plugin.ps1`：本机校验
- `tools/publish-plugin.ps1`：tag → build → sign → upload → 给 Registry 提 PR

---

## 11. 应用本体更新通道

保留现有 `tauri-plugin-updater`：
- workflow 已配置 `TAURI_SIGNING_*` Secrets 与 `latest.json` 端点（`docs/release.md`），不动。
- Rust 端 `updates.rs` 接入真实 `app.updater()` API，删除占位字符串。
- 设置页的 `auto_check_updates` 拆为两项：`appAutoUpdate` 与 `pluginAutoUpdate`，加上 `updateChannel: "stable" | "beta"`。
- 启动后 `5s + jitter` 异步并行：拉应用更新元数据 + 拉 Registry index；不阻塞 UI。
- 状态栏徽章：
  - 有应用更新：右下角金色"应用 0.3.0 可更新"按钮 → 弹更新对话框。
  - 有插件更新：徽章"插件 3 个可更新" → 跳 `/plugins?filter=updatable`。
- 若插件 `minAppVersion` 高于当前应用：
  - Marketplace 页面安装按钮变灰，提示"需要先升级应用到 0.3.0+"。
  - 已安装但应用降级后不兼容的插件：禁用入口（不卸载），列表中标红。

---

## 12. UI / UX 升级方案

参考 VS Code + Linear + Raycast。下文每节既是设计目标也是验收点。

### 12.1 整体壳布局

```
┌──────────────────────────────────────────────────────────────────────┐
│ Topbar     [Toolbag▾] breadcrumb              [Ctrl+K]  [🔔] [🌗] [⚙] │
├──────┬───────────────────────────────────────────────────────────────┤
│ Side │ Main content（双栏列表+详情 / 工具运行面板）                     │
│ bar  │                                                                │
│ (可  │                                                                │
│ 折叠)│                                                                │
│      │                                                                │
├──────┴───────────────────────────────────────────────────────────────┤
│ Statusbar   v0.2.0  •  3 plugin updates  •  无遥测  •  job: hash 42%  │
└──────────────────────────────────────────────────────────────────────┘
```

Sidebar 分组（图标条 + 展开文字）：
- 工作台（/）
- 应用市场（/marketplace）
- 已安装（/plugins）
- 日志（/logs）
- 设置（/settings）
- 关于（/about）

### 12.2 命令面板（Ctrl+K / Ctrl+P）

浮层位于上中部，宽 720px。可：
- 跳转到工具（`> hash`）
- 触发命令（`> 检查应用更新`、`> 打开数据目录`）
- 搜索设置（`> 设置 自动更新`）
- 安装插件（`> 安装 hash`）

实现选 `cmdk` 库或自写（200 行内可写完）。

### 12.3 工具详情页（`/tools/:id`）

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← 返回   哈希计算  v1.2.3  · safe · 上次 12:34 成功  ⋯ (更多菜单)     │
├──────────────────────────────────────────┬───────────────────────────┤
│ 输入                                       │ 结果                       │
│  ◉ 文件   ○ 文本                           │ progress ▒▒▒▒▒░ 42%       │
│  [选择文件]                                 │ ─ log ─────────────────── │
│  算法 [sha256▾]                             │ 12:00 opening file        │
│  [计算]  [清空]                             │ 12:00 read 8MB            │
│                                            │ 12:00 sha256: a1b2…        │
│                                            │ [复制] [导出]              │
└──────────────────────────────────────────┴───────────────────────────┘
                                            ⌃右侧 Drawer 可展开
                                              · 权限
                                              · 元信息（risk/permissions/changelog）
                                              · 历史运行（最近 20 次）
```

### 12.4 设置页（重做）

分组 + 左导航：

| 分组 | 设置项 |
|---|---|
| 通用 | 语言（zh-CN / en-US）· 启动页（工作台 / 上次打开的工具）· 最近列表长度（5/10/20）· 开机自启动（接口已存在） |
| 外观 | 主题（浅 / 深 / 跟随系统）· 强调色（4 预设 + 自定义 HEX）· 密度（紧凑 / 舒适）· 动画（开 / 关 / 系统）· 字号缩放（90% / 100% / 115%） |
| 更新 | 自动检查应用更新 · 自动检查插件更新 · 检查频率（启动 / 每日 / 每周 / 手动）· 通道（稳定 / Beta）· HTTP 代理（系统 / 自定义） |
| 插件 | Registry URL（高级折叠）· 允许加载未签名包（debug 才显示）· 并发下载数（1–4）· 清理 cache 按钮 |
| 隐私 | 遥测（强制 off，灰显说明）· 错误上报（off）· 日志保留天数（7 / 30 / 永久）· 一键清理日志/历史运行/缓存 |
| 高级 | 应用数据目录（显示路径 + "打开"按钮）· 导出 / 导入设置 JSON · 重置全部 · 查看许可证 · 当前运行的 sidecar 列表（带"终止"按钮）· 强制刷新 Registry |
| 关于 | 版本 · 公钥指纹 · 系统信息 · 链接 |

新设置项需要的 SQLite 字段（合并到 `AppSettings`）：

```rust
pub struct AppSettings {
    pub favorite_tool_ids: Vec<String>,
    pub app_auto_update: bool,
    pub plugin_auto_update: bool,
    pub update_check_frequency: UpdateFrequency, // OnStart | Daily | Weekly | Manual
    pub update_channel: UpdateChannel,           // Stable | Beta
    pub launch_at_startup: bool,
    pub telemetry_enabled: bool,                 // 仍强制 false
    pub theme: Theme,                            // Light | Dark | System
    pub accent: AccentColor,                     // Indigo | Emerald | Rose | Amber | Custom(hex)
    pub density: Density,                        // Compact | Comfortable
    pub motion: MotionPref,                      // On | Off | System
    pub language: String,                        // "zh-CN" | "en-US"
    pub startup_page: StartupPage,               // Workbench | LastTool
    pub recent_list_size: u8,                    // 5 | 10 | 20
    pub log_retention_days: LogRetention,        // Days(7|30) | Forever
    pub registry_url: Option<String>,            // None = default
    pub allow_unsigned: bool,                    // 仅 debug 暴露
    pub max_concurrent_downloads: u8,
    pub http_proxy: Option<String>,
    pub font_scale: u8,                          // 90 | 100 | 115
}
```

迁移策略：v3 时给所有新字段补 default，`appSettingsSchema`（zod）继续兼容旧字段缺失。

### 12.5 交互细节清单（验收）

- 焦点环统一 `ring-2 ring-primary/40 outline-none`，覆盖所有 Button、Nav、Tab、Switch、Select、List item、Card。
- 悬停 / 按下 / 禁用 / 加载 四态在所有交互元素补齐；按钮 loading 用 `Loader2 animate-spin` + 锁宽。
- 空态插画 + 引导操作：工具台为空 / 搜索无结果 / 安装失败 / Registry 不可达。
- 错误态：toast + 原位置重试入口；网络错误显示底部 banner（"离线，使用缓存数据"）。
- 长列表（>50 项）走虚拟滚动（`react-window` 或自写 IntersectionObserver）。
- 流式日志区按行自动滚到底，用户上滑后停滞，显示"↓ 跳到最新"按钮。
- 表单：错误就地展示、`Esc` 重置、`Ctrl+Enter` 提交、提交 loading 锁按钮。
- 字体：Inter（中文回退 Microsoft YaHei / PingFang SC） + JetBrains Mono（等宽）。
- 间距体系：Tailwind 4 默认（4/8/12/16/24/32），保持现状。
- 阴影：`shadow-soft` / `shadow-panel` / 新增 `shadow-elevated`（hover-pop）。
- 动效：列表 hover 50ms、modal 入场 120ms、tab 切换 80ms；`prefers-reduced-motion` 或设置项关闭时取消。
- 主题切换：CSS variables 切换，无白屏闪烁；状态色（成功/警告/错误）在浅深色下各一组。
- 键盘可达：所有交互项 Tab 顺序可控，列表 ↑↓ 选中，Enter 触发。
- ARIA：列表用 `role=list/listitem`；命令面板用 `role=combobox` + `aria-activedescendant`。
- 国际化：首版仍中文为主，但抽 `src/shared/i18n/` 以 key 取值，预留 `en-US.json`。

---

## 13. 已发现的框架问题清单

在写方案时阅读现有代码发现的问题，实施时一并修复：

| # | 文件 | 问题 | 处理 |
|---|---|---|---|
| F1 | `src/app/shell/AppShell.tsx:69-81` | `Ctrl+K` 监听在 `<input>` 已聚焦时仍 preventDefault | 忽略 `event.target` 是表单元素的情况 |
| F2 | `src/features/tools/registry.ts:18-53` | `composeToolDefinitions` 抛错会拖垮整个 React 渲染 | 插件化后改为 per-tool fallback，记录错误并降级为"不可用"卡片 |
| F3 | `src-tauri/src/commands.rs:39-44` | `save_settings` 强制 `telemetry_enabled=false` | 保留语义，但拆出 `error_reporting_enabled` 字段未来可单独开关 |
| F4 | `src-tauri/src/updates.rs` | 占位实现，从不真的检查 | 接入真实 `app.updater()`，前端在未配置端点时显示明确提示 |
| F5 | `src/app/shell/AppShell.tsx:37-50` | `categoryItems` 中文 key 硬编码 | 改为读 Registry `categories.json` + 用户已装插件并集 |
| F6 | `src/features/settings/SettingsPage.tsx:13-15` | `useState` 维护 draft，路由切换丢失 | 升级为 form context，并在离开未保存时弹"放弃 / 保留"二选一 |
| F7 | `src/features/tools/ToolPage.tsx:11-13` | 找不到工具时 fallback 到 `WorkbenchPage` | 显示"工具不存在 / 已卸载"专门页面 |
| F8 | `src-tauri/src/database.rs:120-127` | `tool_runs.tool_id` 无索引 | 加 `CREATE INDEX idx_tool_runs_tool_id ON tool_runs(tool_id)`（新表 `plugin_runs` 一并加） |
| F9 | `src-tauri/src/database.rs:10-12` | `Mutex<Connection>` 全局阻塞 | 标记 TODO，本期不动；未来上 `r2d2` 池 |
| F10 | `src-tauri/tauri.conf.json:26` | CSP 缺 `connect-src` | 加 `connect-src 'self' https:` 让 Registry/Release 走标准 fetch |
| F11 | `src-tauri/tauri.conf.json:13-21` | 仅 980×640 最小窗口，4K 上 sidebar 折叠点不优雅 | 补 `xl:` / `2xl:` 断点并测试 1280 / 1440 / 1920 / 2560 |
| F12 | `src-tauri/tauri.conf.json:38-40` | `installMode: "currentUser"` 不显示对用户的影响 | 在"关于"页/安装后 onboarding 写明数据目录与 currentUser 含义 |
| F13 | `src-tauri/src/errors.rs` | `AppError::Message` 全字符串化 | 加 `AppError::Code { code: ErrorCode, message: String }`，前端按码处理（E_NETWORK / E_SIG / E_VER / E_PERM / E_DECOMPRESS / E_NOT_FOUND / E_BUSY / E_PROTOCOL） |
| F14 | `src/features/tools/ToolPage.tsx` | 无错误边界 | 包一层 React ErrorBoundary，工具崩溃只影响该子树 |
| F15 | `scripts/prepare-tauri-release.mjs` | 仅服务于应用本体 | 新增 `scripts/build-plugin.mjs` 模板和文档 |
| F16 | `src/shared/tauri/commands.ts:23-33` | `invokeOrFallback` 在浏览器预览模式静默回 fallback | 加 `import.meta.env.MODE === "development"` 日志，避免生产环境隐藏问题 |
| F17 | `src-tauri/src/commands.rs:101-156` | `start_environment_scan` 与 `record_tool_run` 命名仍 tool-centric | 迁移期保留，新 `start_plugin_command` 统一抽象 |

---

## 14. 迁移、路线图、风险

### 14.1 `environment-overview` 迁移策略

保留为"builtin 通道"的样板：
1. 在 `plugins/com.lfen.toolbag.environment-overview/1.0.0/` 写入 `tool.json`：
   ```json
   { "id": "com.lfen.toolbag.environment-overview", "runtime": { "kind": "builtin" }, "ui": "ui.json" }
   ```
2. `ui.json` 用 `"renderer": "native:environment-overview"` 转义，由前端 `EnvironmentOverviewRenderer` 渲染（保留现有组件）。
3. 在 `installed_plugins` 表里标 `bundled = 1`，UI 卸载按钮灰显（允许禁用）。
4. 首次启动应用时 `seed_bundled_plugins()` 把它写入。
5. 长期目标：把它拆成独立 sidecar 工具（用 Rust 写本机扫描），但本期不做。

### 14.2 用户数据迁移

- v3 SQLite migration：建新表，迁移 `tool_runs` → `plugin_runs`（`plugin_id = tool_id`，`command_id = "__legacy__"`）。
- `app_settings` 增字段默认值兼容（zod 解析允许缺失）。
- 已收藏的 `favorite_tool_ids` 在迁移时把 `environment-overview` 替换为 `com.lfen.toolbag.environment-overview`。

### 14.3 分阶段路线图

| 阶段 | 范围 | 估时（人日） |
|---|---|---|
| P0 | 方案文档（本文件）+ JSON Schema 草案（plugin.json / ui.json） | 1 |
| P1 | Rust `plugins/` crate 骨架：manifest / installer（无签名）/ runner / 错误码 / 新 invoke 命令 / SQLite v3 迁移 | 4 |
| P2 | 前端 SchemaForm + ResultRenderer + 表达式求值 + ToolPage 重写 + ErrorBoundary | 3 |
| P3 | Marketplace 页面 + Plugins 页面 + Command Palette + StatusBar | 3 |
| P4 | 签名校验（minisign）+ 公钥嵌入 + 签名 / 校验 / 发布脚本 | 1.5 |
| P5 | Registry 仓搭建 + index.json CI + GitHub Pages + 第一个示例插件（hash）端到端 | 2 |
| P6 | environment-overview 迁移到 builtin 通道 + 兼容验证 + 自动数据迁移 | 0.5 |
| P7 | 设置页重做 + 主题 / 强调色 / 密度 / 动画 / 国际化骨架 | 2 |
| P8 | UI 细节抛光（空态 / 错误态 / 键盘可达 / 微动效 / a11y eslint 规则） + Playwright 烟测 | 2 |
| P9 | 文档（开发者 / 发布 / 安全 / 升级）+ 0.2.0 发布 | 1 |
| **合计** |  | **20** |

可并行：P3 与 P5 独立、P7 与 P8 独立；理论压缩到 12 个人日（双人）。

### 14.4 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| NDJSON 大输出刷屏 | 前端卡顿 | runner 端 1Hz 合流 progress；log 按级别筛选；行级虚拟滚动 |
| minisign crate 集成 | 安全前提失败 | 选 `minisign-verify`（纯 Rust，无 C 依赖），写集成测试覆盖密钥轮换 |
| GitHub Pages 缓存延迟 | 用户拿到旧 index | 双源（Pages + jsdelivr），`Cache-Control: no-cache`，UI 显示 `generatedAt` |
| sidecar 阻塞主进程 | 应用假死 | 全异步 Tokio 管道；Job Object 限制；超时 kill |
| 复制粘贴本地包 | 跳过安装管线 | "从文件安装" 入口仍走 install_plugin（验签 + 落盘） |
| 公钥泄露 | 任意包可注入 | 私钥仅 GitHub Secret + 离线备份；上 1Password；准备应急公钥轮换流程 |
| 同一 plugin id 跨作者重复 | 命名冲突 | Registry PR 评审 + 首次注册者锁定（schema 强制 reserved_ids） |

### 14.5 待二级决策的小问题

实施过程中可以再定，不阻塞主框架：

1. 允许用户配置自定义 Registry URL？建议默认隐藏在"高级"。
2. 命令面板是否搜索"已知文件路径"？建议先不做，专注工具与命令。
3. 是否支持同一插件并存多版本（不只是回滚而是并行使用）？建议否。
4. "favorite / 置顶"作为工具台首屏？建议是，复用 `favorite_tool_ids`。
5. 国际化首版只做 zh-CN，还是同步出 en-US 骨架？建议出骨架，文案后补。

---

## 附录 A：术语

- **Toolbag**：本应用本体。
- **Plugin / 插件 / 工具**：可被加载的扩展单元。在用户文案里用"工具"，在开发者文案里用"插件"。
- **Sidecar**：插件附带的原生可执行子进程。
- **Registry**：Toolbag-Registry 仓库，提供 `index.json` 元数据。
- **.tbpkg**：插件分发包后缀（实质 zip）。
- **minisign**：Ed25519 签名工具集，复用 Tauri updater 体系。

## 附录 B：参考

- Tauri Updater：https://v2.tauri.app/plugin/updater/
- minisign：https://jedisct1.github.io/minisign/
- VS Code 扩展模型（设计灵感）：https://code.visualstudio.com/api
- Linear / Raycast UI 风格（视觉灵感）

---

> 下一步：你过这份方案。我建议读完后我们对齐 §14.5 的几个小问题，然后我从 P1（Rust plugins crate 骨架 + SQLite 迁移）开始动手；同时并行用一两天把 §13 里的 F1 / F2 / F8 / F10 / F13 / F14 这种"零依赖"的框架修复先合入，给后面减阻力。
