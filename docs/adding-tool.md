# 新增工具

每个工具都需要登记共享 manifest 和前端组件。首版工具模型只支持内置模块，不支持第三方插件或任意脚本执行。

## 1. 添加共享 manifest

先在 `src/shared/tools/manifest.json` 中加入工具元数据：

```json
{
  "id": "my-tool",
  "name": "我的工具",
  "description": "一句话说明工具用途。",
  "category": "系统",
  "version": "1.0.0",
  "routePath": "/tools/my-tool",
  "tags": ["系统"],
  "riskLevel": "safe",
  "requiresElevation": false,
  "permissionRequirement": "普通权限",
  "dataAccess": "说明读取或写入的数据范围",
  "detailDescription": "更完整的工具说明。"
}
```

## 2. 添加前端模块

在 `src/features/tools/<tool-id>` 下创建工具组件，例如：

```tsx
export function MyTool() {
  return <div>...</div>;
}
```

然后在 `src/features/tools/registry.ts` 注册组件映射：

```ts
{
  id: "my-tool",
  icon: Wrench,
  component: MyTool,
}
```

`composeToolDefinitions()` 会校验共享 manifest 和前端组件是否一一对应。

## 3. 添加 Rust command

Rust 会自动从共享 manifest 读取工具清单。如果工具需要系统能力，新增专用 Rust command，并在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中登记；不要开放通用 shell 执行器。

## 4. 权限规则

- 默认工具应为 `riskLevel: "safe"` 且 `requiresElevation: false`。
- 会写文件、改注册表、操作服务或 hosts 的工具必须声明更高风险。
- 需要管理员权限的工具只做显式提权入口，不让整个 Toolbag 始终管理员运行。

## 5. 测试

至少补充：

- 工具注册表测试，确认共享 manifest 能映射到组件。
- 工具组件的渲染或交互测试。
- Rust command 的单元测试或错误映射测试。
