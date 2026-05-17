# Toolbag 架构说明

Toolbag 采用 Tauri 2 作为桌面容器，前端负责工作台 UI，Rust 负责系统能力、SQLite、日志、发布状态和权限边界。前端组件不直接调用 `invoke`，所有 IPC 都经过 `src/shared/tauri/commands.ts`。

## 分层

- `src/app`：应用壳、全局 Provider、路由和工作区状态。
- `src/features`：业务页面与工具模块，工具放在 `src/features/tools/<tool-id>`。
- `src/shared`：UI primitives、工具函数和 Tauri 调用层。
- `src-tauri/src`：Rust 命令、SQLite、应用状态、工具清单和更新占位。

## 工具模型

前端工具定义包含：

```ts
id, name, description, category, icon, routePath, tags, riskLevel, requiresElevation, component
```

Rust 侧返回可序列化的 `ToolManifest`，前端再与本地组件注册表合并。这样工具目录由后端确认，UI 组件仍保持类型安全。

## 本地数据

Rust 在应用数据目录创建 `toolbag.sqlite3`，当前包含：

- `app_settings`：设置 JSON。
- `tool_runs`：预留工具运行记录。
- `schema_migrations`：迁移版本。

默认遥测关闭，保存设置时 Rust 会强制 `telemetryEnabled=false`。
