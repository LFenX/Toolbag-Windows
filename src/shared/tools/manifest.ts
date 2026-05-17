import { z } from "zod";

import rawToolMetadata from "./manifest.json";
import type { ToolManifest, ToolManifestMetadata } from "../tauri/types";

export const riskLevelSchema = z.enum(["safe", "caution", "elevated"]);
export const lastResultSchema = z.enum(["success", "failed", "cancelled", "never"]);

export const toolManifestMetadataSchema = z.object({
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
}) satisfies z.ZodType<ToolManifestMetadata>;

export const toolManifestSchema = toolManifestMetadataSchema.extend({
  lastRunAt: z.string().nullable(),
  runCount: z.number().int().nonnegative(),
  averageDurationMs: z.number().int().nonnegative().nullable(),
  lastResult: lastResultSchema,
}) satisfies z.ZodType<ToolManifest>;

export const toolManifestListSchema = z.array(toolManifestSchema);

export const toolManifestMetadata = z
  .array(toolManifestMetadataSchema)
  .parse(rawToolMetadata);

export const fallbackTools: ToolManifest[] = toolManifestMetadata.map((tool) => ({
  ...tool,
  lastRunAt: null,
  runCount: 0,
  averageDurationMs: null,
  lastResult: "never",
}));
