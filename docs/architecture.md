# Toolbag 架构说明

Toolbag 采用 Tauri 2 作为桌面容器，前端负责工作台 UI，Rust 负责系统能力、SQLite、插件运行时、日志、发布状态与权限边界。前端组件不直接调用 `invoke`，所有 IPC 都经过 `src/shared/tauri/commands.ts` 和 `src/shared/tauri/plugins.ts`。

## 分层

- `src/app`：应用壳、全局 Provider、路由、主题控制器、工作区 store。
- `src/features`：业务页面
  - `workbench/`：工具台（默认页）
  - `marketplace/`：应用市场（浏览 / 安装 Registry 中的插件）
  - `plugins/`：已安装插件管理（启用 / 禁用 / 卸载）
  - `tools/`：工具运行容器（builtin 和声明式 schema 双轨）
  - `settings/`：分组设置（通用 / 外观 / 更新 / 插件 / 隐私 / 高级）
  - `logs/`、`about/`：日志导出与关于页
- `src/shared`：UI primitives、工具函数和 Tauri 调用层。
- `src-tauri/src`：Rust 模块。

## 插件系统

工具从"编译进 bundle 的模块"改成了"运行时可加载的包"。一个插件是一个 `.tbpkg` 压缩包，里面有 `tool.json`（清单）、`ui.json`（声明式 UI schema）、可选的原生 sidecar 可执行文件，以及图标/changelog。

详见 `docs/plan-v0.2-plugin-system.md`，`docs/adding-tool.md`。

### Rust 模块

```
src-tauri/src/
├── plugins/
│   ├── mod.rs              # 公开 API
│   ├── manifest.rs         # tool.json 解析 + JSON Schema 校验
│   ├── registry.rs         # 拉 Registry index.json（带 ETag 缓存）
│   ├── installer.rs        # 下载 → 校验 → 解压 → 落盘
│   ├── runner.rs           # 调度 builtin / sidecar 命令；NDJSON IPC
│   ├── perms.rs            # 权限白名单
│   ├── signature.rs        # minisign 校验
│   ├── builtin.rs          # 内置插件注册（迁移期遗留）
│   └── store.rs            # 统一 facade
├── commands.rs             # Tauri invoke 命令入口
├── database.rs             # SQLite，schema v3
├── state.rs                # AppState：DB + PluginStore + scan jobs
├── environment.rs/scan.rs  # environment-overview 内置实现
├── elevation.rs            # UAC helpers
├── updates.rs              # 应用本体更新（接 tauri-plugin-updater）
└── errors.rs               # 错误码 ErrorCode
```

### 前端模块

```
src/features/tools/
├── ToolPage.tsx            # 顶层工具页：分流到 builtin 或 SchemaForm
├── ErrorBoundary.tsx       # 隔离单个工具崩溃
├── registry.ts             # builtin renderer key → 组件
└── runtime/
    ├── SchemaForm.tsx      # 通用表单渲染器
    ├── ResultRenderer.tsx  # 通用结果区（progress/log/keyValue/table/...）
    ├── expr.ts             # visibleWhen / disabledWhen 表达式求值
    ├── usePluginJob.ts     # 启动/取消命令 + 流式事件
    └── types.ts            # 运行时状态
```

## 工具模型

工具清单不再用静态 JSON 文件 —— Rust `PluginStore::list_tools()` 读取 `installed_plugins` 表，再读每个插件目录下的 `tool.json`，合并运行历史，返回 `ToolManifest[]`。前端 `composeToolDefinitions()` 把它和 `builtinRegistry` 合并为 `ToolDefinition[]`（增加 icon 和 component）。

## 本地数据

Rust 在应用数据目录创建 `toolbag.sqlite3`：

| 表 | 用途 |
|---|---|
| `app_settings` | JSON 字符串持久化设置 |
| `tool_runs` | v1/v2 遗留：历史运行记录 |
| `plugin_runs` | v3+：按 `plugin_id` + `command_id` 记录运行 |
| `installed_plugins` | 已安装插件元数据（版本 / 权限 / 启停 / bundled 标记） |
| `registry_cache` | Registry index 缓存（含 ETag） |
| `schema_migrations` | 迁移版本 |

数据目录布局：

```
%APPDATA%\Toolbag\
├── toolbag.sqlite3
├── plugins\<id>\<version>\{tool.json, ui.json, bin/, ...}
├── plugins\<id>\current.txt        # 当前激活版本号
├── staging\                         # 安装期临时目录
├── downloads\                       # Registry 下载临时目录
├── cache\
└── log-exports\
```

默认遥测关闭，保存设置时 Rust 会强制 `telemetryEnabled = false`。Release 构建强制 `allowUnsigned = false`。

## 更新通道

应用本体和插件走两条独立通道：

- **应用本体**：`tauri-plugin-updater` + GitHub Release `latest.json`。
- **插件**：拉 `https://toolbag.lfen.dev/index.json`（或用户配置的 Registry URL），按 `latestVersion` 跟已装版本对比，弹徽章提示。

两者都依赖同一把 minisign 主密钥（公钥硬编码进应用）。

## 错误处理

`AppError::Coded { code: ErrorCode, message }` 序列化为 `{ code: "E_XXX", message: "..." }` 传到前端：

- `E_NETWORK` `E_SIG` `E_HASH` `E_VER` `E_PERM` `E_DECOMPRESS`
- `E_MANIFEST` `E_NOT_FOUND` `E_BUSY` `E_PROTOCOL` `E_CANCELLED`
- `E_IO` `E_DB` `E_INTERNAL`

前端按码渲染不同的引导（如签名失败 → 显眼红色横条 + 链接到「关于」页查看公钥指纹）。
