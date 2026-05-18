import { Plus, X } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../../../../shared/lib/utils";
import type { SessionVM } from "../state/types";

interface SessionTabBarProps {
  sessions: SessionVM[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onContextMenu: (id: string, anchor: { x: number; y: number }) => void;
  onRename: (id: string, name: string) => void;
}

export function SessionTabBar({
  sessions,
  activeId,
  onSelect,
  onClose,
  onNew,
  onContextMenu,
  onRename,
}: SessionTabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card/40 px-2 py-1">
      {sessions.map((session) => (
        <SessionTab
          key={session.id}
          session={session}
          active={activeId === session.id}
          editing={editingId === session.id}
          onSelect={() => { onSelect(session.id); }}
          onClose={() => { onClose(session.id); }}
          onContextMenu={(point) => { onContextMenu(session.id, point); }}
          onStartRename={() => { setEditingId(session.id); }}
          onCommitRename={(name) => {
            setEditingId(null);
            if (name && name !== session.name) onRename(session.id, name);
          }}
          onCancelRename={() => { setEditingId(null); }}
        />
      ))}
      <button
        type="button"
        onClick={onNew}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="新建会话"
        aria-label="新建会话"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function statusColor(session: SessionVM): string {
  if (session.status === "running") return "bg-emerald-500";
  if (session.status === "failed") return "bg-rose-500";
  return "bg-muted-foreground";
}

interface SessionTabProps {
  session: SessionVM;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (point: { x: number; y: number }) => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
}

function SessionTab(props: SessionTabProps) {
  // The renaming sub-UI keeps its own draft; remount it whenever editing flips
  // so the draft re-initializes from the canonical name without an effect.
  return <SessionTabBody key={props.editing ? "editing" : "static"} {...props} />;
}

function SessionTabBody({
  session,
  active,
  editing,
  onSelect,
  onClose,
  onContextMenu,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: SessionTabProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(session.name);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing]);

  const handleMiddleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="tab"
      aria-selected={active}
      className={cn(
        "group flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
        active
          ? "border-border bg-card text-foreground shadow-sm"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      onClick={onSelect}
      onAuxClick={handleMiddleClick}
      onDoubleClick={onStartRename}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <span className={cn("size-2 shrink-0 rounded-full", statusColor(session))} aria-hidden="true" />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); }}
          onBlur={() => { onCommitRename(draft.trim()); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitRename(draft.trim());
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancelRename();
            }
          }}
          onClick={(event) => { event.stopPropagation(); }}
          className="h-5 w-32 rounded bg-background px-1 text-xs text-foreground outline-none ring-1 ring-ring"
        />
      ) : (
        <span className="max-w-[160px] truncate" title={session.name}>
          {session.name}
        </span>
      )}
      <button
        type="button"
        className="ml-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted-foreground/20 hover:text-foreground group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="关闭会话"
        title="关闭"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}
