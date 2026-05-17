import { invoke } from "@tauri-apps/api/core";

import {
  type AppInfo,
  type AppSettings,
  defaultSettings,
  type EnvironmentSnapshot,
  fallbackEnvironmentSnapshot,
  type LogExport,
  type ReleaseStatus,
  type SignatureStatus,
  type ToolManifest,
} from "./types";
import { fallbackTools } from "../tools/manifest";
import { appSettingsSchema } from "./validation";

export function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

async function invokeOrFallback<T>(
  command: string,
  fallback: () => T | Promise<T>,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    if (import.meta.env.DEV) {
       
      console.info(`[browser-preview] ${command} → fallback`);
    }
    return fallback();
  }

  return invoke<T>(command, args);
}

export async function getAppInfo(): Promise<AppInfo> {
  return invokeOrFallback("get_app_info", () => ({
    name: "Toolbag",
    version: "0.2.0",
    identifier: "com.lfen.toolbag",
    buildProfile: "browser-preview",
    dataDir: "浏览器预览模式未连接本地数据目录",
    logDir: "浏览器预览模式未连接本地日志目录",
    pluginsDir: "浏览器预览模式未连接本地插件目录",
    trustedPubkeyFingerprint: null,
  }));
}

export async function listTools(): Promise<ToolManifest[]> {
  return invokeOrFallback("list_tools", () => fallbackTools);
}

export async function getSettings(): Promise<AppSettings> {
  const settings = await invokeOrFallback("get_settings", () => defaultSettings);
  return appSettingsSchema.parse(settings);
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const saved = await invokeOrFallback("save_settings", () => settings, { settings });
  return appSettingsSchema.parse(saved);
}

export async function getReleaseStatus(): Promise<ReleaseStatus> {
  return invokeOrFallback("get_release_status", () => ({
    currentVersion: "0.2.0",
    updateAvailable: false,
    message: "浏览器预览模式不会检查更新。",
  }));
}

export async function checkForUpdates(): Promise<ReleaseStatus> {
  return invokeOrFallback("check_for_updates", () => ({
    currentVersion: "0.2.0",
    updateAvailable: false,
    checkedAt: new Date().toISOString(),
    message: "浏览器预览模式不会检查更新。",
  }));
}

export async function exportLogs(): Promise<LogExport> {
  return invokeOrFallback("export_logs", () => ({
    filePath: "浏览器预览模式未导出日志",
    bytes: 0,
  }));
}

export async function getEnvironmentSnapshot(): Promise<EnvironmentSnapshot> {
  return invokeOrFallback("get_environment_snapshot", () => fallbackEnvironmentSnapshot);
}

export async function startEnvironmentScan(): Promise<string> {
  return invokeOrFallback("start_environment_scan", () => "browser-preview-job");
}

export async function cancelEnvironmentScan(jobId: string): Promise<boolean> {
  return invokeOrFallback("cancel_environment_scan", () => false, { jobId });
}

export async function getIsElevated(): Promise<boolean> {
  return invokeOrFallback("get_is_elevated", () => false);
}

export async function relaunchAsAdmin(): Promise<boolean> {
  return invokeOrFallback("relaunch_as_admin", () => false);
}

export async function getSignatureStatus(): Promise<SignatureStatus> {
  return invokeOrFallback("get_signature_status", () => ({
    enforced: false,
    fingerprint: null,
  }));
}

export async function openDataDir(): Promise<string> {
  return invokeOrFallback("open_data_dir", () => "浏览器预览模式");
}

export async function clearRegistryCache(): Promise<void> {
  await invokeOrFallback("clear_registry_cache", () => undefined);
}
