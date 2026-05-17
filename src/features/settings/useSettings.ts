import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSettings, saveSettings } from "../../shared/tauri/commands";
import type { AppSettings } from "../../shared/tauri/types";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData<AppSettings>(["settings"], settings);
    },
  });
}
