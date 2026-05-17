import { act, renderHook, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useToolJob } from "./useToolJob";

type Listener = (event: { payload: unknown }) => void;

const listeners = new Map<string, Set<Listener>>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, handler: Listener) => {
    const eventListeners = listeners.get(eventName) ?? new Set<Listener>();
    eventListeners.add(handler);
    listeners.set(eventName, eventListeners);
    return Promise.resolve(() => {
      eventListeners.delete(handler);
    });
  }),
}));

function emit(eventName: string, payload: unknown) {
  for (const listener of listeners.get(eventName) ?? []) {
    listener({ payload });
  }
}

function renderToolJob({
  cancelFn = vi.fn().mockResolvedValue(true),
  onItems = vi.fn(),
  startFn = vi.fn().mockResolvedValue("job-1"),
  startOnMount = false,
} = {}) {
  return {
    cancelFn,
    onItems,
    startFn,
    ...renderHook(() =>
      useToolJob({
        eventPrefix: "test",
        startFn,
        cancelFn,
        callbacks: { onItems },
        startOnMount,
      }),
    ),
  };
}

beforeEach(() => {
  listeners.clear();
  vi.clearAllMocks();
});

describe("useToolJob", () => {
  it("does not auto-start by default", () => {
    const { startFn } = renderToolJob();

    expect(startFn).not.toHaveBeenCalled();
  });

  it("starts on mount only when configured", async () => {
    const { startFn } = renderToolJob({ startOnMount: true });

    await waitFor(() => {
      expect(startFn).toHaveBeenCalledTimes(1);
    });
  });

  it("filters streaming events by the current job id", async () => {
    const { onItems, result } = renderToolJob();

    await waitFor(() => {
      expect(listen).toHaveBeenCalledTimes(5);
    });
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      emit("test://items", { jobId: "old-job", items: ["stale"] });
      emit("test://items", { jobId: "job-1", items: ["fresh"] });
    });

    expect(onItems).toHaveBeenCalledTimes(1);
    expect(onItems).toHaveBeenCalledWith({ jobId: "job-1", items: ["fresh"] });
  });

  it("cancels the previous job before starting a replacement", async () => {
    const startFn = vi
      .fn()
      .mockResolvedValueOnce("job-1")
      .mockResolvedValueOnce("job-2");
    const cancelFn = vi.fn().mockResolvedValue(true);
    const { result } = renderToolJob({ cancelFn, startFn });

    await act(async () => {
      await result.current.start();
      await result.current.start();
    });

    expect(cancelFn).toHaveBeenCalledWith("job-1");
  });

  it("cancels an active job on unmount", async () => {
    const cancelFn = vi.fn().mockResolvedValue(true);
    const { result, unmount } = renderToolJob({ cancelFn });

    await act(async () => {
      await result.current.start();
    });
    unmount();

    expect(cancelFn).toHaveBeenCalledWith("job-1");
  });
});
