import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  cancelPluginCommand,
  startPluginCommand,
} from "../../../shared/tauri/plugins";
import { initialRunState, type RunState } from "./types";

type Action =
  | { type: "start"; jobId: string }
  | { type: "progress"; jobId: string; value?: number; stage?: string }
  | {
      type: "log";
      jobId: string;
      level: string;
      message: string;
    }
  | { type: "result"; jobId: string; data: unknown }
  | { type: "error"; jobId: string; code: string; message: string }
  | { type: "done"; jobId: string }
  | { type: "reset" };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "start":
      return {
        ...initialRunState,
        jobId: action.jobId,
        running: true,
        lastResult: "never",
      };
    case "progress":
      if (state.jobId !== action.jobId) return state;
      return {
        ...state,
        progress: action.value ?? state.progress,
        stage: action.stage ?? state.stage,
      };
    case "log":
      if (state.jobId !== action.jobId) return state;
      return {
        ...state,
        logs: [
          ...state.logs.slice(-499),
          { level: action.level, message: action.message, ts: Date.now() },
        ],
      };
    case "result":
      if (state.jobId !== action.jobId) return state;
      return { ...state, result: action.data, lastResult: "success" };
    case "error":
      if (state.jobId !== action.jobId) return state;
      return {
        ...state,
        lastError: { code: action.code, message: action.message },
        lastResult: action.code === "E_CANCELLED" ? "cancelled" : "failed",
        running: false,
      };
    case "done":
      if (state.jobId !== action.jobId) return state;
      return { ...state, running: false };
    case "reset":
      return initialRunState;
    default:
      return state;
  }
}

export function usePluginJob(pluginId: string) {
  const [state, dispatch] = useReducer(reducer, initialRunState);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    let alive = true;
    const setup = async () => {
      const handles: UnlistenFn[] = [];
      handles.push(
        await listen<{ jobId: string; value?: number; stage?: string }>(
          "plugin://job-progress",
          (event) => {
            dispatch({
              type: "progress",
              jobId: event.payload.jobId,
              value: event.payload.value,
              stage: event.payload.stage,
            });
          },
        ),
      );
      handles.push(
        await listen<{ jobId: string; level: string; message: string }>(
          "plugin://job-log",
          (event) => {
            dispatch({
              type: "log",
              jobId: event.payload.jobId,
              level: event.payload.level,
              message: event.payload.message,
            });
          },
        ),
      );
      handles.push(
        await listen<{ jobId: string; data: unknown }>(
          "plugin://job-result",
          (event) => {
            dispatch({
              type: "result",
              jobId: event.payload.jobId,
              data: event.payload.data,
            });
          },
        ),
      );
      handles.push(
        await listen<{ jobId: string; code: string; message: string }>(
          "plugin://job-error",
          (event) => {
            dispatch({
              type: "error",
              jobId: event.payload.jobId,
              code: event.payload.code,
              message: event.payload.message,
            });
          },
        ),
      );
      handles.push(
        await listen<{ jobId: string }>("plugin://job-done", (event) => {
          dispatch({ type: "done", jobId: event.payload.jobId });
        }),
      );
      if (!alive) {
        handles.forEach((u) => { u(); });
        return;
      }
      unlistenRefs.current = handles;
    };
    void setup();
    return () => {
      alive = false;
      unlistenRefs.current.forEach((u) => { u(); });
      unlistenRefs.current = [];
    };
  }, []);

  const start = useCallback(
    async (command: string, params: unknown) => {
      const jobId = await startPluginCommand(pluginId, command, params);
      dispatch({ type: "start", jobId });
      return jobId;
    },
    [pluginId],
  );

  const cancel = useCallback(async () => {
    if (!state.jobId) return false;
    return cancelPluginCommand(state.jobId);
  }, [state.jobId]);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  return { state, start, cancel, reset };
}
