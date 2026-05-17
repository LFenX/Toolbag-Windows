import { describe, expect, it } from "vitest";
import { MonitorCog, Wrench } from "lucide-react";

import { fallbackTools } from "../../shared/tools/manifest";
import { builtinRegistry, composeToolDefinitions } from "./registry";

function StubTool() {
  return null;
}

describe("tool registry", () => {
  it("composes definitions and links builtin renderer components", () => {
    const definitions = composeToolDefinitions(fallbackTools);

    expect(definitions).toHaveLength(fallbackTools.length);
    const env = definitions[0];
    expect(env.id).toBe("com.lfen.toolbag.environment-overview");
    expect(env.component).toBe(builtinRegistry[0].component);
  });

  it("falls back to a null component when builtin renderer is missing", () => {
    const orphan = fallbackTools.map((tool) => ({
      ...tool,
      builtinRenderer: "ghost-renderer",
    }));
    const [definition] = composeToolDefinitions(orphan, []);
    expect(definition.component).toBeNull();
  });

  it("detects duplicate builtin registrations", () => {
    expect(() =>
      composeToolDefinitions(fallbackTools, [
        { rendererKey: "environment-overview", icon: MonitorCog, component: StubTool },
        { rendererKey: "environment-overview", icon: MonitorCog, component: StubTool },
      ]),
    ).toThrow();
  });

  it("detects duplicate manifests", () => {
    expect(() =>
      composeToolDefinitions([fallbackTools[0], fallbackTools[0]]),
    ).toThrow();
  });

  it("uses a generic icon when category has no preset", () => {
    const definition = composeToolDefinitions([
      { ...fallbackTools[0], category: "实用", runtimeKind: "sidecar" as const, builtinRenderer: null },
    ]);
    expect(definition[0].icon).toBe(Wrench);
  });
});
