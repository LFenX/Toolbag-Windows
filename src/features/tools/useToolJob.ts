import { listen } from "@tauri-apps/api/event";
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
   * Use to opt-out in browser preview mode. Default: true.
   */
  enabled?: boolean;
}

export interface ToolJobControls {
  start: () => Promise<void>;
  cancel: () => void;
  jobIdRef: React.RefObject<string | null>;
}

/**
 * Generic hook that wires Tauri streaming job events and exposes
 * `start` / `cancel` controls. Each tool provides its own state updates
 * via `callbacks`. Listeners are always registered before `startFn` is
 * called to avoid race conditions.
 */
export function useToolJob<TStarted, TItems, TGroupDone, TDone>({
  eventPrefix: prefix,
  startFn,
  cancelFn,
  callbacks,
  enabled = true,
}: UseToolJobOptions<TStarted, TItems, TGroupDone, TDone>): ToolJobControls {
  const jobIdRef = useRef<string | null>(null);
  const cbRef = useRef(callbacks);

  // Keep cbRef current without triggering effect re-runs.
  useEffect(() => {
    cbRef.current = callbacks;
  });

  const start = useCallback(async () => {
    // Cancel any running job before starting a new one.
    if (jobIdRef.current) {
      try { await cancelFn(jobIdRef.current); } catch { /* best-effort */ }
      jobIdRef.current = null;
    }
    try {
      const id = await startFn();
      jobIdRef.current = id;
    } catch (err: unknown) {
      cbRef.current.onError?.(err);
    }
  }, [startFn, cancelFn]);

  const cancel = useCallback(() => {
    if (jobIdRef.current) void cancelFn(jobIdRef.current);
  }, [cancelFn]);

  useEffect(() => {
    let active = true;
    const cleanupFns: (() => void)[] = [];

    async function setup() {
      if (!enabled) {
        await start();
        return;
      }

      const fns = await Promise.all([
        listen<TStarted>(`${prefix}://job-started`, (e) => {
          if (!active) return;
          const jobId = (e.payload as { jobId?: string }).jobId ?? "";
          jobIdRef.current = jobId;
          cbRef.current.onStarted?.(e.payload, jobId);
        }),
        listen<TItems>(`${prefix}://items`, (e) => {
          if (active) cbRef.current.onItems?.(e.payload);
        }),
        listen<TGroupDone>(`${prefix}://group-done`, (e) => {
          if (active) cbRef.current.onGroupDone?.(e.payload);
        }),
        listen<TDone>(`${prefix}://job-done`, (e) => {
          if (active) cbRef.current.onDone?.(e.payload);
        }),
        listen<unknown>(`${prefix}://job-cancelled`, () => {
          if (active) cbRef.current.onCancelled?.();
        }),
      ]).catch((err: unknown) => {
        if (active) cbRef.current.onError?.(err);
        return [] as (() => void)[];
      });

      if (!active) { fns.forEach((f) => { f(); }); return; }
      cleanupFns.push(...fns);

      await start();
    }

    void setup();

    return () => {
      active = false;
      cleanupFns.forEach((f) => { f(); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, enabled]); // prefix and enabled are static per tool

  return { start, cancel, jobIdRef };
}
