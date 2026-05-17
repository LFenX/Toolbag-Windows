import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  Copy,
  Play,
  Plus,
  RefreshCw,
  Save,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "../../../shared/lib/utils";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import {
  type PluginSidecarEvent,
  usePluginSession,
} from "../runtime/usePluginSession";
import {
  POWERSHELL_SESSION_MANAGER_PLUGIN_ID,
  usePowerShellActivityStore,
} from "./activity-store";

type SessionStatus = "running" | "exited" | "failed";

interface ShellInfo {
  detected: string | null;
  candidates: string[];
  error?: string | null;
}

interface ManagedSession {
  id: string;
  name: string;
  command?: string | null;
  cwd?: string | null;
  shellPath?: string | null;
  status: SessionStatus;
  exitCode?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  recentOutput?: string;
}

interface SavedCommand {
  id: string;
  name: string;
  command: string;
  cwd?: string | null;
  note?: string | null;
  tags?: string[];
  shellPath?: string | null;
  stopTimeoutMs?: number | null;
}

interface CommandGroup {
  id: string;
  name: string;
  commandIds: string[];
}

interface BootPayload {
  sessions?: ManagedSession[];
  commands?: SavedCommand[];
  groups?: CommandGroup[];
  shell?: ShellInfo;
}

interface TerminalChunk {
  sessionId: string;
  data: string;
  seq: number;
}

const EMPTY_SHELL: ShellInfo = { detected: null, candidates: [] };
const DEFAULT_STOP_TIMEOUT_MS = 3000;
const RECENT_OUTPUT_LIMIT = 200_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function appendRecent(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= RECENT_OUTPUT_LIMIT) return next;
  return next.slice(next.length - RECENT_OUTPUT_LIMIT);
}

function normalizeSession(value: unknown): ManagedSession | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : "PowerShell",
    command: typeof value.command === "string" ? value.command : null,
    cwd: typeof value.cwd === "string" ? value.cwd : null,
    shellPath: typeof value.shellPath === "string" ? value.shellPath : null,
    status:
      value.status === "exited" || value.status === "failed"
        ? value.status
        : "running",
    exitCode: typeof value.exitCode === "number" ? value.exitCode : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    recentOutput:
      typeof value.recentOutput === "string" ? value.recentOutput : "",
  };
}

function normalizeCommand(value: unknown): SavedCommand | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.command !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    command: value.command,
    cwd: typeof value.cwd === "string" ? value.cwd : null,
    note: typeof value.note === "string" ? value.note : null,
    shellPath: typeof value.shellPath === "string" ? value.shellPath : null,
    stopTimeoutMs:
      typeof value.stopTimeoutMs === "number"
        ? value.stopTimeoutMs
        : DEFAULT_STOP_TIMEOUT_MS,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

function normalizeGroup(value: unknown): CommandGroup | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    commandIds: Array.isArray(value.commandIds)
      ? value.commandIds.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

function readBootPayload(value: unknown): BootPayload {
  if (!isRecord(value)) return {};
  return {
    sessions: Array.isArray(value.sessions)
      ? value.sessions
          .map(normalizeSession)
          .filter((entry): entry is ManagedSession => entry !== null)
      : [],
    commands: Array.isArray(value.commands)
      ? value.commands
          .map(normalizeCommand)
          .filter((entry): entry is SavedCommand => entry !== null)
      : [],
    groups: Array.isArray(value.groups)
      ? value.groups
          .map(normalizeGroup)
          .filter((entry): entry is CommandGroup => entry !== null)
      : [],
    shell: isRecord(value.shell)
      ? {
          detected:
            typeof value.shell.detected === "string" ? value.shell.detected : null,
          candidates: Array.isArray(value.shell.candidates)
            ? value.shell.candidates.filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [],
          error: typeof value.shell.error === "string" ? value.shell.error : null,
        }
      : EMPTY_SHELL,
  };
}

