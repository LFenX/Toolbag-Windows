import { describe, expect, it } from "vitest";

import { defaultSettings } from "../../shared/tauri/types";

describe("settings defaults", () => {
  it("keeps telemetry disabled by default", () => {
    expect(defaultSettings.telemetryEnabled).toBe(false);
  });

  it("starts with the environment tool as a favorite", () => {
    expect(defaultSettings.favoriteToolIds).toContain("environment-overview");
  });
});
