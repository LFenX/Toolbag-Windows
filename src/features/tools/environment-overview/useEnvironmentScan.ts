import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  cancelEnvironmentScan,
  startEnvironmentScan,
} from "../../../shared/tauri/commands";
import { fallbackEnvironmentSnapshot } from "../../../shared/tauri/types";
import type {
  ScanGroupDonePayload,
  ScanItemsPayload,
  ScanJobDonePayload,
  ScanJobStartedPayload,
} from "../../../shared/tauri/types";
import { useToolJob } from "../useToolJob";
import { useEnvironmentScanStore } from "./store";

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

const IS_TAURI = isTauriRuntime();

function browserStartFn(): Promise<string> {
  useEnvironmentScanStore.getState().loadFallback(fallbackEnvironmentSnapshot.items);
  return Promise.resolve("browser-preview-job");
}

function tauriStartFn(): Promise<string> {
  useEnvironmentScanStore.getState().reset();
  return startEnvironmentScan();
}

export function useEnvironmentScan() {
  const queryClient = useQueryClient();
  const callbacks = useMemo(
    () => ({
      onStarted(p: ScanJobStartedPayload) {
        useEnvironmentScanStore.getState().startJob(p);
      },
      onItems(p: ScanItemsPayload) {
        useEnvironmentScanStore.getState().addItems(p);
      },
      onGroupDone(p: ScanGroupDonePayload) {
        useEnvironmentScanStore.getState().completeGroup(p);
      },
      onDone(p: ScanJobDonePayload) {
        useEnvironmentScanStore.getState().completeJob(p);
        void queryClient.invalidateQueries({ queryKey: ["tools"] });
      },
      onCancelled() {
        useEnvironmentScanStore.getState().cancelJob();
        void queryClient.invalidateQueries({ queryKey: ["tools"] });
      },
      onError() {
        useEnvironmentScanStore.getState().setError();
      },
    }),
    [queryClient],
  );

  const { start, cancel, jobIdRef } = useToolJob<
    ScanJobStartedPayload,
    ScanItemsPayload,
    ScanGroupDonePayload,
    ScanJobDonePayload
  >({
    eventPrefix: "env",
    startFn: IS_TAURI ? tauriStartFn : browserStartFn,
    cancelFn: cancelEnvironmentScan,
    callbacks,
    enabled: IS_TAURI,
    startOnMount: true,
  });

  return { startScan: start, cancelScan: cancel, jobIdRef };
}
