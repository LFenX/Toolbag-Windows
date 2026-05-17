import { create } from "zustand";

import type {
  EnvironmentItem,
  ScanGroupDonePayload,
  ScanGroupStatus,
  ScanItemsPayload,
  ScanJobDonePayload,
  ScanJobStartedPayload,
} from "../../../shared/tauri/types";

export type ScanStatus = "idle" | "scanning" | "done" | "error" | "cancelled";

interface EnvironmentScanStore {
  jobId: string | null;
  isAdmin: boolean;
  scanStatus: ScanStatus;
  startedAt: string | null;
  durationMs: number | null;
  totalGroups: number;
  groupProgress: Partial<Record<string, ScanGroupStatus>>;
  items: EnvironmentItem[];

  startJob(p: ScanJobStartedPayload): void;
  addItems(p: ScanItemsPayload): void;
  completeGroup(p: ScanGroupDonePayload): void;
  completeJob(p: ScanJobDonePayload): void;
  cancelJob(): void;
  setError(): void;
  loadFallback(items: EnvironmentItem[]): void;
  reset(): void;
}

const INITIAL: Pick<
  EnvironmentScanStore,
  | "jobId"
  | "isAdmin"
  | "scanStatus"
  | "startedAt"
  | "durationMs"
  | "totalGroups"
  | "groupProgress"
  | "items"
> = {
  jobId: null,
  isAdmin: false,
  scanStatus: "idle",
  startedAt: null,
  durationMs: null,
  totalGroups: 9,
  groupProgress: {},
  items: [],
};

export const useEnvironmentScanStore = create<EnvironmentScanStore>((set) => ({
  ...INITIAL,

  startJob(p) {
    set({
      jobId: p.jobId,
      isAdmin: p.isAdmin,
      scanStatus: "scanning",
      startedAt: p.generatedAt,
      totalGroups: p.totalGroups,
      groupProgress: {},
      items: [],
      durationMs: null,
    });
  },

  addItems(p) {
    set((s) => ({
      groupProgress: { ...s.groupProgress, [p.group]: "running" },
      items: [...s.items, ...p.items],
    }));
  },

  completeGroup(p) {
    set((s) => ({
      groupProgress: {
        ...s.groupProgress,
        [p.group]: p.status === "done" ? "done" : "failed",
      },
    }));
  },

  completeJob(p) {
    set({ scanStatus: "done", durationMs: p.durationMs });
  },

  cancelJob() {
    set({ scanStatus: "cancelled" });
  },

  setError() {
    set({ scanStatus: "error" });
  },

  loadFallback(items) {
    set({ ...INITIAL, scanStatus: "done", items, durationMs: 0, totalGroups: 0 });
  },

  reset() {
    set(INITIAL);
  },
}));
