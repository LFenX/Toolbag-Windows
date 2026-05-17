import { useQuery } from "@tanstack/react-query";
import { GitBranch, PackageCheck, ShieldCheck } from "lucide-react";

import { getAppInfo } from "../../shared/tauri/commands";
import { Badge } from "../../shared/ui/badge";
import { Panel, PanelBody, PanelHeader } from "../../shared/ui/panel";

const stack = [
  "Tauri 2",
  "Rust",
  "React 19",
  "TypeScript",
  "Vite",
  "pnpm",
  "SQLite",
];

export function AboutPage() {
  const { data: appInfo } = useQuery({
    queryKey: ["app-info"],
    queryFn: getAppInfo,
  });

  return (
    <div className="w-full space-y-4">
      <section className="rounded-lg border border-border bg-card px-6 py-5 shadow-panel">
        <h1 className="text-xl font-semibold tracking-normal">关于 Toolbag</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          一个面向 Windows 的本地工具集合框架。
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <AboutCard icon={PackageCheck} title="发行" value="GitHub Release + NSIS" />
        <AboutCard icon={ShieldCheck} title="隐私" value="默认无遥测" />
        <AboutCard icon={GitBranch} title="仓库" value="LFenX/Toolbag-Windows" />
      </div>

      <Panel className="shadow-panel">
        <PanelHeader>
          <h2 className="text-base font-semibold">技术栈</h2>
        </PanelHeader>
        <PanelBody className="flex flex-wrap gap-2">
          {stack.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </PanelBody>
      </Panel>

      <Panel className="shadow-panel">
        <PanelHeader>
          <h2 className="text-base font-semibold">版本</h2>
        </PanelHeader>
        <PanelBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            <AboutRow label="应用名称" value={appInfo?.name ?? "Toolbag"} />
            <AboutRow label="当前版本" value={appInfo?.version ?? "0.1.0"} />
            <AboutRow
              label="应用标识"
              value={appInfo?.identifier ?? "com.lfen.toolbag"}
            />
            <AboutRow label="构建模式" value={appInfo?.buildProfile ?? "preview"} />
          </dl>
        </PanelBody>
      </Panel>
    </div>
  );
}

function AboutCard({
  icon: Icon,
  title,
  value,
}: {
  icon: typeof PackageCheck;
  title: string;
  value: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-panel">
      <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </section>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium">{value}</dd>
    </div>
  );
}
