import { useQuery } from "@tanstack/react-query";

import { listTools } from "../../shared/tauri/commands";
import { composeToolDefinitions } from "./registry";
import type { ToolDefinition } from "./types";

export function useTools() {
  return useQuery({
    queryKey: ["tools"],
    queryFn: async (): Promise<ToolDefinition[]> => {
      const manifests = await listTools();
      return composeToolDefinitions(manifests);
    },
  });
}
