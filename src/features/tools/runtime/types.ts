import type { LastResult } from "../../../shared/tauri/types";

export interface RunState {
  jobId: string | null;
  running: boolean;
  result: unknown;
  logs: { level: string; message: string; ts: number }[];
  progress: number | null;
  stage: string | null;
  lastError: { code: string; message: string } | null;
  lastResult: LastResult;
}

export const initialRunState: RunState = {
  jobId: null,
  running: false,
  result: null,
  logs: [],
  progress: null,
  stage: null,
  lastError: null,
  lastResult: "never",
};
