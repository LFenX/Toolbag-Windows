import { Link } from "@tanstack/react-router";
import {
  Grid2X2,
  List,
  Package,
  PackagePlus,
  Pin,
  Search,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useWorkspaceStore } from "../../app/shell/workspace-store";
import { cn } from "../../shared/lib/utils";
import { defaultSettings } from "../../shared/tauri/types";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { useSaveSettings, useSettings } from "../settings/useSettings";
import {
  formatDuration,
  formatLastResult,
  formatLastRun,
  getRiskDisplay,
} from "../tools/display";
import type { ToolDefinition } from "../tools/types";
import { useTools } from "../tools/useTools";

type ToolFilter = "all" | "favorite" | "recent";
type ViewMode = "list" | "grid";

const FILTERS: { id: ToolFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "favorite", label: "收藏" },
  { id: "recent", label: "最近" },
];

export function WorkbenchPage({ selectedToolId }: { selectedToolId?: string } = {}) {
  const { data: tools = [] } = useTools();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const search = useWorkspaceStore((s) => s.search);
  const setSearch = useWorkspaceStore((s) => s.setSearch);
  const categoryFilter = useWorkspaceStore((s) => s.categoryFilter);
  const [filter, setFilter] = useState<ToolFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<string | null>(selectedToolId ?? null);

  const favoriteIds = useMemo(
    () => new Set(settings?.favoriteToolIds ?? defaultSettings.favoriteToolIds),
    [settings?.favoriteToolIds],
  );

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesQuery =
        !q ||
        [tool.name, tool.description, tool.category, ...tool.tags]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "favorite" && favoriteIds.has(tool.id)) ||
        (filter === "recent" && tool.lastResult !== "never");
      const matchesCategory =
        categoryFilter === "all" || tool.category === categoryFilter;
      return matchesQuery && matchesFilter && matchesCategory;
    });
  }, [categoryFilter, favoriteIds, filter, search, tools]);

  const selectedTool = (() => {
    const match = filteredTools.find((tool) => tool.id === selected);
    if (match) return match;
    return filteredTools.length > 0 ? filteredTools[0] : null;
  })();

  const toggleFavorite = (toolId: string) => {
    const current = settings ?? defaultSettings;
    const next = favoriteIds.has(toolId)
      ? current.favoriteToolIds.filter((id) => id !== toolId)
      : [...current.favoriteToolIds, toolId];
    saveSettings.mutate({ ...current, favoriteToolIds: next });
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">工具台</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              本地优先 · 普通权限 · 共 {tools.length} 个工具
            </p>
          </div>
          <Button asChild size="sm" className="gap-2">
            <Link to="/marketplace">
              <PackagePlus className="size-4" aria-hidden="true" />
              添加工具
            </Link>
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <label className="relative min-w-60 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); }}
              placeholder="搜索工具…"
              className="h-9 bg-card pl-9 text-xs"
              aria-label="搜索工具"
            />
          </label>
          <div className="flex rounded-md border border-border bg-background p-0.5 text-xs">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setFilter(entry.id); }}
                className={cn(
                  "rounded-sm px-2.5 py-1 font-medium transition-colors",
                  filter === entry.id
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            <Button
              size="icon"
              variant={viewMode === "list" ? "secondary" : "outline"}
              onClick={() => { setViewMode("list"); }}
              aria-pressed={viewMode === "list"}
            >
              <span className="sr-only">列表视图</span>
              <List className="size-4" aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant={viewMode === "grid" ? "secondary" : "outline"}
              onClick={() => { setViewMode("grid"); }}
              aria-pressed={viewMode === "grid"}
            >
              <span className="sr-only">网格视图</span>
              <Grid2X2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredTools.length === 0 ? (
            <EmptyState />
          ) : viewMode === "list" ? (
            <ToolList
              tools={filteredTools}
              favoriteIds={favoriteIds}
              selectedId={selectedTool ? selectedTool.id : undefined}
              onSelect={setSelected}
              onToggleFavorite={toggleFavorite}
            />
          ) : (
            <ToolGrid
              tools={filteredTools}
              favoriteIds={favoriteIds}
              selectedId={selectedTool ? selectedTool.id : undefined}
              onSelect={setSelected}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </div>
      </section>

      <aside className="space-y-3 max-xl:order-first">
        <Inspector
          tool={selectedTool}
          favorited={selectedTool != null && favoriteIds.has(selectedTool.id)}
          onToggleFavorite={toggleFavorite}
        />
      </aside>
    </div>
  );
}

function ToolList({
  tools,
  favoriteIds,
  selectedId,
  onSelect,
  onToggleFavorite,
}: {
  tools: ToolDefinition[];
  favoriteIds: Set<string>;
  selectedId?: string;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const favorite = favoriteIds.has(tool.id);
        const risk = getRiskDisplay(tool.riskLevel);
        return (
          <li key={tool.id}>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-colors",
                selectedId === tool.id ? "bg-secondary/50" : "hover:bg-muted/60",
              )}
              role="presentation"
              onClick={() => { onSelect(tool.id); }}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="truncate text-sm font-semibold hover:underline"
                    params={{ toolId: tool.id }}
                    to="/tools/$toolId"
                  >
                    {tool.name}
                  </Link>
                  {tool.bundled && (
                    <Badge variant="secondary" className="text-[10px]">
                      内置
                    </Badge>
                  )}
                  {tool.disabled && (
                    <Badge variant="warning" className="text-[10px]">
                      已禁用
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {tool.category}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {tool.description}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 text-xs">
                <Badge variant={risk.badgeVariant}>{risk.label}</Badge>
                <span className="text-muted-foreground">
                  {formatLastRun(tool.lastRunAt)}
                </span>
              </div>
              <button
                type="button"
                className={cn(
                  "grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted",
                  favorite && "text-primary",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(tool.id);
                }}
                aria-label="切换收藏"
              >
                <Star
                  className={cn("size-4", favorite && "fill-current")}
                  aria-hidden="true"
                />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ToolGrid({
  tools,
  favoriteIds,
  selectedId,
  onSelect,
  onToggleFavorite,
}: {
  tools: ToolDefinition[];
  favoriteIds: Set<string>;
  selectedId?: string;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const favorite = favoriteIds.has(tool.id);
        const risk = getRiskDisplay(tool.riskLevel);
        const isSelected = selectedId === tool.id;
        return (
          <Link
            key={tool.id}
            to="/tools/$toolId"
            params={{ toolId: tool.id }}
            onClick={() => { onSelect(tool.id); }}
            className={cn(
              "group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40",
              isSelected && "border-primary/40 shadow-soft",
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-md border border-border bg-background text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <button
                type="button"
                className={cn(
                  "grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted",
                  favorite && "text-primary",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  onToggleFavorite(tool.id);
                }}
                aria-label="切换收藏"
              >
                <Star
                  className={cn("size-4", favorite && "fill-current")}
                  aria-hidden="true"
                />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{tool.name}</h3>
              {tool.bundled && (
                <Badge variant="secondary" className="text-[10px]">
                  内置
                </Badge>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
              {tool.detailDescription}
            </p>
            <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{tool.category}</span>
              <Badge variant={risk.badgeVariant} className="text-[10px]">
                {risk.label}
              </Badge>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Inspector({
  tool,
  favorited,
  onToggleFavorite,
}: {
  tool: ToolDefinition | null;
  favorited: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  if (!tool) {
    return (
      <section className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft">
        暂无可用工具。
      </section>
    );
  }
  const Icon = tool.icon;
  const risk = getRiskDisplay(tool.riskLevel);
  return (
    <section className="rounded-lg border border-border bg-card shadow-soft">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">工具详情</h2>
        <button
          type="button"
          onClick={() => { onToggleFavorite(tool.id); }}
          className={cn(
            "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted",
            favorited && "text-primary",
          )}
          aria-label="切换收藏"
        >
          <Pin
            className={cn("size-3.5", favorited && "fill-current")}
            aria-hidden="true"
          />
        </button>
      </header>
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-md border border-border bg-background text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{tool.name}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {tool.description}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-[88px_1fr] gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">ID</dt>
          <dd className="break-all font-medium">{tool.id}</dd>
          <dt className="text-muted-foreground">版本</dt>
          <dd className="font-medium">{tool.version}</dd>
          <dt className="text-muted-foreground">分类</dt>
          <dd className="font-medium">{tool.category}</dd>
          <dt className="text-muted-foreground">风险</dt>
          <dd className={cn("font-medium", risk.valueClassName)}>{risk.label}</dd>
          <dt className="text-muted-foreground">权限</dt>
          <dd className="font-medium">{tool.permissionRequirement || "—"}</dd>
          <dt className="text-muted-foreground">最近一次</dt>
          <dd className="font-medium">{formatLastRun(tool.lastRunAt)}</dd>
          <dt className="text-muted-foreground">运行次数</dt>
          <dd className="font-medium">{tool.runCount}</dd>
          <dt className="text-muted-foreground">平均耗时</dt>
          <dd className="font-medium">{formatDuration(tool.averageDurationMs)}</dd>
          <dt className="text-muted-foreground">上次结果</dt>
          <dd className="font-medium">{formatLastResult(tool.lastResult)}</dd>
        </dl>

        <Button asChild className="w-full justify-center">
          <Link to="/tools/$toolId" params={{ toolId: tool.id }}>
            <Package className="size-4" aria-hidden="true" />
            打开工具
          </Link>
        </Button>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted">
        <Package className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium">没有匹配的工具</p>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">
        调整筛选条件，或去应用市场安装一个新工具。
      </p>
      <Button asChild className="mt-4" variant="outline" size="sm">
        <Link to="/marketplace">浏览应用市场</Link>
      </Button>
    </div>
  );
}
