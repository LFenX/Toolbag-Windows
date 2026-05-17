import { AlertCircle, CheckCircle2, Download, RefreshCw, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "../../shared/lib/utils";
import { Button } from "../../shared/ui/button";
import { useSettings } from "../settings/useSettings";
import {
  checkForAppUpdate,
  dismissAppUpdate,
  formatBytes,
  getAppUpdateProgressPercent,
  installAppUpdate,
  shouldAutoCheckAppUpdate,
  useAppUpdateStore,
  type AppUpdatePhase,
} from "./app-update-store";

export function AppUpdatePrompt() {
  const { data: settings } = useSettings();
  const phase = useAppUpdateStore((state) => state.phase);
  const visible = useAppUpdateStore((state) => state.visible);
  const info = useAppUpdateStore((state) => state.info);
  const message = useAppUpdateStore((state) => state.message);
  const downloadedBytes = useAppUpdateStore((state) => state.downloadedBytes);
  const contentLength = useAppUpdateStore((state) => state.contentLength);
  const autoCheckKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!settings || !shouldAutoCheckAppUpdate(settings)) return;

    const autoCheckKey = [
      settings.appAutoUpdate,
      settings.updateCheckFrequency,
      settings.updateChannel,
      settings.httpProxy ?? "",
    ].join(":");
    if (autoCheckKeyRef.current === autoCheckKey) return;
    autoCheckKeyRef.current = autoCheckKey;

    const delay = 5_000 + Math.floor(Math.random() * 2_500);
    const timer = window.setTimeout(() => {
      void checkForAppUpdate(settings, { silent: true });
    }, delay);
    return () => { window.clearTimeout(timer); };
  }, [settings]);

  if (!visible || phase === "idle") return null;

  const progress = getAppUpdateProgressPercent(downloadedBytes, contentLength);
  const canDismiss = phase !== "downloading" && phase !== "installing" && phase !== "installed";

  return (
    <aside
      aria-live="polite"
      className="fixed bottom-10 right-4 z-50 w-[min(calc(100vw-2rem),380px)] rounded-lg border border-border bg-card p-4 shadow-elevated"
    >
      <div className="flex items-start gap-3">
        <StatusIcon phase={phase} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{titleForPhase(phase, info?.latestVersion)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{message}</p>
            </div>
            {canDismiss && (
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="关闭更新提示"
                onClick={dismissAppUpdate}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {phase === "available" && info?.notes && (
            <div className="mt-3 max-h-24 overflow-y-auto rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
              {info.notes}
            </div>
          )}

          {(phase === "downloading" || phase === "installing") && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-all",
                    progress === null && "w-1/3 animate-pulse",
                  )}
                  style={progress === null ? undefined : { width: `${String(progress)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {progress === null
                  ? formatBytes(downloadedBytes)
                  : `${String(progress)}% · ${formatBytes(downloadedBytes)} / ${formatBytes(contentLength ?? 0)}`}
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {phase === "available" && (
              <Button size="sm" onClick={() => { void installAppUpdate(settings); }}>
                <Download className="size-4" aria-hidden="true" />
                安装并重启
              </Button>
            )}
            {phase === "error" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { void checkForAppUpdate(settings); }}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                重试
              </Button>
            )}
            {phase === "notAvailable" && (
              <Button size="sm" variant="outline" onClick={dismissAppUpdate}>
                知道了
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function StatusIcon({ phase }: { phase: AppUpdatePhase }) {
  if (phase === "error") {
    return (
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
      </span>
    );
  }
  if (phase === "notAvailable" || phase === "installed") {
    return (
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground">
        <CheckCircle2 className="size-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
      <RefreshCw
        className={cn(
          "size-4",
          (phase === "checking" || phase === "downloading" || phase === "installing") && "animate-spin",
        )}
        aria-hidden="true"
      />
    </span>
  );
}

function titleForPhase(phase: AppUpdatePhase, latestVersion?: string) {
  switch (phase) {
    case "checking":
      return "正在检查更新";
    case "available":
      return latestVersion ? `Toolbag ${latestVersion} 可更新` : "发现新版本";
    case "notAvailable":
      return "已是最新版本";
    case "downloading":
      return "正在下载更新";
    case "installing":
      return "正在安装更新";
    case "installed":
      return "正在重启";
    case "error":
      return "更新失败";
    case "idle":
      return "更新";
  }
}
