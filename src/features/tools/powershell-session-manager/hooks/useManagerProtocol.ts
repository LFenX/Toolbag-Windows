import { useCallback, useEffect, useRef } from "react";

import {
  type PluginSidecarEvent,
  usePluginSession,
} from "../../runtime/usePluginSession";
import { POWERSHELL_SESSION_MANAGER_PLUGIN_ID } from "../activity-store";
import { usePowerShellManagerStore } from "../state/store";
import type {
  CommandFolderVM,
  CommandGroupVM,
  LivenessVM,
  ProcessInfoVM,
  SavedCommandVM,
  SessionVM,
  ShellInfo,
} from "../state/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function normalizeSession(value: unknown): SessionVM | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const status =
    value.status === "exited" || value.status === "failed" ? value.status : "running";
  return {
    id: value.id,
    name: asString(value.name, "PowerShell"),
    command: typeof value.command === "string" ? value.command : null,
    cwd: typeof value.cwd === "string" ? value.cwd : null,
    shellPath: asString(value.shellPath, "pwsh.exe"),
    shellVersion: typeof value.shellVersion === "string" ? value.shellVersion : null,
    status,
    exitCode: typeof value.exitCode === "number" ? value.exitCode : null,
    createdAt: asString(value.createdAt),
    startedAtMs: asNumber(value.startedAtMs),
    pid: asNumber(value.pid),
    loadProfile: asBool(value.loadProfile, true),
    commandId: typeof value.commandId === "string" ? value.commandId : null,
    recentOutput: asString(value.recentOutput),
  };
}

function normalizeFolder(value: unknown): CommandFolderVM | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    parentId: typeof value.parentId === "string" ? value.parentId : null,
  };
}

function normalizeCommand(value: unknown): SavedCommandVM | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.command !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    command: value.command,
    cwd: typeof value.cwd === "string" ? value.cwd : null,
    note: typeof value.note === "string" ? value.note : null,
    tags: asStringArray(value.tags),
    shellPath: typeof value.shellPath === "string" ? value.shellPath : null,
    stopTimeoutMs: asNumber(value.stopTimeoutMs, 3000),
    folderId: typeof value.folderId === "string" ? value.folderId : null,
    loadProfile: typeof value.loadProfile === "boolean" ? value.loadProfile : null,
  };
}

function normalizeGroup(value: unknown): CommandGroupVM | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    commandIds: asStringArray(value.commandIds),
    mode: value.mode === "parallel" ? "parallel" : "sequential",
  };
}

function normalizeLiveness(value: unknown): LivenessVM | null {
  if (!isRecord(value) || typeof value.commandId !== "string") return null;
  return {
    commandId: value.commandId,
    runId: asString(value.runId),
    pid: asNumber(value.pid),
    alive: asBool(value.alive),
    startedAt: asString(value.startedAt),
    startedAtMs: asNumber(value.startedAtMs),
  };
}

function normalizeShell(value: unknown): ShellInfo {
  if (!isRecord(value)) {
    return { detected: null, version: null, candidates: [], error: null };
  }
  return {
    detected: typeof value.detected === "string" ? value.detected : null,
    version: typeof value.version === "string" ? value.version : null,
    candidates: asStringArray(value.candidates),
    error: typeof value.error === "string" ? value.error : null,
  };
}

function normalizeProcessInfo(value: unknown): ProcessInfoVM | null {
  if (!isRecord(value) || typeof value.pid !== "number") return null;
  return {
    pid: value.pid,
    name: asString(value.name),
    cmd: asStringArray(value.cmd),
    parentPid: typeof value.parentPid === "number" ? value.parentPid : null,
    cpuUsage: asNumber(value.cpuUsage),
    memoryKb: asNumber(value.memoryKb),
    children: Array.isArray(value.children)
      ? value.children
          .map(normalizeProcessInfo)
          .filter((c): c is ProcessInfoVM => c !== null)
      : [],
  };
}

export interface NewSessionParams {
  name?: string;
  command?: string | null;
  cwd?: string | null;
  shellPath?: string | null;
  loadProfile?: boolean;
  cols?: number;
  rows?: number;
}

