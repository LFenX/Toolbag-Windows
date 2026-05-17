import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Pause } from "lucide-react";
import { memo, Suspense, useMemo, useState } from "react";

import { getPluginUiSchema } from "../../shared/tauri/plugins";
import type { PluginUiSchema, UiField } from "../../shared/tauri/types";
import { Badge } from "../../shared/ui/badge";
import { Button } from "../../shared/ui/button";
import { ToolErrorBoundary } from "./ErrorBoundary";
import { builtinRegistry } from "./registry";
import { ResultRenderer } from "./runtime/ResultRenderer";
import { SchemaForm } from "./runtime/SchemaForm";
import { usePluginJob } from "./runtime/usePluginJob";
import { useTools } from "./useTools";

/**
 * Renders a single tool. Reusable by the tab host so multiple instances can
 * coexist; each instance owns its own job state via the keyed `usePluginJob`
 * hook (the parent should mount this inside a stable React subtree keyed by
 * the tab `instanceId` to keep state isolated).
 *
 * Wrapped in `memo` so a tab switch — which re-renders `AppShell` and
 * therefore `ToolHost` — doesn't cascade through every mounted tab's
 * SchemaForm subtree. `toolId` is the only prop and a primitive, so the
 * default shallow comparison is the right thing.
 */
export const ToolView = memo(function ToolView({ toolId }: { toolId: string }) {
  const { data: tools = [] } = useTools();
  const tool = tools.find((entry) => entry.id === toolId);

  if (!tool) {
    return <ToolNotFound id={toolId} />;
  }

  if (tool.disabled) {
    return <ToolDisabled id={toolId} />;
  }

  return (
    <ToolErrorBoundary>
      <ToolRouter pluginId={tool.id} />
    </ToolErrorBoundary>
  );
});

function ToolRouter({ pluginId }: { pluginId: string }) {
  const { data: tools = [] } = useTools();
  const tool = tools.find((entry) => entry.id === pluginId);
  const { data: ui, isLoading } = useQuery({
    queryKey: ["plugin-ui", pluginId],
    queryFn: () => getPluginUiSchema(pluginId),
    enabled: Boolean(tool),
  });

  if (!tool) {
    return null;
  }

  if (tool.builtinRenderer) {
    const reg = builtinRegistry.find(
      (r) => r.rendererKey === (tool.builtinRenderer ?? ""),
    );
    if (!reg) {
      return <MissingRenderer id={pluginId} renderer={tool.builtinRenderer} />;
    }
    const Component = reg.component;
    return (
      <Suspense fallback={<ToolLoading />}>
        <Component />
      </Suspense>
    );
  }

  if (isLoading) {
    return (
      <section className="grid h-full place-items-center text-sm text-muted-foreground">
        正在加载工具…
      </section>
    );
  }

  if (!ui) {
    return <MissingSchema id={pluginId} />;
  }
  return <SchemaToolView pluginId={pluginId} ui={ui} />;
}

function SchemaToolView({
  pluginId,
  ui,
}: {
  pluginId: string;
  ui: PluginUiSchema;
}) {
  const { state, start, cancel, reset } = usePluginJob(pluginId);
  const defaultFormState = useMemo(
    () => buildDefaultFormState(ui.schema),
    [ui.schema],
  );
  const [formState, setFormState] =
    useState<Record<string, unknown>>(defaultFormState);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleAction = async (actionId: string, command?: string) => {
    if (ui.schema.layout === "builtin") return;
    const sections = collectSections(ui.schema);
    const action = sections
      .flatMap((section) =>
        "actions" in section && section.actions ? section.actions : [],
      )
      .find((entry) => entry.id === actionId);
    if (!action) return;
    if (action.kind === "cancel") {
      await cancel();
      return;
    }
    if (action.kind === "reset") {
      reset();
      setFormState(defaultFormState);
      return;
    }
    if (action.kind === "copy" && action.source) {
      try {
        const value = lookupCopySource(action.source, state.result);
        await navigator.clipboard.writeText(
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
        );
      } catch (error) {
        console.warn("copy failed", error);
      }
      return;
    }
    if (action.kind === "openUrl" && action.url) {
      window.open(action.url, "_blank");
      return;
    }
    const cmd = command ?? action.command;
    if (!cmd) return;
    setBusyAction(actionId);
    try {
      await start(cmd, formState);
    } finally {
      setBusyAction(null);
    }
  };

  if (ui.schema.layout === "builtin") {
    return <MissingRenderer id={pluginId} renderer={ui.schema.builtinRenderer} />;
  }

  if (ui.schema.layout === "single") {
    return (
      <div className="grid h-full">
        <ResultRenderer section={ui.schema.right} state={state} />
      </div>
    );
  }

  if (ui.schema.layout === "split") {
    const schema = ui.schema;
    return (
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-card shadow-soft">
          <SchemaForm
            section={schema.left}
            values={formState}
            onChange={setFormState}
            onAction={handleAction}
            busy={state.running}
            busyActionId={busyAction}
          />
        </section>
        <section className="rounded-lg border border-border bg-card shadow-soft">
          <ResultRenderer section={schema.right} state={state} />
        </section>
      </div>
    );
  }

  const stackSchema = ui.schema;
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4">
      {stackSchema.sections.map((section, idx) => (
        <section
          key={idx}
          className="rounded-lg border border-border bg-card shadow-soft"
        >
          {section.kind === "result" ? (
            <ResultRenderer section={section} state={state} />
          ) : (
            <SchemaForm
              section={section}
              values={formState}
              onChange={setFormState}
              onAction={handleAction}
              busy={state.running}
              busyActionId={busyAction}
            />
          )}
        </section>
      ))}
    </div>
  );
}

