import { FolderTree, ListChecks, TerminalSquare } from "lucide-react";

import { cn } from "../../../../shared/lib/utils";
import type { SidebarView } from "../state/types";

interface SidebarTabsProps {
  value: SidebarView;
  onChange: (next: SidebarView) => void;
  sessionCount: number;
  commandCount: number;
  groupCount: number;
}

interface TabSpec {
  value: SidebarView;
  label: string;
  icon: typeof TerminalSquare;
  count: number;
}

export function SidebarTabs({
  value,
  onChange,
  sessionCount,
  commandCount,
  groupCount,
}: SidebarTabsProps) {
  const tabs: TabSpec[] = [
    { value: "sessions", label: "会话", icon: TerminalSquare, count: sessionCount },
    { value: "library", label: "命令库", icon: FolderTree, count: commandCount },
    { value: "groups", label: "任务组", icon: ListChecks, count: groupCount },
  ];

  return (
    <div className="flex gap-1 border-b border-border bg-card/60 p-1">
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => { onChange(tab.value); }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <tab.icon className="size-3.5" aria-hidden="true" />
            <span>{tab.label}</span>
            <span
              className={cn(
                "min-w-[1.25rem] rounded-full px-1 text-[10px]",
                active ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
