import { create } from "zustand";

import type {
  CommandFolderVM,
  CommandGroupVM,
  LivenessVM,
  SavedCommandVM,
  SessionVM,
  ShellInfo,
  UiPrefs,
} from "./types";
import { DEFAULT_PREFS, PREFS_STORAGE_KEY } from "./types";

const EMPTY_SHELL: ShellInfo = {
  detected: null,
  version: null,
  candidates: [],
  error: null,
};

interface ManagerState {
  // ---- server data ----
  booted: boolean;
  sidecarExited: boolean;
  shell: ShellInfo;
  sessions: SessionVM[];
  folders: CommandFolderVM[];
  commands: SavedCommandVM[];
  groups: CommandGroupVM[];
  liveness: Partial<Record<string, LivenessVM>>; // keyed by commandId
  // ---- ui state ----
  activeSessionId: string | null;
  searchQuery: string;
  prefs: UiPrefs;

  // ---- actions ----
  setBooted: (booted: boolean) => void;
  setSidecarExited: (value: boolean) => void;
  setShell: (shell: ShellInfo) => void;
  upsertSession: (session: SessionVM) => void;
  removeSession: (id: string) => void;
  markSessionExited: (id: string, exitCode: number | null) => void;
  appendOutput: (id: string, chunk: string) => void;
  setSessions: (sessions: SessionVM[]) => void;
  setFolders: (folders: CommandFolderVM[]) => void;
  setCommands: (commands: SavedCommandVM[]) => void;
  setGroups: (groups: CommandGroupVM[]) => void;
  setLiveness: (entries: LivenessVM[]) => void;
  updateLiveness: (entry: LivenessVM) => void;
  setActiveSession: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  updatePrefs: (patch: Partial<UiPrefs>) => void;
  reset: () => void;
}

const RECENT_OUTPUT_LIMIT = 200_000;

function appendRecent(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= RECENT_OUTPUT_LIMIT) return next;
  return next.slice(next.length - RECENT_OUTPUT_LIMIT);
}

function loadPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: UiPrefs): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // best effort
  }
}

export const usePowerShellManagerStore = create<ManagerState>((set, get) => ({
  booted: false,
  sidecarExited: false,
  shell: EMPTY_SHELL,
  sessions: [],
  folders: [],
  commands: [],
  groups: [],
  liveness: {},
  activeSessionId: null,
  searchQuery: "",
  prefs: loadPrefs(),

  setBooted: (booted) => { set({ booted }); },
  setSidecarExited: (sidecarExited) => { set({ sidecarExited }); },
  setShell: (shell) => { set({ shell }); },

  upsertSession: (session) => {
    set((state) => {
      const index = state.sessions.findIndex((entry) => entry.id === session.id);
      if (index < 0) {
        const next = [...state.sessions, session];
        return {
          sessions: next,
          activeSessionId: state.activeSessionId ?? session.id,
        };
      }
      const previous = state.sessions[index];
      const next = [...state.sessions];
      next[index] = {
        ...previous,
        ...session,
        recentOutput:
          session.recentOutput.length > 0
            ? session.recentOutput
            : previous.recentOutput,
      };
      return { sessions: next };
    });
  },

  removeSession: (id) => {
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      let activeSessionId = state.activeSessionId;
      if (activeSessionId === id) {
        activeSessionId = sessions[0]?.id ?? null;
      }
      return { sessions, activeSessionId };
    });
  },

  markSessionExited: (id, exitCode) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, status: "exited", exitCode: exitCode ?? s.exitCode } : s,
      ),
    }));
  },

  appendOutput: (id, chunk) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, recentOutput: appendRecent(s.recentOutput, chunk) } : s,
      ),
    }));
  },

  setSessions: (sessions) => {
    set((state) => ({
      sessions,
      activeSessionId:
        state.activeSessionId &&
        sessions.some((s) => s.id === state.activeSessionId)
          ? state.activeSessionId
          : sessions[0]?.id ?? null,
    }));
  },
  setFolders: (folders) => { set({ folders }); },
  setCommands: (commands) => { set({ commands }); },
  setGroups: (groups) => { set({ groups }); },

  setLiveness: (entries) => {
    set(() => {
      const liveness: Partial<Record<string, LivenessVM>> = {};
      for (const entry of entries) {
        const prev: LivenessVM | undefined = liveness[entry.commandId];
        if (!prev || entry.startedAtMs >= prev.startedAtMs) {
          liveness[entry.commandId] = entry;
        }
      }
      return { liveness };
    });
  },

  updateLiveness: (entry) => {
    set((state) => {
      const prev: LivenessVM | undefined = state.liveness[entry.commandId];
      if (prev && prev.startedAtMs > entry.startedAtMs) return state;
      return { liveness: { ...state.liveness, [entry.commandId]: entry } };
    });
  },

  setActiveSession: (id) => { set({ activeSessionId: id }); },
  setSearchQuery: (searchQuery) => { set({ searchQuery }); },

  updatePrefs: (patch) => {
    const next = { ...get().prefs, ...patch };
    savePrefs(next);
    set({ prefs: next });
  },

  reset: () => {
    set({
      booted: false,
      sidecarExited: false,
      shell: EMPTY_SHELL,
      sessions: [],
      folders: [],
      commands: [],
      groups: [],
      liveness: {},
      activeSessionId: null,
      searchQuery: "",
    });
  },
}));

export function selectActiveSession(state: ManagerState): SessionVM | null {
  if (!state.activeSessionId) return state.sessions[0] ?? null;
  return state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
}

export function selectLivingCount(state: ManagerState): number {
  let count = 0;
  for (const entry of Object.values(state.liveness)) {
    if (entry?.alive) count += 1;
  }
  return count;
}

export function selectRunningSessionCount(state: ManagerState): number {
  return state.sessions.filter((s) => s.status === "running").length;
}
