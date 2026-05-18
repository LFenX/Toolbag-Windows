import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  installPluginFromRegistry,
  listRegistryPlugins,
} from "../../shared/tauri/plugins";

export function useRegistry(forceRefresh = false) {
  return useQuery({
    queryKey: ["registry", forceRefresh],
    queryFn: () => listRegistryPlugins(forceRefresh),
    staleTime: 60_000,
  });
}

export function useRefreshRegistry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => listRegistryPlugins(true),
    onSuccess: (registry) => {
      qc.setQueryData(["registry", false], registry);
      qc.setQueryData(["registry", true], registry);
      qc.setQueryData(["registry-passive"], registry);
    },
  });
}

export function useInstallPlugin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pluginId: string) => installPluginFromRegistry(pluginId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tools"] });
      void qc.invalidateQueries({ queryKey: ["registry"] });
    },
  });
}
