import {
  Boxes,
  Code2,
  Globe2,
  HardDrive,
  MonitorCog,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { EnvironmentOverviewTool } from "./environment-overview/EnvironmentOverviewTool";
import type { ToolManifest } from "../../shared/tauri/types";
import type { BuiltinRegistration, ToolDefinition } from "./types";

export const builtinRegistry: BuiltinRegistration[] = [
  {
    rendererKey: "environment-overview",
    icon: MonitorCog,
    component: EnvironmentOverviewTool,
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
    if (manifest.runtimeKind === "builtin") {
      const key = manifest.builtinRenderer ?? "";
      registration = byKey.get(key);
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
