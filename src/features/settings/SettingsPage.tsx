import { RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "../../shared/ui/button";
import { Panel, PanelBody, PanelHeader } from "../../shared/ui/panel";
import { Switch } from "../../shared/ui/switch";
import { defaultSettings, type AppSettings } from "../../shared/tauri/types";
import { useSaveSettings, useSettings } from "./useSettings";

export function SettingsPage() {
  const settingsQuery = useSettings();
  const saveSettings = useSaveSettings();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const currentSettings = settingsQuery.data ?? defaultSettings;
  const visibleDraft = draft ?? currentSettings;
  const isDirty = draft !== null;

  return (
    <div className="w-full space-y-4">
      <section className="rounded-lg border border-border bg-card px-6 py-5 shadow-panel">
        <h1 className="text-xl font-semibold tracking-normal">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理 Toolbag 的本地偏好、发行策略和隐私边界。
        </p>
      </section>

      <Panel className="shadow-panel">
        <PanelHeader className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold">发行与隐私</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              设置会保存到本机 SQLite，不会自动上传。
            </p>
          </div>
        </PanelHeader>
        <PanelBody className="divide-y divide-border p-0">
          <SettingRow
            checked={visibleDraft.autoCheckUpdates}
            description="启动后允许检查 GitHub Release 更新状态。"
            icon={RefreshCw}
            label="自动检查更新"
            onCheckedChange={(checked) => {
              setDraft({ ...visibleDraft, autoCheckUpdates: checked });
            }}
          />
          <SettingRow
            checked={visibleDraft.launchAtStartup}
            description="接口已预留，首版不会主动注册开机启动。"
            icon={Rocket}
            label="开机启动"
            onCheckedChange={(checked) => {
              setDraft({ ...visibleDraft, launchAtStartup: checked });
            }}
          />
          <SettingRow
            checked={visibleDraft.telemetryEnabled}
            description="首版没有第三方遥测，后端会强制保持关闭。"
            icon={ShieldCheck}
            label="遥测上报"
            onCheckedChange={(checked) => {
              setDraft({ ...visibleDraft, telemetryEnabled: checked });
            }}
          />
        </PanelBody>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!isDirty || saveSettings.isPending}
          onClick={() => {
            saveSettings.mutate(visibleDraft, {
              onSuccess: () => {
                setDraft(null);
              },
            });
          }}
        >
          {saveSettings.isPending ? "正在保存" : "保存设置"}
        </Button>
        <Button
          onClick={() => {
            setDraft(null);
          }}
          variant="outline"
        >
          放弃更改
        </Button>
      </div>
    </div>
  );
}

function SettingRow({
  checked,
  description,
  icon: Icon,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  icon: typeof ShieldCheck;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onClick={() => {
          onCheckedChange(!checked);
        }}
      />
    </div>
  );
}
