import { Plus, RefreshCw, Settings2, Square, Radio } from "lucide-react";

import { Badge } from "../../../../shared/ui/badge";
import { Button } from "../../../../shared/ui/button";

interface ToolbarProps {
  runningCount: number;
  livingProcesses: number;
  sidecarExited: boolean;
  onNewSession: () => void;
  onStopAll: () => void;
  onRestartAll: () => void;
  onBroadcast: () => void;
  onOpenSettings: () => void;
  onRebootSidecar: () => void;
}

export function Toolbar({
  runningCount,
  livingProcesses,
  sidecarExited,
  onNewSession,
  onStopAll,
  onRestartAll,
  onBroadcast,
  onOpenSettings,
  onRebootSidecar,
}: ToolbarProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onNewSession}>
          <Plus className="size-4" aria-hidden="true" />
          新会话
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRestartAll}
          disabled={runningCount === 0}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          重启全部
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onStopAll}
          disabled={runningCount === 0}
        >
          <Square className="size-4" aria-hidden="true" />
          停止全部
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onBroadcast}
          disabled={runningCount < 2}
          title="向所有运行中的会话广播一条命令"
        >
          <Radio className="size-4" aria-hidden="true" />
          广播
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">
          <span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />
          {runningCount} 会话
        </Badge>
        <Badge variant="outline" title="命令库中由保存的命令派生的、仍在运行的进程数">
          <span className="mr-1 inline-block size-2 rounded-full bg-sky-500" />
          {livingProcesses} 活进程
        </Badge>
        {sidecarExited && (
          <Button size="sm" variant="destructive" onClick={onRebootSidecar}>
            sidecar 已退出 · 点击重启
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={onOpenSettings}
          aria-label="设置"
        >
          <Settings2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
