import { useState } from "react";

import { Button } from "../../../../shared/ui/button";
import { Input } from "../../../../shared/ui/input";
import type { UiPrefs } from "../state/types";

import { Modal } from "./Modal";

interface NewSessionDialogProps {
  prefs: UiPrefs;
  onCancel: () => void;
  onConfirm: (data: {
    name: string;
    cwd: string | null;
    command: string | null;
    shellPath: string | null;
    loadProfile: boolean;
  }) => void;
}

export function NewSessionDialog({
  prefs,
  onCancel,
  onConfirm,
}: NewSessionDialogProps) {
  const [name, setName] = useState("PowerShell");
  const [cwd, setCwd] = useState(prefs.defaultCwd ?? "");
  const [shellPath, setShellPath] = useState(prefs.defaultShellPath ?? "");
  const [command, setCommand] = useState("");
  const [loadProfile, setLoadProfile] = useState(prefs.loadProfile);

  return (
    <Modal
      open
      onClose={onCancel}
      title="新建 PowerShell 会话"
      description="启动一个新的 PowerShell PTY，可选指定工作目录和初始命令。"
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onConfirm({
                name: name.trim() || "PowerShell",
                cwd: cwd.trim() || null,
                shellPath: shellPath.trim() || null,
                command: command.trim() || null,
                loadProfile,
              });
            }}
          >
            创建
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Field label="会话名称">
          <Input value={name} onChange={(event) => { setName(event.target.value); }} />
        </Field>
        <Field label="工作目录 (可选)" hint="留空则继承当前进程的工作目录。">
          <Input
            value={cwd}
            placeholder="C:\\repo\\my-project"
            onChange={(event) => { setCwd(event.target.value); }}
          />
        </Field>
        <Field
          label="Shell 路径 (可选)"
          hint="默认按检测顺序使用 pwsh.exe → powershell.exe。"
        >
          <Input
            value={shellPath}
            placeholder="pwsh.exe"
            onChange={(event) => { setShellPath(event.target.value); }}
          />
        </Field>
        <Field label="初始命令 (可选)" hint="作为第一条输入推入 shell，常用于启动开发服务。">
          <textarea
            value={command}
            onChange={(event) => { setCommand(event.target.value); }}
            rows={3}
            placeholder="npm run dev"
            className="min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs text-foreground shadow-sm focus:border-ring"
          />
        </Field>
        <label className="flex items-start gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={loadProfile}
            onChange={(event) => { setLoadProfile(event.target.checked); }}
            className="mt-0.5"
          />
          <span>
            加载用户 $PROFILE（关闭则启动更快但少了别名、补全等自定义）
          </span>
        </label>
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
