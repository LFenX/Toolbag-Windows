import { useMutation } from "@tanstack/react-query";
import { FileDown, FolderOpen, ShieldCheck } from "lucide-react";

import { exportLogs } from "../../shared/tauri/commands";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { Panel, PanelBody, PanelHeader } from "../../shared/ui/panel";

export function LogsPage() {
  const exportMutation = useMutation({
    mutationFn: exportLogs,
  });

  return (
    <div className="w-full space-y-4">
      <section className="rounded-lg border border-border bg-card px-6 py-5 shadow-panel">
        <h1 className="text-xl font-semibold tracking-normal">日志</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          本地日志只保存在这台电脑上，导出后由你自行分享。
        </p>
      </section>

      <Panel className="shadow-panel">
        <PanelHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary">
              <FileDown className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold">本地日志导出</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Rust 后端会复制当前日志目录并返回导出路径。
              </p>
            </div>
          </div>
          <Badge variant="success">
            <ShieldCheck className="mr-1 size-3" aria-hidden="true" />
            本机
          </Badge>
        </PanelHeader>
        <PanelBody className="space-y-4">
          <Button
            disabled={exportMutation.isPending}
            onClick={() => {
              exportMutation.mutate();
            }}
          >
            <FileDown className="size-4" aria-hidden="true" />
            {exportMutation.isPending ? "正在导出" : "导出日志"}
          </Button>

          {exportMutation.data ? (
            <div className="rounded-md border border-border bg-background p-4 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <FolderOpen className="size-4 text-primary" aria-hidden="true" />
                导出完成
              </p>
              <p className="mt-2 break-all text-muted-foreground">
                {exportMutation.data.filePath}
              </p>
              <p className="mt-1 text-muted-foreground">
                {exportMutation.data.bytes} bytes
              </p>
            </div>
          ) : null}

          {exportMutation.error ? (
            <p className="text-sm text-destructive">
              {exportMutation.error.message}
            </p>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}
