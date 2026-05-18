import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

import {
  sendPluginFrame,
  shutdownPluginSession,
  startPluginCommand,
} from "../../../shared/tauri/plugins";
import { usePluginJob } from "./usePluginJob";

export interface PluginSidecarEvent {
  pluginId: string;
  event: string;
  data: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Wrapper around `usePluginJob` for plugins declared with
 * `runtime.lifecycle = "persistent"`.
 *
 * Adds two things on top of the base hook:
 *
 *   * `sendRequest(command, params)` — fires a request and resolves with
 *     the sidecar's `result` data, or rejects with the `error` frame.
 *     Multiple concurrent requests are supported (the base hook can only
 *     track one in-flight job at a time).
 *   * `sendFrame(frame)` — writes a raw NDJSON line into the sidecar's
 *     stdin. Use for `terminal.input`, `terminal.resize`, broadcasts,
 *     and anything else that isn't request/response.
 *
 * The hook also reliably registers the `plugin://sidecar-event`
 * listener on mount — the previous version gated registration on a
 * ref that hadn't been populated yet, so async event callbacks never
 * fired. That bug manifested as "buttons do nothing".
 */
export function usePluginSession(
  pluginId: string,
  options: {
    autoShutdown?: boolean;
    onEvent?: (event: PluginSidecarEvent) => void;
  } = {},
) {
  const { autoShutdown = true, onEvent } = options;
  const job = usePluginJob(pluginId);
  const autoShutdownRef = useRef(autoShutdown);
  const pluginIdRef = useRef(pluginId);
  const onEventRef = useRef(onEvent);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());

  useEffect(() => {
    autoShutdownRef.current = autoShutdown;
  }, [autoShutdown]);
  useEffect(() => {
    pluginIdRef.current = pluginId;
  }, [pluginId]);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let alive = true;
    const handles: UnlistenFn[] = [];
    const setup = async () => {
      handles.push(
        await listen<PluginSidecarEvent>("plugin://sidecar-event", (event) => {
          if (event.payload.pluginId !== pluginIdRef.current) return;
          onEventRef.current?.(event.payload);
        }),
      );
      handles.push(
        await listen<{ jobId: string; data: unknown }>(
          "plugin://job-result",
          (event) => {
            const pending = pendingRef.current.get(event.payload.jobId);
            if (!pending) return;
            pendingRef.current.delete(event.payload.jobId);
            pending.resolve(event.payload.data);
          },
        ),
      );
      handles.push(
        await listen<{ jobId: string; code: string; message: string }>(
          "plugin://job-error",
          (event) => {
            const pending = pendingRef.current.get(event.payload.jobId);
            if (!pending) return;
            pendingRef.current.delete(event.payload.jobId);
            pending.reject(
              new Error(`${event.payload.code}: ${event.payload.message}`),
            );
          },
        ),
      );
      if (!alive) {
        handles.forEach((unlisten) => { unlisten(); });
      }
    };
    void setup();
    const pendingSnapshot = pendingRef.current;
    return () => {
      alive = false;
      handles.forEach((unlisten) => { unlisten(); });
      pendingSnapshot.forEach((entry) => {
        entry.reject(new Error("E_UNMOUNT: usePluginSession unmounted"));
      });
      pendingSnapshot.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (autoShutdownRef.current) {
        void shutdownPluginSession(pluginIdRef.current);
      }
    };
  }, []);

  const sendFrame = useCallback(
    async (frame: Record<string, unknown>) => {
      await sendPluginFrame(pluginId, frame);
    },
    [pluginId],
  );

  const sendRequest = useCallback(
    async <T = unknown>(
      command: string,
      params: Record<string, unknown> = {},
    ): Promise<T> => {
      const jobId = await startPluginCommand(pluginId, command, params);
      return new Promise<T>((resolve, reject) => {
        pendingRef.current.set(jobId, {
          resolve: (value) => { resolve(value as T); },
          reject,
        });
      });
    },
    [pluginId],
  );

  const shutdown = useCallback(async () => {
    await shutdownPluginSession(pluginId);
  }, [pluginId]);

  return {
    ...job,
    sendFrame,
    sendRequest,
    shutdown,
  };
}
