import {
  FolderOpen,
  Lock,
  Monitor,
  Moon,
  Palette,
  Paintbrush,
  PackageOpen,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  ShieldAlert,
  Sun,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "../../shared/lib/utils";
import {
  clearRegistryCache,
  openDataDir,
} from "../../shared/tauri/commands";
import {
  defaultSettings,
  type AccentColor,
  type AppSettings,
  type Density,
  type LogRetention,
  type MotionPref,
  type StartupPage,
  type ThemePref,
  type UpdateChannel,
  type UpdateFrequency,
} from "../../shared/tauri/types";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { Switch } from "../../shared/ui/switch";
import { useSaveSettings, useSettings } from "./useSettings";

type Section = "general" | "appearance" | "updates" | "plugins" | "privacy" | "advanced";

function noop() {
  // intentionally empty
}

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "通用", icon: SettingsIcon },
  { id: "appearance", label: "外观", icon: Palette },
  { id: "updates", label: "更新", icon: RefreshCw },
  { id: "plugins", label: "插件", icon: PackageOpen },
  { id: "privacy", label: "隐私", icon: Lock },
  { id: "advanced", label: "高级", icon: ShieldAlert },
];

export function SettingsPage() {
  const settingsQuery = useSettings();
  const saveSettings = useSaveSettings();
  const currentSettings = settingsQuery.data ?? defaultSettings;
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [section, setSection] = useState<Section>("general");
  const [dataDir, setDataDir] = useState<string>("");

  const visibleDraft = draft ?? currentSettings;
  const isDirty = useMemo(
    () =>
      draft != null && JSON.stringify(draft) !== JSON.stringify(currentSettings),
    [draft, currentSettings],
  );

  const update = (patch: Partial<AppSettings>) => {
    setDraft({ ...visibleDraft, ...patch });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card px-6 py-5 shadow-soft">
        <h1 className="text-xl font-semibold tracking-tight">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理 Toolbag 的本地偏好。所有设置仅存储在本机 SQLite。
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="rounded-lg border border-border bg-card p-2 shadow-soft" aria-label="设置分组">
          <ul className="space-y-0.5">
            {NAV.map((entry) => {
              const Icon = entry.icon;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => { setSection(entry.id); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      section === entry.id
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {entry.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-4">
          {section === "general" && (
            <GeneralSection draft={visibleDraft} onChange={update} />
          )}
          {section === "appearance" && (
            <AppearanceSection draft={visibleDraft} onChange={update} />
          )}
          {section === "updates" && (
            <UpdatesSection draft={visibleDraft} onChange={update} />
          )}
          {section === "plugins" && (
            <PluginsSection draft={visibleDraft} onChange={update} />
          )}
          {section === "privacy" && (
            <PrivacySection draft={visibleDraft} onChange={update} />
          )}
          {section === "advanced" && (
            <AdvancedSection
              draft={visibleDraft}
              dataDir={dataDir}
              onChange={update}
              onShowDataDir={async () => {
                try {
                  const dir = await openDataDir();
                  setDataDir(dir);
                } catch (error) {
                   
                  console.warn("openDataDir", error);
                }
              }}
              onClearCache={async () => {
                await clearRegistryCache();
              }}
            />
          )}
        </div>
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-elevated">
        <p className="text-xs text-muted-foreground">
          {isDirty ? "有未保存的更改" : "所有更改已保存"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!isDirty}
            onClick={() => { setDraft(null); }}
          >
            放弃更改
          </Button>
          <Button
            size="sm"
            disabled={!isDirty || saveSettings.isPending}
            onClick={() => {
              saveSettings.mutate(visibleDraft, {
                onSuccess: () => { setDraft(null); },
              });
            }}
          >
            <Save className="size-4" aria-hidden="true" />
            {saveSettings.isPending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-soft">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="grid size-9 place-items-center rounded-md bg-secondary text-secondary-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex justify-start sm:justify-end">{control}</div>
    </div>
  );
}

function GeneralSection({
  draft,
  onChange,
}: {
  draft: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <SectionCard
      title="通用"
      description="语言、启动行为与常用偏好。"
      icon={SettingsIcon}
    >
      <SettingRow
        label="界面语言"
        description="目前只发布中文，英文骨架待补。"
        control={
          <Select
            value={draft.language}
            options={[
              { value: "zh-CN", label: "简体中文" },
              { value: "en-US", label: "English (preview)" },
            ]}
            onChange={(value) => { onChange({ language: value }); }}
          />
        }
      />
      <SettingRow
        label="启动页"
        description="启动应用时打开的页面。"
        control={
          <Select<StartupPage>
            value={draft.startupPage}
            options={[
              { value: "workbench", label: "工具台" },
              { value: "lastTool", label: "上次打开的工具" },
            ]}
            onChange={(value) => { onChange({ startupPage: value }); }}
          />
        }
      />
      <SettingRow
        label="最近列表长度"
        description="工具台 / 命令面板里显示的最近工具数。"
        control={
          <NumberPicker
            value={draft.recentListSize}
            options={[5, 10, 20]}
            onChange={(value) => { onChange({ recentListSize: value }); }}
          />
        }
      />
      <SettingRow
        label="开机自启动"
        description="接口已预留，首版不会主动注册开机启动。"
        control={
          <Switch
            checked={draft.launchAtStartup}
            onClick={() => { onChange({ launchAtStartup: !draft.launchAtStartup }); }}
          />
        }
      />
    </SectionCard>
  );
}

function AppearanceSection({
  draft,
  onChange,
}: {
  draft: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <SectionCard
      title="外观"
      description="主题、强调色、密度与字号。"
      icon={Paintbrush}
    >
      <SettingRow
        label="主题"
        description="支持跟随系统切换。"
        control={
          <ChoiceGroup<ThemePref>
            value={draft.theme}
            onChange={(value) => { onChange({ theme: value }); }}
            options={[
              { value: "light", label: "浅色", icon: Sun },
              { value: "dark", label: "深色", icon: Moon },
              { value: "system", label: "跟随系统", icon: Monitor },
            ]}
          />
        }
      />
      <SettingRow
        label="强调色"
        description="影响按钮、强调高亮、焦点环。"
        control={
          <AccentPicker
            value={draft.accent}
            onChange={(value) => { onChange({ accent: value }); }}
          />
        }
      />
      <SettingRow
        label="界面密度"
        description="紧凑模式信息密度更高。"
        control={
          <ChoiceGroup<Density>
            value={draft.density}
            onChange={(value) => { onChange({ density: value }); }}
            options={[
              { value: "compact", label: "紧凑" },
              { value: "comfortable", label: "舒适" },
            ]}
          />
        }
      />
      <SettingRow
        label="动画"
        description="跟随系统时会尊重 prefers-reduced-motion。"
        control={
          <ChoiceGroup<MotionPref>
            value={draft.motion}
            onChange={(value) => { onChange({ motion: value }); }}
            options={[
              { value: "on", label: "开启" },
              { value: "off", label: "关闭" },
              { value: "system", label: "跟随系统" },
            ]}
          />
        }
      />
      <SettingRow
        label="字号缩放"
        description="影响整体字号比例。"
        control={
          <NumberPicker
            value={draft.fontScale}
            options={[90, 100, 115]}
            renderLabel={(value) => `${String(value)}%`}
            onChange={(value) => { onChange({ fontScale: value }); }}
          />
        }
      />
    </SectionCard>
  );
}

function UpdatesSection({
  draft,
  onChange,
}: {
  draft: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <SectionCard
      title="更新"
      description="应用本体与插件的更新策略相互独立。"
      icon={RefreshCw}
    >
      <SettingRow
        label="自动检查应用更新"
        description="访问 GitHub Release 获取最新版本信息。"
        control={
          <Switch
            checked={draft.appAutoUpdate}
            onClick={() => { onChange({ appAutoUpdate: !draft.appAutoUpdate }); }}
          />
        }
      />
      <SettingRow
        label="自动检查插件更新"
        description="启动时拉取 Registry index.json。"
        control={
          <Switch
            checked={draft.pluginAutoUpdate}
            onClick={() => { onChange({ pluginAutoUpdate: !draft.pluginAutoUpdate }); }}
          />
        }
      />
      <SettingRow
        label="检查频率"
        description="启动时 / 每日 / 每周 / 仅手动。"
        control={
          <Select<UpdateFrequency>
            value={draft.updateCheckFrequency}
            options={[
              { value: "onStart", label: "启动时" },
              { value: "daily", label: "每日" },
              { value: "weekly", label: "每周" },
              { value: "manual", label: "仅手动" },
            ]}
            onChange={(value) => { onChange({ updateCheckFrequency: value }); }}
          />
        }
      />
      <SettingRow
        label="更新通道"
        description="Beta 通道发布频率更高但稳定性弱。"
        control={
          <ChoiceGroup<UpdateChannel>
            value={draft.updateChannel}
            onChange={(value) => { onChange({ updateChannel: value }); }}
            options={[
              { value: "stable", label: "稳定" },
              { value: "beta", label: "Beta" },
            ]}
          />
        }
      />
      <SettingRow
        label="HTTP 代理"
        description="留空表示走系统代理；填写格式 http://host:port。"
        control={
          <Input
            className="w-72 max-w-full"
            value={draft.httpProxy ?? ""}
            placeholder="http://127.0.0.1:7890"
            onChange={(event) =>
              { onChange({ httpProxy: event.target.value || null }); }
            }
          />
        }
      />
    </SectionCard>
  );
}

function PluginsSection({
  draft,
  onChange,
}: {
  draft: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <SectionCard
      title="插件"
      description="注册中心与下载策略。"
      icon={PackageOpen}
    >
      <SettingRow
        label="注册中心 URL"
        description="默认为 https://lfenx.github.io/Toolbag-Registry/index.json。企业可改私有源。"
        control={
          <Input
            className="w-72 max-w-full"
            value={draft.registryUrl ?? ""}
            placeholder="留空 = 使用默认"
            onChange={(event) =>
              { onChange({ registryUrl: event.target.value || null }); }
            }
          />
        }
      />
      <SettingRow
        label="并发下载数"
        description="同时安装/升级插件的最大并发。"
        control={
          <NumberPicker
            value={draft.maxConcurrentDownloads}
            options={[1, 2, 3, 4]}
            onChange={(value) => { onChange({ maxConcurrentDownloads: value }); }}
          />
        }
      />
      <SettingRow
        label="允许加载未签名包"
        description="仅 debug 构建生效；release 构建强制校验。"
        control={
          <Switch
            checked={draft.allowUnsigned}
            disabled={!import.meta.env.DEV}
            onClick={() => { onChange({ allowUnsigned: !draft.allowUnsigned }); }}
          />
        }
      />
    </SectionCard>
  );
}

function PrivacySection({
  draft,
  onChange,
}: {
  draft: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <SectionCard
      title="隐私"
      description="本地优先，禁止任何遥测与上报。"
      icon={Lock}
    >
      <SettingRow
        label="遥测上报"
        description="强制保持关闭，无法启用。"
        control={
          <Switch checked={draft.telemetryEnabled} disabled onClick={noop} />
        }
      />
      <SettingRow
        label="日志保留"
        description="超过保留期的日志会在启动时清理。"
        control={
          <Select<string>
            value={
              draft.logRetentionDays.kind === "forever"
                ? "forever"
                : String(draft.logRetentionDays.value)
            }
            options={[
              { value: "7", label: "7 天" },
              { value: "30", label: "30 天" },
              { value: "forever", label: "永久" },
            ]}
            onChange={(value) => {
              const next: LogRetention =
                value === "forever"
                  ? { kind: "forever" }
                  : { kind: "days", value: Number(value) };
              onChange({ logRetentionDays: next });
            }}
          />
        }
      />
    </SectionCard>
  );
}

function AdvancedSection({
  draft,
  dataDir,
  onChange,
  onShowDataDir,
  onClearCache,
}: {
  draft: AppSettings;
  dataDir: string;
  onChange: (patch: Partial<AppSettings>) => void;
  onShowDataDir: () => void;
  onClearCache: () => void;
}) {
  void draft;
  void onChange;
  return (
    <>
      <SectionCard
        title="高级"
        description="数据目录、缓存、危险操作。"
        icon={ShieldAlert}
      >
        <SettingRow
          label="应用数据目录"
          description={dataDir || "点击右侧按钮显示具体路径。"}
          control={
            <Button size="sm" variant="outline" onClick={onShowDataDir}>
              <FolderOpen className="size-4" aria-hidden="true" />
              查看路径
            </Button>
          }
        />
        <SettingRow
          label="清理注册中心缓存"
          description="下次访问应用市场会强制重新拉取。"
          control={
            <Button size="sm" variant="outline" onClick={onClearCache}>
              <Trash2 className="size-4" aria-hidden="true" />
              清理
            </Button>
          }
        />
      </SectionCard>

      <section className="rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive shadow-soft">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5" aria-hidden="true" />
          <div>
            <p className="font-medium">危险区</p>
            <p className="mt-1 text-xs">
              "重置全部设置" 暂未启用，将在下个版本启用并要求二次确认。
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function ChoiceGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => { onChange(opt.value); }}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-3.5" aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => { onChange(event.target.value as T); }}
      className="flex h-9 rounded-md border border-input bg-card px-3 text-sm"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function NumberPicker({
  value,
  options,
  renderLabel,
  onChange,
}: {
  value: number;
  options: number[];
  renderLabel?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => { onChange(opt); }}
          className={cn(
            "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
            value === opt
              ? "bg-card text-foreground shadow-soft"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {renderLabel ? renderLabel(opt) : opt}
        </button>
      ))}
    </div>
  );
}

const accentSwatches: { value: AccentColor; label: string; color: string }[] = [
  { value: "indigo", label: "靛蓝", color: "oklch(56% 0.18 264)" },
  { value: "emerald", label: "翠绿", color: "oklch(56% 0.16 162)" },
  { value: "rose", label: "玫红", color: "oklch(56% 0.19 14)" },
  { value: "amber", label: "琥珀", color: "oklch(58% 0.16 70)" },
];

function AccentPicker({
  value,
  onChange,
}: {
  value: AccentColor;
  onChange: (value: AccentColor) => void;
}) {
  const isCustom = typeof value === "object";
  return (
    <div className="flex items-center gap-2">
      {accentSwatches.map((swatch) => {
        const active = !isCustom && value === swatch.value;
        return (
          <button
            key={swatch.label}
            type="button"
            onClick={() => { onChange(swatch.value); }}
            className={cn(
              "size-7 rounded-full border-2 transition-shadow",
              active ? "border-foreground shadow-soft" : "border-transparent",
            )}
            style={{ background: swatch.color }}
            aria-label={swatch.label}
          />
        );
      })}
      <Input
        type="color"
        value={isCustom ? value.custom : "#0f66e8"}
        onChange={(event) => { onChange({ custom: event.target.value }); }}
        className="h-7 w-10 cursor-pointer p-0"
        aria-label="自定义颜色"
      />
    </div>
  );
}
