import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Grid2X2,
  Info,
  Package,
  PanelLeft,
  Search,
  Settings,
  Store,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";

import { useTools } from "../../features/tools/useTools";
import { listRegistryPlugins } from "../../shared/tauri/plugins";
import { getAppInfo } from "../../shared/tauri/commands";
import { cn } from "../../shared/lib/utils";
import { Badge } from "../../shared/ui/badge";
import { Input } from "../../shared/ui/input";
import { CommandPalette } from "./CommandPalette";
import { StatusBar } from "./StatusBar";
import { useWorkspaceStore } from "./workspace-store";

const navItems: {
  label: string;
  to: "/" | "/marketplace" | "/plugins" | "/logs" | "/settings" | "/about";
  icon: LucideIcon;
}[] = [
  { label: "工具台", to: "/", icon: Grid2X2 },
  { label: "应用市场", to: "/marketplace", icon: Store },
  { label: "已安装", to: "/plugins", icon: Package },
  { label: "日志", to: "/logs", icon: FileText },
  { label: "设置", to: "/settings", icon: Settings },
  { label: "关于", to: "/about", icon: Info },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: tools = [] } = useTools();
  const { data: appInfo } = useQuery({
    queryKey: ["app-info"],
    queryFn: getAppInfo,
  });
  const { data: registry } = useQuery({
    queryKey: ["registry-passive"],
    queryFn: () => listRegistryPlugins(false),
    refetchOnMount: false,
  });
  const isSidebarCollapsed = useWorkspaceStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar);
  const setCommandPaletteOpen = useWorkspaceStore(
    (s) => s.setCommandPaletteOpen,
  );
  const search = useWorkspaceStore((s) => s.search);
  const setSearch = useWorkspaceStore((s) => s.setSearch);
  const categoryFilter = useWorkspaceStore((s) => s.categoryFilter);
  const setCategoryFilter = useWorkspaceStore((s) => s.setCategoryFilter);

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
      if (key === "k") {
        const target = event.target as HTMLElement | null;
        const isEditable =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable);
        if (isEditable && target !== searchRef.current) {
          // Already typing somewhere: open palette instead of stealing focus.
          event.preventDefault();
          setCommandPaletteOpen(true);
          return;
        }
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (key === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [setCommandPaletteOpen, toggleSidebar]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const tool of tools) {
      map.set(tool.category, (map.get(tool.category) ?? 0) + 1);
    }
    return map;
  }, [tools]);

  const categories = useMemo(() => {
    const registryCats = registry?.categories ?? [];
    const fromTools = new Set(tools.map((tool) => tool.category));
    const merged = new Map<string, string>();
    for (const cat of registryCats) {
      merged.set(cat.key, cat.label);
    }
    for (const c of fromTools) {
      if (!merged.has(c)) merged.set(c, c);
    }
    return Array.from(merged.entries()).map(([key, label]) => ({ key, label }));
  }, [registry, tools]);

  const installedById = useMemo(
    () => new Map(tools.map((tool) => [tool.id, tool])),
    [tools],
  );

  const updatablePluginCount = useMemo(() => {
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
        <aside
          className={cn(
            "flex h-full flex-col border-r border-border bg-sidebar px-3 py-3 shadow-soft",
          )}
        >
          <div className="flex items-center gap-3 px-1.5">
            <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground shadow-soft">
              <Boxes className="size-5" aria-hidden="true" />
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    Toolbag
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {appInfo?.version ?? "0.2.0"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  本地工具工作台
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={isSidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
            >
              {isSidebarCollapsed ? (
                <ChevronsRight className="size-3.5" aria-hidden="true" />
              ) : (
                <ChevronsLeft className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {!isSidebarCollapsed && (
            <label className="relative mt-4 block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchRef}
                value={search}
                onChange={(event) => { setSearch(event.target.value); }}
                placeholder="搜索工具"
                aria-label="搜索工具"
                className="h-9 bg-card pl-8 pr-14 text-xs"
              />
              <button
                type="button"
                onClick={() => { setCommandPaletteOpen(true); }}
                aria-label="打开命令面板"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
              >
                ⌘K
              </button>
            </label>
          )}

          <nav aria-label="主导航" className="mt-3 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.to === "/"
                  ? location.pathname === "/" || isToolRoute
                  : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {!isSidebarCollapsed && (
            <div className="mt-5 flex-1 overflow-hidden">
              <div className="mb-2 flex items-center justify-between px-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  工具分类
                </p>
                <PanelLeft className="size-3 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="space-y-0.5 overflow-y-auto pr-1">
                <CategoryRow
                  active={categoryFilter === "all"}
                  count={tools.length}
                  label="全部工具"
                  onClick={() => { setCategoryFilter("all"); }}
                />
                {categories.map((cat) => (
                  <CategoryRow
                    key={cat.key}
                    active={categoryFilter === cat.key}
                    count={categoryCounts.get(cat.key) ?? 0}
                    label={cat.label}
                    onClick={() => { setCategoryFilter(cat.key); }}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0 overflow-y-auto p-4 max-md:p-3">
          <div
            className={cn(
              "min-h-full w-full",
              isToolRoute ? "h-[calc(100vh-32px)]" : "max-w-none",
            )}
          >
            {children}
          </div>
        </main>
      </div>
      <StatusBar updatablePluginCount={updatablePluginCount} online={online} />
      <CommandPalette />
    </div>
  );
}

function CategoryRow({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-[12px] transition-colors",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums text-[11px]">{count}</span>
    </button>
  );
}

