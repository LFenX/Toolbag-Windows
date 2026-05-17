import { describe, expect, it } from "vitest";
import { MonitorCog, Wrench } from "lucide-react";

import { fallbackTools } from "../../shared/tauri/types";
import { composeToolDefinitions, localToolRegistry } from "./registry";

function StubTool() {
  return null;
}

describe("tool registry", () => {
  it("keeps backend manifests mapped to frontend components", () => {
    const definitions = composeToolDefinitions(fallbackTools);

    expect(definitions).toHaveLength(fallbackTools.length);
    expect(definitions[0]).toMatchObject({
      id: "environment-overview",
      name: "环境概览",
      component: localToolRegistry[0].component,
    });
  });

  it("declares safe defaults for the initial tool", () => {
    const tool = composeToolDefinitions(fallbackTools).find(
      (item) => item.id === "environment-overview",
    );

    expect(tool).toMatchObject({
      riskLevel: "safe",
      requiresElevation: false,
      routePath: "/tools/environment-overview",
    });
  });

  it("fails when a manifest has no frontend component", () => {
    expect(() => composeToolDefinitions(fallbackTools, [])).toThrow(
      "Tool environment-overview is missing a frontend component.",
    );
  });

  it("fails when a frontend component has no manifest", () => {
    expect(() =>
      composeToolDefinitions(fallbackTools, [
        ...localToolRegistry,
        { id: "orphan-tool", icon: Wrench, component: StubTool },
      ]),
    ).toThrow("Tool orphan-tool is missing a manifest.");
  });

  it("detects duplicate frontend registrations", () => {
    expect(() =>
      composeToolDefinitions(fallbackTools, [
        { id: "environment-overview", icon: MonitorCog, component: StubTool },
        { id: "environment-overview", icon: MonitorCog, component: StubTool },
      ]),
    ).toThrow("Tool environment-overview has duplicate frontend registrations.");
  });
});
