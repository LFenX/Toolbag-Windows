import { Plus, RefreshCw, Square, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { cn } from "../../../../shared/lib/utils";
import { Button } from "../../../../shared/ui/button";
import { Input } from "../../../../shared/ui/input";
import type { SessionVM } from "../state/types";

import { EmptyState } from "./EmptyState";

interface SessionListPanelProps {
  sessions: SessionVM[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNewSession: () => void;
  onRestart: (id: string) => void;
  onStop: (id: string) => void;
}

function statusBadge(session: SessionVM): { color: string; label: string } {
  if (session.status === "running") return { color: "bg-emerald-500", label: "运行中" };
  if (session.status === "failed") return { color: "bg-rose-500", label: "失败" };
  return { color: "bg-muted-foreground", label: "已退出" };
}

export function SessionListPanel({
  sessions,
  activeSessionId,
  onSelect,
  onNewSession,
  onRestart,
  onStop,
}: SessionListPanelProps) {
  const [filter, setFilter] = useState("");

  const filtered = sessions.filter((session) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      session.name.toLowerCase().includes(f) ||
      (session.command?.toLowerCase().includes(f) ?? false) ||
      (session.cwd?.toLowerCase().includes(f) ?? false)
    );
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-2">
        <Input
          value={filter}
          onChange={(event) => { setFilter(event.target.value); }}
          placeholder="过滤会话…"
          className="h-8 text-xs"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <EmptyState
            icon={TerminalSquare}
            title={sessions.length === 0 ? "暂无会话" : "无匹配结果"}
            description={sessions.length === 0 ? "点击下方按钮新建一个 PowerShell 会话。" : undefined}
            action={
              sessions.length === 0 ? (
                <Button size="sm" onClick={onNewSession}>
                  <Plus className="size-4" aria-hidden="true" />
                  新建会话
                </Button>
              ) : undefined
            }
          />
        ) : (
          filtered.map((session) => {
            const status = statusBadge(session);
            const active = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={cn(
                  "group mb-1 rounded-md border px-2 py-2 text-left transition-colors",
                  active
                    ? "border-primary/40 bg-secondary text-secondary-foreground"
                    : "border-transparent hover:border-border hover:bg-muted/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => { onSelect(session.id); }}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <TerminalSquare className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", status.color)} aria-hidden="true" />
                      <span className="truncate text-sm font-medium" title={session.name}>
                        {session.name}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={session.cwd ?? undefined}>
                      {session.cwd ?? session.shellPath}
                    </p>
                  </div>
                </button>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{status.label} · PID {session.pid || "—"}</span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => { onRestart(session.id); }}
                      className="rounded p-1 hover:bg-muted-foreground/20 hover:text-foreground"
                      title="重启会话"
                    >
                      <RefreshCw className="size-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { onStop(session.id); }}
                      className="rounded p-1 hover:bg-destructive/20 hover:text-destructive"
                      title="停止会话"
                    >
                      <Square className="size-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
