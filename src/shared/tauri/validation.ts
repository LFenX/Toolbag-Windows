import { z } from "zod";

import { defaultSettings } from "./types";
import type { AppSettings } from "./types";

const accentColorSchema = z.union([
  z.literal("indigo"),
  z.literal("emerald"),
  z.literal("rose"),
  z.literal("amber"),
  z.object({ custom: z.string() }),
]);

const logRetentionSchema = z.union([
  z.object({ kind: z.literal("days"), value: z.number().int().positive() }),
  z.object({ kind: z.literal("forever") }),
]);

export const appSettingsSchema = z.object({
  favoriteToolIds: z.array(z.string()).default(defaultSettings.favoriteToolIds),
  appAutoUpdate: z.boolean().default(defaultSettings.appAutoUpdate),
  pluginAutoUpdate: z.boolean().default(defaultSettings.pluginAutoUpdate),
  updateCheckFrequency: z
    .enum(["onStart", "daily", "weekly", "manual"])
    .default(defaultSettings.updateCheckFrequency),
  updateChannel: z.enum(["stable", "beta"]).default(defaultSettings.updateChannel),
  launchAtStartup: z.boolean().default(defaultSettings.launchAtStartup),
  telemetryEnabled: z.boolean().default(false),
  theme: z.enum(["light", "dark", "system"]).default(defaultSettings.theme),
  accent: accentColorSchema.default(defaultSettings.accent),
  density: z.enum(["compact", "comfortable"]).default(defaultSettings.density),
  motion: z.enum(["on", "off", "system"]).default(defaultSettings.motion),
  language: z.string().default(defaultSettings.language),
  startupPage: z.enum(["workbench", "lastTool"]).default(defaultSettings.startupPage),
  recentListSize: z.number().int().positive().default(defaultSettings.recentListSize),
  logRetentionDays: logRetentionSchema.default(defaultSettings.logRetentionDays),
  registryUrl: z.string().nullable().default(null),
  allowUnsigned: z.boolean().default(false),
  maxConcurrentDownloads: z
    .number()
    .int()
    .positive()
    .default(defaultSettings.maxConcurrentDownloads),
  httpProxy: z.string().nullable().default(null),
  fontScale: z.number().int().positive().default(defaultSettings.fontScale),
}) satisfies z.ZodType<AppSettings>;
