import { useState } from "react";

import { Button } from "../../../../shared/ui/button";
import { Input } from "../../../../shared/ui/input";
import type { CommandFolderVM, SavedCommandVM } from "../state/types";

import { Modal } from "./Modal";

interface EditCommandDialogProps {
  initial: SavedCommandVM | null;
  folders: CommandFolderVM[];
  defaultFolderId: string | null;
  onCancel: () => void;
  onConfirm: (data: SavedCommandVM) => void;
}

function newDraft(folderId: string | null): SavedCommandVM {
  return {
    id: "",
    name: "",
    command: "",
    cwd: null,
    note: null,
    tags: [],
    shellPath: null,
    stopTimeoutMs: 3000,
    folderId,
    loadProfile: null,
  };
}

export function EditCommandDialog({
  initial,
  folders,
  defaultFolderId,
  onCancel,
  onConfirm,
}: EditCommandDialogProps) {
  const [draft, setDraft] = useState<SavedCommandVM>(
    () => initial ?? newDraft(defaultFolderId),
  );
  const [tagsInput, setTagsInput] = useState(draft.tags.join(", "));

  const valid = draft.name.trim().length > 0 && draft.command.trim().length > 0;

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? "编辑命令" : "保存命令"}
      description="命令保存到命令库后，可在新会话运行，也可注入到当前会话。"
      size="lg"
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => {
              const tags = tagsInput
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean);
              onConfirm({
                ...draft,
                name: draft.name.trim(),
                command: draft.command.trim(),
                cwd: emptyToNull(draft.cwd),
                note: emptyToNull(draft.note),
                shellPath: emptyToNull(draft.shellPath),
                tags,
              });
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称 *">
            <Input
              value={draft.name}
              onChange={(event) => { setDraft({ ...draft, name: event.target.value }); }}
            />
          </Field>
          <Field label="文件夹">
            <select
              value={draft.folderId ?? ""}
              onChange={(event) =>
                { setDraft({ ...draft, folderId: event.target.value || null }); }
              }
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm"
            >
              <option value="">/（根目录）</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folderDisplay(folder, folders)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="命令 *" hint="支持多行；运行时整段写入 PowerShell。">
          <textarea
            value={draft.command}
            onChange={(event) => { setDraft({ ...draft, command: event.target.value }); }}
            rows={6}
            spellCheck={false}
            className="min-h-32 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs text-foreground shadow-sm focus:border-ring"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="工作目录 (可选)">
            <Input
              value={draft.cwd ?? ""}
              onChange={(event) => { setDraft({ ...draft, cwd: event.target.value }); }}
            />
          </Field>
          <Field label="Shell 路径 (可选)">
            <Input
              value={draft.shellPath ?? ""}
              placeholder="留空使用默认"
              onChange={(event) => { setDraft({ ...draft, shellPath: event.target.value }); }}
            />
          </Field>
        </div>
        <Field label="标签 (逗号分隔)">
          <Input
            value={tagsInput}
            onChange={(event) => { setTagsInput(event.target.value); }}
            placeholder="dev, web, build"
          />
        </Field>
        <Field label="备注 (可选)">
          <textarea
            value={draft.note ?? ""}
            onChange={(event) => { setDraft({ ...draft, note: event.target.value }); }}
            rows={2}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground shadow-sm focus:border-ring"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="停止超时 (ms)"
            hint="Ctrl+C 后等待多少毫秒再 kill。"
          >
            <Input
              type="number"
              min={500}
              step={500}
              value={draft.stopTimeoutMs}
              onChange={(event) =>
                { setDraft({ ...draft, stopTimeoutMs: Number(event.target.value) || 3000 }); }
              }
            />
          </Field>
          <Field label="加载 $PROFILE">
            <select
              value={draft.loadProfile == null ? "default" : draft.loadProfile ? "true" : "false"}
              onChange={(event) => {
                const value = event.target.value;
                setDraft({
                  ...draft,
                  loadProfile:
                    value === "true" ? true : value === "false" ? false : null,
                });
              }}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm"
            >
              <option value="default">跟随默认</option>
              <option value="true">加载</option>
              <option value="false">不加载</option>
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function folderDisplay(folder: CommandFolderVM, all: CommandFolderVM[]): string {
  const map = new Map(all.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cursor: string | null = folder.id;
  while (cursor) {
    const current = map.get(cursor);
    if (!current) break;
    parts.unshift(current.name);
    cursor = current.parentId;
  }
  return "/" + parts.join("/");
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
