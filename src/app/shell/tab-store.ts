import { create } from "zustand";

export interface ToolTab {
  instanceId: string;
  toolId: string;
  toolName: string;
  iconKey: string | null;
  createdAt: number;
}

interface PersistedTabsV1 {
  version: 1;
  tabs: ToolTab[];
  activeInstanceId: string | null;
}

interface TabsState {
  tabs: ToolTab[];
  activeInstanceId: string | null;
  hasHydrated: boolean;
  openTab: (input: {
    toolId: string;
    toolName: string;
    iconKey?: string | null;
  }) => string;
  closeTab: (instanceId: string) => void;
  setActive: (instanceId: string | null) => void;
  closeAll: () => void;
  reorderTabs: (fromIdx: number, toIdx: number) => void;
  hydrate: () => void;
}

const STORAGE_KEY = "toolbag.tabs.v1";

function genInstanceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadPersisted(): PersistedTabsV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; tabs?: unknown; activeInstanceId?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.tabs)) return null;
    const tabs: ToolTab[] = [];
    for (const candidate of parsed.tabs as unknown[]) {
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        typeof (candidate as { instanceId?: unknown }).instanceId === "string" &&
        typeof (candidate as { toolId?: unknown }).toolId === "string" &&
        typeof (candidate as { toolName?: unknown }).toolName === "string"
      ) {
        const c = candidate as {
          instanceId: string;
          toolId: string;
          toolName: string;
          iconKey?: unknown;
          createdAt?: unknown;
        };
        tabs.push({
          instanceId: c.instanceId,
          toolId: c.toolId,
          toolName: c.toolName,
          iconKey: typeof c.iconKey === "string" ? c.iconKey : null,
          createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
        });
      }
    }
    const persistedActive =
      typeof parsed.activeInstanceId === "string"
        ? parsed.activeInstanceId
        : null;
    const active =
      persistedActive && tabs.some((t) => t.instanceId === persistedActive)
        ? persistedActive
        : (tabs[0]?.instanceId ?? null);
    return { version: 1, tabs, activeInstanceId: active };
  } catch {
    return null;
  }
}

function savePersisted(state: PersistedTabsV1) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / private mode: ignore — tabs simply won't persist this session.
  }
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeInstanceId: null,
  hasHydrated: false,

  openTab: ({ toolId, toolName, iconKey = null }) => {
    const instanceId = genInstanceId();
    const newTab: ToolTab = {
      instanceId,
      toolId,
      toolName,
      iconKey,
      createdAt: Date.now(),
    };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeInstanceId: instanceId,
    }));
    return instanceId;
  },

  closeTab: (instanceId) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.instanceId === instanceId);
      if (idx < 0) return state;
      const nextTabs = [...state.tabs.slice(0, idx), ...state.tabs.slice(idx + 1)];
      let nextActive = state.activeInstanceId;
      if (state.activeInstanceId === instanceId) {
        // Focus the neighbor: prefer the tab to the left, fall back to the right.
        let fallback: ToolTab | undefined;
        if (idx > 0 && idx - 1 < nextTabs.length) {
          fallback = nextTabs[idx - 1];
        } else if (idx < nextTabs.length) {
          fallback = nextTabs[idx];
        }
        nextActive = fallback ? fallback.instanceId : null;
      }
      return { tabs: nextTabs, activeInstanceId: nextActive };
    });
  },

  setActive: (instanceId) => {
    set((state) => {
      if (instanceId === null) return { activeInstanceId: null };
      if (!state.tabs.some((t) => t.instanceId === instanceId)) return state;
      return { activeInstanceId: instanceId };
    });
  },

  closeAll: () => {
    set({ tabs: [], activeInstanceId: null });
  },

  reorderTabs: (fromIdx, toIdx) => {
    set((state) => {
      if (
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= state.tabs.length ||
        toIdx >= state.tabs.length
      ) {
        return state;
      }
      const next = [...state.tabs];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { tabs: next };
    });
  },

  hydrate: () => {
    if (get().hasHydrated) return;
    const persisted = loadPersisted();
    if (persisted) {
      set({
        tabs: persisted.tabs,
        activeInstanceId: persisted.activeInstanceId,
        hasHydrated: true,
      });
    } else {
      set({ hasHydrated: true });
    }
  },
}));

// Persist after every change — but debounced. Tab switching fires this
// subscription synchronously, so doing JSON.stringify + localStorage.setItem
// inline blocks the click handler and shows up as input lag.
if (typeof window !== "undefined") {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedTabsV1 | null = null;
  const flush = () => {
    saveTimer = null;
    if (pending) {
      savePersisted(pending);
      pending = null;
    }
  };
  useTabsStore.subscribe((state) => {
    if (!state.hasHydrated) return;
    pending = {
      version: 1,
      tabs: state.tabs,
      activeInstanceId: state.activeInstanceId,
    };
    if (saveTimer !== null) return;
    saveTimer = setTimeout(flush, 250);
  });
  // Last-chance flush so an unmount / refresh doesn't lose the most recent
  // switch the user just made.
  window.addEventListener("pagehide", () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      flush();
    }
  });
}

export function nextActiveAfterCycle(
  tabs: ToolTab[],
  current: string | null,
  direction: 1 | -1,
): string | null {
  if (tabs.length === 0) return null;
  if (current === null) return tabs[0].instanceId;
  const idx = tabs.findIndex((t) => t.instanceId === current);
  if (idx < 0) return tabs[0].instanceId;
  const nextIdx = (idx + direction + tabs.length) % tabs.length;
  return tabs[nextIdx].instanceId;
}
