import { listen } from "@tauri-apps/api/event";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

export interface ToolJobCallbacks<TStarted, TItems, TGroupDone, TDone> {
  onStarted?: (payload: TStarted, jobId: string) => void;
  onItems?: (payload: TItems) => void;
  onGroupDone?: (payload: TGroupDone) => void;
  onDone?: (payload: TDone) => void;
  onCancelled?: () => void;
  onError?: (err: unknown) => void;
}

export interface UseToolJobOptions<TStarted, TItems, TGroupDone, TDone> {
  /** Event channel prefix, e.g. "env" for events like "env://job-started". */
  eventPrefix: string;
  /** Returns the new job ID. Called once per `start()` invocation. */
  startFn: () => Promise<string>;
  cancelFn: (jobId: string) => Promise<unknown>;
  /** Stable reference — pass a `useMemo`-ed object. */
  callbacks: ToolJobCallbacks<TStarted, TItems, TGroupDone, TDone>;
  /**
   * When false, skips Tauri event registration and calls `startFn` directly.
   * Use to opt out in browser preview mode. Default: true.
   */
  enabled?: boolean;
  /** Start once after listeners are ready. Default: false. */
  startOnMount?: boolean;
}

export interface ToolJobControls {
  start: () => Promise<void>;
  cancel: () => void;
  jobIdRef: RefObject<string | null>;
}

function payloadJobId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const jobId = (payload as { jobId?: unknown }).jobId;
  return typeof jobId === "string" && jobId.length > 0 ? jobId : null;
}

/**
 * Generic hook that wires Tauri streaming job events and exposes
 * `start` / `cancel` controls. Each tool provides its own state updates
 * via `callbacks`. Listeners are registered before optional auto-start
 * to avoid race conditions.
 */
export function useToolJob<TStarted, TItems, TGroupDone, TDone>({
  eventPrefix: prefix,
  startFn,
  cancelFn,
  callbacks,
  enabled = true,
  startOnMount = false,
}: UseToolJobOptions<TStarted, TItems, TGroupDone, TDone>): ToolJobControls {
  const jobIdRef = useRef<string | null>(null);
  const ignoredJobIdsRef = useRef<Set<string>>(new Set());
  const cbRef = useRef(callbacks);

  useEffect(() => {
    cbRef.current = callbacks;
  });

  const isCurrentJobPayload = useCallback((payload: unknown) => {
    const eventJobId = payloadJobId(payload);
    return Boolean(eventJobId && eventJobId === jobIdRef.current);
  }, []);

  const start = useCallback(async () => {
    if (jobIdRef.current) {
      const previousJobId = jobIdRef.current;
      ignoredJobIdsRef.current.add(previousJobId);
      jobIdRef.current = null;
      try {
        await cancelFn(previousJobId);
      } catch {
        // best-effort cancellation before replacement
      }
    }

    try {
      const id = await startFn();
      if (!ignoredJobIdsRef.current.has(id)) {
        jobIdRef.current = id;
      }
    } catch (err: unknown) {
      cbRef.current.onError?.(err);
    }
  }, [cancelFn, startFn]);

  const cancel = useCallback(() => {
    if (jobIdRef.current) {
      void cancelFn(jobIdRef.current);
    }
  }, [cancelFn]);

  useEffect(() => {
    let active = true;
    const cleanupFns: (() => void)[] = [];

    async function setup() {
      if (!enabled) {
        if (startOnMount) {
          await start();
        }
        return;
      }

      const fns = await Promise.all([
        listen<TStarted>(`${prefix}://job-started`, (event) => {
          if (!active) return;
          const jobId = payloadJobId(event.payload);
          if (!jobId || ignoredJobIdsRef.current.has(jobId)) return;
          if (jobIdRef.current && jobIdRef.current !== jobId) return;

          jobIdRef.current = jobId;
          cbRef.current.onStarted?.(event.payload, jobId);
        }),
        listen<TItems>(`${prefix}://items`, (event) => {
          if (active && isCurrentJobPayload(event.payload)) {
            cbRef.current.onItems?.(event.payload);
          }
        }),
        listen<TGroupDone>(`${prefix}://group-done`, (event) => {
          if (active && isCurrentJobPayload(event.payload)) {
            cbRef.current.onGroupDone?.(event.payload);
          }
        }),
        listen<TDone>(`${prefix}://job-done`, (event) => {
          if (!active || !isCurrentJobPayload(event.payload)) return;
          cbRef.current.onDone?.(event.payload);
          jobIdRef.current = null;
        }),
        listen<unknown>(`${prefix}://job-cancelled`, (event) => {
          if (!active || !isCurrentJobPayload(event.payload)) return;
          cbRef.current.onCancelled?.();
          jobIdRef.current = null;
        }),
      ]).catch((err: unknown) => {
        if (active) cbRef.current.onError?.(err);
        return [] as (() => void)[];
      });

      if (!active) {
        fns.forEach((cleanup) => {
          cleanup();
        });
        return;
      }

      cleanupFns.push(...fns);

      if (startOnMount) {
        await start();
      }
    }

    void setup();

    return () => {
      active = false;
      cleanupFns.forEach((cleanup) => {
        cleanup();
      });
      if (jobIdRef.current) {
        void cancelFn(jobIdRef.current);
        jobIdRef.current = null;
      }
    };
  }, [cancelFn, enabled, isCurrentJobPayload, prefix, start, startOnMount]);

  return { start, cancel, jobIdRef };
}
