import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../../../shared/lib/utils";
import { Button } from "../../../../shared/ui/button";
import { Input } from "../../../../shared/ui/input";
import type {
  CommandFolderVM,
  LivenessVM,
  SavedCommandVM,
  UiPrefs,
} from "../state/types";

import { EmptyState } from "./EmptyState";

interface CommandLibraryPanelProps {
  folders: CommandFolderVM[];
  commands: SavedCommandVM[];
  liveness: Partial<Record<string, LivenessVM>>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  expanded: Record<string, boolean | undefined>;
  onToggleFolder: (id: string) => void;
  onNewCommand: (folderId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onEditCommand: (command: SavedCommandVM) => void;
  onDeleteCommand: (command: SavedCommandVM) => void;
  onRunInNewSession: (command: SavedCommandVM) => void;
  onRunInActiveSession: (command: SavedCommandVM) => void;
  onShowProcess: (liveness: LivenessVM) => void;
  onMoveCommand: (commandId: string, folderId: string | null) => void;
  onRenameFolder: (folder: CommandFolderVM) => void;
  onDeleteFolder: (folder: CommandFolderVM) => void;
  canRunInActiveSession: boolean;
  prefs: UiPrefs;
}

interface TreeNode {
  folder: CommandFolderVM | null; // null = root
  children: TreeNode[];
  commands: SavedCommandVM[];
}

function buildTree(
  folders: CommandFolderVM[],
  commands: SavedCommandVM[],
): TreeNode {
  const byParent = new Map<string | null, CommandFolderVM[]>();
  for (const folder of folders) {
    const parent = folder.parentId ?? null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    const bucket = byParent.get(parent);
    if (bucket) bucket.push(folder);
  }
  for (const [, list] of byParent) {
    list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }

  const commandsByFolder = new Map<string | null, SavedCommandVM[]>();
  for (const command of commands) {
    const folderId = command.folderId ?? null;
    if (!commandsByFolder.has(folderId)) commandsByFolder.set(folderId, []);
    const bucket = commandsByFolder.get(folderId);
    if (bucket) bucket.push(command);
  }
  for (const [, list] of commandsByFolder) {
    list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }

  const build = (folder: CommandFolderVM | null): TreeNode => {
    const childFolders = byParent.get(folder?.id ?? null) ?? [];
    return {
      folder,
      children: childFolders.map((child) => build(child)),
      commands: commandsByFolder.get(folder?.id ?? null) ?? [],
    };
  };

  return build(null);
}

function commandMatches(command: SavedCommandVM, needle: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  return (
    command.name.toLowerCase().includes(n) ||
    command.command.toLowerCase().includes(n) ||
    (command.note?.toLowerCase().includes(n) ?? false) ||
    command.tags.some((tag) => tag.toLowerCase().includes(n))
  );
}

function folderPath(
  folders: CommandFolderVM[],
  folderId: string | null,
): string {
  if (!folderId) return "/";
  const map = new Map(folders.map((f) => [f.id, f]));
  const segments: string[] = [];
  let cursor: string | null = folderId;
  while (cursor) {
    const folder = map.get(cursor);
    if (!folder) break;
    segments.unshift(folder.name);
    cursor = folder.parentId;
  }
  return "/" + segments.join("/");
}

export function CommandLibraryPanel(props: CommandLibraryPanelProps) {
  const {
    folders,
    commands,
    liveness,
    searchQuery,
    onSearchChange,
    expanded,
    onToggleFolder,
    onNewCommand,
    onNewFolder,
    onEditCommand,
    onDeleteCommand,
    onRunInNewSession,
    onRunInActiveSession,
    onShowProcess,
    onMoveCommand,
    onRenameFolder,
    onDeleteFolder,
    canRunInActiveSession,
    prefs,
  } = props;

  const tree = useMemo(() => buildTree(folders, commands), [folders, commands]);
  const matchingCommands = useMemo(
    () => commands.filter((c) => commandMatches(c, searchQuery)),
    [commands, searchQuery],
  );
  const searchActive = searchQuery.trim().length > 0;

  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
          // don't steal from the search box itself
        }
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(event) => { onSearchChange(event.target.value); }}
            placeholder="搜索 (Ctrl+K) · 名称/命令/标签/备注"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => { onNewCommand(null); }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            新命令
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => { onNewFolder(null); }}
          >
            <FolderPlus className="size-3.5" aria-hidden="true" />
            新文件夹
          </Button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-1"
        onDragOver={(event) => { event.preventDefault(); }}
        onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData("application/x-command-id");
          if (id) onMoveCommand(id, null);
        }}
      >
        {commands.length === 0 && folders.length === 0 ? (
          <EmptyState
            icon={Folder}
            title="命令库为空"
            description="保存常用命令到此，可按需在新会话或当前会话运行。"
          />
        ) : searchActive ? (
          <SearchResults
            results={matchingCommands}
            folders={folders}
            liveness={liveness}
            prefs={prefs}
            canRunInActiveSession={canRunInActiveSession}
            onEditCommand={onEditCommand}
            onDeleteCommand={onDeleteCommand}
            onRunInNewSession={onRunInNewSession}
            onRunInActiveSession={onRunInActiveSession}
            onShowProcess={onShowProcess}
          />
        ) : (
          <TreeView
            node={tree}
            depth={0}
            expanded={expanded}
            liveness={liveness}
            prefs={prefs}
            canRunInActiveSession={canRunInActiveSession}
            onToggleFolder={onToggleFolder}
            onNewCommand={onNewCommand}
            onNewFolder={onNewFolder}
            onEditCommand={onEditCommand}
            onDeleteCommand={onDeleteCommand}
            onRunInNewSession={onRunInNewSession}
            onRunInActiveSession={onRunInActiveSession}
            onShowProcess={onShowProcess}
            onMoveCommand={onMoveCommand}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
          />
        )}
      </div>
    </div>
  );
}