function collectSections(schema: PluginUiSchema["schema"]) {
  if (schema.layout === "split") return [schema.left, schema.right];
  if (schema.layout === "stack") return schema.sections;
  if (schema.layout === "single") return [schema.right];
  return [];
}

function buildDefaultFormState(schema: PluginUiSchema["schema"]) {
  const defaults: Record<string, unknown> = {};
  for (const section of collectSections(schema)) {
    if (!("fields" in section)) continue;
    for (const field of section.fields) {
      const value = getFieldDefault(field);
      if (value !== undefined) {
        defaults[field.key] = value;
      }
    }
  }
  return defaults;
}

function getFieldDefault(field: UiField) {
  if (field.type === "hidden") {
    return field.value;
  }
  if ("default" in field) {
    return field.default;
  }
  return undefined;
}

function lookupCopySource(source: string, result: unknown) {
  if (source === "$result") return result;
  if (!result || typeof result !== "object") return undefined;
  const parts = source.replace(/^\$result\./, "").split(".");
  let value: unknown = result;
  for (const part of parts) {
    if (value == null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function ToolLoading() {
  return (
    <section className="grid h-full place-items-center text-sm text-muted-foreground">
      正在加载工具...
    </section>
  );
}

function ToolNotFound({ id }: { id: string }) {
  return (
    <section className="grid h-full place-items-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
          <AlertTriangle className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-base font-semibold">工具不存在</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          找不到 ID 为 <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{id}</code> 的工具。可能已卸载或未安装。
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/">
            <ArrowLeft className="size-4" aria-hidden="true" />
            返回工具台
          </Link>
        </Button>
      </div>
    </section>
  );
}

function ToolDisabled({ id }: { id: string }) {
  return (
    <section className="grid h-full place-items-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
          <Pause className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-base font-semibold">工具已禁用</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          请前往「已安装」页面重新启用 <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{id}</code>。
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/plugins">前往已安装管理</Link>
        </Button>
      </div>
    </section>
  );
}

function MissingRenderer({
  id,
  renderer,
}: {
  id: string;
  renderer: string | null | undefined;
}) {
  return (
    <section className="grid h-full place-items-center p-10">
      <div className="max-w-md text-center">
        <Badge variant="warning">缺失渲染器</Badge>
        <h2 className="mt-3 text-base font-semibold">工具 {id} 无法渲染</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          未找到 builtin 渲染器 {renderer ? <code>{renderer}</code> : null}。请升级应用或重装该插件。
        </p>
      </div>
    </section>
  );
}

function MissingSchema({ id }: { id: string }) {
  return (
    <section className="grid h-full place-items-center p-10">
      <div className="max-w-md text-center">
        <Badge variant="warning">缺失 ui.json</Badge>
        <h2 className="mt-3 text-base font-semibold">工具 {id} 没有 UI 描述</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          该插件未提供 <code>ui.json</code>。请联系作者补充，或重装。
        </p>
      </div>
    </section>
  );
}
