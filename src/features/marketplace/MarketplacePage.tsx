import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CloudOff,
  Download,
  PackagePlus,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { cn } from "../../shared/lib/utils";
import type { RegistryEntry } from "../../shared/tauri/types";
import type { ToolDefinition } from "../tools/types";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { useTools } from "../tools/useTools";
import { useInstallPlugin, useRegistry } from "./useRegistry";

export function MarketplacePage() {
  const { data: registry, refetch, isFetching, isError } = useRegistry();
  const { data: installed = [] } = useTools();
  const installMutation = useInstallPlugin();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const installedById = useMemo(
    () => new Map(installed.map((tool) => [tool.id, tool])),
    [installed],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const plugins = registry ? registry.plugins : [];
    if (!q) return plugins;
    return plugins.filter((plugin) =>
      [plugin.id, plugin.name, plugin.description, plugin.category, ...plugin.tags]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [registry, query]);

  const selected = useMemo(() => {
    const match = visible.find((entry) => entry.id === selectedId);
    if (match) return match;
    return visible.length > 0 ? visible[0] : null;
  }, [visible, selectedId]);

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card px-6 py-5 shadow-soft">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">应用市场</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            从 Toolbag Registry 浏览、安装和升级工具插件。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={registry?.source === "live" ? "success" : "outline"}>
            {registry?.source === "live"
              ? "来自远程"
              : registry?.source === "cached"
                ? "本地缓存"
                : "内置兜底"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
          >
            <RefreshCw
              className={cn("size-4", isFetching && "animate-spin")}
              aria-hidden="true"
            />
            刷新
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <label className="relative min-w-64 flex-1 max-sm:min-w-full">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => { setQuery(event.target.value); }}
              placeholder="搜索插件 ID、名称或标签…"
              className="h-10 bg-card pl-9"
            />
          </label>
          <span className="text-xs text-muted-foreground">
            共 {visible.length} 个插件
          </span>
        </div>

        {isError ? (
          <div className="grid place-items-center px-8 py-12 text-center">
            <CloudOff className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">无法连接到 Registry</p>
            <p className="mt-1 text-xs text-muted-foreground">
              检查网络或代理；当前显示来自本地缓存或内置兜底。
            </p>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <ul className="divide-y divide-border">
              {visible.map((entry) => (
                <li key={entry.id}>
                  <PluginRow
                    entry={entry}
                    installed={installedById.get(entry.id)}
                    selected={selected?.id === entry.id}
                    onSelect={() => { setSelectedId(entry.id); }}
                    onInstall={() => { installMutation.mutate(entry.id); }}
                    installing={
                      installMutation.isPending && installMutation.variables === entry.id
                    }
                  />
                </li>
              ))}
            </ul>
            <aside className="border-l border-border bg-background/40 p-4 max-lg:border-l-0 max-lg:border-t">
              {selected != null ? (
                <PluginDetail
                  entry={selected}
                  installed={installedById.get(selected.id)}
                  installing={
                    installMutation.isPending &&
                    installMutation.variables === selected.id
                  }
                  installError={installMutation.error?.message}
                  onInstall={() => { installMutation.mutate(selected.id); }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">选择一个插件查看详情。</p>
              )}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}

function PluginRow({
  entry,
  installed,
  selected,
  onSelect,
  onInstall,
  installing,
}: {
  entry: RegistryEntry;
  installed: ToolDefinition | undefined;
  selected: boolean;
  onSelect: () => void;
  onInstall: () => void;
  installing: boolean;
}) {
  const stateLabel = installed
    ? installed.version === entry.latestVersion
      ? "已安装最新"
      : `可升级到 ${entry.latestVersion}`
    : entry.latestVersion;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect();
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-4 px-4 py-3 text-left transition-colors",
        selected ? "bg-secondary/60" : "hover:bg-muted",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card text-primary">
        <PackagePlus className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{entry.name}</h3>
          <Badge variant="outline" className="text-[10px]">
            {entry.category}
          </Badge>
          {installed && (
            <Badge variant="success" className="text-[10px]">
              已装 {installed.version}
            </Badge>
          )}
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {entry.description}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground/70">
          {entry.id}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="text-xs text-muted-foreground">{stateLabel}</span>
        <Button
          size="sm"
          variant={installed ? "outline" : "default"}
          disabled={
            installing ||
            (installed?.version === entry.latestVersion)
          }
          onClick={(event) => {
            event.stopPropagation();
            onInstall();
          }}
        >
          <Download className="size-4" aria-hidden="true" />
          {installing ? "安装中…" : installed ? "更新" : "安装"}
        </Button>
      </div>
    </div>
  );
}

function PluginDetail({
  entry,
  installed,
  installing,
  installError,
  onInstall,
}: {
  entry: RegistryEntry;
  installed: ToolDefinition | undefined;
  installing: boolean;
  installError?: string;
  onInstall: () => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <header>
        <h2 className="text-base font-semibold">{entry.name}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{entry.id}</p>
      </header>

      <p className="text-sm leading-6">{entry.description}</p>

      <dl className="grid grid-cols-[88px_1fr] gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">最新版本</dt>
        <dd className="font-medium">{entry.latestVersion}</dd>
        {installed && (
          <>
            <dt className="text-muted-foreground">已安装</dt>
            <dd className="font-medium">{installed.version}</dd>
          </>
        )}
        <dt className="text-muted-foreground">分类</dt>
        <dd className="font-medium">{entry.category}</dd>
        {entry.minAppVersion && (
          <>
            <dt className="text-muted-foreground">最低应用版本</dt>
            <dd className="font-medium">{entry.minAppVersion}</dd>
          </>
        )}
        <dt className="text-muted-foreground">发布时间</dt>
        <dd className="font-medium">
          {new Date(entry.publishedAt).toLocaleString()}
        </dd>
        {entry.author && (
          <>
            <dt className="text-muted-foreground">作者</dt>
            <dd className="font-medium">{entry.author}</dd>
          </>
        )}
        {entry.size != null && (
          <>
            <dt className="text-muted-foreground">大小</dt>
            <dd className="font-medium">
              {(entry.size / 1024).toFixed(1)} KB
            </dd>
          </>
        )}
      </dl>

      {entry.changelog && (
        <details className="rounded-md border border-border bg-card/60 p-3 text-xs">
          <summary className="cursor-pointer font-medium">更新说明</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs">
            {entry.changelog}
          </pre>
        </details>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={onInstall} disabled={installing}>
          <Download className="size-4" aria-hidden="true" />
          {installing
            ? "安装中…"
            : installed
              ? installed.version === entry.latestVersion
                ? "重装"
                : "升级"
              : "安装"}
        </Button>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3" aria-hidden="true" />
          下载后会自动校验签名
        </span>
      </div>

      {installError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4" aria-hidden="true" />
          <span>{installError}</span>
        </div>
      )}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted">
        <PackagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium">
        {query ? "没有匹配的插件" : "Registry 还没有发布插件"}
      </p>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">
        {query
          ? "尝试不同的关键字。"
          : "等待 Registry 上线后这里会列出所有可安装工具。可以先使用「从文件安装」导入本地插件包。"}
      </p>
    </div>
  );
}
