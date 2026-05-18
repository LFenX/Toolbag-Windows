import { create } from "zustand";

export const POWERSHELL_SESSION_MANAGER_PLUGIN_ID =
  "com.lfen.toolbag.powershell-session-manager";

interface PowerShellActivityState {
  activeSessionCount: number;
  livingProcessesCount: number;
  setActiveSessionCount: (count: number) => void;
  setLivingProcessesCount: (count: number) => void;
}

export const usePowerShellActivityStore = create<PowerShellActivityState>((set) => ({
  activeSessionCount: 0,
  livingProcessesCount: 0,
  setActiveSessionCount: (count) => {
    set({ activeSessionCount: Math.max(0, count) });
  },
  setLivingProcessesCount: (count) => {
    set({ livingProcessesCount: Math.max(0, count) });
  },
}));

export function getPowerShellActiveSessionCount(): number {
  return usePowerShellActivityStore.getState().activeSessionCount;
}
