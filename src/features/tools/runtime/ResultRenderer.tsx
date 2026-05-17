import { useEffect, useRef, useState } from "react";

import { cn } from "../../../shared/lib/utils";
import type {
  UiResultRenderer,
  UiResultSection,
} from "../../../shared/tauri/types";
import { Badge } from "../../../shared/ui/badge";
import { evalBool } from "./expr";
import type { RunState } from "./types";

export interface ResultRendererProps {
  section: UiResultSection;
  state: RunState;
}

function formatScalar(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function readSource(state: RunState, source?: string): unknown {
  if (!source) return state.result;
  if (source === "$result") return state.result;
  if (source === "$logs") return state.logs;
  if (source === "$running") return state.running;
  if (source === "$lastError") return state.lastError;
  if (state.result && typeof state.result === "object") {
    const parts = source.replace(/^\$result\./, "").split(".");
    let value: unknown = state.result;
    for (const part of parts) {
      if (value == null || typeof value !== "object") return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  }
  return undefined;
}

export function ResultRenderer({ section, state }: ResultRendererProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {section.title && (
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight">{section.title}</h2>
          <RunStatusBadge state={state} />
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {section.renderers.map((renderer, index) => {
          const showWhenScope = {
            $running: state.running,
            $result: state.result,
            $logs: state.logs,
            $lastError: state.lastError,
          };
          const visible =
            renderer.type === "progress"
              ? evalBool(renderer.showWhen, showWhenScope)
              : true;
          if (!visible) return null;
          return (
            <RendererItem
              key={`${renderer.type}-${String(index)}`}
              renderer={renderer}
              state={state}
            />
          );
        })}
      </div>
    </div>
  );
}

function RunStatusBadge({ state }: { state: RunState }) {
  if (state.running) {
    return <Badge variant="default">运行中</Badge>;
  }
  if (state.lastError) {
    return <Badge variant="warning">失败</Badge>;
  }
  if (state.lastResult === "success") {
    return <Badge variant="success">完成</Badge>;
  }
  if (state.lastResult === "cancelled") {
    return <Badge variant="outline">已取消</Badge>;
  }
  return <Badge variant="outline">就绪</Badge>;
}

function RendererItem({
  renderer,
  state,
}: {
  renderer: UiResultRenderer;
  state: RunState;
}) {
  switch (renderer.type) {
    case "text": {
      const value = readSource(state, renderer.source);
      return (
        <p className="text-sm leading-6 text-foreground">
          {formatScalar(value)}
        </p>
      );
    }
    case "code": {
      const value = readSource(state, renderer.source);
      return (
        <pre
          className={cn(
            "rounded-md border border-border bg-background p-4 text-xs leading-5",
            renderer.wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto",
          )}
        >
          {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    case "keyValue": {
      const value = readSource(state, renderer.source);
      if (!value || typeof value !== "object") {
        return <p className="text-sm text-muted-foreground">暂无数据</p>;
      }
      return (
        <dl className="grid gap-2 sm:grid-cols-[160px_1fr]">
          {Object.entries(value as Record<string, unknown>).map(([key, v]) => (
            <div key={key} className="contents text-sm">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="break-words font-medium">{formatScalar(v)}</dd>
            </div>
          ))}
        </dl>
      );
    }
    case "table": {
      const value = readSource(state, renderer.source);
      if (!Array.isArray(value) || value.length === 0) {
        return <p className="text-sm text-muted-foreground">暂无数据</p>;
      }
      const columns =
        renderer.columns ??
        Object.keys(value[0] as Record<string, unknown>).map((k) => ({
          key: k,
          label: k,
        }));
      return (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(value as Record<string, unknown>[]).map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2">
                      {formatScalar(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "list": {
      const value = readSource(state, renderer.source);
      if (!Array.isArray(value)) {
        return <p className="text-sm text-muted-foreground">暂无数据</p>;
      }
      return (
        <ul className="space-y-1 text-sm">
          {(value as unknown[]).map((item, i) => (
            <li key={i} className="rounded-md border border-border bg-card px-3 py-2">
              {typeof item === "string" ? item : JSON.stringify(item)}
            </li>
          ))}
        </ul>
      );
    }
    case "log":
      return <LogPane logs={state.logs} level={renderer.level ?? "info"} />;
    case "progress":
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{state.stage ?? "处理中"}</span>
            <span>
              {state.progress != null
                ? `${String(Math.round(state.progress * 100))}%`
                : ""}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{
                width: `${String(
                  state.progress != null
                    ? Math.min(100, Math.max(0, state.progress * 100))
                    : state.running
                      ? 35
                      : 0,
                )}%`,
              }}
            />
          </div>
        </div>
      );
    case "status":
      return (
        <div
          className={cn(
            "rounded-md border p-4 text-sm",
            state.lastError
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : state.lastResult === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {state.lastError ? (
            <>
              <p className="font-medium">{state.lastError.code}</p>
              <p className="mt-1">{state.lastError.message}</p>
            </>
          ) : state.lastResult === "success" ? (
            <p>已完成。</p>
          ) : (
            <p>等待运行。</p>
          )}
        </div>
      );
    default:
      return null;
  }
}

function LogPane({
  logs,
  level,
}: {
  logs: RunState["logs"];
  level: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [followBottom, setFollowBottom] = useState(true);
  const levelRank: Record<string, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  const min = levelRank[level] ?? 1;
  const visible = logs.filter((row) => (levelRank[row.level] ?? 1) >= min);
  useEffect(() => {
    if (!followBottom || !ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [visible.length, followBottom]);

  return (
    <div className="flex h-64 flex-col rounded-md border border-border bg-[#0d1117] font-mono text-xs leading-5 text-slate-100">
      <div
        ref={ref}
        className="flex-1 overflow-auto px-3 py-2"
        onScroll={(event) => {
          const target = event.currentTarget;
          const atBottom =
            target.scrollHeight - target.scrollTop - target.clientHeight < 4;
          setFollowBottom(atBottom);
        }}
      >
        {visible.length === 0 ? (
          <p className="text-slate-500">[no logs yet]</p>
        ) : (
          visible.map((row, i) => (
            <div key={i} className="whitespace-pre-wrap">
              <span
                className={cn(
                  "mr-2 text-xs uppercase",
                  row.level === "error"
                    ? "text-red-400"
                    : row.level === "warn"
                      ? "text-amber-300"
                      : "text-cyan-300",
                )}
              >
                {row.level}
              </span>
              {row.message}
            </div>
          ))
        )}
      </div>
      {!followBottom && (
        <button
          type="button"
          onClick={() => { setFollowBottom(true); }}
          className="border-t border-slate-700 bg-slate-800 py-1 text-xs text-slate-200 hover:bg-slate-700"
        >
          ↓ 跳到最新
        </button>
      )}
    </div>
  );
}
