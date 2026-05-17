import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Database,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  Layers3,
  Loader2,
  MonitorCog,
  Package,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wifi,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { relaunchAsAdmin } from "../../../shared/tauri/commands";
import { cn } from "../../../shared/lib/utils";
import type {
  EnvironmentItem,
  EnvironmentItemStatus,
  EnvironmentMetadataValue,
  ScanGroupStatus,
} from "../../../shared/tauri/types";
import { fallbackEnvironmentSnapshot } from "../../../shared/tauri/types";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { useEnvironmentScanStore } from "./store";
import { useEnvironmentScan } from "./useEnvironmentScan";

// ── Static category metadata ──────────────────────────────────────────────────

const STATIC_CATEGORIES = fallbackEnvironmentSnapshot.categories;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  system: MonitorCog,
  hardware: Cpu,
  storage: HardDrive,
  network: Wifi,
  process: Activity,
  service: Server,
  driver: Database,
  environment: Terminal,
  path: Code2,
  software: Package,
  automation: Layers3,
  security: ShieldCheck,
  registry: FileText,
  app: FolderOpen,
  permission: ShieldCheck,
};

// Maps a top-level category to the scan group(s) that produce it.
const CATEGORY_GROUPS: Record<string, string[]> = {
  system: ["fast"],
  environment: ["fast"],
  path: ["fast"],
  registry: ["fast"],
  app: ["fast"],
  permission: ["fast"],
  hardware: ["hardware"],
  storage: ["storage"],
  network: ["network"],
  process: ["process"],
  service: ["service_driver"],
  driver: ["service_driver"],
  software: ["software"],
  automation: ["software", "automation"],
  security: ["security"],
};

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<EnvironmentItemStatus, string> = {
  ok: "正常",
  info: "信息",
  warning: "注意",
  error: "错误",
  empty: "空值",
};

const STATUS_PILL_CLASS: Record<EnvironmentItemStatus, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
  empty: "border-slate-200 bg-slate-50 text-slate-500",
};

const STATUS_DOT_CLASS: Record<EnvironmentItemStatus, string> = {
  ok: "bg-emerald-500",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  empty: "bg-slate-300",
};

function worstStatus(statuses: EnvironmentItemStatus[]): EnvironmentItemStatus {
  const priority: EnvironmentItemStatus[] = ["error", "warning", "info", "ok", "empty"];
  for (const s of priority) {
    if (statuses.includes(s)) return s;
  }
  return "ok";
}

// ── Component: StatusPill ─────────────────────────────────────────────────────

function StatusPill({ status }: { status: EnvironmentItemStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[11px] font-medium whitespace-nowrap",
        STATUS_PILL_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Component: StatusDot ──────────────────────────────────────────────────────

function StatusDot({ status }: { status: EnvironmentItemStatus }) {
  return <span className={cn("mt-0.5 size-2 shrink-0 rounded-full", STATUS_DOT_CLASS[status])} />;
}

// ── Component: HighlightedText ────────────────────────────────────────────────

function HighlightedText({ query, text }: { query: string; text: string }) {
  const normalized = query.trim();
  if (!normalized) return <>{text}</>;

  const idx = text.toLowerCase().indexOf(normalized.toLowerCase());
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-blue-100 px-0.5 text-primary">
        {text.slice(idx, idx + normalized.length)}
      </mark>
      {text.slice(idx + normalized.length)}
    </>
  );
}

// ── Component: ToggleButton ───────────────────────────────────────────────────

function ToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
        active
          ? "border-primary/20 bg-secondary text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "grid size-4 place-items-center rounded-sm border",
          active ? "border-primary bg-primary text-white" : "border-border bg-card",
        )}
      >
        {active ? <CheckCircle2 className="size-3" aria-hidden="true" /> : null}
      </span>
      {label}
    </button>
  );
}

// ── Component: SkeletonCard ───────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 size-2 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="h-4 w-12 rounded bg-slate-200" />
          </div>
          <div className="h-3.5 w-3/4 rounded bg-slate-100" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

// ── Component: EnvCard ────────────────────────────────────────────────────────

