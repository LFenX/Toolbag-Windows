import { Button } from "../../../../shared/ui/button";
import { Input } from "../../../../shared/ui/input";
import type { ShellInfo, UiPrefs } from "../state/types";

import { Modal } from "./Modal";

interface SettingsDialogProps {
  prefs: UiPrefs;
  shell: ShellInfo;
  onChange: (patch: Partial<UiPrefs>) => void;
  onClose: () => void;
}

export function SettingsDialog({
  prefs,
  shell,
  onChange,
  onClose,
}: SettingsDialogProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title="终端设置"
      description="所有设置保存在本机；改动立即生效，新会话与活动会话都会同步。"
      footer={
        <Button size="sm" onClick={onClose}>
          完成
        </Button>
      }
    >
      <div className="space-y-3 text-sm">
        <Field
          label="默认 Shell 路径"
          hint={`已检测到：${shell.detected ?? "未找到 PowerShell"}${shell.version ? ` · ${shell.version}` : ""}`}
        >
          <Input
            value={prefs.defaultShellPath ?? ""}
            placeholder={shell.detected ?? "pwsh.exe"}
            onChange={(event) =>
              { onChange({ defaultShellPath: event.target.value.trim() || null }); }
            }
          />
        </Field>
        <Field label="默认工作目录" hint="新建会话时若未指定 cwd，则使用此目录。">
          <Input
            value={prefs.defaultCwd ?? ""}
            placeholder="留空则继承当前进程目录"
            onChange={(event) =>
              { onChange({ defaultCwd: event.target.value.trim() || null }); }
            }
          />
        </Field>
        <label className="flex items-start gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={prefs.loadProfile}
            onChange={(event) => { onChange({ loadProfile: event.target.checked }); }}
            className="mt-0.5"
          />
          <span>新建会话默认加载用户 $PROFILE（PSReadLine、别名、补全等）</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="字体">
            <select
              value={prefs.fontFamily}
              onChange={(event) => { onChange({ fontFamily: event.target.value }); }}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm"
            >
              <option value='Cascadia Mono, Consolas, "JetBrains Mono", "SFMono-Regular", monospace'>
                Cascadia / Consolas
              </option>
              <option value='"JetBrains Mono", Consolas, monospace'>JetBrains Mono</option>
              <option value='"Fira Code", Consolas, monospace'>Fira Code</option>
              <option value='Consolas, "Cascadia Mono", monospace'>Consolas</option>
            </select>
          </Field>
          <Field label="字号">
            <select
              value={prefs.fontSize}
              onChange={(event) => { onChange({ fontSize: Number(event.target.value) }); }}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm"
            >
              {[11, 12, 13, 14, 15, 16, 18].map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="终端主题">
          <select
            value={prefs.theme}
            onChange={(event) =>
              { onChange({ theme: event.target.value as UiPrefs["theme"] }); }
            }
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm"
          >
            <option value="dark">GitHub Dark</option>
            <option value="midnight">Midnight</option>
            <option value="follow">跟随应用 (与 dark 等价)</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
