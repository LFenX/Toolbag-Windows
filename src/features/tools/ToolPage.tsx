import { useParams } from "@tanstack/react-router";

import { WorkbenchPage } from "../workbench/WorkbenchPage";
import { getLocalTool } from "./registry";

export function ToolPage() {
  const { toolId } = useParams({ from: "/tools/$toolId" });
  const selectedTool = getLocalTool(toolId);

  if (!selectedTool) {
    return <WorkbenchPage selectedToolId={toolId} />;
  }

  const ToolComponent = selectedTool.component;

  return <ToolComponent />;
}
