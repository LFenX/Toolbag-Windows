import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

import type { ToolManifest } from "../../shared/tauri/types";

export interface LocalToolRegistration {
  id: string;
  icon: LucideIcon;
  component: ComponentType;
}

export interface ToolDefinition extends ToolManifest, LocalToolRegistration {}