export function useManagerProtocol() {
  const store = usePowerShellManagerStore;
  const bootedRef = useRef(false);

  const handleEvent = useCallback((event: PluginSidecarEvent) => {
    const s = store.getState();
    switch (event.event) {
      case "manager.state": {
        if (!isRecord(event.data)) return;
        const data = event.data;
        const sessions =
          (Array.isArray(data.sessions) ? data.sessions : [])
            .map(normalizeSession)
            .filter((v): v is SessionVM => v !== null);
        const folders =
          (Array.isArray(data.folders) ? data.folders : [])
            .map(normalizeFolder)
            .filter((v): v is CommandFolderVM => v !== null);
        const commands =
          (Array.isArray(data.commands) ? data.commands : [])
            .map(normalizeCommand)
            .filter((v): v is SavedCommandVM => v !== null);
        const groups =
          (Array.isArray(data.groups) ? data.groups : [])
            .map(normalizeGroup)
            .filter((v): v is CommandGroupVM => v !== null);
        const liveness =
          (Array.isArray(data.liveness) ? data.liveness : [])
            .map(normalizeLiveness)
            .filter((v): v is LivenessVM => v !== null);
        s.setShell(normalizeShell(data.shell));
        s.setSessions(sessions);
        s.setFolders(folders);
        s.setCommands(commands);
        s.setGroups(groups);
        s.setLiveness(liveness);
        s.setSidecarExited(false);
        s.setBooted(true);
        break;
      }
      case "manager.sidecarExit": {
        s.setSidecarExited(true);
        s.setSessions(
          s.sessions.map((session) => ({
            ...session,
            status: "failed" as const,
          })),
        );
        break;
      }
      case "session.created":
      case "session.updated": {
        const session = normalizeSession(event.data);
        if (session) s.upsertSession(session);
        break;
      }
      case "session.removed": {
        if (!isRecord(event.data) || typeof event.data.sessionId !== "string") return;
        s.removeSession(event.data.sessionId);
        break;
      }
      case "session.exited": {
        if (!isRecord(event.data) || typeof event.data.sessionId !== "string") return;
        const exitCode =
          typeof event.data.exitCode === "number" ? event.data.exitCode : null;
        s.markSessionExited(event.data.sessionId, exitCode);
        break;
      }
      case "terminal.output": {
        if (
          !isRecord(event.data) ||
          typeof event.data.sessionId !== "string" ||
          typeof event.data.data !== "string"
        ) {
          return;
        }
        const { sessionId, data: chunk } = event.data;
        s.appendOutput(sessionId, chunk);
        terminalBus.emit(sessionId, chunk);
        break;
      }
      case "library.changed": {
        if (!isRecord(event.data)) return;
        const folders = Array.isArray(event.data.folders)
          ? event.data.folders.map(normalizeFolder).filter((f): f is CommandFolderVM => f !== null)
          : [];
        const commands = Array.isArray(event.data.commands)
          ? event.data.commands.map(normalizeCommand).filter((c): c is SavedCommandVM => c !== null)
          : [];
        const groups = Array.isArray(event.data.groups)
          ? event.data.groups.map(normalizeGroup).filter((g): g is CommandGroupVM => g !== null)
          : [];
        s.setFolders(folders);
        s.setCommands(commands);
        s.setGroups(groups);
        break;
      }
      case "command.liveness": {
        const entry = normalizeLiveness(event.data);
        if (entry) s.updateLiveness(entry);
        break;
      }
      case "command.liveness.batch": {
        if (!isRecord(event.data) || !Array.isArray(event.data.reports)) return;
        const entries = event.data.reports
          .map(normalizeLiveness)
          .filter((v): v is LivenessVM => v !== null);
        s.setLiveness(entries);
        break;
      }
      default:
        break;
    }
  }, [store]);

  const { sendRequest, sendFrame } = usePluginSession(
    POWERSHELL_SESSION_MANAGER_PLUGIN_ID,
    { autoShutdown: false, onEvent: handleEvent },
  );

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void sendRequest("manager.boot", {});
  }, [sendRequest]);

  const createSession = useCallback(
    (params: NewSessionParams) =>
      sendRequest<SessionVM>("session.create", {
        name: params.name ?? "PowerShell",
        command: params.command ?? null,
        cwd: params.cwd ?? null,
        shellPath: params.shellPath ?? null,
        loadProfile: params.loadProfile ?? true,
        cols: params.cols ?? 120,
        rows: params.rows ?? 30,
      }),
    [sendRequest],
  );

  const killSession = useCallback(
    (sessionId: string) => sendRequest("session.kill", { sessionId }),
    [sendRequest],
  );
  const restartSession = useCallback(
    (sessionId: string) => sendRequest<SessionVM>("session.restart", { sessionId }),
    [sendRequest],
  );
  const renameSession = useCallback(
    (sessionId: string, name: string) =>
      sendRequest<SessionVM>("session.rename", { sessionId, name }),
    [sendRequest],
  );
  const broadcastInput = useCallback(
    (data: string) => sendRequest("session.broadcast", { data }),
    [sendRequest],
  );

  const saveFolder = useCallback(
    (params: { id?: string; name: string; parentId?: string | null }) =>
      sendRequest<CommandFolderVM>("folder.save", {
        id: params.id,
        name: params.name,
        parentId: params.parentId ?? null,
      }),
    [sendRequest],
  );
  const deleteFolder = useCallback(
    (folderId: string, cascade: boolean) =>
      sendRequest("folder.delete", { folderId, cascade }),
    [sendRequest],
  );

  const saveCommand = useCallback(
    (params: Omit<SavedCommandVM, "stopTimeoutMs"> & { stopTimeoutMs?: number }) =>
      sendRequest<SavedCommandVM>("command.save", {
        id: params.id || undefined,
        name: params.name,
        command: params.command,
        cwd: params.cwd ?? null,
        note: params.note ?? null,
        tags: params.tags,
        shellPath: params.shellPath ?? null,
        stopTimeoutMs: params.stopTimeoutMs ?? 3000,
        folderId: params.folderId ?? null,
        loadProfile: params.loadProfile,
      }),
    [sendRequest],
  );
  const deleteCommand = useCallback(
    (commandId: string) => sendRequest("command.delete", { commandId }),
    [sendRequest],
  );
  const moveCommand = useCallback(
    (commandId: string, folderId: string | null) =>
      sendRequest("command.move", { commandId, folderId }),
    [sendRequest],
  );
  const runCommand = useCallback(
    (commandId: string) => sendRequest<SessionVM>("command.run", { commandId }),
    [sendRequest],
  );
  const runCommandInSession = useCallback(
    (commandId: string, sessionId: string) =>
      sendRequest("command.runInSession", { commandId, sessionId }),
    [sendRequest],
  );

  const saveGroup = useCallback(
    (params: { id?: string; name: string; commandIds: string[]; mode: "parallel" | "sequential" }) =>
      sendRequest<CommandGroupVM>("group.save", params),
    [sendRequest],
  );
  const deleteGroup = useCallback(
    (groupId: string) => sendRequest("group.delete", { groupId }),
    [sendRequest],
  );
  const runGroup = useCallback(
    (groupId: string) => sendRequest("group.run", { groupId }),
    [sendRequest],
  );

  const describeProcess = useCallback(
    async (pid: number): Promise<ProcessInfoVM | null> => {
      const data = await sendRequest<{ info: unknown }>("process.describe", { pid });
      return normalizeProcessInfo(data.info);
    },
    [sendRequest],
  );
  const killProcess = useCallback(
    (pid: number, recursive = true) =>
      sendRequest("process.kill", { pid, recursive }),
    [sendRequest],
  );

  return {
    sendFrame,
    createSession,
    killSession,
    restartSession,
    renameSession,
    broadcastInput,
    saveFolder,
    deleteFolder,
    saveCommand,
    deleteCommand,
    moveCommand,
    runCommand,
    runCommandInSession,
    saveGroup,
    deleteGroup,
    runGroup,
    describeProcess,
    killProcess,
  };
}

/**
 * Lightweight pub/sub bus for live terminal output. The store keeps the last
 * 200 KB per session (for re-mount replay), but we don't want every render to
 * write into xterm — instead, pane subscribers receive chunks as they arrive.
 */
class TerminalBus {
  private readonly subs = new Map<string, Set<(chunk: string) => void>>();

  emit(sessionId: string, chunk: string): void {
    const set = this.subs.get(sessionId);
    if (!set) return;
    for (const sub of set) sub(chunk);
  }

  subscribe(sessionId: string, fn: (chunk: string) => void): () => void {
    let set = this.subs.get(sessionId);
    if (!set) {
      set = new Set();
      this.subs.set(sessionId, set);
    }
    set.add(fn);
    return () => {
      const current = this.subs.get(sessionId);
      if (!current) return;
      current.delete(fn);
      if (current.size === 0) this.subs.delete(sessionId);
    };
  }
}

export const terminalBus = new TerminalBus();
