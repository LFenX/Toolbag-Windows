import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Switch } from "../../../shared/ui/switch";
import { cn } from "../../../shared/lib/utils";
import type { UiField, UiSection } from "../../../shared/tauri/types";
import { evalBool } from "./expr";

type FormState = Record<string, unknown>;

export interface SchemaFormProps {
  section: UiSection;
  values: FormState;
  onChange: (next: FormState) => void;
  onAction: (actionId: string, command?: string) => void;
  busy?: boolean;
  busyActionId?: string | null;
}

export function SchemaForm({
  section,
  values,
  onChange,
  onAction,
  busy = false,
  busyActionId = null,
}: SchemaFormProps) {
  const scope = values;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {(section.title ?? section.description) ? (
        <header className="border-b border-border px-5 py-4">
          {section.title && (
            <h2 className="text-sm font-semibold tracking-tight">{section.title}</h2>
          )}
          {section.description && (
            <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
          )}
        </header>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="space-y-4">
          {section.fields.map((field) => {
            const visible = evalBool(field.visibleWhen, scope);
            const disabled = busy || !evalBool(field.disabledWhen, scope);
            if (!visible) return null;
            return (
              <FieldRow
                key={field.key}
                field={field}
                value={values[field.key]}
                disabled={disabled || busy}
                onChange={(v) => {
                  onChange({ ...values, [field.key]: v });
                }}
              />
            );
          })}
        </div>
      </div>
      {section.actions && section.actions.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          {section.actions.map((action) => {
            const isBusy = busy && busyActionId === action.id;
            return (
              <Button
                key={action.id}
                variant={action.primary ? "default" : "outline"}
                size="sm"
                disabled={busy && action.kind !== "cancel"}
                onClick={() => {
                  onAction(action.id, action.command);
                }}
              >
                {isBusy ? "运行中…" : action.label}
              </Button>
            );
          })}
        </footer>
      )}
    </div>
  );
}

function FieldRow({
  field,
  value,
  disabled,
  onChange,
}: {
  field: UiField;
  value: unknown;
  disabled: boolean;
  onChange: (next: unknown) => void;
}) {
  const labelNode = field.label ? (
    <div className="mb-1.5 flex items-center justify-between">
      <label className="text-xs font-medium text-foreground" htmlFor={field.key}>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </label>
    </div>
  ) : null;

  return (
    <div>
      {labelNode}
      <FieldInput field={field} value={value} disabled={disabled} onChange={onChange} />
      {field.help && (
        <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: UiField;
  value: unknown;
  disabled: boolean;
  onChange: (next: unknown) => void;
}): ReactNode {
  switch (field.type) {
    case "text":
      return (
        <Input
          id={field.key}
          value={typeof value === "string" ? value : field.default ?? ""}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); }}
        />
      );
    case "textarea":
      return (
        <textarea
          id={field.key}
          rows={field.rows ?? 4}
          value={typeof value === "string" ? value : field.default ?? ""}
          placeholder={field.placeholder}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); }}
          className={cn(
            "flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:border-ring",
            field.monospace && "font-mono",
          )}
        />
      );
    case "number":
      return (
        <Input
          id={field.key}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={
            typeof value === "number" ? value : field.default ?? ""
          }
          disabled={disabled}
          onChange={(e) => { onChange(Number(e.target.value)); }}
        />
      );
    case "switch": {
      const checked = typeof value === "boolean" ? value : field.default ?? false;
      return (
        <Switch
          checked={checked}
          disabled={disabled}
          onClick={() => { onChange(!checked); }}
        />
      );
    }
    case "select": {
      const fallback = field.options.length > 0 ? field.options[0].value : "";
      const current =
        typeof value === "string"
          ? value
          : field.default ?? fallback;
      return (
        <select
          id={field.key}
          value={current}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); }}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label ?? opt.value}
            </option>
          ))}
        </select>
      );
    }
    case "radioGroup":
      return (
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => {
            const current = value ?? field.default;
            const active = current === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                disabled={disabled}
                onClick={() => { onChange(opt.value); }}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "border-primary/60 bg-secondary text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {opt.label ?? opt.value}
              </button>
            );
          })}
        </div>
      );
    case "tabs":
      return (
        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
          {field.options.map((opt) => {
            const current = value ?? field.default;
            const active = current === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                disabled={disabled}
                onClick={() => { onChange(opt.value); }}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label ?? opt.value}
              </button>
            );
          })}
        </div>
      );
    case "multiSelect": {
      const arr = Array.isArray(value)
        ? (value as string[])
        : field.default ?? [];
      return (
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => {
            const active = arr.includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                disabled={disabled}
                onClick={() => {
                  if (active) {
                    onChange(arr.filter((v) => v !== opt.value));
                  } else {
                    if (field.max != null && arr.length >= field.max) return;
                    onChange([...arr, opt.value]);
                  }
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-primary/60 bg-secondary text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {opt.label ?? opt.value}
              </button>
            );
          })}
        </div>
      );
    }
    case "filePicker":
    case "folderPicker": {
      const current = typeof value === "string" ? value : field.default ?? "";
      return (
        <FilePickerInput
          value={current}
          disabled={disabled}
          isFolder={field.type === "folderPicker"}
          onChange={onChange}
        />
      );
    }
    case "tagInput": {
      const tags = Array.isArray(value)
        ? (value as string[])
        : field.default ?? [];
      return (
        <TagInputControl
          value={tags}
          disabled={disabled}
          onChange={onChange}
        />
      );
    }
    case "hidden":
      return null;
    default:
      return (
        <p className="text-xs text-destructive">不支持的字段类型</p>
      );
  }
}

function FilePickerInput({
  value,
  disabled,
  isFolder,
  onChange,
}: {
  value: string;
  disabled: boolean;
  isFolder: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        disabled={disabled}
        placeholder={isFolder ? "选择目录…" : "选择文件…"}
        onChange={(e) => { onChange(e.target.value); }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title="桌面文件选择器将在挂载 tauri-plugin-dialog 后启用"
      >
        浏览
      </Button>
    </div>
  );
}

function TagInputControl({
  value,
  disabled,
  onChange,
}: {
  value: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-card p-1.5">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-sm bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            disabled={disabled}
            onClick={() => { onChange(value.filter((t) => t !== tag)); }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`删除 ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        placeholder="输入后回车"
        value={draft}
        disabled={disabled}
        onChange={(e) => { setDraft(e.target.value); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && draft.trim()) {
            event.preventDefault();
            if (!value.includes(draft.trim())) {
              onChange([...value, draft.trim()]);
            }
            setDraft("");
          } else if (event.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
