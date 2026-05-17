import { z } from "zod";

import rawToolMetadata from "./manifest.json";
import type { ToolManifest } from "../tauri/types";

export const riskLevelSchema = z.enum(["safe", "caution", "elevated"]);
export const lastResultSchema = z.enum(["success", "failed", "cancelled", "never"]);
export const runtimeKindSchema = z.enum(["none", "builtin", "sidecar"]);

export const toolManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  version: z.string().min(1),
  routePath: z.string().min(1),
  tags: z.array(z.string()),
  riskLevel: riskLevelSchema,
  requiresElevation: z.boolean(),
  permissionRequirement: z.string().min(1),
  dataAccess: z.string().min(1),
  detailDescription: z.string().min(1),
  runtimeKind: runtimeKindSchema.default("builtin"),
  builtinRenderer: z.string().nullable().default(null),
  bundled: z.boolean().default(false),
  installed: z.boolean().default(true),
  disabled: z.boolean().default(false),
  grantedPerms: z.array(z.string()).default([]),
  minAppVersion: z.string().nullable().default(null),
  lastRunAt: z.string().nullable().default(null),
  runCount: z.number().int().nonnegative().default(0),
  averageDurationMs: z.number().int().nonnegative().nullable().default(null),
  lastResult: lastResultSchema.default("never"),
  icon: z.string().nullable().default(null),
  uiSchemaPath: z.string().nullable().default(null),
  permissionsRequired: z.array(z.string()).default([]),
}) satisfies z.ZodType<ToolManifest>;

export const toolManifestListSchema = z.array(toolManifestSchema);

export const fallbackTools: ToolManifest[] = toolManifestListSchema.parse(rawToolMetadata);
