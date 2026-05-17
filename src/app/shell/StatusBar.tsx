import { useQuery } from "@tanstack/react-query";
import { Activity, ShieldCheck, Wifi, WifiOff } from "lucide-react";

import { getAppInfo, getSignatureStatus } from "../../shared/tauri/commands";

interface StatusBarProps {
  updatablePluginCount: number;
  online: boolean;
}

export function StatusBar({
  updatablePluginCount,
  online,
}: StatusBarProps) {
  const { data: appInfo } = useQuery({ queryKey: ["app-info"], queryFn: getAppInfo });
  const { data: signature } = useQuery({
    queryKey: ["signature"],
    queryFn: getSignatureStatus,
  });

  return (
    <footer className="flex h-7 items-center gap-4 border-t border-border bg-sidebar px-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Activity className="size-3" aria-hidden="true" />
        Toolbag {appInfo?.version ?? "—"}
      </span>
      <span>·</span>
      <span className="flex items-center gap-1.5">
        <ShieldCheck className="size-3" aria-hidden="true" />
        {signature?.enforced ? "签名校验已启用" : "签名校验未启用"}
      </span>
      <span>·</span>
      <span>无遥测</span>
      {updatablePluginCount > 0 && (
        <>
          <span>·</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
            {updatablePluginCount} 个插件可更新
          </span>
        </>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        {online ? (
          <Wifi className="size-3" aria-hidden="true" />
        ) : (
          <WifiOff className="size-3 text-amber-500" aria-hidden="true" />
        )}
        {online ? "联网" : "离线"}
      </span>
    </footer>
  );
}
