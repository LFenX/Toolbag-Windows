import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";

import { ToolHost } from "../../features/tools/ToolHost";
import { useTools } from "../../features/tools/useTools";
import { listRegistryPlugins } from "../../shared/tauri/plugins";
import { cn } from "../../shared/lib/utils";
import { AddToolDialog } from "./AddToolDialog";
import { CommandPalette } from "./CommandPalette";
import { AppUpdatePrompt } from "../../features/updates/AppUpdatePrompt";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { nextActiveAfterCycle, useTabsStore } from "./tab-store";
import { useToolRouteSync } from "./useToolRouteSync";
import { useWorkspaceStore } from "./workspace-store";

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const isSidebarCollapsed = useWorkspaceStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar);
  const setCommandPaletteOpen = useWorkspaceStore(
    (s) => s.setCommandPaletteOpen,
  );

  const hydrate = useTabsStore((s) => s.hydrate);
  const hasHydrated = useTabsStore((s) => s.hasHydrated);
  const tabs = useTabsStore((s) => s.tabs);
  const activeInstanceId = useTabsStore((s) => s.activeInstanceId);
  const closeTab = useTabsStore((s) => s.closeTab);
  const setActive = useTabsStore((s) => s.setActive);

  const [isAddDialogOpen, setAddDialogOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useToolRouteSync();

  const isToolRoute = location.pathname.startsWith("/tools/");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod) return;
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (key === "k") {
        if (isEditable && target !== searchRef.current) {
          event.preventDefault();
          setCommandPaletteOpen(true);
          return;
        }
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (key === "b") {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (key === "t") {
        // Ctrl+T opens the tool picker.
        event.preventDefault();
        setAddDialogOpen(true);
        return;
      }
      if (key === "w") {
        // Ctrl+W closes the active tab. Only meaningful when one is open.
        const current = useTabsStore.getState();
        if (!current.activeInstanceId) return;
        event.preventDefault();
        const idx = current.tabs.findIndex(
          (t) => t.instanceId === current.activeInstanceId,
        );
        let neighbor: typeof current.tabs[number] | undefined;
        if (idx > 0) {
          neighbor = current.tabs[idx - 1];
        } else if (idx + 1 < current.tabs.length) {
          neighbor = current.tabs[idx + 1];
        }
        closeTab(current.activeInstanceId);
        if (neighbor) {
          void navigate({
            to: "/tools/$toolId",
            params: { toolId: neighbor.toolId },
          });
        } else {
          void navigate({ to: "/" });
        }
        return;
      }
      if (key === "tab") {
        const current = useTabsStore.getState();
        if (current.tabs.length === 0) return;
        event.preventDefault();
        const direction = event.shiftKey ? -1 : 1;
        const next = nextActiveAfterCycle(
          current.tabs,
          current.activeInstanceId,
          direction,
        );
        if (next) {
          setActive(next);
          const tab = current.tabs.find((t) => t.instanceId === next);
          if (tab) {
            void navigate({
              to: "/tools/$toolId",
              params: { toolId: tab.toolId },
            });
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [closeTab, navigate, setActive, setCommandPaletteOpen, toggleSidebar]);

  const updatablePluginCount = useUpdatablePluginCount();

  // ToolHost owns the viewport ONLY while we're on /tools/*. Off the tool
  // route (e.g. clicking 工具台 / 设置) it stays mounted so plugin jobs keep
  // running, but is hidden so the Outlet's page shows underneath.
  const activeTab = useMemo(
    () => tabs.find((t) => t.instanceId === activeInstanceId),
    [tabs, activeInstanceId],
  );
  const showToolHost = isToolRoute && Boolean(activeTab);
  const showOutlet = !showToolHost;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div
        className={cn(
          "grid min-h-0 flex-1 transition-[grid-template-columns] duration-200",
          isSidebarCollapsed
            ? "grid-cols-[68px_minmax(0,1fr)]"
            : "grid-cols-[252px_minmax(0,1fr)]",
        )}
      >
        <Sidebar searchRef={searchRef} />

        <main className="flex min-w-0 flex-col">
          <TabBar onAddClick={() => { setAddDialogOpen(true); }} />
          <div
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden",
              showToolHost ? "" : "overflow-y-auto",
            )}
          >
            <div
              className={cn(
                "absolute inset-0 p-4 max-md:p-3",
                showToolHost ? "" : "pointer-events-none invisible",
              )}
              aria-hidden={!showToolHost}
            >
              <ToolHost />
            </div>
            <div
              className={cn(
                "min-h-full w-full p-4 max-md:p-3",
                showOutlet ? "" : "pointer-events-none invisible h-0 overflow-hidden p-0",
              )}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
      <StatusBar updatablePluginCount={updatablePluginCount} online={online} />
      <AppUpdatePrompt />
      <CommandPalette />
      <AddToolDialog
        open={isAddDialogOpen}
        onClose={() => { setAddDialogOpen(false); }}
      />
      {!hasHydrated && null}
    </div>
  );
}

function useUpdatablePluginCount(): number {
  const { data: tools = [] } = useTools();
  const { data: registry } = useQuery({
    queryKey: ["registry-passive"],
    queryFn: () => listRegistryPlugins(false),
    refetchOnMount: false,
  });
  const installedById = useMemo(
    () => new Map(tools.map((tool) => [tool.id, tool])),
    [tools],
  );
  return useMemo(() => {
    if (!registry) return 0;
    let count = 0;
    for (const entry of registry.plugins) {
      const installed = installedById.get(entry.id);
      if (installed && installed.version !== entry.latestVersion) {
        count += 1;
      }
    }
    return count;
  }, [installedById, registry]);
}
