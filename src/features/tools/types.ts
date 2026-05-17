import type { ComponentType, LazyExoticComponent } from "react";
import type { LucideIcon } from "lucide-react";

import type { ToolManifest } from "../../shared/tauri/types";

export type ToolRendererComponent =
  | ComponentType
  | LazyExoticComponent<ComponentType>;

/// A host-provided React renderer component. Most plugins use the
/// declarative SchemaForm + ResultRenderer path; a small number of
/// first-party tools can pair a host renderer with a sidecar runtime.
export interface BuiltinRegistration {
  /// Matches `tool.json.builtinRenderer`.
  rendererKey: string;
  icon: LucideIcon;
  component: ToolRendererComponent;
}

export interface ToolDefinition extends Omit<ToolManifest, "icon"> {
  icon: LucideIcon;
  iconKey: string | null;
  component: ToolRendererComponent | null;
}
