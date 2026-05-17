import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleSlash,
  FolderPlus,
  Package,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { cn } from "../../shared/lib/utils";
import {
  importPluginFromFile,
  togglePlugin,
  uninstallPlugin,
} from "../../shared/tauri/plugins";
import type { ToolDefinition } from "../tools/types";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { useRegistry } from "../marketplace/useRegistry";
import { useTools } from "../tools/useTools";

export function PluginsPage() {
  const qc = useQueryClient();
  const { data: tools = [] } = useTools();
  const { data: registry } = useRegistry();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [importPath, setImportPath] = useState("");
  const [importSig, setImportSig] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tools"] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      togglePlugin(id, disabled),
    onSuccess: invalidate,
  });
  const uninstallMutation = useMutation({
    mutationFn: (payload: { id: string; deleteData?: boolean }) =>
      uninstallPlugin(payload.id, payload.deleteData ?? false),
    onSuccess: () => {
      setConfirmingId(null);
      invalidate();
    },
  });
  const importMutation = useMutation({
    mutationFn: (payload: { packagePath: string; signaturePath?: string }) =>
      importPluginFromFile(payload.packagePath, payload.signaturePath),
    onSuccess: () => {
      setImportPath("");
      setImportSig("");
      setImportError(null);
      invalidate();
    },
    onError: (error: Error) => { setImportError(error.message); },
  });

  const registryById = new Map((registry?.plugins ?? []).map((p) => [p.id, p]));

  const sorted = [...tools].sort((a, b) => {
    if (a.bundled !== b.bundled) return a.bundled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card px-6 py-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">已安装插件</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              管理已安装工具的状态、权限与卸载。
            </p>
          </div>
          <Badge variant="outline">
            <ShieldCheck className="mr-1 size-3" aria-hidden="true" />
            {tools.length} 项
          </Badge>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-soft">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">从文件安装</h2>
          <FolderPlus className="size-4 text-muted-foreground" aria-hidden="true" />
        </header>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <label className="block text-xs text-muted-foreground">
            .tbpkg 路径
            <Input
              className="mt-1.5"
              value={importPath}
              onChange={(event) => { setImportPath(event.target.value); }}
              placeholder="C:\Users\you\Downloads\my-plugin.tbpkg"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            .tbpkg.sig 路径（可选）
            <Input
              className="mt-1.5"
              value={importSig}
              onChange={(event) => { setImportSig(event.target.value); }}
              placeholder="对应的 minisign 签名文件"
            />
          </label>
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          {importError ? (
            <p className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {importError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              注：未启用签名校验时也建议提供签名文件以备未来切换。
            </p>
          )}
          <Button
            size="sm"
            disabled={!importPath || importMutation.isPending}
            onClick={() => {
              setImportError(null);
              importMutation.mutate({
                packagePath: importPath,
                signaturePath: importSig || undefined,
              });
            }}
          >
            {importMutation.isPending ? "导入中…" : "导入并安装"}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-soft">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">已安装列表</h2>
        </header>
        <ul className="divide-y divide-border">
          {sorted.map((tool) => {
            const registryEntry = registryById.get(tool.id);
            const isUpdatable =
              registryEntry != null && registryEntry.latestVersion !== tool.version;
            return (
              <li key={tool.id}>
                <PluginRow
                  tool={tool}
                  isUpdatable={isUpdatable}
                  latestVersion={registryEntry?.latestVersion}
                  onToggle={() =>
                    { toggleMutation.mutate({
                      id: tool.id,
                      disabled: !tool.disabled,
                    }); }
                  }
                  onUninstall={() => { setConfirmingId(tool.id); }}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {confirmingId && (
        <ConfirmUninstall
          id={confirmingId}
          onCancel={() => { setConfirmingId(null); }}
          onConfirm={(deleteData) => {
            uninstallMutation.mutate({ id: confirmingId, deleteData });
          }}
          pending={uninstallMutation.isPending}
          error={uninstallMutation.error?.message}
        />
      )}
    </div>
  );
}

function PluginRow({
  tool,
  isUpdatable,
  latestVersion,
  onToggle,
  onUninstall,
}: {
  tool: ToolDefinition;
  isUpdatable: boolean;
  latestVersion?: string;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-md border",
          tool.disabled
            ? "border-muted bg-muted text-muted-foreground"
            : "border-border bg-card text-primary",
        )}
      >
        <Package className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{tool.name}</h3>
          <Badge variant="outline" className="text-[10px]">
            {tool.category}
          </Badge>
          {tool.bundled && <Badge variant="secondary" className="text-[10px]">内置</Badge>}
          {tool.disabled && (
            <Badge variant="warning" className="text-[10px]">
              已禁用
            </Badge>
          )}
          {isUpdatable && (
            <Badge variant="default" className="text-[10px]">
              可升级 → {latestVersion}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {tool.description}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">
          {tool.id} · v{tool.version}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={tool.bundled && !tool.disabled}
          onClick={onToggle}
          title={tool.bundled ? "内置插件不可禁用" : undefined}
        >
          {tool.disabled ? (
            <>
              <PlayCircle className="size-4" aria-hidden="true" />
              启用
            </>
          ) : (
            <>
              <PauseCircle className="size-4" aria-hidden="true" />
              禁用
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={tool.bundled}
          onClick={onUninstall}
          title={tool.bundled ? "内置插件不可卸载" : undefined}
        >
          {tool.bundled ? (
            <>
              <CircleSlash className="size-4" aria-hidden="true" />
              不可卸载
            </>
          ) : (
            <>
              <Trash2 className="size-4" aria-hidden="true" />
              卸载
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ConfirmUninstall({
  id,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  id: string;
  onCancel: () => void;
  onConfirm: (deleteData: boolean) => void;
  pending: boolean;
  error?: string;
}) {
  const [deleteData, setDeleteData] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-lg border border-border bg-popover p-5 shadow-elevated">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 place-items-center rounded-full bg-destructive/10 text-destructive">
            <Trash2 className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">确认卸载</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              卸载 <code className="rounded bg-muted px-1.5 py-0.5">{id}</code> 后，相关历史运行记录仍保留。
            </p>
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <label className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={deleteData}
            onChange={(event) => { setDeleteData(event.currentTarget.checked); }}
            className="mt-0.5"
          />
          <span>
            同时删除插件数据目录。默认保留命令库、备注和日志，方便重新安装后继续使用。
          </span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => { onConfirm(deleteData); }}
            disabled={pending}
          >
            {pending ? "卸载中…" : "确认卸载"}
          </Button>
        </div>
      </div>
    </div>
  );
}
