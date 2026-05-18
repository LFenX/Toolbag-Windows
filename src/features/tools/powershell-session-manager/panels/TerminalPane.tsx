import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Copy, Eraser, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../../../../shared/ui/button";
import { terminalBus } from "../hooks/useManagerProtocol";
import type { SessionVM, UiPrefs } from "../state/types";

interface InstanceEntry {
  terminal: Terminal;
  fit: FitAddon;
  container: HTMLDivElement;
  unsubscribe: () => void;
  resizeObserver: ResizeObserver;
  bootstrapped: boolean;
}

interface TerminalPaneProps {
  session: SessionVM | null;
  prefs: UiPrefs;
  onSendInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  emptyContent?: React.ReactNode;
}

interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

const TERMINAL_THEMES: Record<"dark" | "midnight", TerminalTheme> = {
  dark: {
    background: "#0d1117",
    foreground: "#e6edf3",
    cursor: "#7dd3fc",
    cursorAccent: "#0d1117",
    selectionBackground: "#264f78",
    black: "#484f58",
    red: "#ff7b72",
    green: "#7ee787",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    white: "#b1bac4",
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#56d364",
    brightYellow: "#e3b341",
    brightBlue: "#79c0ff",
    brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd",
    brightWhite: "#f0f6fc",
  },
  midnight: {
    background: "#020617",
    foreground: "#e2e8f0",
    cursor: "#38bdf8",
    cursorAccent: "#020617",
    selectionBackground: "#1e3a8a",
    black: "#1e293b",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#facc15",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#cbd5e1",
    brightBlack: "#475569",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde047",
    brightBlue: "#93c5fd",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#f1f5f9",
  },
};

function pickTheme(prefs: UiPrefs): TerminalTheme {
  if (prefs.theme === "midnight") return TERMINAL_THEMES.midnight;
  return TERMINAL_THEMES.dark;
}

export function TerminalPane({
  session,
  prefs,
  onSendInput,
  onResize,
  emptyContent,
}: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instancesRef = useRef<Map<string, InstanceEntry>>(new Map());
  const activeIdRef = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const theme = useMemo(() => pickTheme(prefs), [prefs]);

  const sessionId = session?.id ?? null;
  const callActive = useCallback(
    (fn: (entry: InstanceEntry) => void): void => {
      if (!sessionId) return;
      const entry = instancesRef.current.get(sessionId);
      if (entry) fn(entry);
    },
    [sessionId],
  );

  // Tear down all instances when component unmounts.
  useEffect(() => {
    const instances = instancesRef.current;
    return () => {
      for (const entry of instances.values()) {
        entry.unsubscribe();
        entry.resizeObserver.disconnect();
        entry.terminal.dispose();
        entry.container.remove();
      }
      instances.clear();
    };
  }, []);

  // Apply theme/font changes to all existing terminals.
  useEffect(() => {
    for (const entry of instancesRef.current.values()) {
      entry.terminal.options.theme = theme;
      entry.terminal.options.fontFamily = prefs.fontFamily;
      entry.terminal.options.fontSize = prefs.fontSize;
      try {
        entry.fit.fit();
      } catch {
        // size 0 when not visible
      }
    }
  }, [theme, prefs.fontFamily, prefs.fontSize]);

  // Activate the right terminal when session changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const prevActive = activeIdRef.current;
    if (prevActive && prevActive !== session?.id) {
      const prevEntry = instancesRef.current.get(prevActive);
      if (prevEntry) {
        prevEntry.container.style.display = "none";
      }
    }
    activeIdRef.current = session?.id ?? null;
    if (!session) return;

    let entry = instancesRef.current.get(session.id);
    if (!entry) {
      entry = createInstance({
        host,
        session,
        prefs,
        theme,
        onSendInput,
        onResize,
      });
      instancesRef.current.set(session.id, entry);
    }
    entry.container.style.display = "block";
    try {
      entry.fit.fit();
    } catch {
      // ignore
    }
    entry.terminal.focus();
    if (!entry.bootstrapped) {
      if (session.recentOutput) {
        entry.terminal.write(session.recentOutput);
      }
      entry.bootstrapped = true;
    }
  }, [session, theme, prefs, onResize, onSendInput]);

  // Drop instances for removed sessions.
  useEffect(() => {
    if (!session) return;
    // session changes are the trigger; nothing extra to do beyond keeping
    // instances around for sessions that still exist. Removal cleanup happens
    // when a session is removed externally — we listen via a separate effect.
  }, [session]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      // Sweep instances whose sessions are gone: any instance whose id is not
      // in the live store is destroyed. Cheap once per second.
      const liveIds = new Set<string>();
      if (activeIdRef.current) liveIds.add(activeIdRef.current);
      // We don't have direct access to all sessions here; rely on parent
      // calling our handle via unmounting via key — but in the IDE layout
      // we keep one TerminalPane. So we keep instances until tab closes from
      // SessionTabBar onClose which calls killSession; on session.removed the
      // store drops the id and parent re-renders with a different active.
      // Implement a stale-instance trim by checking DOM membership.
      for (const [id, entry] of instancesRef.current.entries()) {
        if (!entry.container.isConnected) {
          entry.unsubscribe();
          entry.resizeObserver.disconnect();
          entry.terminal.dispose();
          instancesRef.current.delete(id);
        }
      }
    }, 5000);
    return () => { window.clearInterval(interval); };
  }, []);

  return (
    <div className="flex h-full flex-col bg-[var(--ps-terminal-bg,#0d1117)]" data-terminal-scope="true">
      <div className="flex items-center gap-1 border-b border-border/60 bg-card/30 px-2 py-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={!session}
          onClick={() => {
            callActive((entry) => {
              const selection = entry.terminal.getSelection();
              if (selection) {
                void navigator.clipboard.writeText(selection);
              }
            });
          }}
          title="复制选区 (Ctrl+Shift+C)"
        >
          <Copy className="size-3.5" aria-hidden="true" />
          复制
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!session}
          onClick={() => {
            callActive((entry) => { entry.terminal.clear(); });
          }}
          title="清屏 (不清除滚动缓冲)"
        >
          <Eraser className="size-3.5" aria-hidden="true" />
          清屏
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!session}
          onClick={() => {
            setShowSearch((v) => !v);
          }}
          title="查找"
        >
          <Search className="size-3.5" aria-hidden="true" />
          查找
        </Button>
        {showSearch && (
          <input
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); }}
            placeholder="在终端中查找…"
            className="ml-2 h-7 w-56 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                callActive((entry) => {
                  const buffer = entry.terminal.buffer.active;
                  const needle = searchQuery.toLowerCase();
                  let found = -1;
                  for (let i = buffer.length - 1; i >= 0; i -= 1) {
                    const line = buffer.getLine(i)?.translateToString() ?? "";
                    if (line.toLowerCase().includes(needle)) {
                      found = i;
                      break;
                    }
                  }
                  if (found >= 0) {
                    entry.terminal.scrollToLine(found);
                  }
                });
              } else if (event.key === "Escape") {
                setShowSearch(false);
              }
            }}
          />
        )}
      </div>
      <div ref={hostRef} className="relative min-h-0 flex-1">
        {!session && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            {emptyContent ?? "选择或创建一个会话"}
          </div>
        )}
      </div>
    </div>
  );
}

