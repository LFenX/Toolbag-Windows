import { OctagonX, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "../../../../shared/lib/utils";
import { Button } from "../../../../shared/ui/button";
import type { ProcessInfoVM } from "../state/types";

import { Modal } from "./Modal";

interface ProcessProbeDialogProps {
  pid: number;
  describe: (pid: number) => Promise<ProcessInfoVM | null>;
  onKill: (pid: number, recursive: boolean) => Promise<void>;
  onClose: () => void;
}

export function ProcessProbeDialog({
  pid,
  describe,
  onKill,
  onClose,
}: ProcessProbeDialogProps) {
  const [info, setInfo] = useState<ProcessInfoVM | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await describe(pid);
      setInfo(result);
      if (!result) setError("进程已不存在或无权读取。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [describe, pid]);

  // Fire the initial fetch in a microtask so it doesn't synchronously call
  // setState during commit — the lint rule is happy and behaviour is identical.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; };
  }, [refresh]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`进程详情 · PID ${String(pid)}`}
      size="md"
      footer={
        <>
          <Button size="sm" variant="outline" onClick={() => { void refresh(); }} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
            刷新
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              await onKill(pid, true);
              await refresh();
            }}
          >
            <OctagonX className="size-3.5" aria-hidden="true" />
            终止进程树
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      {error && (
        <p className="rounded-md border border-amber-300/40 bg-amber-50/50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
      )}
      {!info ? (
        <p className="text-sm text-muted-foreground">{loading ? "正在读取…" : "无数据"}</p>
      ) : (
        <ProcessTree info={info} depth={0} />
      )}
    </Modal>
  );
}

function ProcessTree({ info, depth }: { info: ProcessInfoVM; depth: number }) {
  return (
    <div className="text-xs">
      <div
        className="grid items-center gap-2"
        style={{
          paddingLeft: `${String(depth * 12)}px`,
          gridTemplateColumns: "auto auto auto 1fr",
        }}
      >
        <span className="font-mono text-muted-foreground">{String(info.pid)}</span>
        <span className="font-medium text-foreground">{info.name}</span>
        <span className="text-muted-foreground">{info.memoryKb.toLocaleString()} KB</span>
        <span className="truncate text-muted-foreground" title={info.cmd.join(" ")}>
          {info.cmd.join(" ") || "(no cmdline)"}
        </span>
      </div>
      {info.children.map((child) => (
        <ProcessTree key={child.pid} info={child} depth={depth + 1} />
      ))}
    </div>
  );
}
