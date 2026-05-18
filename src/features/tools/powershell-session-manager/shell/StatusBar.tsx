import { Clock, Cpu, FolderSearch, HardDrive } from "lucide-react";
import { useEffect, useState } from "react";

import type { SessionVM, ShellInfo } from "../state/types";

interface StatusBarProps {
  session: SessionVM | null;
  shell: ShellInfo;
}

function formatUptime(ms: number): string {
  if (ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function StatusBar({ session, shell }: StatusBarProps) {
  const [now, setNow] = useState(() => Date.now());
  const isRunning = session?.status === "running";
  useEffect(() => {
    if (!isRunning) return;
    const handle = window.setInterval(() => { setNow(Date.now()); }, 1000);
    return () => { window.clearInterval(handle); };
  }, [isRunning]);

  if (!session) {
    return (
      <footer className="flex items-center gap-3 border-t border-border bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <HardDrive className="size-3" aria-hidden="true" />
          {shell.detected ?? "未检测到 PowerShell"}
        </span>
        {shell.version && <span>{shell.version}</span>}
        <span className="ml-auto">无活动会话</span>
      </footer>
    );
  }

  const uptime =
    session.status === "running" ? formatUptime(now - session.startedAtMs) : "—";

  return (
    <footer className="flex items-center gap-4 border-t border-border bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1" title={session.shellPath}>
        <HardDrive className="size-3" aria-hidden="true" />
        {session.shellVersion ?? session.shellPath}
      </span>
      <span className="flex items-center gap-1">
        <Cpu className="size-3" aria-hidden="true" />
        PID {session.pid > 0 ? String(session.pid) : "—"}
      </span>
      <span className="flex items-center gap-1" title={session.cwd ?? "默认目录"}>
        <FolderSearch className="size-3" aria-hidden="true" />
        {session.cwd ?? "默认目录"}
      </span>
      <span className="flex items-center gap-1">
        <Clock className="size-3" aria-hidden="true" />
        {uptime}
      </span>
      <span className="ml-auto">
        {session.status === "running"
          ? "运行中"
          : session.exitCode != null
            ? `已退出 (${String(session.exitCode)})`
            : "已退出"}
      </span>
    </footer>
  );
}