function EnvCard({
  item,
  isExpanded,
  query,
  onToggle,
  onCopy,
  onReveal,
}: {
  item: EnvironmentItem;
  isExpanded: boolean;
  query: string;
  onToggle: () => void;
  onCopy: (text: string) => void;
  onReveal: (path: string) => void;
}) {
  const details = item.details ?? [];
  const metadataEntries = Object.entries(item.metadata ?? {});
  const revealPath =
    typeof item.metadata?.path === "string" && item.metadata.path.trim()
      ? item.metadata.path
      : undefined;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
      <button
        aria-expanded={isExpanded}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-background/60"
        onClick={onToggle}
        type="button"
      >
        <div className="flex items-start gap-3">
          <StatusDot status={item.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold leading-5">
                <HighlightedText query={query} text={item.name} />
              </span>
              <StatusPill status={item.status} />
            </div>
            <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
              <HighlightedText query={query} text={item.value} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              <HighlightedText query={query} text={item.source} />
            </p>
          </div>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground/50 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t border-border bg-background/40 px-4 py-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">原始值</p>
            <pre className="max-h-40 overflow-auto rounded-md border border-border bg-[#0f172a] p-3 text-xs leading-5 text-slate-100">
              {item.rawValue ?? item.value}
            </pre>
          </div>

          {details.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">关键字段</p>
              <dl className="rounded-md border border-border bg-card p-3 text-xs">
                {details.map((d) => (
                  <div className="flex justify-between gap-4 py-0.5" key={`${d.label}-${d.value}`}>
                    <dt className="text-muted-foreground">{d.label}</dt>
                    <dd className="font-medium">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {metadataEntries.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">元数据</p>
              <dl className="rounded-md border border-border bg-card p-3 text-xs">
                {metadataEntries.map(([k, v]) => (
                  <div className="flex justify-between gap-4 py-0.5" key={k}>
                    <dt className="text-muted-foreground">{metadataLabel(k)}</dt>
                    <dd className="break-all font-medium">{formatMetadataValue(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {item.tags.length > 0 && (
            <p className="flex flex-wrap gap-1 text-xs text-muted-foreground">
              {item.tags.map((tag) => (
                <span className="rounded border border-border bg-card px-1.5 py-0.5" key={tag}>
                  {tag}
                </span>
              ))}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => { onCopy(item.value); }}
              variant="outline"
            >
              <Copy className="size-3" aria-hidden="true" />
              复制值
            </Button>
            {revealPath && (
              <Button
                className="h-8 gap-1.5 px-3 text-xs"
                onClick={() => { onReveal(revealPath); }}
                variant="outline"
              >
                <FolderOpen className="size-3" aria-hidden="true" />
                定位
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component: CategorySidebar ────────────────────────────────────────────────

function CategorySidebar({
  activeCategory,
  items,
  groupProgress,
  scanStatus,
  onSelect,
}: {
  activeCategory: string;
  items: EnvironmentItem[];
  groupProgress: Partial<Record<string, ScanGroupStatus>>;
  scanStatus: string;
  onSelect: (id: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
      if (item.subcategory) {
        counts.set(item.subcategory, (counts.get(item.subcategory) ?? 0) + 1);
      }
    }
    return counts;
  }, [items]);

  const statusByCategory = useMemo(() => {
    const map = new Map<string, EnvironmentItemStatus>();
    for (const item of items) {
      const cur = map.get(item.category);
      map.set(item.category, worstStatus([cur ?? "ok", item.status]));
    }
    return map;
  }, [items]);

  const parentCategories = STATIC_CATEGORIES.filter((c) => !c.parentId);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, typeof STATIC_CATEGORIES>();
    for (const c of STATIC_CATEGORIES) {
      if (c.parentId) {
        const arr = map.get(c.parentId) ?? [];
        arr.push(c);
        map.set(c.parentId, arr);
      }
    }
    return map;
  }, []);

  function getCategoryLoadStatus(categoryId: string): "idle" | "scanning" | "done" | "failed" {
    if (scanStatus === "idle" || scanStatus === "done" || scanStatus === "cancelled" || scanStatus === "error") {
      return "idle";
    }
    const groups = CATEGORY_GROUPS[categoryId] ?? [];
    if (groups.length === 0) return "idle";
    const statuses = groups.map((g) => groupProgress[g] ?? "pending");
    if (statuses.every((s) => s === "done")) return "done";
    if (statuses.some((s) => s === "failed")) return "failed";
    return "scanning";
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <aside className="min-h-0 overflow-auto border-r border-border bg-sidebar p-3 max-lg:border-b max-lg:border-r-0">
      <button
        aria-label="分类 全部环境项"
        className={cn(
          "mb-2 flex h-10 w-full items-center justify-between rounded-md px-3 text-left text-sm transition-colors",
          activeCategory === "all"
            ? "bg-secondary text-primary"
            : "text-muted-foreground hover:bg-muted",
        )}
        onClick={() => { onSelect("all"); }}
        type="button"
      >
        <span className="flex items-center gap-2">
          <Boxes className="size-4 shrink-0" aria-hidden="true" />
          全部环境项
        </span>
        <span className="text-xs tabular-nums">{items.length}</span>
      </button>

      <div className="space-y-0.5">
        {parentCategories.map((cat) => {
          const children = childrenByParent.get(cat.id) ?? [];
          const Icon = CATEGORY_ICONS[cat.id] ?? FileText;
          const selected = activeCategory === cat.id;
          const isExpanded =
            children.length > 0 &&
            (expandedIds.size === 0 || expandedIds.has(cat.id));
          const count = countByCategory.get(cat.id) ?? 0;
          const loadStatus = getCategoryLoadStatus(cat.id);
          const itemStatus = statusByCategory.get(cat.id);

          return (
            <div key={cat.id}>
              <div className="flex items-stretch gap-1">
                <button
                  aria-label={`${isExpanded ? "折叠" : "展开"} ${cat.label}`}
                  className={cn(
                    "grid w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors",
                    children.length === 0
                      ? "invisible"
                      : "hover:bg-muted hover:text-foreground",
                  )}
                  disabled={children.length === 0}
                  onClick={() => { toggleExpand(cat.id); }}
                  type="button"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  )}
                </button>

                <button
                  aria-label={`分类 ${cat.label}`}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left transition-colors",
                    selected
                      ? "bg-secondary text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => { onSelect(cat.id); }}
                  type="button"
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{cat.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {cat.description}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <GroupStatusIcon loadStatus={loadStatus} itemStatus={itemStatus} />
                    <span className="text-xs tabular-nums">{count}</span>
                  </span>
                </button>
              </div>

              {isExpanded && (
                <div className="ml-8 mt-0.5 space-y-0.5 border-l border-border/70 pl-2">
                  {children.map((child) => {
                    const childCount = countByCategory.get(child.id) ?? 0;
                    const childSelected = activeCategory === child.id;
                    return (
                      <button
                        aria-label={`分类 ${child.label}`}
                        className={cn(
                          "flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-xs transition-colors",
                          childSelected
                            ? "bg-secondary text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        key={child.id}
                        onClick={() => { onSelect(child.id); }}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{child.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {child.description}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{childCount}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function GroupStatusIcon({
  loadStatus,
  itemStatus,
}: {
  loadStatus: "idle" | "scanning" | "done" | "failed";
  itemStatus: EnvironmentItemStatus | undefined;
}) {
  if (loadStatus === "scanning") {
    return <Loader2 className="size-3.5 animate-spin text-primary/60" aria-hidden="true" />;
  }
  if (loadStatus === "failed") {
    return <AlertTriangle className="size-3.5 text-amber-500" aria-hidden="true" />;
  }
  if (itemStatus === "warning" || itemStatus === "error") {
    return (
      <span
        className={cn(
          "size-2 rounded-full",
          itemStatus === "error" ? "bg-red-500" : "bg-amber-500",
        )}
      />
    );
  }
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function EnvironmentOverviewTool() {
  const { startScan, cancelScan } = useEnvironmentScan();
  const { items, scanStatus, groupProgress, totalGroups, isAdmin, durationMs, startedAt } =
    useEnvironmentScanStore();

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [relaunching, setRelaunching] = useState(false);

  const categoryById = useMemo(
    () => new Map(STATIC_CATEGORIES.map((c) => [c.id, c])),
    [],
  );

  const doneGroups = useMemo(
    () => Object.values(groupProgress).filter((s) => s === "done" || s === "failed").length,
    [groupProgress],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory !== "all") {
        const cat = categoryById.get(activeCategory);
        if (cat?.parentId) {
          if (item.subcategory !== activeCategory) return false;
        } else {
          if (item.category !== activeCategory) return false;
        }
      }
      if (hideEmpty && item.status === "empty") return false;
      if (onlyIssues && item.status !== "warning" && item.status !== "error") return false;
      if (q) {
        const haystack = [
          item.name, item.value, item.rawValue ?? "", item.source,
          item.category, item.subcategory ?? "", item.subcategoryLabel ?? "",
          ...item.tags,
          ...(item.details ?? []).flatMap((d) => [d.label, d.value, d.source ?? ""]),
          item.metadata ? JSON.stringify(item.metadata) : "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [activeCategory, categoryById, hideEmpty, onlyIssues, query, items]);

  const issueCount = useMemo(
    () => items.filter((i) => i.status === "warning" || i.status === "error").length,
    [items],
  );

  const isScanning = scanStatus === "scanning";
  const progressPct = totalGroups > 0 ? (doneGroups / totalGroups) * 100 : 0;

  // Determine if the active category's group is still loading
  const activeCategoryParent = useMemo(() => {
    const cat = categoryById.get(activeCategory);
    return cat?.parentId ?? activeCategory;
  }, [activeCategory, categoryById]);

  const activeCategoryLoading = useMemo(() => {
    if (!isScanning || activeCategory === "all") return false;
    const groups = CATEGORY_GROUPS[activeCategoryParent] ?? [];
    return groups.some((g) => groupProgress[g] !== "done" && groupProgress[g] !== "failed");
  }, [activeCategoryParent, groupProgress, isScanning, activeCategory]);

  function toggleCard(id: string) {
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("已复制到剪贴板。");
    } catch {
      setFeedback("当前环境无法访问剪贴板。");
    }
    setTimeout(() => { setFeedback(null); }, 2500);
  }

  async function revealPath(path: string) {
    if (!isTauriRuntime()) {
      setFeedback("浏览器预览模式无法打开资源管理器。");
      return;
    }
    try {
      await revealItemInDir(path);
    } catch {
      setFeedback("无法在资源管理器中显示该路径。");
    }
  }

  function exportSummary() {
    const lines = [
      "Toolbag 环境概览摘要",
      `扫描时间：${startedAt ? formatDateTime(startedAt) : "—"}`,
      `扫描耗时：${durationMs != null ? String(durationMs) : "—"} ms`,
      `总项目数：${String(items.length)} 项`,
      `异常项数：${String(issueCount)} 项`,
    ];
    if (filteredItems.length < items.length) {
      lines.push(`当前筛选：${String(filteredItems.length)} 项`);
    }
    void copyText(lines.join("\n"));
  }

  async function handleElevate() {
    setRelaunching(true);
    try {
      await relaunchAsAdmin();
    } catch {
      setFeedback("无法请求管理员权限。");
      setRelaunching(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-panel max-lg:h-auto max-lg:min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-md border border-primary/20 bg-[#102538] text-cyan-300 shadow-soft">
                <MonitorCog className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-normal">环境概览</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Windows 本机环境信息 · 只读扫描 · 可搜索匹配
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <Badge className="h-8 gap-1 px-3 border-amber-200 bg-amber-50 text-amber-700" variant="outline">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                管理员
              </Badge>
            ) : (
              <Badge className="h-8 gap-1 px-3" variant="outline">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                普通权限
              </Badge>
            )}

            {isScanning ? (
              <Button
                className="h-9 gap-2"
                onClick={cancelScan}
                variant="outline"
              >
                <XCircle className="size-4" aria-hidden="true" />
                取消扫描
              </Button>
            ) : (
              <Button
                className="h-9 gap-2"
                disabled={relaunching}
                onClick={() => { void startScan(); }}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                刷新
              </Button>
            )}

            {!isAdmin && (
              <Button
                className="h-9 gap-2"
                disabled={relaunching}
                onClick={() => { void handleElevate(); }}
                variant="outline"
              >
                <ShieldAlert className="size-4" aria-hidden="true" />
                {relaunching ? "提权中…" : "以管理员运行"}
              </Button>
            )}

            <Button className="h-9 gap-2" onClick={exportSummary} variant="outline">
              <Download className="size-4" aria-hidden="true" />
              导出摘要
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {isScanning && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>
                已完成 {doneGroups}/{totalGroups} 组 · {items.length} 项
              </span>
              <span>扫描中…</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${progressPct.toFixed(1)}%` }}
              />
            </div>
          </div>
        )}

        {scanStatus === "error" && (
          <p className="mt-2 flex items-center gap-2 text-sm text-red-600">
            <XCircle className="size-4" aria-hidden="true" />
            扫描失败，请重试。
          </p>
        )}

        {feedback && (
          <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-xs text-primary">
            {feedback}
          </p>
        )}
      </div>

      {/* Filter bar */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[280px] flex-1 max-sm:min-w-full">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="搜索环境信息"
              className="h-10 bg-card pl-9"
              placeholder="搜索项目、路径、变量、进程、服务…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
            />
          </label>
          <ToggleButton
            active={hideEmpty}
            label="隐藏空值"
            onClick={() => { setHideEmpty((v) => !v); }}
          />
          <ToggleButton
            active={onlyIssues}
            label="仅异常项"
            onClick={() => { setOnlyIssues((v) => !v); }}
          />
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {filteredItems.length} / {items.length} 项
          </span>
        </div>
      </div>

      {/* Body: sidebar + cards */}
      <div className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1 max-lg:overflow-visible">
        <CategorySidebar
          activeCategory={activeCategory}
          groupProgress={groupProgress}
          items={items}
          scanStatus={scanStatus}
          onSelect={setActiveCategory}
        />

        {/* Card area */}
        <div className="min-h-0 overflow-auto p-4">
          {scanStatus === "idle" && (
            <EmptyState
              description="点击刷新按钮开始扫描 Windows 环境信息。"
              icon={RefreshCw}
              title="等待扫描"
            />
          )}

          {(scanStatus === "scanning" || scanStatus === "done" || scanStatus === "cancelled") && (
            <>
              {filteredItems.length === 0 && !activeCategoryLoading && (
                <EmptyState
                  description={
                    isScanning
                      ? "此分类数据正在加载中，请稍候。"
                      : "试试放宽过滤条件或切换其他分类。"
                  }
                  icon={Search}
                  title="没有匹配的环境项"
                />
              )}

              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <EnvCard
                    isExpanded={expandedCardIds.has(item.id)}
                    item={item}
                    key={item.id}
                    query={query}
                    onCopy={(t) => { void copyText(t); }}
                    onReveal={(p) => { void revealPath(p); }}
                    onToggle={() => { toggleCard(item.id); }}
                  />
                ))}

                {activeCategoryLoading &&
                  Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
              </div>
            </>
          )}

          {scanStatus === "error" && (
            <EmptyState
              description="扫描时发生错误，请点击刷新重试。"
              icon={XCircle}
              title="扫描失败"
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/80 px-4 py-3 text-xs text-muted-foreground">
        <span>
          {scanStatus === "done" || scanStatus === "scanning" || scanStatus === "cancelled" ? (
            <>
              扫描完成 · {items.length} 项 · {issueCount} 个异常 · 本地只读
              {startedAt ? ` · ${formatDateTime(startedAt)}` : ""}
            </>
          ) : scanStatus === "error" ? (
            "扫描失败"
          ) : (
            "就绪"
          )}
        </span>
        {durationMs != null && scanStatus === "done" && (
          <span>耗时 {durationMs} ms</span>
        )}
        {isScanning && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {doneGroups}/{totalGroups} 组完成
          </span>
        )}
      </div>
    </section>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="grid min-h-[280px] place-items-center p-8 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-md bg-secondary text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-base font-semibold">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function metadataLabel(key: string): string {
  const copy: Record<string, string> = {
    autoConfigUrl: "自动配置 URL",
    class: "类别",
    command: "命令",
    count: "数量",
    description: "说明",
    exists: "存在",
    family: "地址族",
    health: "健康状态",
    issuer: "颁发者",
    lastWriteTime: "最后写入",
    path: "路径",
    paths: "路径",
    processId: "进程 ID",
    publisher: "发布者",
    scope: "作用域",
    size: "大小",
    source: "来源",
    status: "状态",
    store: "存储区",
    thumbprint: "指纹",
    version: "版本",
  };
  return copy[key] ?? key;
}

function formatMetadataValue(value: EnvironmentMetadataValue): string {
  if (value === null) return "空值";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? formatDateTime(value) : value;
  }
  if (Array.isArray(value)) return value.map(formatMetadataValue).join(", ");
  return JSON.stringify(value, null, 2);
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}
