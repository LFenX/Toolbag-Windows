import { cn } from "../../shared/lib/utils";
import { useTabsStore } from "../../app/shell/tab-store";
import type { ToolTab } from "../../app/shell/tab-store";
import { ToolView } from "./ToolView";

/**
 * Hosts every open tool tab as a mounted React subtree. The active tab is
 * visible; inactive ones stay mounted under `display: none` so their plugin
 * jobs, sidecar streams, and form state survive a tab switch.
 *
 * Each `<ToolView>` is keyed by `instanceId` so React keeps the subtree
 * stable across reorders and never reuses state between two tabs that happen
 * to point at the same `toolId`.
 */
export function ToolHost() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeInstanceId = useTabsStore((s) => s.activeInstanceId);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="relative h-full">
      {tabs.map((tab: ToolTab) => {
        const isActive = tab.instanceId === activeInstanceId;
        return (
          <div
            key={tab.instanceId}
            className={cn(
              "absolute inset-0 h-full w-full overflow-auto",
              // `content-visibility: hidden` lets the browser skip layout +
              // paint for inactive tabs' subtrees while keeping the DOM /
              // React tree / scroll positions alive. Without this every
              // sidebar-resize frame would reflow every mounted SchemaForm.
              isActive
                ? "z-10"
                : "pointer-events-none [content-visibility:hidden]",
            )}
            aria-hidden={!isActive}
          >
            <ToolView toolId={tab.toolId} />
          </div>
        );
      })}
    </div>
  );
}
