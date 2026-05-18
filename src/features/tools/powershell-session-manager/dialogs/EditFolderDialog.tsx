import { useState } from "react";

import { Button } from "../../../../shared/ui/button";
import { Input } from "../../../../shared/ui/input";
import type { CommandFolderVM } from "../state/types";

import { Modal } from "./Modal";

interface EditFolderDialogProps {
  initial: CommandFolderVM | null;
  folders: CommandFolderVM[];
  defaultParentId: string | null;
  onCancel: () => void;
  onConfirm: (data: { id?: string; name: string; parentId: string | null }) => void;
}

function descendantIds(
  folders: CommandFolderVM[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string | null, CommandFolderVM[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    const bucket = childrenByParent.get(key);
    if (bucket) bucket.push(folder);
  }
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id == null) break;
    for (const child of childrenByParent.get(id) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return result;
}

export function EditFolderDialog({
  initial,
  folders,
  defaultParentId,
  onCancel,
  onConfirm,
}: EditFolderDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [parentId, setParentId] = useState<string | null>(
    initial?.parentId ?? defaultParentId,
  );

  // When editing, exclude self + descendants from parent options to avoid cycles.
  const excluded = initial ? descendantIds(folders, initial.id) : new Set<string>();

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? "重命名文件夹" : "新建文件夹"}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={() => {
              onConfirm({
                id: initial?.id,
                name: name.trim(),
                parentId,
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
          <span className="text-xs font-medium text-foreground">名称 *</span>
          <Input
            value={name}
            autoFocus
            onChange={(event) => { setName(event.target.value); }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">父文件夹</span>
          <select
            value={parentId ?? ""}
            onChange={(event) => { setParentId(event.target.value || null); }}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm"
          >
            <option value="">/（根目录）</option>
            {folders
              .filter((folder) => !excluded.has(folder.id))
              .map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folderDisplay(folder, folders)}
                </option>
              ))}
          </select>
        </label>
      </div>
    </Modal>
  );
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
