import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Code2,
  Fingerprint,
  GitBranch,
  Globe2,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";

import { getAppInfo, getSignatureStatus } from "../../shared/tauri/commands";
import { Badge } from "../../shared/ui/badge";
import { Panel, PanelBody, PanelHeader } from "../../shared/ui/panel";

const stack = [
  "Tauri 2",
  "Rust",
  "React 19",
  "TypeScript",
  "Vite",
  "Tailwind 4",
  "pnpm",
  "SQLite",
  "TanStack Query / Router",
];

export function AboutPage() {
  const { data: appInfo } = useQuery({
    queryKey: ["app-info"],
    queryFn: getAppInfo,
  });
  const { data: signature } = useQuery({
    queryKey: ["signature"],
    queryFn: getSignatureStatus,
  });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card px-6 py-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <Boxes className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">关于 Toolbag</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              一个面向 Windows 的本地工具集合框架，支持声明式 + 原生 sidecar 双模插件。
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <AboutCard icon={PackageCheck} title="发行" value="GitHub Release + NSIS" />
        <AboutCard icon={ShieldCheck} title="隐私" value="本地优先 · 默认无遥测" />
        <AboutCard icon={GitBranch} title="仓库" value="LFenX/Toolbag-Windows" />
      </div>

      <Panel className="shadow-soft">
        <PanelHeader>
          <h2 className="text-sm font-semibold">技术栈</h2>
        </PanelHeader>
        <PanelBody className="flex flex-wrap gap-2">
          {stack.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))}
        </PanelBody>
      </Panel>

      <Panel className="shadow-soft">
        <PanelHeader>
          <h2 className="text-sm font-semibold">版本与目录</h2>
        </PanelHeader>
        <PanelBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            <AboutRow label="应用名称" value={appInfo?.name ?? "Toolbag"} />
            <AboutRow label="当前版本" value={appInfo?.version ?? "0.2.0"} />
            <AboutRow
              label="应用标识"
              value={appInfo?.identifier ?? "com.lfen.toolbag"}
            />
            <AboutRow label="构建模式" value={appInfo?.buildProfile ?? "preview"} />
            <AboutRow label="数据目录" value={appInfo?.dataDir ?? "—"} />
            <AboutRow label="日志目录" value={appInfo?.logDir ?? "—"} />
            <AboutRow label="插件目录" value={appInfo?.pluginsDir ?? "—"} />
          </dl>
        </PanelBody>
      </Panel>

      <Panel className="shadow-soft">
        <PanelHeader className="flex items-center gap-3">
          <Fingerprint className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">信任与签名</h2>
        </PanelHeader>
        <PanelBody className="space-y-2 text-sm">
          {signature?.enforced ? (
            <>
              <p>已启用 minisign 签名校验。</p>
              <p className="text-xs text-muted-foreground">
                公钥指纹：
                <code className="ml-1 break-all rounded bg-muted px-1.5 py-0.5">
                  {signature.fingerprint}
                </code>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              当前构建未启用签名校验（仅适用于开发）。Release 构建必须配置 minisign 公钥。
            </p>
          )}
        </PanelBody>
      </Panel>

      <Panel className="shadow-soft">
        <PanelHeader>
          <h2 className="text-sm font-semibold">链接</h2>
        </PanelHeader>
        <PanelBody className="grid gap-2 text-sm sm:grid-cols-2">
          <ExternalLink icon={GitBranch} label="GitHub 源码" url="https://github.com/LFenX/Toolbag-Windows" />
          <ExternalLink icon={Globe2} label="注册中心" url="https://toolbag.lfen.dev" />
          <ExternalLink icon={Code2} label="插件开发文档" url="https://toolbag.lfen.dev/docs/plugin-development" />
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
    <section className="rounded-lg border border-border bg-card p-5 shadow-soft">
      <span className="grid size-9 place-items-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="mt-4 text-xs text-muted-foreground">{title}</p>
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

function ExternalLink({
  icon: Icon,
  label,
  url,
}: {
  icon: typeof GitBranch;
  label: string;
  url: string;
}) {
  return (
    <a
      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted"
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{url}</span>
    </a>
  );
}
