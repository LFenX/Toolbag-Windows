export type SessionStatus = "running" | "exited" | "failed";
export type GroupMode = "parallel" | "sequential";
export type SidebarView = "sessions" | "library" | "groups";

export interface ShellInfo {
  detected: string | null;
  version: string | null;
  candidates: string[];
  error: string | null;
}

export interface SessionVM {
  id: string;
  name: string;
  command: string | null;
  cwd: string | null;
  shellPath: string;
  shellVersion: string | null;
  status: SessionStatus;
  exitCode: number | null;
  createdAt: string;
  startedAtMs: number;
  pid: number;
  loadProfile: boolean;
  commandId: string | null;
  recentOutput: string;
}

export interface CommandFolderVM {
  id: string;
  name: string;
  parentId: string | null;
}

export interface SavedCommandVM {
  id: string;
  name: string;
  command: string;
  cwd: string | null;
  note: string | null;
  tags: string[];
  shellPath: string | null;
  stopTimeoutMs: number;
  folderId: string | null;
  loadProfile: boolean | null;
}

export interface CommandGroupVM {
  id: string;
  name: string;
  commandIds: string[];
  mode: GroupMode;
}

export interface LivenessVM {
  commandId: string;
  runId: string;
  pid: number;
  alive: boolean;
  startedAt: string;
  startedAtMs: number;
}

export interface ProcessInfoVM {
  pid: number;
  name: string;
  cmd: string[];
  parentPid: number | null;
  cpuUsage: number;
  memoryKb: number;
  children: ProcessInfoVM[];
}

export interface UiPrefs {
  sidebarView: SidebarView;
  sidebarWidth: number;
  fontSize: number;
  fontFamily: string;
  theme: "follow" | "dark" | "midnight";
  defaultShellPath: string | null;
  defaultCwd: string | null;
  loadProfile: boolean;
  expandedFolders: Record<string, boolean | undefined>;
}

export const DEFAULT_PREFS: UiPrefs = {
  sidebarView: "sessions",
  sidebarWidth: 280,
  fontSize: 13,
  fontFamily:
    'Cascadia Mono, Consolas, "JetBrains Mono", "SFMono-Regular", monospace',
  theme: "dark",
  defaultShellPath: null,
  defaultCwd: null,
  loadProfile: true,
  expandedFolders: {},
};

export const PREFS_STORAGE_KEY = "toolbag.powershell-session-manager.prefs.v1";
