import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Code2,
  FileText,
  Globe2,
  Grid2X2,
  HardDrive,
  Info,
  Monitor,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useRef } from "react";

import { useTools } from "../../features/tools/useTools";
import { getAppInfo } from "../../shared/tauri/commands";
import { cn } from "../../shared/lib/utils";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { useWorkspaceStore } from "./workspace-store";

const navItems = [
  { label: "工具台", to: "/", icon: Grid2X2 },
  { label: "设置", to: "/settings", icon: Settings },
  { label: "日志", to: "/logs", icon: FileText },
  { label: "关于", to: "/about", icon: Info },
] as const;

const categoryItems: {
  label: string;
  key: string;
  icon: LucideIcon;
}[] = [
  { label: "全部工具", key: "all", icon: Grid2X2 },
  { label: "系统", key: "系统", icon: Monitor },
  { label: "网络", key: "网络", icon: Globe2 },
  { label: "开发", key: "开发", icon: Code2 },
  { label: "实用", key: "实用", icon: Wrench },
  { label: "媒体", key: "媒体", icon: HardDrive },
  { label: "安全", key: "安全", icon: ShieldCheck },
  { label: "其他", key: "其他", icon: Boxes },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: tools = [] } = useTools();
  const { data: appInfo } = useQuery({
    queryKey: ["app-info"],
    queryFn: getAppInfo,
  });
  const categoryFilter = useWorkspaceStore((state) => state.categoryFilter);
  const search = useWorkspaceStore((state) => state.search);
  const setAddToolDialogOpen = useWorkspaceStore(
    (state) => state.setAddToolDialogOpen,
  );
  const setCategoryFilter = useWorkspaceStore((state) => state.setCategoryFilter);
  const setSearch = useWorkspaceStore((state) => state.setSearch);
  const isToolRoute = location.pathname.startsWith("/tools/");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of tools) {
      counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
    }
    return counts;
  }, [tools]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,#ffffff_0,#f7f9fc_34%,#f4f7fb_100%)] text-foreground">
      <div className="grid min-h-screen grid-cols-[256px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="flex min-h-screen flex-col border-r border-border/80 bg-sidebar/90 px-4 py-5 shadow-soft max-lg:min-h-0 max-lg:border-b max-lg:border-r-0">
          <div className="flex items-center gap-3 px-1">
            <div className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground shadow-panel">
              <Boxes className="size-7" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xl font-semibold leading-none tracking-normal">
                  Toolbag
                </p>
                <Badge variant="outline">{appInfo?.version ?? "0.1.0"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                本地工具工作台
              </p>
            </div>
          </div>

          <label className="relative mt-8 block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="搜索工具"
              className="h-10 bg-card pl-9 pr-14"
              placeholder="搜索工具"
              ref={searchRef}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              Ctrl K
            </span>
          </label>

          <nav aria-label="主导航" className="mt-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.to === "/"
                  ? location.pathname === "/" ||
                    location.pathname.startsWith("/tools/")
                  : location.pathname.startsWith(item.to);

              return (
                <Button
                  asChild
                  className={cn(
                    "h-10 w-full justify-start gap-3 px-3 text-[14px]",
                    isActive &&
                      "border border-primary/10 bg-secondary text-primary shadow-soft",
                  )}
                  key={item.to}
                  size="sm"
                  variant={isActive ? "secondary" : "ghost"}
                >
                  <Link to={item.to}>
                    <Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>

          <div className="mt-6 border-t border-border/70 pt-5">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-medium text-muted-foreground">工具分类</p>
              <Button
                className="size-7"
                onClick={() => {
                  setAddToolDialogOpen(true);
                }}
                size="icon"
                variant="ghost"
              >
                <span className="sr-only">添加工具</span>
                <Plus className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <div className="space-y-1">
              {categoryItems.map((item) => {
                const Icon = item.icon;
                const count =
                  item.key === "all" ? tools.length : categoryCounts.get(item.key) ?? 0;
                const isSelected = categoryFilter === item.key;

                return (
                  <button
                    className={cn(
                      "flex h-9 w-full items-center justify-between rounded-md px-3 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-secondary text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    key={item.key}
                    onClick={() => {
                      setCategoryFilter(item.key);
                    }}
                    type="button"
                  >
                    <span className="flex items-center gap-3">
                      <Icon
                        className={cn("size-4", isSelected && "text-primary")}
                        aria-hidden="true"
                      />
                      {item.label}
                    </span>
                    <span className="text-xs tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-auto rounded-lg border border-border bg-card p-3 shadow-soft">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              本地优先 · 无遥测 · 普通权限启动
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>所有数据仅存储在本地</span>
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 max-lg:px-3">
          <div
            className={cn(
              "min-h-[calc(100vh-40px)] w-full",
              isToolRoute
                ? "max-w-none lg:h-[calc(100vh-40px)]"
                : "max-w-none",
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
