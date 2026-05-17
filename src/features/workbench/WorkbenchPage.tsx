import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Grid2X2,
  Home,
  List,
  Monitor,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { useWorkspaceStore } from "../../app/shell/workspace-store";
import { cn } from "../../shared/lib/utils";
import {
  checkForUpdates,
  getAppInfo,
  getReleaseStatus,
} from "../../shared/tauri/commands";
import { defaultSettings } from "../../shared/tauri/types";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { useSettings, useSaveSettings } from "../settings/useSettings";
import type { ToolDefinition } from "../tools/types";
import { useTools } from "../tools/useTools";

type ToolFilter = "all" | "favorite" | "recent";
type ViewMode = "list" | "grid";
type OpenMenu = "workspace" | "category" | "pageSize" | null;

const categories = ["all", "系统", "网络", "开发", "实用", "媒体", "安全", "其他"];
const pageSizeOptions = [10, 20, 50];

export function WorkbenchPage({ selectedToolId }: { selectedToolId?: string }) {
  const [filter, setFilter] = useState<ToolFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [isInspectorVisible, setInspectorVisible] = useState(true);
  const [isInspectorPinned, setInspectorPinned] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categoryFilter = useWorkspaceStore((state) => state.categoryFilter);
  const isAddToolDialogOpen = useWorkspaceStore(
    (state) => state.isAddToolDialogOpen,
  );
  const search = useWorkspaceStore((state) => state.search);
  const setAddToolDialogOpen = useWorkspaceStore(
    (state) => state.setAddToolDialogOpen,
  );
  const setCategoryFilter = useWorkspaceStore((state) => state.setCategoryFilter);
  const setSearch = useWorkspaceStore((state) => state.setSearch);
  const { data: tools = [] } = useTools();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const { data: appInfo } = useQuery({
    queryKey: ["app-info"],
    queryFn: getAppInfo,
  });
  const { data: releaseStatus } = useQuery({
    queryKey: ["release-status"],
    queryFn: getReleaseStatus,
  });

  const updateMutation = useMutation({
    mutationFn: checkForUpdates,
    onSuccess: (status) => {
      queryClient.setQueryData(["release-status"], status);
    },
  });

  const favoriteIds = useMemo(
    () => new Set(settings?.favoriteToolIds ?? defaultSettings.favoriteToolIds),
    [settings?.favoriteToolIds],
  );

  const selectedToolFromId = selectedToolId
    ? tools.find((tool) => tool.id === selectedToolId)
    : undefined;
  const selectedTool =
    selectedToolFromId ?? (tools.length > 0 ? tools[0] : null);

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesQuery =
        !query ||
        [tool.name, tool.description, tool.category, ...tool.tags]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "favorite" && favoriteIds.has(tool.id)) ||
        (filter === "recent" && tool.lastResult !== "never");
      const matchesCategory =
        categoryFilter === "all" || tool.category === categoryFilter;

      return matchesQuery && matchesFilter && matchesCategory;
    });
  }, [categoryFilter, favoriteIds, filter, search, tools]);

  const pageCount = Math.max(1, Math.ceil(filteredTools.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedTools = filteredTools.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const toggleFavorite = (toolId: string) => {
    const current = settings ?? defaultSettings;
    const nextFavoriteIds = favoriteIds.has(toolId)
      ? current.favoriteToolIds.filter((id) => id !== toolId)
      : [...current.favoriteToolIds, toolId];

    saveSettings.mutate({
      ...current,
      favoriteToolIds: nextFavoriteIds,
    });
  };

  const selectedCategoryLabel =
    categoryFilter === "all" ? "所有分类" : categoryFilter;

  return (
    <>
      <div
        className={cn(
          "grid gap-4",
          isInspectorVisible
            ? "xl:grid-cols-[minmax(0,1fr)_330px]"
            : "xl:grid-cols-1",
        )}
      >
        <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 max-sm:flex-col max-sm:px-4">
            <div>
              <h1 className="text-xl font-semibold tracking-normal">工具台</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                本地工具工作台，安全、专业、高效。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!isInspectorVisible && selectedTool ? (
                <Button
                  className="h-9 gap-2 px-3"
                  onClick={() => {
                    setInspectorVisible(true);
                  }}
                  variant="outline"
                >
                  <Monitor className="size-4" aria-hidden="true" />
                  显示详情
                </Button>
              ) : null}
              <Button
                className="h-9 gap-2 px-3"
                onClick={() => {
                  setAddToolDialogOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                添加工具
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-5 border-b border-border max-lg:grid-cols-2 max-sm:grid-cols-1">
            <StatusCell
              icon={Home}
              label="工作空间"
              value="默认工作空间"
              onClick={() => {
                setOpenMenu(openMenu === "workspace" ? null : "workspace");
              }}
              menu={
                openMenu === "workspace" ? (
                  <MenuPanel className="left-5 top-[72px] w-64">
                    <p className="text-sm font-semibold">默认工作空间</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      当前启用一个本地工作空间，后续可扩展多配置文件。
                    </p>
                    <div className="mt-3 rounded-md bg-background p-3 text-xs text-muted-foreground">
                      数据目录：{appInfo?.dataDir ?? "等待 Tauri 后端"}
                    </div>
                  </MenuPanel>
                ) : null
              }
            />
            <StatusCell icon={ShieldCheck} label="运行权限" value="普通权限" />
            <StatusCell icon={Database} label="数据存储" value="本地 SQLite" />
            <StatusCell icon={FileText} label="日志级别" value="Info" />
            <StatusCell icon={Monitor} label="应用模式" value="本地模式" />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <label className="relative min-w-64 flex-1 max-sm:min-w-full">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="搜索工具"
                className="h-10 bg-card pl-9"
                placeholder="搜索工具..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>

            <div className="flex rounded-md border border-border bg-background p-0.5">
              <FilterButton
                active={filter === "all"}
                onClick={() => {
                  setFilter("all");
                  setPage(1);
                }}
              >
                全部
              </FilterButton>
              <FilterButton
                active={filter === "favorite"}
                onClick={() => {
                  setFilter("favorite");
                  setPage(1);
                }}
              >
                收藏
              </FilterButton>
              <FilterButton
                active={filter === "recent"}
                onClick={() => {
                  setFilter("recent");
                  setPage(1);
                }}
              >
                最近
              </FilterButton>
            </div>

            <div className="relative">
              <Button
                className="h-10 gap-2"
                onClick={() => {
                  setOpenMenu(openMenu === "category" ? null : "category");
                }}
                variant="outline"
              >
                <Filter className="size-4" aria-hidden="true" />
                {selectedCategoryLabel}
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
              {openMenu === "category" ? (
                <MenuPanel className="right-0 top-12 w-44">
                  {categories.map((category) => (
                    <button
                      className={cn(
                        "flex h-9 w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-muted",
                        categoryFilter === category && "bg-secondary text-primary",
                      )}
                      key={category}
                      onClick={() => {
                        setCategoryFilter(category);
                        setPage(1);
                        setOpenMenu(null);
                      }}
                      type="button"
                    >
                      {category === "all" ? "所有分类" : category}
                      {categoryFilter === category ? "✓" : null}
                    </button>
                  ))}
                </MenuPanel>
              ) : null}
            </div>

            <div className="ml-auto flex gap-1 max-sm:ml-0">
              <Button
                aria-pressed={viewMode === "list"}
                className="size-10"
                onClick={() => {
                  setViewMode("list");
                }}
                size="icon"
                variant={viewMode === "list" ? "secondary" : "outline"}
              >
                <span className="sr-only">列表视图</span>
                <List className="size-4" aria-hidden="true" />
              </Button>
              <Button
                aria-pressed={viewMode === "grid"}
                className="size-10"
                onClick={() => {
                  setViewMode("grid");
                }}
                size="icon"
                variant={viewMode === "grid" ? "secondary" : "outline"}
              >
                <span className="sr-only">网格视图</span>
                <Grid2X2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {viewMode === "list" ? (
            <ToolTable
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
              pagedTools={pagedTools}
              selectedToolId={selectedTool?.id}
            />
          ) : (
            <ToolGrid
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
              pagedTools={pagedTools}
              selectedToolId={selectedTool?.id}
            />
          )}

          <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm text-muted-foreground max-sm:flex-col max-sm:items-start max-sm:gap-3">
            <span>共 {filteredTools.length} 个工具</span>
            <div className="flex items-center gap-3">
              <Button
                className="size-8"
                disabled={currentPage <= 1}
                onClick={() => {
                  setPage((value) => Math.max(1, value - 1));
                }}
                size="icon"
                variant="ghost"
              >
                <span className="sr-only">上一页</span>
                <ChevronDown className="size-4 rotate-90" aria-hidden="true" />
              </Button>
              <span className="grid size-9 place-items-center rounded-md border border-primary/40 bg-secondary text-primary">
                {currentPage}
              </span>
              <Button
                className="size-8"
                disabled={currentPage >= pageCount}
                onClick={() => {
                  setPage((value) => Math.min(pageCount, value + 1));
                }}
                size="icon"
                variant="ghost"
              >
                <span className="sr-only">下一页</span>
                <ChevronDown className="size-4 -rotate-90" aria-hidden="true" />
              </Button>
              <div className="relative">
                <Button
                  className="h-9 gap-2"
                  onClick={() => {
                    setOpenMenu(openMenu === "pageSize" ? null : "pageSize");
                  }}
                  variant="outline"
                >
                  {pageSize} 条/页
                  <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
                {openMenu === "pageSize" ? (
                  <MenuPanel className="bottom-11 right-0 w-32">
                    {pageSizeOptions.map((option) => (
                      <button
                        className={cn(
                          "h-9 w-full rounded-md px-3 text-left text-sm hover:bg-muted",
                          pageSize === option && "bg-secondary text-primary",
                        )}
                        key={option}
                        onClick={() => {
                          setPageSize(option);
                          setPage(1);
                          setOpenMenu(null);
                        }}
                        type="button"
                      >
                        {option} 条/页
                      </button>
                    ))}
                  </MenuPanel>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {isInspectorVisible ? (
          <aside
            className={cn("space-y-4", isInspectorPinned && "xl:sticky xl:top-5")}
          >
            <ToolInspector
              checkingUpdates={updateMutation.isPending}
              favorite={selectedTool ? favoriteIds.has(selectedTool.id) : false}
              isPinned={isInspectorPinned}
              onCheckUpdates={() => {
                updateMutation.mutate();
              }}
              onClose={() => {
                setInspectorVisible(false);
              }}
              onOpenTool={(tool) => {
                void navigate({
                  to: "/tools/$toolId",
                  params: { toolId: tool.id },
                });
              }}
              onPin={() => {
                setInspectorPinned((value) => !value);
              }}
              onToggleFavorite={toggleFavorite}
              releaseMessage={releaseStatus?.message ?? "已是最新版本"}
              releaseVersion={
                releaseStatus?.currentVersion ?? appInfo?.version ?? "0.1.0"
              }
              selectedTool={selectedTool}
            />
          </aside>
        ) : null}
      </div>

      <AddToolDialog
        isOpen={isAddToolDialogOpen}
        onClose={() => {
          setAddToolDialogOpen(false);
        }}
      />
    </>
  );
}

function ToolTable({
  favoriteIds,
  onToggleFavorite,
  pagedTools,
  selectedToolId,
}: {
  favoriteIds: Set<string>;
  onToggleFavorite: (toolId: string) => void;
  pagedTools: ToolDefinition[];
  selectedToolId?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="h-11 bg-background/70 text-left text-xs font-medium text-muted-foreground">
            <th className="w-[330px] px-5">工具名称</th>
            <th className="w-[120px] px-3">分类</th>
            <th className="w-[300px] px-3">描述</th>
            <th className="w-[120px] px-3">风险级别</th>
            <th className="w-[92px] px-3 text-center">收藏</th>
            <th className="w-[110px] px-3">最近使用</th>
          </tr>
        </thead>
        <tbody>
          {pagedTools.map((tool) => (
            <ToolRow
              favorite={favoriteIds.has(tool.id)}
              key={tool.id}
              onToggleFavorite={onToggleFavorite}
              selected={selectedToolId === tool.id}
              tool={tool}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ToolGrid({
  favoriteIds,
  onToggleFavorite,
  pagedTools,
  selectedToolId,
}: {
  favoriteIds: Set<string>;
  onToggleFavorite: (toolId: string) => void;
  pagedTools: ToolDefinition[];
  selectedToolId?: string;
}) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
      {pagedTools.map((tool) => {
        const Icon = tool.icon;
        const favorite = favoriteIds.has(tool.id);

        return (
          <Link
            className={cn(
              "rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-card",
              selectedToolId === tool.id &&
                "border-primary/40 bg-[linear-gradient(180deg,#eef6ff_0%,#ffffff_100%)]",
            )}
            key={tool.id}
            params={{ toolId: tool.id }}
            to="/tools/$toolId"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-md border border-primary/20 bg-[#102538] text-cyan-300 shadow-soft">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <button
                className={cn(
                  "grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted",
                  favorite && "text-primary",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  onToggleFavorite(tool.id);
                }}
                type="button"
              >
                <span className="sr-only">切换收藏</span>
                <Star
                  className={cn("size-4", favorite && "fill-current")}
                  aria-hidden="true"
                />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{tool.name}</h3>
              <Badge variant="secondary">内置</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {tool.detailDescription}
            </p>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{tool.category}</span>
              <Badge variant={tool.riskLevel === "safe" ? "success" : "warning"}>
                {tool.riskLevel === "safe" ? "安全" : "谨慎"}
              </Badge>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ToolRow({
  favorite,
  onToggleFavorite,
  selected,
  tool,
}: {
  favorite: boolean;
  onToggleFavorite: (toolId: string) => void;
  selected: boolean;
  tool: ToolDefinition;
}) {
  const Icon = tool.icon;

  return (
    <tr
      className={cn(
        "h-[86px] max-h-[86px] border-t border-border transition-colors",
        selected
          ? "bg-[linear-gradient(90deg,#eaf4ff_0%,#f4f9ff_100%)] outline outline-1 -outline-offset-1 outline-primary/25"
          : "bg-card hover:bg-background/70",
      )}
    >
      <td className="px-5 py-3 align-middle">
        <Link
          className="flex min-w-0 items-center gap-3"
          params={{ toolId: tool.id }}
          to="/tools/$toolId"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-md border border-primary/20 bg-[#102538] text-cyan-300 shadow-soft">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <span className="truncate">{tool.name}</span>
              <Badge variant="secondary">内置</Badge>
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {tool.description}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-3 align-middle">
        <span className="inline-flex items-center gap-2 text-sm">
          <span className="size-1.5 rounded-full bg-primary" />
          {tool.category}
        </span>
      </td>
      <td className="px-3 py-3 align-middle text-sm leading-5 text-muted-foreground">
        <p className="line-clamp-2 max-h-10 overflow-hidden break-normal">
          {tool.detailDescription}
        </p>
      </td>
      <td className="px-3 py-3 align-middle">
        <Badge variant={tool.riskLevel === "safe" ? "success" : "warning"}>
          {tool.riskLevel === "safe" ? "安全" : "谨慎"}
        </Badge>
      </td>
      <td className="px-3 py-3 text-center align-middle">
        <Button
          className={cn("size-8", favorite && "text-primary")}
          onClick={() => {
            onToggleFavorite(tool.id);
          }}
          size="icon"
          variant="ghost"
        >
          <span className="sr-only">切换收藏</span>
          <Star
            className={cn("size-4", favorite && "fill-current")}
            aria-hidden="true"
          />
        </Button>
      </td>
      <td className="px-3 py-3 align-middle text-muted-foreground">
        {tool.lastRunAt}
      </td>
    </tr>
  );
}

function StatusCell({
  icon: Icon,
  label,
  menu,
  onClick,
  value,
}: {
  icon: LucideIcon;
  label: string;
  menu?: ReactNode;
  onClick?: () => void;
  value: string;
}) {
  const content = (
    <>
      <Icon className="size-5 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-medium">{value}</p>
      </div>
      {onClick ? (
        <ChevronDown className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      ) : null}
      {menu}
    </>
  );

  if (onClick) {
    return (
      <button
        className="relative flex min-h-20 items-center gap-3 border-r border-border px-5 text-left transition-colors hover:bg-background/70 last:border-r-0 max-lg:border-b max-sm:border-r-0"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="relative flex min-h-20 items-center gap-3 border-r border-border px-5 last:border-r-0 max-lg:border-b max-sm:border-r-0">
      {content}
    </div>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "h-8 min-w-16 rounded-sm px-3 text-sm font-medium transition-colors",
        active ? "bg-secondary text-primary shadow-soft" : "text-muted-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ToolInspector({
  checkingUpdates,
  favorite,
  isPinned,
  onCheckUpdates,
  onClose,
  onOpenTool,
  onPin,
  onToggleFavorite,
  releaseMessage,
  releaseVersion,
  selectedTool,
}: {
  checkingUpdates: boolean;
  favorite: boolean;
  isPinned: boolean;
  onCheckUpdates: () => void;
  onClose: () => void;
  onOpenTool: (tool: ToolDefinition) => void;
  onPin: () => void;
  onToggleFavorite: (toolId: string) => void;
  releaseMessage: string;
  releaseVersion: string;
  selectedTool: ToolDefinition | null;
}) {
  if (!selectedTool) {
    return (
      <section className="rounded-lg border border-border bg-card p-5 shadow-panel">
        <p className="text-sm text-muted-foreground">暂无可用工具。</p>
      </section>
    );
  }

  const Icon = selectedTool.icon;

  return (
    <>
      <section className="rounded-lg border border-border bg-card shadow-panel">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <h2 className="text-base font-semibold">工具详情</h2>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Button
              className={cn("size-8", isPinned && "text-primary")}
              onClick={onPin}
              size="icon"
              variant="ghost"
            >
              <span className="sr-only">固定详情面板</span>
              <Pin
                className={cn("size-4", isPinned && "fill-current")}
                aria-hidden="true"
              />
            </Button>
            <Button className="size-8" onClick={onClose} size="icon" variant="ghost">
              <span className="sr-only">关闭详情面板</span>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-md border border-primary/20 bg-[#102538] text-cyan-300 shadow-soft">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{selectedTool.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedTool.description}
                  </p>
                </div>
                <Button
                  className={cn("size-8", favorite && "text-primary")}
                  onClick={() => {
                    onToggleFavorite(selectedTool.id);
                  }}
                  size="icon"
                  variant="ghost"
                >
                  <span className="sr-only">切换收藏</span>
                  <Star
                    className={cn("size-4", favorite && "fill-current")}
                    aria-hidden="true"
                  />
                </Button>
              </div>
            </div>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <InspectorRow label="工具 ID" value={selectedTool.id} />
            <InspectorRow label="版本" value={selectedTool.version} />
            <InspectorRow label="分类" value={selectedTool.category} />
            <InspectorRow
              label="风险级别"
              value={selectedTool.riskLevel === "safe" ? "安全" : "谨慎"}
              valueClassName="text-emerald-700"
            />
            <InspectorRow label="权限要求" value={selectedTool.permissionRequirement} />
            <InspectorRow label="数据访问" value={selectedTool.dataAccess} />
            <InspectorRow label="描述" value={selectedTool.detailDescription} multiline />
          </dl>

          <div className="mt-5 space-y-2">
            <Button
              className="h-10 w-full justify-center gap-2"
              onClick={() => {
                onOpenTool(selectedTool);
              }}
            >
              <Play className="size-4" aria-hidden="true" />
              打开工具
            </Button>
            <Button
              asChild
              className="h-10 w-full justify-center gap-2"
              variant="outline"
            >
              <Link params={{ toolId: selectedTool.id }} to="/tools/$toolId">
                <ExternalLink className="size-4" aria-hidden="true" />
                在当前窗口打开
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">近期状态</h2>
          <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <dl className="space-y-3 text-sm">
          <InspectorRow label="最后运行" value={selectedTool.lastRunAt} />
          <InspectorRow label="运行次数" value={String(selectedTool.runCount)} />
          <InspectorRow
            label="平均耗时"
            value={formatDuration(selectedTool.averageDurationMs)}
          />
          <InspectorRow
            label="最后结果"
            value={selectedTool.lastResult === "success" ? "成功" : "未运行"}
            valueClassName="text-emerald-700"
          />
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">更新状态</h2>
          <Button
            className="h-8 px-3 text-xs"
            disabled={checkingUpdates}
            onClick={onCheckUpdates}
            variant="outline"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {checkingUpdates ? "检查中" : "检查更新"}
          </Button>
        </div>
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-1 size-5 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">{releaseMessage}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              当前版本 {releaseVersion}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function InspectorRow({
  label,
  multiline = false,
  value,
  valueClassName,
}: {
  label: string;
  multiline?: boolean;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[92px_minmax(0,1fr)] gap-3",
        multiline && "items-start",
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-right font-medium",
          multiline && "text-left leading-5",
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function AddToolDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <Modal onClose={onClose} title="添加工具">
      <p className="text-sm leading-6 text-muted-foreground">
        当前版本采用内置模块模型。新增工具时，需要在前端工具注册表和 Rust
        工具清单中登记同一个工具 ID，再按风险级别补充专用后端命令。
      </p>
      <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
        <p className="font-medium">推荐目录</p>
        <p className="mt-2 break-all text-muted-foreground">
          src/features/tools/&lt;tool-id&gt;
        </p>
        <p className="mt-1 break-all text-muted-foreground">
          src-tauri/src/tools/&lt;tool_id&gt;
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} variant="outline">
          稍后再说
        </Button>
        <Button onClick={onClose}>知道了</Button>
      </div>
    </Modal>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/20 p-4 backdrop-blur-sm">
      <section className="max-h-[86vh] w-full max-w-lg overflow-auto rounded-lg border border-border bg-card shadow-panel">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button className="size-8" onClick={onClose} size="icon" variant="ghost">
            <span className="sr-only">关闭</span>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function MenuPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute z-30 rounded-lg border border-border bg-card p-2 shadow-panel",
        className,
      )}
    >
      {children}
    </div>
  );
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return "< 1 秒";
  }
  return `${(durationMs / 1000).toFixed(1)} 秒`;
}
