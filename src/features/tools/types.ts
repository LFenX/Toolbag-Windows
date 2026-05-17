import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

import type { ToolManifest } from "../../shared/tauri/types";

/// A built-in React renderer component registered for plugins whose
/// `runtimeKind === "builtin"`. Other plugins use the declarative SchemaForm + ResultRenderer.
export interface BuiltinRegistration {
  /// Matches `tool.json.builtinRenderer`.
  rendererKey: string;
  icon: LucideIcon;
  component: ComponentType;
}

export interface ToolDefinition extends Omit<ToolManifest, "icon"> {
  icon: LucideIcon;
  iconKey: string | null;
  component: ComponentType | null;
}
