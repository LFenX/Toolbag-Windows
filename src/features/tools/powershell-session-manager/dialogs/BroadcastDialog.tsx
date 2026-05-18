import { useState } from "react";

import { Button } from "../../../../shared/ui/button";

import { Modal } from "./Modal";

interface BroadcastDialogProps {
  runningCount: number;
  onCancel: () => void;
  onSend: (text: string) => Promise<void>;
}

export function BroadcastDialog({
  runningCount,
  onCancel,
  onSend,
}: BroadcastDialogProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onCancel}
      title="向所有运行中会话广播"
      description={`将作为按键输入推送到 ${String(runningCount)} 个运行中的会话。`}
      size="md"
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={busy || !text}
            onClick={async () => {
              setBusy(true);
              try {
                await onSend(text.endsWith("\n") ? text : text + "\r\n");
                onCancel();
              } finally {
                setBusy(false);
              }
            }}
          >
            发送
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(event) => { setText(event.target.value); }}
        rows={5}
        autoFocus
        placeholder="cls"
        className="min-h-32 w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs text-foreground shadow-sm focus:border-ring"
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        提示：以换行结尾的内容会附加 CRLF；多行将原样推入每个会话。
      </p>
    </Modal>
  );
}