export function PowerShellSessionManagerTool() {
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [commands, setCommands] = useState<SavedCommand[]>([]);
  const [groups, setGroups] = useState<CommandGroup[]>([]);
  const [shell, setShell] = useState<ShellInfo>(EMPTY_SHELL);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [terminalChunk, setTerminalChunk] = useState<TerminalChunk | null>(null);
  const [sidecarExited, setSidecarExited] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    name: "PowerShell",
    command: "",
    cwd: "",
  });
  const [commandDraft, setCommandDraft] = useState({
    name: "",
    command: "",
    cwd: "",
    note: "",
    tags: "",
  });
  const seqRef = useRef(0);
  const setActiveSessionCount = usePowerShellActivityStore(
    (state) => state.setActiveSessionCount,
  );

  const applyBoot = useCallback((payload: unknown) => {
    const boot = readBootPayload(payload);
    setSessions(boot.sessions ?? []);
    setCommands(boot.commands ?? []);
    setGroups(boot.groups ?? []);
    setShell(boot.shell ?? EMPTY_SHELL);
    setSidecarExited(false);
    setActiveSessionId((current) => {
      if (current && boot.sessions?.some((session) => session.id === current)) {
        return current;
      }
      return boot.sessions?.[0]?.id ?? null;
    });
  }, []);

  const upsertSession = useCallback((session: ManagedSession) => {
    setSessions((current) => {
      const index = current.findIndex((entry) => entry.id === session.id);
      if (index < 0) return [...current, session];
      const next = [...current];
      next[index] = { ...next[index], ...session };
      return next;
    });
    setActiveSessionId((current) => current ?? session.id);
  }, []);

  const handleSidecarEvent = useCallback(
    (event: PluginSidecarEvent) => {
      if (event.event === "manager.state") {
        applyBoot(event.data);
        return;
      }
      if (event.event === "manager.sidecarExit") {
        setSidecarExited(true);
        setSessions((current) =>
          current.map((session) => ({ ...session, status: "failed" })),
        );
        setActiveSessionCount(0);
        return;
      }
      if (event.event === "session.created" || event.event === "session.updated") {
        const session = normalizeSession(event.data);
        if (session) upsertSession(session);
        return;
      }
      if (event.event === "session.removed") {
        if (!isRecord(event.data) || typeof event.data.sessionId !== "string") return;
        const sessionId = event.data.sessionId;
        setSessions((current) =>
          current.filter((session) => session.id !== sessionId),
        );
        setActiveSessionId((current) =>
          current === sessionId ? null : current,
        );
        return;
      }
      if (event.event === "session.exited") {
        if (!isRecord(event.data) || typeof event.data.sessionId !== "string") return;
        const sessionId = event.data.sessionId;
        const exitCode =
          typeof event.data.exitCode === "number" ? event.data.exitCode : null;
        setSessions((current) =>
          current.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  status: "exited",
                  exitCode: exitCode ?? session.exitCode,
                }
              : session,
          ),
        );
        return;
      }
      if (event.event === "terminal.output") {
        if (
          !isRecord(event.data) ||
          typeof event.data.sessionId !== "string" ||
          typeof event.data.data !== "string"
        ) {
          return;
        }
        const chunk: TerminalChunk = {
          sessionId: event.data.sessionId,
          data: event.data.data,
          seq: seqRef.current + 1,
        };
        seqRef.current = chunk.seq;
        setTerminalChunk(chunk);
        setSessions((current) =>
          current.map((session) =>
            session.id === chunk.sessionId
              ? {
                  ...session,
                  recentOutput: appendRecent(session.recentOutput ?? "", chunk.data),
                }
              : session,
          ),
        );
        return;
      }
      if (event.event === "commands.changed") {
        if (Array.isArray(event.data)) {
          setCommands(
            event.data
              .map(normalizeCommand)
              .filter((entry): entry is SavedCommand => entry !== null),
          );
        }
      }
    },
    [applyBoot, setActiveSessionCount, upsertSession],
  );

  const { start, sendFrame } = usePluginSession(POWERSHELL_SESSION_MANAGER_PLUGIN_ID, {
    autoShutdown: false,
    onEvent: handleSidecarEvent,
  });

  useEffect(() => {
    void start("manager.boot", {});
  }, [start]);

  const activeCount = useMemo(
    () => sessions.filter((entry) => entry.status === "running").length,
    [sessions],
  );
  useEffect(() => {
    setActiveSessionCount(activeCount);
    return () => { setActiveSessionCount(0); };
  }, [activeCount, setActiveSessionCount]);

  const activeSession =
    sessions.find((entry) => entry.id === activeSessionId) ??
    sessions.at(0) ??
    null;

  const runRequest = useCallback(
    async (command: string, params: Record<string, unknown>) => {
      await start(command, params);
    },
    [start],
  );

  const createSession = async () => {
    await runRequest("session.create", {
      name: createDraft.name.trim() || "PowerShell",
      command: createDraft.command.trim() || null,
      cwd: createDraft.cwd.trim() || null,
    });
    setCreateDraft((draft) => ({ ...draft, command: "" }));
  };

  const saveCommand = async () => {
    if (!commandDraft.name.trim() || !commandDraft.command.trim()) return;
    await runRequest("command.save", {
      name: commandDraft.name.trim(),
      command: commandDraft.command.trim(),
      cwd: commandDraft.cwd.trim() || null,
      note: commandDraft.note.trim() || null,
      tags: commandDraft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      stopTimeoutMs: DEFAULT_STOP_TIMEOUT_MS,
    });
    setCommandDraft({ name: "", command: "", cwd: "", note: "", tags: "" });
  };

  const restartSidecar = async () => {
    setSidecarExited(false);
    await runRequest("manager.boot", {});
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)_320px] gap-3 max-xl:grid-cols-[260px_minmax(0,1fr)] max-lg:grid-cols-1">
      <aside className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-soft">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">PowerShell 会话</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activeCount} 个运行中
            </p>
          </div>
          <Badge variant={sidecarExited ? "warning" : "success"}>
            {sidecarExited ? "已退出" : "在线"}
          </Badge>
        </header>

        {sidecarExited && (
          <div className="border-b border-border bg-destructive/5 p-3 text-xs text-destructive">
            <p>sidecar 已退出，所有会话已停止。</p>
            <Button size="sm" className="mt-2" onClick={() => { void restartSidecar(); }}>
              <RefreshCw className="size-4" aria-hidden="true" />
              重启
            </Button>
          </div>
        )}

        <div className="space-y-2 border-b border-border p-3">
          <Input
            value={createDraft.name}
            onChange={(event) =>
              { setCreateDraft((draft) => ({ ...draft, name: event.target.value })); }
            }
            placeholder="会话名称"
          />
          <Input
            value={createDraft.cwd}
            onChange={(event) =>
              { setCreateDraft((draft) => ({ ...draft, cwd: event.target.value })); }
            }
            placeholder="工作目录"
          />
          <textarea
            value={createDraft.command}
            onChange={(event) =>
              { setCreateDraft((draft) => ({ ...draft, command: event.target.value })); }
            }
            placeholder="启动命令，可留空"
            rows={3}
            className="min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs shadow-sm focus:border-ring"
          />
          <Button size="sm" className="w-full" onClick={() => { void createSession(); }}>
            <Plus className="size-4" aria-hidden="true" />
            新建会话
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              还没有会话。创建一个空会话，或从右侧命令库运行常用命令。
            </p>
          ) : (
            sessions.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setActiveSessionId(entry.id); }}
                className={cn(
                  "mb-1 flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                  activeSession?.id === entry.id
                    ? "border-primary/50 bg-secondary text-secondary-foreground"
                    : "border-transparent hover:border-border hover:bg-muted",
                )}
              >
                <TerminalSquare className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{entry.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {entry.cwd ?? shell.detected ?? "PowerShell"}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-1 size-2 rounded-full",
                    entry.status === "running" ? "bg-emerald-500" : "bg-muted-foreground",
                  )}
                  aria-hidden="true"
                />
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {activeSession?.name ?? "终端"}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {activeSession?.command ??
                activeSession?.cwd ??
                shell.detected ??
                "等待会话"}
            </p>
          </div>
          {activeSession && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(activeSession.command ?? "");
                }}
              >
                <Copy className="size-4" aria-hidden="true" />
                复制命令
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void runRequest("session.restart", { sessionId: activeSession.id });
                }}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                重启
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  void runRequest("session.kill", { sessionId: activeSession.id });
                }}
              >
                <Square className="size-4" aria-hidden="true" />
                停止
              </Button>
            </div>
          )}
        </header>
        <div
          className="min-h-0 flex-1 bg-[#0d1117]"
          data-terminal-scope="true"
        >
          {activeSession ? (
            <TerminalPane
              key={activeSession.id}
              session={activeSession}
              chunk={terminalChunk}
              sendFrame={sendFrame}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-slate-400">
              选择或创建一个会话
            </div>
          )}
        </div>
      </main>

      <aside className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-soft max-xl:col-span-2 max-lg:col-span-1">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">命令库</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            保存常用命令、工作目录和备注。
          </p>
        </header>
        <div className="space-y-2 border-b border-border p-3">
          <Input
            value={commandDraft.name}
            onChange={(event) =>
              { setCommandDraft((draft) => ({ ...draft, name: event.target.value })); }
            }
            placeholder="命令名称"
          />
          <Input
            value={commandDraft.cwd}
            onChange={(event) =>
              { setCommandDraft((draft) => ({ ...draft, cwd: event.target.value })); }
            }
            placeholder="工作目录"
          />
          <textarea
            value={commandDraft.command}
            onChange={(event) =>
              { setCommandDraft((draft) => ({ ...draft, command: event.target.value })); }
            }
            placeholder="powershell 命令"
            rows={3}
            className="min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs shadow-sm focus:border-ring"
          />
          <Input
            value={commandDraft.tags}
            onChange={(event) =>
              { setCommandDraft((draft) => ({ ...draft, tags: event.target.value })); }
            }
            placeholder="标签，逗号分隔"
          />
          <textarea
            value={commandDraft.note}
            onChange={(event) =>
              { setCommandDraft((draft) => ({ ...draft, note: event.target.value })); }
            }
            placeholder="备注"
            rows={2}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs shadow-sm focus:border-ring"
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!commandDraft.name.trim() || !commandDraft.command.trim()}
            onClick={() => { void saveCommand(); }}
          >
            <Save className="size-4" aria-hidden="true" />
            保存命令
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {commands.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">命令库为空。</p>
          ) : (
            commands.map((entry) => (
              <div
                key={entry.id}
                className="mb-2 rounded-md border border-border bg-background/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">{entry.name}</h3>
                    <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground">
                      {entry.command}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void runRequest("command.run", { commandId: entry.id });
                      }}
                    >
                      <Play className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        void runRequest("command.delete", { commandId: entry.id });
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                {entry.note && (
                  <p className="mt-2 text-xs text-muted-foreground">{entry.note}</p>
                )}
              </div>
            ))
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>{groups.length} 个任务组</span>
          <span className="truncate">{shell.detected ?? shell.error ?? "未探测 shell"}</span>
        </footer>
      </aside>
    </div>
  );
}

