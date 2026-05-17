import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "./commands";
import type {
  InstallResult,
  PluginUiSchema,
  RegistryIndex,
} from "./types";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`命令 ${command} 在浏览器预览模式不可用`);
  }
  return invoke<T>(command, args);
}

export async function listRegistryPlugins(
  forceRefresh: boolean,
): Promise<RegistryIndex> {
  if (!isTauriRuntime()) {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      appVersion: { stable: "0.2.1" },
      categories: [],
      plugins: [],
      source: "bundled",
    };
  }
  return invoke<RegistryIndex>("list_registry_plugins", { forceRefresh });
}

export async function getPluginUiSchema(
  pluginId: string,
): Promise<PluginUiSchema | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<PluginUiSchema | null>("get_plugin_ui_schema", { pluginId });
}

export async function importPluginFromFile(
  packagePath: string,
  signaturePath?: string,
): Promise<InstallResult> {
  return call<InstallResult>("import_plugin_from_file", {
    packagePath,
    signaturePath,
  });
}

export async function installPluginFromRegistry(
  pluginId: string,
): Promise<InstallResult> {
  return call<InstallResult>("install_plugin_from_registry", { pluginId });
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  await call<null>("uninstall_plugin", { pluginId });
}

export async function togglePlugin(
  pluginId: string,
  disabled: boolean,
): Promise<void> {
  await call<null>("toggle_plugin", { pluginId, disabled });
}

export async function setPluginPermissions(
  pluginId: string,
  permissions: string[],
): Promise<void> {
  await call<null>("set_plugin_permissions", { pluginId, permissions });
}

export async function startPluginCommand(
  pluginId: string,
  command: string,
  params?: unknown,
): Promise<string> {
  return call<string>("start_plugin_command", {
    pluginId,
    command,
    params: params ?? null,
  });
}

export async function cancelPluginCommand(jobId: string): Promise<boolean> {
  return call<boolean>("cancel_plugin_command", { jobId });
}

/**
 * Tells the host to tear down a persistent sidecar process for `pluginId`.
 * Ephemeral plugins ignore this. Use it when closing the last tab for a
 * persistent-lifecycle plugin so the OS process exits instead of lingering.
 */
export async function shutdownPluginSession(pluginId: string): Promise<boolean> {
  return call<boolean>("shutdown_plugin_session", { pluginId });
}

/**
 * Sends a raw NDJSON frame into a persistent sidecar's stdin. Use it when
 * the standard `request → result` flow isn't enough — e.g., to push input
 * lines into a tool that wraps a child REPL process. Errors if the sidecar
 * isn't currently running.
 */
export async function sendPluginFrame(
  pluginId: string,
  frame: Record<string, unknown>,
): Promise<void> {
  await call<null>("send_plugin_frame", { pluginId, frame });
}
