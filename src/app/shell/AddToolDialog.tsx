import { useNavigate } from "@tanstack/react-router";
import { Package, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useTools } from "../../features/tools/useTools";
import { cn } from "../../shared/lib/utils";
import { useTabsStore } from "./tab-store";

export function AddToolDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: tools = [] } = useTools();
  const navigate = useNavigate();
  const openTab = useTabsStore((s) => s.openTab);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = tools.filter((t) => !t.disabled);
    if (!q) return visible.slice(0, 50);
    return visible
      .filter((tool) =>
        [tool.name, tool.description, tool.category, ...tool.tags]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [query, tools]);

  // Clamp the highlighted index into the current match list — without a
  // separate effect, which would trigger a cascading render.
  const safeActiveIndex =
    matches.length === 0
      ? 0
      : Math.min(activeIndex, matches.length - 1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;

  const renderEmptyHint = (toolCount: number) =>
    toolCount > 0
      ? "没有匹配的工具"
      : "暂无可用工具，先去应用市场安装一个吧。";

  const choose = (toolId: string, toolName: string, iconKey: string | null) => {
    openTab({ toolId, toolName, iconKey });
    onClose();
    void navigate({ to: "/tools/$toolId", params: { toolId } });
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-start bg-foreground/10 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover shadow-elevated">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索要打开的工具… (Esc 关闭)"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => { setQuery(e.target.value); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((idx) => Math.min(idx + 1, matches.length - 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((idx) => Math.max(idx - 1, 0));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (safeActiveIndex < matches.length) {
                  const item = matches[safeActiveIndex];
                  choose(item.id, item.name, item.iconKey);
                }
              }
            }}
          />
          <kbd className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {matches.length === 0 ? (
            <li className="grid place-items-center px-4 py-8 text-center text-sm text-muted-foreground">
              <Package className="mb-2 size-5" aria-hidden="true" />
              {renderEmptyHint(tools.length)}
            </li>
          ) : (
            matches.map((tool, index) => {
              const Icon = tool.icon;
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                      index === safeActiveIndex
                        ? "bg-secondary text-secondary-foreground"
                        : "hover:bg-muted",
                    )}
                    onMouseEnter={() => { setActiveIndex(index); }}
                    onMouseDown={(event) => { event.preventDefault(); }}
                    onClick={() => { choose(tool.id, tool.name, tool.iconKey); }}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{tool.name}</span>
                    <span className="ml-2 shrink-0 truncate text-xs text-muted-foreground">
                      {tool.category}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            <kbd className="mr-1 rounded border border-border px-1">↑↓</kbd>移动
            <kbd className="mx-1 rounded border border-border px-1">Enter</kbd>打开
          </span>
          <span>{matches.length} 项</span>
        </div>
      </div>
    </div>
  );
}
