import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

import {
  sendPluginFrame,
  shutdownPluginSession,
} from "../../../shared/tauri/plugins";
import { usePluginJob } from "./usePluginJob";

export interface PluginSidecarEvent {
  pluginId: string;
  event: string;
  data: unknown;
}

/**
 * Wrapper around `usePluginJob` for plugins declared with
 * `runtime.lifecycle = "persistent"`. Exposes the same request/response API
 * plus helpers to push arbitrary NDJSON frames into the sidecar's stdin and
 * to shut the process down explicitly.
 *
 * The hook auto-shuts down the sidecar on unmount when `autoShutdown` is
 * true (default). Set to false when multiple tabs share a sidecar — the
 * caller is then responsible for shutting it down when appropriate (e.g.
 * when the last tab closes).
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
    let unlisten: UnlistenFn | null = null;
    const setup = async () => {
      unlisten = await listen<PluginSidecarEvent>(
        "plugin://sidecar-event",
        (event) => {
          if (event.payload.pluginId !== pluginIdRef.current) return;
          onEventRef.current?.(event.payload);
        },
      );
      if (!alive) {
        unlisten();
        unlisten = null;
      }
    };
    if (onEventRef.current) {
      void setup();
    }
    return () => {
      alive = false;
      if (unlisten) {
        unlisten();
      }
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

  const shutdown = useCallback(async () => {
    await shutdownPluginSession(pluginId);
  }, [pluginId]);

  return {
    ...job,
    sendFrame,
    shutdown,
  };
}
