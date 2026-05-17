import { describe, expect, it } from "vitest";

import { fallbackTools } from "../../shared/tauri/types";
import { localToolRegistry } from "./registry";

describe("tool registry", () => {
  it("keeps backend manifests mapped to frontend components", () => {
    const localToolIds = new Set(localToolRegistry.map((tool) => tool.id));

    expect(localToolIds.has("environment-overview")).toBe(true);
    expect(
      fallbackTools.every((manifest) => localToolIds.has(manifest.id)),
    ).toBe(true);
  });

  it("declares safe defaults for the initial tool", () => {
    const tool = localToolRegistry.find(
      (item) => item.id === "environment-overview",
    );

    expect(tool).toMatchObject({
      riskLevel: "safe",
      requiresElevation: false,
      routePath: "/tools/environment-overview",
    });
  });
});
