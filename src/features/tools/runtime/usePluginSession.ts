import { useCallback, useEffect, useRef } from "react";

import {
  sendPluginFrame,
  shutdownPluginSession,
} from "../../../shared/tauri/plugins";
import { usePluginJob } from "./usePluginJob";

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
  options: { autoShutdown?: boolean } = {},
) {
  const { autoShutdown = true } = options;
  const job = usePluginJob(pluginId);
  const autoShutdownRef = useRef(autoShutdown);
  const pluginIdRef = useRef(pluginId);

  useEffect(() => {
    autoShutdownRef.current = autoShutdown;
  }, [autoShutdown]);
  useEffect(() => {
    pluginIdRef.current = pluginId;
  }, [pluginId]);

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
