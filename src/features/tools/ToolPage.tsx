/**
 * Route placeholder for `/tools/$toolId`. The actual tool UI is rendered by
 * the global `ToolHost` (mounted in `AppShell`) so that every open tab keeps
 * its plugin job and form state across route changes. URL → tab
 * synchronization lives in `useToolRouteSync` and is invoked from `AppShell`.
 */
export function ToolPage() {
  return null;
}
