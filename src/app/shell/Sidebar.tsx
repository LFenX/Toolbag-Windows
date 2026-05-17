import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Grid2X2,
  Info,
  Package,
  Search,
  Settings,
  Store,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import type { RefObject } from "react";

import { useTools } from "../../features/tools/useTools";
import type { ToolDefinition } from "../../features/tools/types";
import { listRegistryPlugins } from "../../shared/tauri/plugins";
import { getAppInfo } from "../../shared/tauri/commands";
import { cn } from "../../shared/lib/utils";
import { Badge } from "../../shared/ui/badge";
import { Input } from "../../shared/ui/input";
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

interface SidebarProps {
  searchRef: RefObject<HTMLInputElement | null>;
}

/**
 * The whole left rail. Wrapped in `memo` and subscribes to its own state so
 * tab switches / route changes in the main area don't drag it through a
 * re-render. Only the active-nav highlight legitimately depends on the
 * current pathname; that single highlight is the cost of keeping the
 * navigation visible.
 */
export const Sidebar = memo(function Sidebar({ searchRef }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
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

  const isToolRoute = location.pathname.startsWith("/tools/");

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

  // Stable callback so the memoized ToolListSection doesn't re-render every
  // time the URL changes (which re-runs Sidebar via useLocation).
  const handleOpenToolTab = useCallback(
    (tool: ToolDefinition) => {
      void navigate({ to: "/tools/$toolId", params: { toolId: tool.id } });
    },
    [navigate],
  );

  return (
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
                {appInfo?.version ?? "0.2.1"}
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
        <ToolListSection
          tools={tools}
          categories={categories}
          onOpenTool={handleOpenToolTab}
        />
      )}
    </aside>
  );
});

const ToolListSection = memo(function ToolListSection({
  tools,
  categories,
  onOpenTool,
}: {
  tools: ToolDefinition[];
  categories: { key: string; label: string }[];
  onOpenTool: (tool: ToolDefinition) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );

  const groups = useMemo(() => {
    const byCategory = new Map<string, ToolDefinition[]>();
    for (const tool of tools) {
      if (tool.disabled) continue;
      const list = byCategory.get(tool.category) ?? [];
      list.push(tool);
      byCategory.set(tool.category, list);
    }
    const ordered: { key: string; label: string; tools: ToolDefinition[] }[] = [];
    for (const cat of categories) {
      const items = byCategory.get(cat.key);
      if (items && items.length > 0) {
        ordered.push({ key: cat.key, label: cat.label, tools: items });
        byCategory.delete(cat.key);
      }
    }
    for (const [key, items] of byCategory.entries()) {
      ordered.push({ key, label: key, tools: items });
    }
    return ordered;
  }, [tools, categories]);

  const totalTools = tools.filter((t) => !t.disabled).length;

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
      <div className="flex items-center justify-between bg-muted/30 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <Package className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-[12px] font-semibold text-foreground">
            我的工具
          </span>
        </div>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {totalTools}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
        {groups.length === 0 ? (
          <p className="px-3 py-3 text-[12.5px] text-muted-foreground">
            暂无可用工具
          </p>
        ) : (
          groups.map((group) => {
            const isOpen = expandedGroups[group.key] ?? true;
            return (
              <div key={group.key} className="px-1">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedGroups((prev) => ({
                      ...prev,
                      [group.key]: !isOpen,
                    }));
                  }}
                  className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[12.5px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="flex-1 truncate">{group.label}</span>
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {group.tools.length}
                  </span>
                </button>
                {isOpen && (
                  <ul className="mb-0.5 space-y-0.5">
                    {group.tools.map((tool) => {
                      const Icon = tool.icon;
                      return (
                        <li key={tool.id}>
                          <button
                            type="button"
                            onClick={() => { onOpenTool(tool); }}
                            className="flex h-7 w-full items-center gap-2 rounded-md pl-6 pr-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title={tool.description}
                          >
                            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{tool.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      <Link
        to="/marketplace"
        className="flex h-9 items-center gap-2 border-t border-border px-3 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Store className="size-3.5" aria-hidden="true" />
        <span>添加更多工具…</span>
      </Link>
    </div>
  );
});
