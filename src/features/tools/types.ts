import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

import type { RiskLevel } from "../../shared/tauri/types";

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  icon: LucideIcon;
  routePath: string;
  tags: string[];
  riskLevel: RiskLevel;
  requiresElevation: boolean;
  permissionRequirement: string;
  dataAccess: string;
  detailDescription: string;
  lastRunAt: string;
  runCount: number;
  averageDurationMs: number;
  lastResult: "success" | "failed" | "never";
  component: ComponentType;
}
