import { useNavigate } from "@tanstack/react-router";
import { Boxes, Settings, ShieldCheck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../shared/lib/utils";
import { useTools } from "../../features/tools/useTools";
import { useWorkspaceStore } from "./workspace-store";

interface CommandItem {
  id: string;
  title: string;
  hint?: string;
  icon: LucideIcon;
  keywords: string[];
  run: () => void;
}

export function CommandPalette() {
  const open = useWorkspaceStore((state) => state.isCommandPaletteOpen);
  const setOpen = useWorkspaceStore((state) => state.setCommandPaletteOpen);
  const navigate = useNavigate();
  const { data: tools = [] } = useTools();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const baseCommands = useMemo<CommandItem[]>(
    () => [
      {
        id: "nav:workbench",
        title: "前往工具台",
        icon: Boxes,
        keywords: ["workbench", "home"],
        run: () => void navigate({ to: "/" }),
      },
      {
        id: "nav:marketplace",
        title: "前往应用市场",
        icon: Boxes,
        keywords: ["marketplace", "shop", "市场"],
        run: () => void navigate({ to: "/marketplace" }),
      },
      {
        id: "nav:plugins",
        title: "前往已安装",
        icon: Wrench,
        keywords: ["plugins", "installed", "已装"],
        run: () => void navigate({ to: "/plugins" }),
      },
      {
        id: "nav:settings",
        title: "前往设置",
        icon: Settings,
        keywords: ["settings", "preferences"],
        run: () => void navigate({ to: "/settings" }),
      },
      {
        id: "nav:about",
        title: "前往关于",
        icon: ShieldCheck,
        keywords: ["about", "version"],
        run: () => void navigate({ to: "/about" }),
      },
    ],
    [navigate],
  );

  const toolCommands = useMemo<CommandItem[]>(() => {
    return tools.map((tool) => ({
      id: `tool:${tool.id}`,
      title: `打开 ${tool.name}`,
      hint: tool.description,
      icon: tool.icon,
      keywords: [tool.id, tool.name, tool.category, ...tool.tags],
      run: () =>
        void navigate({
          to: "/tools/$toolId",
          params: { toolId: tool.id },
        }),
    }));
  }, [navigate, tools]);

  const matches = useMemo(() => {
    const all = [...toolCommands, ...baseCommands];
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 20);
    return all
      .filter((item) =>
        [item.title, item.hint ?? "", ...item.keywords]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 24);
  }, [baseCommands, toolCommands, query]);

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

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setActiveIndex((idx) => (idx > matches.length - 1 ? 0 : idx));
    });
    return () => {
      cancelled = true;
    };
  }, [query, matches.length]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-start bg-foreground/10 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover shadow-elevated">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="grid size-6 place-items-center rounded-md bg-secondary text-secondary-foreground">
            ⌘
          </span>
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索工具或命令… (Esc 关闭)"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(e) => { setQuery(e.target.value); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((idx) => Math.min(idx + 1, matches.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((idx) => Math.max(idx - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (matches.length === 0) return;
                const item = matches[activeIndex];
                item.run();
                setOpen(false);
              }
            }}
          />
          <kbd className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {matches.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              没有匹配项
            </li>
          ) : (
            matches.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                      index === activeIndex
                        ? "bg-secondary text-secondary-foreground"
                        : "hover:bg-muted",
                    )}
                    onMouseEnter={() => { setActiveIndex(index); }}
                    onMouseDown={(event) => { event.preventDefault(); }}
                    onClick={() => {
                      item.run();
                      setOpen(false);
                    }}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.hint && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {item.hint}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            <kbd className="mr-1 rounded border border-border px-1">↑↓</kbd>移动
            <kbd className="mx-1 rounded border border-border px-1">Enter</kbd>执行
          </span>
          <span>{matches.length} 项</span>
        </div>
      </div>
    </div>
  );
}
