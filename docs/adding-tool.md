# 新增工具

每个工具都需要同时登记前端组件和 Rust manifest。首版工具模型只支持内置模块，不支持第三方插件或任意脚本执行。

## 1. 添加前端模块

在 `src/features/tools/<tool-id>` 下创建工具组件，例如：

```tsx
export function MyTool() {
  return <div>...</div>;
}
```

然后在 `src/features/tools/registry.ts` 注册：

```ts
{
  id: "my-tool",
  name: "我的工具",
  description: "一句话说明工具用途。",
  category: "系统",
  icon: Wrench,
  routePath: "/tools/my-tool",
  tags: ["系统"],
  riskLevel: "safe",
  requiresElevation: false,
  component: MyTool,
}
```

## 2. 添加 Rust manifest

在 `src-tauri/src/tools/mod.rs` 的 `list_tools()` 中加入同一个 `id`。如果工具未来需要系统能力，新增专用 Rust command，不要开放通用 shell 执行器。

## 3. 权限规则

- 默认工具应为 `riskLevel: "safe"` 且 `requiresElevation: false`。
- 会写文件、改注册表、操作服务或 hosts 的工具必须声明更高风险。
- 需要管理员权限的工具只做显式提权入口，不让整个 Toolbag 始终管理员运行。

## 4. 测试

至少补充：

- 工具注册表测试，确认 manifest 能映射到组件。
- 工具组件的渲染或交互测试。
- Rust command 的单元测试或错误映射测试。
