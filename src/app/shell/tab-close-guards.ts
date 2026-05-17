import { shutdownPluginSession } from "../../shared/tauri/plugins";
import type { ToolTab } from "./tab-store";
import {
  getPowerShellActiveSessionCount,
  POWERSHELL_SESSION_MANAGER_PLUGIN_ID,
} from "../../features/tools/powershell-session-manager/activity-store";

export async function prepareCloseToolTab(
  tab: ToolTab,
  remainingTabs: ToolTab[],
): Promise<boolean> {
  if (tab.toolId !== POWERSHELL_SESSION_MANAGER_PLUGIN_ID) {
    return true;
  }

  const hasAnotherManagerTab = remainingTabs.some(
    (entry) => entry.toolId === POWERSHELL_SESSION_MANAGER_PLUGIN_ID,
  );
  if (hasAnotherManagerTab) {
    return true;
  }

  const activeCount = getPowerShellActiveSessionCount();
  if (activeCount === 0) {
    await shutdownPluginSession(POWERSHELL_SESSION_MANAGER_PLUGIN_ID);
    return true;
  }

  const confirmed = window.confirm(
    `还有 ${String(activeCount)} 个 PowerShell 会话正在运行。关闭这个标签页会停止这些会话，确定继续吗？`,
  );
  if (!confirmed) {
    return false;
  }

  await shutdownPluginSession(POWERSHELL_SESSION_MANAGER_PLUGIN_ID);
  return true;
}

export function isTerminalKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.closest("[data-terminal-scope='true']") !== null;
}
