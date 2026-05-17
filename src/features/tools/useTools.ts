import { useQuery } from "@tanstack/react-query";

import { listTools } from "../../shared/tauri/commands";
import { localToolRegistry } from "./registry";
import type { ToolDefinition } from "./types";

export function useTools() {
  return useQuery({
    queryKey: ["tools"],
    queryFn: async (): Promise<ToolDefinition[]> => {
      const manifests = await listTools();

      return manifests.map((manifest) => {
        const localTool = localToolRegistry.find((tool) => tool.id === manifest.id);
        if (!localTool) {
          throw new Error(`Tool ${manifest.id} is missing a frontend component.`);
        }

        return {
          ...manifest,
          icon: localTool.icon,
          component: localTool.component,
        };
      });
    },
  });
}