interface TreeViewProps {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean | undefined>;
  liveness: Partial<Record<string, LivenessVM>>;
  prefs: UiPrefs;
  canRunInActiveSession: boolean;
  onToggleFolder: (id: string) => void;
  onNewCommand: (folderId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onEditCommand: (command: SavedCommandVM) => void;
  onDeleteCommand: (command: SavedCommandVM) => void;
  onRunInNewSession: (command: SavedCommandVM) => void;
  onRunInActiveSession: (command: SavedCommandVM) => void;
  onShowProcess: (liveness: LivenessVM) => void;
  onMoveCommand: (commandId: string, folderId: string | null) => void;
  onRenameFolder: (folder: CommandFolderVM) => void;
  onDeleteFolder: (folder: CommandFolderVM) => void;
}

function TreeView(props: TreeViewProps) {
  const { node, depth } = props;
  const folder = node.folder;

  if (!folder) {
    // root: render children + root commands
    return (
      <>
        {node.children.map((child) => (
          <TreeView key={child.folder?.id ?? "_root"} {...props} node={child} depth={depth} />
        ))}
        {node.commands.map((command) => (
          <CommandRow
            key={command.id}
            command={command}
            depth={depth}
            liveness={props.liveness[command.id]}
            canRunInActiveSession={props.canRunInActiveSession}
            onEdit={props.onEditCommand}
            onDelete={props.onDeleteCommand}
            onRunInNew={props.onRunInNewSession}
            onRunInActive={props.onRunInActiveSession}
            onShowProcess={props.onShowProcess}
            onMoveTo={props.onMoveCommand}
          />
        ))}
      </>
    );
  }

  const isOpen = props.expanded[folder.id] ?? true;
  const total = countDescendantCommands(node);

  const onDragOverFolder = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("application/x-command-id")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  };
  const onDropFolder = (event: DragEvent<HTMLDivElement>) => {
    const id = event.dataTransfer.getData("application/x-command-id");
    if (!id) return;
    event.preventDefault();
    props.onMoveCommand(id, folder.id);
  };

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded-md py-1 pr-1 text-sm transition-colors hover:bg-muted/60"
        style={{ paddingLeft: `${String(4 + depth * 12)}px` }}
        onDragOver={onDragOverFolder}
        onDrop={onDropFolder}
      >
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => { props.onToggleFolder(folder.id); }}
          aria-label={isOpen ? "折叠文件夹" : "展开文件夹"}
        >
          {isOpen ? (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 truncate text-left"
          onClick={() => { props.onToggleFolder(folder.id); }}
          onDoubleClick={() => { props.onRenameFolder(folder); }}
        >
          {isOpen ? (
            <FolderOpen className="size-3.5 text-amber-500" aria-hidden="true" />
          ) : (
            <Folder className="size-3.5 text-amber-500" aria-hidden="true" />
          )}
          <span className="truncate">{folder.name}</span>
          <span className="ml-1 text-[10px] text-muted-foreground">{total}</span>
        </button>
        <FolderMenu
          onAddCommand={() => { props.onNewCommand(folder.id); }}
          onAddSubFolder={() => { props.onNewFolder(folder.id); }}
          onRename={() => { props.onRenameFolder(folder); }}
          onDelete={() => { props.onDeleteFolder(folder); }}
        />
      </div>
      {isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeView key={child.folder?.id ?? "_root"} {...props} node={child} depth={depth + 1} />
          ))}
          {node.commands.map((command) => (
            <CommandRow
              key={command.id}
              command={command}
              depth={depth + 1}
              liveness={props.liveness[command.id]}
              canRunInActiveSession={props.canRunInActiveSession}
              onEdit={props.onEditCommand}
              onDelete={props.onDeleteCommand}
              onRunInNew={props.onRunInNewSession}
              onRunInActive={props.onRunInActiveSession}
              onShowProcess={props.onShowProcess}
              onMoveTo={props.onMoveCommand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function countDescendantCommands(node: TreeNode): number {
  return (
    node.commands.length +
    node.children.reduce((sum, child) => sum + countDescendantCommands(child), 0)
  );
}

interface SearchResultsProps {
  results: SavedCommandVM[];
  folders: CommandFolderVM[];
  liveness: Partial<Record<string, LivenessVM>>;
  prefs: UiPrefs;
  canRunInActiveSession: boolean;
  onEditCommand: (command: SavedCommandVM) => void;
  onDeleteCommand: (command: SavedCommandVM) => void;
  onRunInNewSession: (command: SavedCommandVM) => void;
  onRunInActiveSession: (command: SavedCommandVM) => void;
  onShowProcess: (liveness: LivenessVM) => void;
}

function SearchResults({
  results,
  folders,
  liveness,
  canRunInActiveSession,
  onEditCommand,
  onDeleteCommand,
  onRunInNewSession,
  onRunInActiveSession,
  onShowProcess,
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        没有匹配的命令。
      </p>
    );
  }
  return (
    <div>
      {results.map((command) => (
        <CommandRow
          key={command.id}
          command={command}
          depth={0}
          path={folderPath(folders, command.folderId)}
          liveness={liveness[command.id]}
          canRunInActiveSession={canRunInActiveSession}
          onEdit={onEditCommand}
          onDelete={onDeleteCommand}
          onRunInNew={onRunInNewSession}
          onRunInActive={onRunInActiveSession}
          onShowProcess={onShowProcess}
          onMoveTo={() => { /* drag move not used in search view */ }}
        />
      ))}
    </div>
  );
}

interface CommandRowProps {
  command: SavedCommandVM;
  depth: number;
  path?: string;
  liveness: LivenessVM | undefined;
  canRunInActiveSession: boolean;
  onEdit: (command: SavedCommandVM) => void;
  onDelete: (command: SavedCommandVM) => void;
  onRunInNew: (command: SavedCommandVM) => void;
  onRunInActive: (command: SavedCommandVM) => void;
  onShowProcess: (liveness: LivenessVM) => void;
  onMoveTo: (commandId: string, folderId: string | null) => void;
}

function CommandRow({
  command,
  depth,
  path,
  liveness,
  canRunInActiveSession,
  onEdit,
  onDelete,
  onRunInNew,
  onRunInActive,
  onShowProcess,
}: CommandRowProps) {
  const [hover, setHover] = useState(false);

  const live = liveness?.alive ?? false;

  return (
    <div
      className="group flex items-center gap-1 rounded-md py-1 pr-1 text-sm transition-colors hover:bg-muted/60"
      style={{ paddingLeft: `${String(20 + depth * 12)}px` }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-command-id", command.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onMouseEnter={() => { setHover(true); }}
      onMouseLeave={() => { setHover(false); }}
    >
      <button
        type="button"
        className="relative flex flex-1 items-start gap-1.5 text-left"
        onDoubleClick={() => { onEdit(command); }}
        onClick={() => { onRunInNew(command); }}
        title={live ? `进程仍在运行 (PID ${liveness?.pid != null ? String(liveness.pid) : "?"})` : "点击在新会话运行 · 双击编辑"}
      >
        <span
          className={cn(
            "mt-1 size-2 shrink-0 rounded-full",
            live ? "bg-emerald-500 ring-2 ring-emerald-500/30" : "bg-muted-foreground/40",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{command.name}</span>
            {command.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-muted px-1 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {command.command}
          </p>
          {path && (
            <p className="truncate text-[10px] text-muted-foreground">{path}</p>
          )}
        </div>
      </button>
      <div className={cn("flex shrink-0 items-center gap-0.5", hover ? "opacity-100" : "opacity-0", "transition-opacity")}>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-600"
          onClick={(event) => {
            event.stopPropagation();
            onRunInNew(command);
          }}
          title="在新会话运行"
        >
          <Play className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-sky-500/15 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={(event) => {
            event.stopPropagation();
            onRunInActive(command);
          }}
          disabled={!canRunInActiveSession}
          title={canRunInActiveSession ? "注入到当前会话" : "无活动会话"}
        >
          <Send className="size-3.5" aria-hidden="true" />
        </button>
        <CommandMenu
          onEdit={() => { onEdit(command); }}
          onDelete={() => { onDelete(command); }}
          onShowProcess={liveness && live ? () => { onShowProcess(liveness); } : undefined}
        />
      </div>
    </div>
  );
}

interface CommandMenuProps {
  onEdit: () => void;
  onDelete: () => void;
  onShowProcess?: () => void;
}

function CommandMenu({ onEdit, onDelete, onShowProcess }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDoc);
    return () => { window.removeEventListener("mousedown", onDoc); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label="更多"
      >
        <MoreVertical className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-30 w-44 rounded-md border border-border bg-card py-1 text-xs shadow-lg">
          <MenuItem icon={Pencil} label="编辑" onClick={() => { setOpen(false); onEdit(); }} />
          {onShowProcess && (
            <MenuItem
              icon={Search}
              label="查看进程"
              onClick={() => { setOpen(false); onShowProcess(); }}
            />
          )}
          <MenuItem
            icon={Trash2}
            label="删除"
            destructive
            onClick={() => { setOpen(false); onDelete(); }}
          />
        </div>
      )}
    </div>
  );
}

interface FolderMenuProps {
  onAddCommand: () => void;
  onAddSubFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function FolderMenu({
  onAddCommand,
  onAddSubFolder,
  onRename,
  onDelete,
}: FolderMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDoc);
    return () => { window.removeEventListener("mousedown", onDoc); };
  }, [open]);
  return (
    <div className="relative opacity-0 transition-opacity group-hover:opacity-100" ref={ref}>
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label="文件夹菜单"
      >
        <MoreVertical className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-30 w-44 rounded-md border border-border bg-card py-1 text-xs shadow-lg">
          <MenuItem icon={Plus} label="新增命令" onClick={() => { setOpen(false); onAddCommand(); }} />
          <MenuItem icon={FolderPlus} label="新增子文件夹" onClick={() => { setOpen(false); onAddSubFolder(); }} />
          <MenuItem icon={Pencil} label="重命名" onClick={() => { setOpen(false); onRename(); }} />
          <MenuItem icon={Trash2} label="删除" destructive onClick={() => { setOpen(false); onDelete(); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-foreground transition-colors hover:bg-muted",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
