import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useState } from "react";

import { cn } from "../../../../shared/lib/utils";
import { Button } from "../../../../shared/ui/button";
import { Input } from "../../../../shared/ui/input";
import type {
  CommandGroupVM,
  SavedCommandVM,
} from "../state/types";

import { Modal } from "./Modal";

interface EditGroupDialogProps {
  initial: CommandGroupVM | null;
  commands: SavedCommandVM[];
  onCancel: () => void;
  onConfirm: (data: {
    id?: string;
    name: string;
    commandIds: string[];
    mode: "parallel" | "sequential";
  }) => void;
}

export function EditGroupDialog({
  initial,
  commands,
  onCancel,
  onConfirm,
}: EditGroupDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mode, setMode] = useState<"parallel" | "sequential">(
    initial?.mode ?? "sequential",
  );
  const [picked, setPicked] = useState<string[]>(initial?.commandIds ?? []);
  const [search, setSearch] = useState("");

  const commandById = new Map(commands.map((c) => [c.id, c]));
  const filteredCommands = commands.filter((c) => {
    if (!search) return true;
    const n = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(n) ||
      c.command.toLowerCase().includes(n) ||
      c.tags.some((tag) => tag.toLowerCase().includes(n))
    );
  });

  const move = (index: number, direction: -1 | 1) => {
    const next = [...picked];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPicked(next);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? "编辑任务组" : "新建任务组"}
      description="并行模式：每条命令在新会话同时启动。串行模式：在同一会话依次执行，前一步失败则停止。"
      size="lg"
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || picked.length === 0}
            onClick={() => {
              onConfirm({
                id: initial?.id,
                name: name.trim(),
                commandIds: picked,
                mode,
              });
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">组名 *</span>
          <Input
            value={name}
            autoFocus
            onChange={(event) => { setName(event.target.value); }}
          />
        </label>

        <div>
          <span className="text-xs font-medium text-foreground">执行模式</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <ModeOption
              active={mode === "parallel"}
              title="并行"
              hint="每条命令开一个新会话同时运行。适合启动多服务。"
              onClick={() => { setMode("parallel"); }}
            />
            <ModeOption
              active={mode === "sequential"}
              title="串行"
              hint="在同一会话按顺序执行，前一步失败则停止。适合构建/部署脚本。"
              onClick={() => { setMode("sequential"); }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border">
            <div className="border-b border-border bg-card/40 px-2 py-1 text-xs font-medium">
              命令库
            </div>
            <div className="p-2">
              <Input
                value={search}
                onChange={(event) => { setSearch(event.target.value); }}
                placeholder="搜索命令…"
                className="h-8 text-xs"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredCommands.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  无匹配。
                </p>
              ) : (
                filteredCommands.map((command) => {
                  const used = picked.includes(command.id);
                  return (
                    <button
                      key={command.id}
                      type="button"
                      disabled={used}
                      onClick={() => { setPicked([...picked, command.id]); }}
                      className={cn(
                        "block w-full truncate rounded px-2 py-1 text-left text-xs transition-colors",
                        used
                          ? "cursor-not-allowed text-muted-foreground"
                          : "hover:bg-muted",
                      )}
                    >
                      {command.name}
                      {used && <span className="ml-1 text-[10px]">（已加入）</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-md border border-border">
            <div className="border-b border-border bg-card/40 px-2 py-1 text-xs font-medium">
              组内命令 · {String(picked.length)}
            </div>
            <div className="max-h-[19.25rem] overflow-y-auto p-1">
              {picked.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  从左侧选择命令加入。
                </p>
              ) : (
                picked.map((id, index) => {
                  const command = commandById.get(id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1 rounded px-1 py-1 text-xs hover:bg-muted"
                    >
                      <span className="flex-1 truncate">
                        {command?.name ?? `（已删除）${id.slice(0, 6)}`}
                      </span>
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => { move(index, -1); }}
                        disabled={index === 0}
                        title="上移"
                      >
                        <ArrowUp className="size-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => { move(index, 1); }}
                        disabled={index === picked.length - 1}
                        title="下移"
                      >
                        <ArrowDown className="size-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        onClick={() => {
                          setPicked(picked.filter((_, i) => i !== index));
                        }}
                        title="移除"
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ModeOption({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border hover:border-foreground/40",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}
