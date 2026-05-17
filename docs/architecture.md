# Toolbag 架构说明

Toolbag 采用 Tauri 2 作为桌面容器，前端负责工作台 UI，Rust 负责系统能力、SQLite、日志、发布状态和权限边界。前端组件不直接调用 `invoke`，所有 IPC 都经过 `src/shared/tauri/commands.ts`。

## 分层

- `src/app`：应用壳、全局 Provider、路由和工作区状态。
- `src/features`：业务页面与工具模块，工具放在 `src/features/tools/<tool-id>`。
- `src/shared`：UI primitives、工具函数和 Tauri 调用层。
- `src-tauri/src`：Rust 命令、SQLite、应用状态、工具清单和更新占位。

## 工具模型

工具元数据以 `src/shared/tools/manifest.json` 为单一来源。每个条目包含：

```ts
id, name, description, category, version, routePath, tags, riskLevel, requiresElevation, permissionRequirement, dataAccess, detailDescription
```

Rust 侧读取这份 JSON，再合并 SQLite 中的运行记录，返回可序列化的 `ToolManifest`。前端本地注册表只保留 `id`、`icon` 和 `component`，并通过 `composeToolDefinitions()` 与 manifest 合并。这样工具目录由共享 manifest 确认，UI 组件仍保持类型安全。

## 本地数据

Rust 在应用数据目录创建 `toolbag.sqlite3`，当前包含：

- `app_settings`：设置 JSON。
- `tool_runs`：工具运行记录，包含状态、耗时、消息和创建时间。
- `schema_migrations`：迁移版本。

默认遥测关闭，保存设置时 Rust 会强制 `telemetryEnabled=false`。