const TerminalPane = memo(function TerminalPane({
  session,
  chunk,
  sendFrame,
}: {
  session: ManagedSession;
  chunk: TerminalChunk | null;
  sendFrame: (frame: Record<string, unknown>) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const initialOutputRef = useRef(session.recentOutput ?? "");

  useEffect(() => {
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        'Cascadia Mono, Consolas, "JetBrains Mono", "SFMono-Regular", monospace',
      fontSize: 13,
      letterSpacing: 0,
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#7dd3fc",
        selectionBackground: "#264f78",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminalRef.current = terminal;
    fitRef.current = fit;
    if (containerRef.current) {
      terminal.open(containerRef.current);
      fit.fit();
      if (initialOutputRef.current) {
        terminal.write(initialOutputRef.current);
      }
      terminal.focus();
    }
    const dataDisposable = terminal.onData((data) => {
      void sendFrame({
        type: "terminal.input",
        sessionId: session.id,
        data,
      });
    });
    const resizeDisposable = terminal.onResize((size) => {
      void sendFrame({
        type: "terminal.resize",
        sessionId: session.id,
        cols: size.cols,
        rows: size.rows,
      });
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => {
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [sendFrame, session.id]);

  useEffect(() => {
    if (chunk?.sessionId !== session.id) return;
    terminalRef.current?.write(chunk.data);
  }, [chunk, session.id]);

  return <div ref={containerRef} className="h-full w-full p-2" />;
});
