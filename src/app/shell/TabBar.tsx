import { useNavigate } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "../../shared/lib/utils";
import { useTools } from "../../features/tools/useTools";
import type { ToolDefinition } from "../../features/tools/types";
import { useTabsStore } from "./tab-store";
import type { ToolTab } from "./tab-store";

export function TabBar({ onAddClick }: { onAddClick: () => void }) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeInstanceId = useTabsStore((s) => s.activeInstanceId);
  const setActive = useTabsStore((s) => s.setActive);
  const closeTab = useTabsStore((s) => s.closeTab);
  const navigate = useNavigate();
  const { data: tools = [] } = useTools();

  const toolMap = useMemo(() => {
    const map = new Map<string, ToolDefinition>();
    for (const t of tools) map.set(t.id, t);
    return map;
  }, [tools]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Keep the active tab scrolled into view.
  useEffect(() => {
    if (!activeInstanceId || !scrollerRef.current) return;
    const el = scrollerRef.current.querySelector<HTMLElement>(
      `[data-instance="${activeInstanceId}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeInstanceId]);

  const handleSelect = (tab: ToolTab) => {
    setActive(tab.instanceId);
    void navigate({ to: "/tools/$toolId", params: { toolId: tab.toolId } });
  };

  const handleClose = (
    event: MouseEvent<HTMLButtonElement>,
    tab: ToolTab,
  ) => {
    event.stopPropagation();
    const wasActive = tab.instanceId === activeInstanceId;
    const idx = tabs.findIndex((t) => t.instanceId === tab.instanceId);
    closeTab(tab.instanceId);
    if (wasActive) {
      // After close, the store auto-focuses a neighbor — navigate to it so URL stays in sync.
      const remaining = tabs.length - 1;
      if (remaining === 0) {
        void navigate({ to: "/" });
      } else {
        let neighbor: ToolTab | undefined;
        if (idx > 0) {
          neighbor = tabs[idx - 1];
        } else if (idx + 1 < tabs.length) {
          neighbor = tabs[idx + 1];
        }
        if (neighbor) {
          void navigate({
            to: "/tools/$toolId",
            params: { toolId: neighbor.toolId },
          });
        }
      }
    }
  };

  const handleMiddleClick = (
    event: MouseEvent<HTMLDivElement>,
    tab: ToolTab,
  ) => {
    if (event.button === 1) {
      event.preventDefault();
      handleClose(event as unknown as MouseEvent<HTMLButtonElement>, tab);
    }
  };

  // Empty state: a clear call-to-action so the bar isn't just dead chrome.
  if (tabs.length === 0) {
    return (
      <div className="flex h-11 items-center gap-2 border-b border-border bg-muted/40 px-3">
        <button
          type="button"
          onClick={onAddClick}
          className="flex h-8 items-center gap-1.5 rounded-md bg-primary/10 px-3 text-[13px] font-medium text-primary transition-colors hover:bg-primary/20"
          title="打开工具 (Ctrl+T)"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>打开工具</span>
        </button>
        <span className="text-[12px] text-muted-foreground">
          没有打开的工具，点这里或按 <kbd className="rounded border border-border bg-background px-1 py-0.5 text-[10px]">Ctrl+T</kbd> 添加
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-11 items-stretch border-b border-border bg-muted/40">
      <div
        ref={scrollerRef}
        className="flex flex-1 items-stretch overflow-x-auto"
        role="tablist"
        aria-label="工具标签"
      >
        {tabs.map((tab) => {
          const tool = toolMap.get(tab.toolId);
          const Icon = tool?.icon;
          const isActive = tab.instanceId === activeInstanceId;
          return (
            <div
              key={tab.instanceId}
              data-instance={tab.instanceId}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => { handleSelect(tab); }}
              onMouseDown={(event) => { handleMiddleClick(event, tab); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelect(tab);
                }
              }}
              className={cn(
                "group relative flex max-w-[220px] min-w-[120px] cursor-pointer items-center gap-2 border-r border-border px-3 text-[13px] transition-colors",
                isActive
                  ? "bg-background font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
              title={tool?.description ?? tab.toolName}
            >
              {/* Top accent strip makes the active tab pop. */}
              {isActive && (
                <span
                  className="absolute inset-x-0 top-0 h-[2px] bg-primary"
                  aria-hidden="true"
                />
              )}
              {Icon ? (
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "text-primary" : "",
                  )}
                  aria-hidden="true"
                />
              ) : (
                <span className="size-4 shrink-0 rounded-sm bg-muted" />
              )}
              <span className="flex-1 truncate">{tool?.name ?? tab.toolName}</span>
              <button
                type="button"
                onClick={(event) => { handleClose(event, tab); }}
                aria-label={`关闭 ${tool?.name ?? tab.toolName}`}
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
                  isActive ? "" : "opacity-0 group-hover:opacity-100",
                )}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
        {/* Inline "+" — sits right after the last tab (browser convention)
            and scrolls with the tab strip when there are many tabs. */}
        <button
          type="button"
          onClick={onAddClick}
          className="ml-1 mr-2 flex size-7 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          title="打开工具 (Ctrl+T)"
          aria-label="打开工具"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
