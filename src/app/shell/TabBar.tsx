import { useNavigate } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "../../shared/lib/utils";
import { useTools } from "../../features/tools/useTools";
import type { ToolDefinition } from "../../features/tools/types";
import { prepareCloseToolTab } from "./tab-close-guards";
import { useTabsStore } from "./tab-store";
import type { ToolTab } from "./tab-store";

export function TabBar({ onAddClick }: { onAddClick: () => void }) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeInstanceId = useTabsStore((s) => s.activeInstanceId);
  const setActive = useTabsStore((s) => s.setActive);
  const closeTab = useTabsStore((s) => s.closeTab);
  const navigate = useNavigate();
  const { data: tools = [] } = useTools();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const toolMap = useMemo(() => {
    const map = new Map<string, ToolDefinition>();
    for (const tool of tools) {
      map.set(tool.id, tool);
    }
    return map;
  }, [tools]);

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

  const navigateAfterClose = (tab: ToolTab, idx: number) => {
    if (tab.instanceId !== activeInstanceId) return;
    if (tabs.length <= 1) {
      void navigate({ to: "/" });
      return;
    }
    const neighbor = idx > 0 ? tabs[idx - 1] : tabs[idx + 1];
    void navigate({
      to: "/tools/$toolId",
      params: { toolId: neighbor.toolId },
    });
  };

  const handleClose = (event: MouseEvent<HTMLElement>, tab: ToolTab) => {
    event.stopPropagation();
    const idx = tabs.findIndex((entry) => entry.instanceId === tab.instanceId);
    const remainingTabs = tabs.filter((entry) => entry.instanceId !== tab.instanceId);
    void prepareCloseToolTab(tab, remainingTabs).then((ok) => {
      if (!ok) return;
      closeTab(tab.instanceId);
      navigateAfterClose(tab, idx);
    });
  };

  const handleMiddleClick = (
    event: MouseEvent<HTMLDivElement>,
    tab: ToolTab,
  ) => {
    if (event.button !== 1) return;
    event.preventDefault();
    handleClose(event, tab);
  };

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
          没有打开的工具，点这里或按
          <kbd className="mx-1 rounded border border-border bg-background px-1 py-0.5 text-[10px]">
            Ctrl+T
          </kbd>
          添加
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
          const label = tool?.name ?? tab.toolName;
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
              title={tool?.description ?? label}
            >
              {isActive && (
                <span
                  className="absolute inset-x-0 top-0 h-[2px] bg-primary"
                  aria-hidden="true"
                />
              )}
              {Icon ? (
                <Icon
                  className={cn("size-4 shrink-0", isActive && "text-primary")}
                  aria-hidden="true"
                />
              ) : (
                <span className="size-4 shrink-0 rounded-sm bg-muted" />
              )}
              <span className="flex-1 truncate">{label}</span>
              <button
                type="button"
                onClick={(event) => { handleClose(event, tab); }}
                aria-label={`关闭 ${label}`}
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
