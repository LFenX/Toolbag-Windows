import { describe, expect, it } from "vitest";

import { defaultSettings } from "../../shared/tauri/types";
import { appSettingsSchema } from "../../shared/tauri/validation";

describe("settings defaults", () => {
  it("keeps telemetry disabled by default", () => {
    expect(defaultSettings.telemetryEnabled).toBe(false);
  });

  it("starts with the environment tool as a favorite", () => {
    expect(defaultSettings.favoriteToolIds).toContain(
      "com.lfen.toolbag.environment-overview",
    );
  });

  it("hydrates missing fields from defaults via the zod schema", () => {
    const parsed = appSettingsSchema.parse({
      favoriteToolIds: ["com.lfen.toolbag.environment-overview"],
    });
    expect(parsed.theme).toBe(defaultSettings.theme);
    expect(parsed.density).toBe(defaultSettings.density);
    expect(parsed.fontScale).toBe(defaultSettings.fontScale);
  });
});
