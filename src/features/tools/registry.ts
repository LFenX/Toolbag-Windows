import { MonitorCog } from "lucide-react";

import { EnvironmentOverviewTool } from "./environment-overview/EnvironmentOverviewTool";
import type { ToolManifest } from "../../shared/tauri/types";
import type { LocalToolRegistration, ToolDefinition } from "./types";

export const localToolRegistry: LocalToolRegistration[] = [
  {
    id: "environment-overview",
    icon: MonitorCog,
    component: EnvironmentOverviewTool,
  },
];

export function composeToolDefinitions(
  manifests: ToolManifest[],
  localRegistrations: LocalToolRegistration[] = localToolRegistry,
): ToolDefinition[] {
  const registrationsById = new Map<string, LocalToolRegistration>();

  for (const registration of localRegistrations) {
    if (registrationsById.has(registration.id)) {
      throw new Error(`Tool ${registration.id} has duplicate frontend registrations.`);
    }
    registrationsById.set(registration.id, registration);
  }

  const manifestIds = new Set<string>();
  const definitions = manifests.map((manifest) => {
    if (manifestIds.has(manifest.id)) {
      throw new Error(`Tool ${manifest.id} has duplicate manifests.`);
    }
    manifestIds.add(manifest.id);

    const localTool = registrationsById.get(manifest.id);
    if (!localTool) {
      throw new Error(`Tool ${manifest.id} is missing a frontend component.`);
    }

    return {
      ...manifest,
      icon: localTool.icon,
      component: localTool.component,
    };
  });

  for (const registration of localRegistrations) {
    if (!manifestIds.has(registration.id)) {
      throw new Error(`Tool ${registration.id} is missing a manifest.`);
    }
  }

  return definitions;
}
