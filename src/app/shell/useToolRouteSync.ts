import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useTools } from "../../features/tools/useTools";
import { useTabsStore } from "./tab-store";

/**
 * Watches the URL: when the user navigates to `/tools/<toolId>`, ensures an
 * active tab exists for that tool. Reuses an existing tab when one already
 * points at the same `toolId`; otherwise opens a fresh one.
 *
 * Mounted once at the app shell level so it survives route changes (which is
 * critical — every route change re-runs this effect).
 */
export function useToolRouteSync() {
  const location = useLocation();
  const { data: tools = [] } = useTools();
  const tabs = useTabsStore((s) => s.tabs);
  const activeInstanceId = useTabsStore((s) => s.activeInstanceId);
  const openTab = useTabsStore((s) => s.openTab);
  const setActive = useTabsStore((s) => s.setActive);

  const toolId = parseToolIdFromPath(location.pathname);

  useEffect(() => {
    if (!toolId) return;
    const activeTab = tabs.find((t) => t.instanceId === activeInstanceId);
    if (activeTab?.toolId === toolId) return;
    const existing = tabs.find((t) => t.toolId === toolId);
    if (existing) {
      setActive(existing.instanceId);
      return;
    }
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    openTab({ toolId: tool.id, toolName: tool.name, iconKey: tool.iconKey });
  }, [toolId, tabs, activeInstanceId, tools, openTab, setActive]);
}

function parseToolIdFromPath(pathname: string): string | null {
  const match = /^\/tools\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
