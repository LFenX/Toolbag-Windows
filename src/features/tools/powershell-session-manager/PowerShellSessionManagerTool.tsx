import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePowerShellActivityStore } from "./activity-store";
import { useManagerProtocol } from "./hooks/useManagerProtocol";
import { CommandLibraryPanel } from "./panels/CommandLibraryPanel";
import { GroupLibraryPanel } from "./panels/GroupLibraryPanel";
import { SessionListPanel } from "./panels/SessionListPanel";
import { TerminalPane } from "./panels/TerminalPane";
import { SessionTabBar } from "./shell/SessionTabBar";
import { SidebarTabs } from "./shell/SidebarTabs";
import { StatusBar } from "./shell/StatusBar";
import { Toolbar } from "./shell/Toolbar";
import { BroadcastDialog } from "./dialogs/BroadcastDialog";
import { ConfirmDialog } from "./dialogs/ConfirmDialog";
import { EditCommandDialog } from "./dialogs/EditCommandDialog";
import { EditFolderDialog } from "./dialogs/EditFolderDialog";
import { EditGroupDialog } from "./dialogs/EditGroupDialog";
import { NewSessionDialog } from "./dialogs/NewSessionDialog";
import { ProcessProbeDialog } from "./dialogs/ProcessProbeDialog";
import { SettingsDialog } from "./dialogs/SettingsDialog";
import {
  selectActiveSession,
  selectLivingCount,
  selectRunningSessionCount,
  usePowerShellManagerStore,
} from "./state/store";
import type {
  CommandFolderVM,
  CommandGroupVM,
  LivenessVM,
  SavedCommandVM,
  SidebarView,
} from "./state/types";

interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

