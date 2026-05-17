import { check, type CheckOptions, type DownloadOptions, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

import { isTauriRuntime, restartApp } from "../../shared/tauri/commands";
import type { AppSettings, UpdateFrequency } from "../../shared/tauri/types";

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "notAvailable"
  | "downloading"
  | "installing"
  | "installed"
  | "error";

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  date?: string;
  notes?: string;
  checkedAt: string;
}

interface AppUpdateState {
  phase: AppUpdatePhase;
  visible: boolean;
  info: AppUpdateInfo | null;
  message: string;
  error: string | null;
  downloadedBytes: number;
  contentLength: number | null;
}

const AUTO_CHECK_STORAGE_KEY = "toolbag.app-update.last-check.v1";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

let activeUpdate: Update | null = null;

export const useAppUpdateStore = create<AppUpdateState>(() => ({
  phase: "idle",
  visible: false,
  info: null,
  message: "",
  error: null,
  downloadedBytes: 0,
  contentLength: null,
}));

export async function checkForAppUpdate(
  settings?: AppSettings,
  options: { silent?: boolean } = {},
) {
  const state = useAppUpdateStore.getState();
  if (state.phase === "checking" || state.phase === "downloading" || state.phase === "installing") {
    return;
  }

  const visible = !options.silent;

  if (!isTauriRuntime()) {
    useAppUpdateStore.setState({
      phase: "notAvailable",
      visible,
      info: null,
      message: "浏览器预览模式不会检查主程序更新。",
      error: null,
      downloadedBytes: 0,
      contentLength: null,
    });
    return;
  }

  await closeActiveUpdate();
  recordUpdateCheckAttempt();

  useAppUpdateStore.setState({
    phase: "checking",
    visible,
    info: null,
    message: "正在检查主程序更新…",
    error: null,
    downloadedBytes: 0,
    contentLength: null,
  });

  try {
    const update = await check(buildCheckOptions(settings));
    const checkedAt = new Date().toISOString();

    if (!update) {
      useAppUpdateStore.setState({
        phase: "notAvailable",
        visible,
        info: null,
        message: "当前已经是最新版本。",
        error: null,
        downloadedBytes: 0,
        contentLength: null,
      });
      return;
    }

    activeUpdate = update;
    useAppUpdateStore.setState({
      phase: "available",
      visible: true,
      info: {
        currentVersion: update.currentVersion,
        latestVersion: update.version,
        date: update.date,
        notes: update.body,
        checkedAt,
      },
      message: `发现新版本 ${update.version}，可在应用内下载并安装。`,
      error: null,
      downloadedBytes: 0,
      contentLength: null,
    });
  } catch (error) {
    const message = formatUpdateError(error);
    useAppUpdateStore.setState({
      phase: "error",
      visible,
      info: null,
      message,
      error: message,
      downloadedBytes: 0,
      contentLength: null,
    });
  }
}

export async function installAppUpdate(settings?: AppSettings) {
  const state = useAppUpdateStore.getState();
  if (state.phase === "downloading" || state.phase === "installing") return;

  if (!activeUpdate) {
    useAppUpdateStore.setState({
      phase: "error",
      visible: true,
      message: "没有可安装的更新，请先检查更新。",
      error: "没有可安装的更新，请先检查更新。",
    });
    return;
  }

  let downloadedBytes = 0;
  useAppUpdateStore.setState({
    phase: "downloading",
    visible: true,
    message: "正在下载更新包…",
    error: null,
    downloadedBytes: 0,
    contentLength: null,
  });

  try {
    await activeUpdate.downloadAndInstall(
      (event) => {
        if (event.event === "Started") {
          downloadedBytes = 0;
          useAppUpdateStore.setState({
            phase: "downloading",
            message: "正在下载更新包…",
            downloadedBytes,
            contentLength: event.data.contentLength ?? null,
          });
          return;
        }
        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          useAppUpdateStore.setState({ downloadedBytes });
          return;
        }
        useAppUpdateStore.setState({
          phase: "installing",
          message: "下载完成，正在安装更新…",
        });
      },
      buildDownloadOptions(settings),
    );

    await closeActiveUpdate();
    useAppUpdateStore.setState({
      phase: "installed",
      visible: true,
      message: "更新安装完成，正在重启 Toolbag…",
      error: null,
    });
    await restartApp();
  } catch (error) {
    const message = formatUpdateError(error);
    useAppUpdateStore.setState({
      phase: "error",
      visible: true,
      message,
      error: message,
    });
  }
}

export function dismissAppUpdate() {
  const phase = useAppUpdateStore.getState().phase;
  if (phase === "downloading" || phase === "installing") return;
  useAppUpdateStore.setState({ visible: false });
}

export function shouldAutoCheckAppUpdate(settings: AppSettings, now = Date.now()) {
  if (!settings.appAutoUpdate) return false;
  const frequency = settings.updateCheckFrequency;
  if (frequency === "manual") return false;
  if (frequency === "onStart") return true;

  const lastChecked = readLastUpdateCheckAt();
  if (lastChecked === null) return true;
  return now - lastChecked >= intervalForFrequency(frequency);
}

export function getAppUpdateProgressPercent(
  downloadedBytes: number,
  contentLength: number | null,
) {
  if (!contentLength || contentLength <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((downloadedBytes / contentLength) * 100)));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${String(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function buildCheckOptions(settings?: AppSettings): CheckOptions {
  const options: CheckOptions = {
    timeout: 20_000,
  };
  const proxy = settings?.httpProxy?.trim();
  if (proxy) {
    options.proxy = proxy;
  }
  if (settings?.updateChannel) {
    options.headers = {
      "x-toolbag-update-channel": settings.updateChannel,
    };
  }
  return options;
}

function buildDownloadOptions(settings?: AppSettings): DownloadOptions {
  const options: DownloadOptions = { timeout: 120_000 };
  if (settings?.updateChannel) {
    options.headers = {
      "x-toolbag-update-channel": settings.updateChannel,
    };
  }
  return options;
}

async function closeActiveUpdate() {
  const update = activeUpdate;
  activeUpdate = null;
  if (update) {
    try {
      await update.close();
    } catch {
      // The updater resource may already be consumed by install.
    }
  }
}

function recordUpdateCheckAttempt() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_CHECK_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable in restricted environments.
  }
}

function readLastUpdateCheckAt() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTO_CHECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function intervalForFrequency(frequency: UpdateFrequency) {
  switch (frequency) {
    case "daily":
      return ONE_DAY_MS;
    case "weekly":
      return ONE_WEEK_MS;
    case "onStart":
    case "manual":
      return 0;
  }
}

function formatUpdateError(error: unknown) {
  const raw = errorMessage(error);
  if (raw.includes("Updater does not have any endpoints")) {
    return "当前构建没有配置更新端点，请确认 Release 构建使用了 updater 配置。";
  }
  if (raw.includes("not allowed") || raw.includes("forbidden") || raw.includes("permission")) {
    return "当前窗口没有更新权限，请检查 Tauri capabilities 中的 updater 权限。";
  }
  if (raw.includes("Could not fetch") || raw.includes("error sending request")) {
    return "无法连接更新服务，请检查网络或 HTTP 代理设置。";
  }
  return raw || "检查或安装更新失败。";
}

function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : JSON.stringify(message);
  }
  return String(error);
}
