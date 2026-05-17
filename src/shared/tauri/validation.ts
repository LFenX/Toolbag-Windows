import { z } from "zod";

import { defaultSettings } from "./types";
import type { AppSettings } from "./types";

export const appSettingsSchema = z.object({
  favoriteToolIds: z.array(z.string()).default(defaultSettings.favoriteToolIds),
  autoCheckUpdates: z.boolean().default(defaultSettings.autoCheckUpdates),
  launchAtStartup: z.boolean().default(defaultSettings.launchAtStartup),
  telemetryEnabled: z.boolean().default(false),
}) satisfies z.ZodType<AppSettings>;
