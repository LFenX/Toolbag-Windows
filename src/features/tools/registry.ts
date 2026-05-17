import {
  Boxes,
  Code2,
  Globe2,
  HardDrive,
  MonitorCog,
  ShieldCheck,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { lazy } from "react";

import { EnvironmentOverviewTool } from "./environment-overview/EnvironmentOverviewTool";
import type { ToolManifest } from "../../shared/tauri/types";
import type { BuiltinRegistration, ToolDefinition } from "./types";

const PowerShellSessionManagerTool = lazy(() =>
  import("./powershell-session-manager/PowerShellSessionManagerTool").then(
    (mod) => ({ default: mod.PowerShellSessionManagerTool }),
  ),
);

export const builtinRegistry: BuiltinRegistration[] = [
  {
    rendererKey: "environment-overview",
    icon: MonitorCog,
    component: EnvironmentOverviewTool,
  },
  {
    rendererKey: "powershell-session-manager",
    icon: TerminalSquare,
    component: PowerShellSessionManagerTool,
  },
];

const categoryIconMap: Record<string, LucideIcon> = {
  系统: MonitorCog,
  网络: Globe2,
  开发: Code2,
  实用: Wrench,
  媒体: HardDrive,
  安全: ShieldCheck,
};

function iconForManifest(manifest: ToolManifest, builtin?: BuiltinRegistration) {
  if (builtin) {
    return builtin.icon;
  }
  return categoryIconMap[manifest.category] ?? Boxes;
}

export function composeToolDefinitions(
  manifests: ToolManifest[],
  registrations: BuiltinRegistration[] = builtinRegistry,
): ToolDefinition[] {
  const byKey = new Map<string, BuiltinRegistration>();
  for (const reg of registrations) {
    if (byKey.has(reg.rendererKey)) {
      throw new Error(
        `Builtin renderer ${reg.rendererKey} has duplicate registrations.`,
      );
    }
    byKey.set(reg.rendererKey, reg);
  }

  const seenIds = new Set<string>();
  return manifests.map((manifest) => {
    if (seenIds.has(manifest.id)) {
      throw new Error(`Tool ${manifest.id} has duplicate manifests.`);
    }
    seenIds.add(manifest.id);

    let component: ToolDefinition["component"] = null;
    let registration: BuiltinRegistration | undefined;
    if (manifest.builtinRenderer) {
      registration = byKey.get(manifest.builtinRenderer);
      // Don't throw — render a "missing renderer" placeholder in UI instead.
      component = registration?.component ?? null;
    }

    const { icon: iconKey, ...rest } = manifest;
    return {
      ...rest,
      iconKey,
      icon: iconForManifest(manifest, registration),
      component,
    };
  });
}