function createInstance({
  host,
  session,
  prefs,
  theme,
  onSendInput,
  onResize,
}: {
  host: HTMLDivElement;
  session: SessionVM;
  prefs: UiPrefs;
  theme: TerminalTheme;
  onSendInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
}): InstanceEntry {
  const container = document.createElement("div");
  container.className = "absolute inset-0 px-2 py-2";
  container.style.display = "none";
  host.appendChild(container);

  const terminal = new Terminal({
    allowProposedApi: true,
    convertEol: false,
    cursorBlink: true,
    cursorStyle: "bar",
    fontFamily: prefs.fontFamily,
    fontSize: prefs.fontSize,
    lineHeight: 1.2,
    letterSpacing: 0,
    scrollback: 5000,
    macOptionIsMeta: true,
    rightClickSelectsWord: true,
    theme,
    allowTransparency: false,
  });

  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);
  try {
    fit.fit();
  } catch {
    // ignore
  }

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    // Ctrl+Shift+C → copy
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c") {
      const selection = terminal.getSelection();
      if (selection) {
        void navigator.clipboard.writeText(selection);
        return false;
      }
    }
    // Ctrl+Shift+V → paste
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v") {
      void navigator.clipboard.readText().then((text) => {
        if (text) terminal.paste(text);
      });
      return false;
    }
    return true;
  });

  const dataDisposable = terminal.onData((data) => {
    onSendInput(session.id, data);
  });
  const resizeDisposable = terminal.onResize((size) => {
    onResize(session.id, size.cols, size.rows);
  });
  const titleDisposable = terminal.onTitleChange((title) => {
    container.dataset.title = title;
  });

  const unsubscribeBus = terminalBus.subscribe(session.id, (chunk) => {
    terminal.write(chunk);
  });

  const resizeObserver = new ResizeObserver(() => {
    try {
      fit.fit();
    } catch {
      // size 0 when hidden
    }
  });
  resizeObserver.observe(container);

  const unsubscribe = () => {
    dataDisposable.dispose();
    resizeDisposable.dispose();
    titleDisposable.dispose();
    unsubscribeBus();
  };

  return {
    terminal,
    fit,
    container,
    unsubscribe,
    resizeObserver,
    bootstrapped: false,
  };
}
