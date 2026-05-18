import { ListChecks, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { cn } from "../../../../shared/lib/utils";
import { Button } from "../../../../shared/ui/button";
import { Input } from "../../../../shared/ui/input";
import type {
  CommandGroupVM,
  SavedCommandVM,
} from "../state/types";

import { EmptyState } from "./EmptyState";

interface GroupLibraryPanelProps {
  groups: CommandGroupVM[];
  commands: SavedCommandVM[];
  onNewGroup: () => void;
  onEditGroup: (group: CommandGroupVM) => void;
  onDeleteGroup: (group: CommandGroupVM) => void;
  onRunGroup: (group: CommandGroupVM) => void;
}

export function GroupLibraryPanel({
  groups,
  commands,
  onNewGroup,
  onEditGroup,
  onDeleteGroup,
  onRunGroup,
}: GroupLibraryPanelProps) {
  const [filter, setFilter] = useState("");
  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const commandById = new Map(commands.map((c) => [c.id, c]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-2">
        <Input
          value={filter}
          onChange={(event) => { setFilter(event.target.value); }}
          placeholder="过滤任务组…"
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" className="w-full" onClick={onNewGroup}>
          <Plus className="size-3.5" aria-hidden="true" />
          新建任务组
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="还没有任务组"
            description="把多条常用命令打包成一组，一键并行或串行运行。"
          />
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            无匹配的任务组。
          </p>
        ) : (
          filtered.map((group) => (
            <div
              key={group.id}
              className="mb-2 rounded-md border border-border bg-card/60 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{group.name}</span>
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 text-[10px]",
                        group.mode === "parallel"
                          ? "bg-sky-500/15 text-sky-600"
                          : "bg-amber-500/15 text-amber-700",
                      )}
                    >
                      {group.mode === "parallel" ? "并行" : "串行"} · ×{group.commandIds.length}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {group.commandIds.length === 0
                      ? "（空组）"
                      : group.commandIds
                          .map((id) => commandById.get(id)?.name ?? "（已删除）")
                          .join(" → ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={group.commandIds.length === 0}
                    onClick={() => { onRunGroup(group); }}
                    title="运行任务组"
                  >
                    <Play className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { onEditGroup(group); }}
                    title="编辑"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => { onDeleteGroup(group); }}
                    title="删除"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