export function PowerShellSessionManagerTool() {
  const protocol = useManagerProtocol();
  const store = usePowerShellManagerStore;

  // ---- subscribe to slices ----
  const booted = usePowerShellManagerStore((s) => s.booted);
  const sidecarExited = usePowerShellManagerStore((s) => s.sidecarExited);
  const shell = usePowerShellManagerStore((s) => s.shell);
  const sessions = usePowerShellManagerStore((s) => s.sessions);
  const folders = usePowerShellManagerStore((s) => s.folders);
  const commands = usePowerShellManagerStore((s) => s.commands);
  const groups = usePowerShellManagerStore((s) => s.groups);
  const liveness = usePowerShellManagerStore((s) => s.liveness);
  const activeSession = usePowerShellManagerStore(selectActiveSession);
  const runningCount = usePowerShellManagerStore(selectRunningSessionCount);
  const livingProcesses = usePowerShellManagerStore(selectLivingCount);
  const searchQuery = usePowerShellManagerStore((s) => s.searchQuery);
  const prefs = usePowerShellManagerStore((s) => s.prefs);
  const setActiveSession = usePowerShellManagerStore((s) => s.setActiveSession);
  const setSearchQuery = usePowerShellManagerStore((s) => s.setSearchQuery);
  const updatePrefs = usePowerShellManagerStore((s) => s.updatePrefs);
  const resetStore = usePowerShellManagerStore((s) => s.reset);

  const setActiveSessionCount = usePowerShellActivityStore(
    (s) => s.setActiveSessionCount,
  );
  const setLivingProcessesCount = usePowerShellActivityStore(
    (s) => s.setLivingProcessesCount,
  );

  useEffect(() => {
    setActiveSessionCount(runningCount);
    return () => { setActiveSessionCount(0); };
  }, [runningCount, setActiveSessionCount]);
  useEffect(() => {
    setLivingProcessesCount(livingProcesses);
  }, [livingProcesses, setLivingProcessesCount]);

  // ---- sidebar view ----
  const [sidebarView, setSidebarView] = useState<SidebarView>(prefs.sidebarView);
  useEffect(() => { updatePrefs({ sidebarView }); }, [sidebarView, updatePrefs]);

  // ---- sidebar resize ----
  const [sidebarWidth, setSidebarWidth] = useState(prefs.sidebarWidth);
  const resizingRef = useRef(false);
  useEffect(() => { updatePrefs({ sidebarWidth }); }, [sidebarWidth, updatePrefs]);
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(480, Math.max(200, event.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => { resizingRef.current = false; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ---- dialogs ----
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<{
    initial: SavedCommandVM | null;
    defaultFolderId: string | null;
  } | null>(null);
  const [editingFolder, setEditingFolder] = useState<{
    initial: CommandFolderVM | null;
    defaultParentId: string | null;
  } | null>(null);
  const [editingGroup, setEditingGroup] = useState<{
    initial: CommandGroupVM | null;
  } | null>(null);
  const [probePid, setProbePid] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // ---- handlers ----
  const handleNewSession = useCallback(() => { setNewSessionOpen(true); }, []);
  const handleConfirmNewSession = useCallback(
    async (data: {
      name: string;
      cwd: string | null;
      command: string | null;
      shellPath: string | null;
      loadProfile: boolean;
    }) => {
      setNewSessionOpen(false);
      try {
        await protocol.createSession(data);
      } catch (err) {
        console.error(err);
      }
    },
    [protocol],
  );

  const handleStopAll = useCallback(() => {
    setConfirm({
      title: "停止全部会话",
      message: `将停止 ${String(runningCount)} 个运行中的会话，未保存的工作会丢失。`,
      destructive: true,
      onConfirm: async () => {
        const running = store.getState().sessions.filter((s) => s.status === "running");
        await Promise.all(running.map((s) => protocol.killSession(s.id)));
        setConfirm(null);
      },
    });
  }, [protocol, runningCount, store]);

  const handleRestartAll = useCallback(() => {
    const running = store.getState().sessions.filter((s) => s.status === "running");
    void Promise.all(running.map((s) => protocol.restartSession(s.id)));
  }, [protocol, store]);

  const handleStopSession = useCallback(
    (id: string) => { void protocol.killSession(id); },
    [protocol],
  );
  const handleRestartSession = useCallback(
    (id: string) => { void protocol.restartSession(id); },
    [protocol],
  );
  const handleRenameSession = useCallback(
    (id: string, name: string) => { void protocol.renameSession(id, name); },
    [protocol],
  );

  const handleSaveCommand = useCallback(
    async (data: SavedCommandVM) => {
      try {
        await protocol.saveCommand(data);
        setEditingCommand(null);
      } catch (err) {
        console.error(err);
      }
    },
    [protocol],
  );

  const handleDeleteCommand = useCallback(
    (command: SavedCommandVM) => {
      setConfirm({
        title: "删除命令",
        message: `确认删除 "${command.name}" 吗？此操作不可撤销。`,
        destructive: true,
        onConfirm: async () => {
          await protocol.deleteCommand(command.id);
          setConfirm(null);
        },
      });
    },
    [protocol],
  );

  const handleSaveFolder = useCallback(
    async (data: { id?: string; name: string; parentId: string | null }) => {
      try {
        await protocol.saveFolder(data);
        setEditingFolder(null);
      } catch (err) {
        console.error(err);
      }
    },
    [protocol],
  );

  const handleDeleteFolder = useCallback(
    (folder: CommandFolderVM) => {
      const count = commands.filter((c) => c.folderId === folder.id).length;
      setConfirm({
        title: "删除文件夹",
        message:
          count > 0
            ? `文件夹 "${folder.name}" 内有 ${String(count)} 条命令。删除时这些命令将移到根目录（不会被删除）。`
            : `确认删除空文件夹 "${folder.name}" 吗？`,
        onConfirm: async () => {
          await protocol.deleteFolder(folder.id, false);
          setConfirm(null);
        },
      });
    },
    [commands, protocol],
  );

  const handleSaveGroup = useCallback(
    async (data: {
      id?: string;
      name: string;
      commandIds: string[];
      mode: "parallel" | "sequential";
    }) => {
      try {
        await protocol.saveGroup(data);
        setEditingGroup(null);
      } catch (err) {
        console.error(err);
      }
    },
    [protocol],
  );

  const handleDeleteGroup = useCallback(
    (group: CommandGroupVM) => {
      setConfirm({
        title: "删除任务组",
        message: `确认删除 "${group.name}" 吗？组内命令本身不会被删除。`,
        destructive: true,
        onConfirm: async () => {
          await protocol.deleteGroup(group.id);
          setConfirm(null);
        },
      });
    },
    [protocol],
  );

  const handleRunGroup = useCallback(
    async (group: CommandGroupVM) => {
      try {
        await protocol.runGroup(group.id);
      } catch (err) {
        console.error(err);
      }
    },
    [protocol],
  );

  const handleRunCommand = useCallback(
    async (command: SavedCommandVM) => {
      try {
        await protocol.runCommand(command.id);
      } catch (err) {
        console.error(err);
      }
    },
    [protocol],
  );
  const handleRunCommandInActive = useCallback(
    async (command: SavedCommandVM) => {
      if (!activeSession) return;
      try {
        await protocol.runCommandInSession(command.id, activeSession.id);
      } catch (err) {
        console.error(err);
      }
    },
    [protocol, activeSession],
  );

  const handleSendInput = useCallback(
    (sessionId: string, data: string) => {
      void protocol.sendFrame({ type: "terminal.input", sessionId, data });
    },
    [protocol],
  );
  const handleResize = useCallback(
    (sessionId: string, cols: number, rows: number) => {
      void protocol.sendFrame({ type: "terminal.resize", sessionId, cols, rows });
    },
    [protocol],
  );

  const handleBroadcastInput = useCallback(
    async (text: string) => {
      await protocol.broadcastInput(text);
    },
    [protocol],
  );

  const expanded = prefs.expandedFolders;
  const toggleFolderExpanded = useCallback(
    (id: string) => {
      const current = expanded[id];
      const isOpen = current ?? true;
      updatePrefs({
        expandedFolders: { ...expanded, [id]: !isOpen },
      });
    },
    [expanded, updatePrefs],
  );

  const handleRebootSidecar = useCallback(() => {
    resetStore();
    // The hook will call manager.boot again on next mount; for an in-place
    // reboot we just send the request — the sidecar respawns lazily on demand.
    void protocol.sendFrame({ type: "request", id: "reboot", command: "manager.boot", params: {} });
  }, [protocol, resetStore]);

  // ---- session context menu ----
  useEffect(() => {
    if (!contextMenu) return;
    const onClick = () => { setContextMenu(null); };
    window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("mousedown", onClick); };
  }, [contextMenu]);

  const activeSessionId = activeSession?.id ?? null;
  const sidebarCommandCount = commands.length;
  const sidebarGroupCount = groups.length;

  const probeForCommand = useMemo<LivenessVM | null>(() => {
    if (probePid == null) return null;
    for (const entry of Object.values(liveness)) {
      if (entry?.pid === probePid && entry.alive) return entry;
    }
    return null;
  }, [liveness, probePid]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <Toolbar
        runningCount={runningCount}
        livingProcesses={livingProcesses}
        sidecarExited={sidecarExited}
        onNewSession={handleNewSession}
        onStopAll={handleStopAll}
        onRestartAll={handleRestartAll}
        onBroadcast={() => { setBroadcastOpen(true); }}
        onOpenSettings={() => { setSettingsOpen(true); }}
        onRebootSidecar={handleRebootSidecar}
      />

      <div className="flex min-h-0 flex-1">
        <aside
          className="flex min-h-0 shrink-0 flex-col border-r border-border bg-card/40"
          style={{ width: `${String(sidebarWidth)}px` }}
        >
          <SidebarTabs
            value={sidebarView}
            onChange={setSidebarView}
            sessionCount={sessions.length}
            commandCount={sidebarCommandCount}
            groupCount={sidebarGroupCount}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {sidebarView === "sessions" && (
              <SessionListPanel
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelect={setActiveSession}
                onNewSession={handleNewSession}
                onRestart={handleRestartSession}
                onStop={handleStopSession}
              />
            )}
            {sidebarView === "library" && (
              <CommandLibraryPanel
                folders={folders}
                commands={commands}
                liveness={liveness}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                expanded={expanded}
                onToggleFolder={toggleFolderExpanded}
                onNewCommand={(folderId) =>
                  { setEditingCommand({ initial: null, defaultFolderId: folderId }); }
                }
                onNewFolder={(parentId) =>
                  { setEditingFolder({ initial: null, defaultParentId: parentId }); }
                }
                onEditCommand={(command) =>
                  { setEditingCommand({ initial: command, defaultFolderId: command.folderId }); }
                }
                onDeleteCommand={handleDeleteCommand}
                onRunInNewSession={(command) => { void handleRunCommand(command); }}
                onRunInActiveSession={(command) => { void handleRunCommandInActive(command); }}
                onShowProcess={(entry) => { setProbePid(entry.pid); }}
                onMoveCommand={(commandId, folderId) =>
                  { void protocol.moveCommand(commandId, folderId); }
                }
                onRenameFolder={(folder) =>
                  { setEditingFolder({ initial: folder, defaultParentId: folder.parentId }); }
                }
                onDeleteFolder={handleDeleteFolder}
                canRunInActiveSession={activeSession?.status === "running"}
                prefs={prefs}
              />
            )}
            {sidebarView === "groups" && (
              <GroupLibraryPanel
                groups={groups}
                commands={commands}
                onNewGroup={() => { setEditingGroup({ initial: null }); }}
                onEditGroup={(group) => { setEditingGroup({ initial: group }); }}
                onDeleteGroup={handleDeleteGroup}
                onRunGroup={(group) => { void handleRunGroup(group); }}
              />
            )}
          </div>
        </aside>
        <div
          className="w-1 cursor-col-resize bg-border/40 transition-colors hover:bg-primary/40"
          onMouseDown={() => {
            resizingRef.current = true;
            document.body.style.cursor = "col-resize";
          }}
          aria-hidden="true"
        />
        <main className="flex min-h-0 flex-1 flex-col">
          <SessionTabBar
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={setActiveSession}
            onClose={handleStopSession}
            onNew={handleNewSession}
            onContextMenu={(sessionId, anchor) =>
              { setContextMenu({ sessionId, x: anchor.x, y: anchor.y }); }
            }
            onRename={handleRenameSession}
          />
          <div className="min-h-0 flex-1">
            <TerminalPane
              session={activeSession}
              prefs={prefs}
              onSendInput={handleSendInput}
              onResize={handleResize}
              emptyContent={
                !booted ? "正在连接 PowerShell sidecar…" : "选择左侧会话或点击「+ 新会话」开始"
              }
            />
          </div>
          <StatusBar session={activeSession} shell={shell} />
        </main>
      </div>

      {contextMenu && (
        <SessionContextMenu
          state={contextMenu}
          onClose={() => { setContextMenu(null); }}
          onRestart={handleRestartSession}
          onStop={handleStopSession}
        />
      )}

      {newSessionOpen && (
        <NewSessionDialog
          prefs={prefs}
          onCancel={() => { setNewSessionOpen(false); }}
          onConfirm={(data) => { void handleConfirmNewSession(data); }}
        />
      )}
      {editingCommand && (
        <EditCommandDialog
          initial={editingCommand.initial}
          folders={folders}
          defaultFolderId={editingCommand.defaultFolderId}
          onCancel={() => { setEditingCommand(null); }}
          onConfirm={(data) => { void handleSaveCommand(data); }}
        />
      )}
      {editingFolder && (
        <EditFolderDialog
          initial={editingFolder.initial}
          folders={folders}
          defaultParentId={editingFolder.defaultParentId}
          onCancel={() => { setEditingFolder(null); }}
          onConfirm={(data) => { void handleSaveFolder(data); }}
        />
      )}
      {editingGroup && (
        <EditGroupDialog
          initial={editingGroup.initial}
          commands={commands}
          onCancel={() => { setEditingGroup(null); }}
          onConfirm={(data) => { void handleSaveGroup(data); }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          prefs={prefs}
          shell={shell}
          onChange={updatePrefs}
          onClose={() => { setSettingsOpen(false); }}
        />
      )}
      {broadcastOpen && (
        <BroadcastDialog
          runningCount={runningCount}
          onCancel={() => { setBroadcastOpen(false); }}
          onSend={handleBroadcastInput}
        />
      )}
      {probePid !== null && (
        <ProcessProbeDialog
          pid={probePid}
          describe={protocol.describeProcess}
          onKill={async (pid, recursive) => {
            await protocol.killProcess(pid, recursive);
          }}
          onClose={() => {
            setProbePid(null);
            void probeForCommand;
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          destructive={confirm.destructive}
          onCancel={() => { setConfirm(null); }}
          onConfirm={() => {
            void confirm.onConfirm();
          }}
        />
      )}
    </div>
  );
}

function SessionContextMenu({
  state,
  onClose,
  onRestart,
  onStop,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onRestart: (id: string) => void;
  onStop: (id: string) => void;
}) {
  return (
    <div
      className="fixed z-50 w-44 rounded-md border border-border bg-card py-1 text-xs shadow-xl"
      style={{ left: state.x, top: state.y }}
      onMouseDown={(event) => { event.stopPropagation(); }}
    >
      <button
        type="button"
        className="block w-full px-3 py-1.5 text-left hover:bg-muted"
        onClick={() => { onClose(); onRestart(state.sessionId); }}
      >
        重启
      </button>
      <button
        type="button"
        className="block w-full px-3 py-1.5 text-left text-destructive hover:bg-destructive/10"
        onClick={() => { onClose(); onStop(state.sessionId); }}
      >
        停止
      </button>
    </div>
  );
}
