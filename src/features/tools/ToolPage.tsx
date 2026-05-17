import { useParams } from "@tanstack/react-router";

import { WorkbenchPage } from "../workbench/WorkbenchPage";
import { useTools } from "./useTools";

export function ToolPage() {
  const { toolId } = useParams({ from: "/tools/$toolId" });
  const { data: tools = [] } = useTools();
  const selectedTool = tools.find((tool) => tool.id === toolId);

  if (!selectedTool) {
    return <WorkbenchPage selectedToolId={toolId} />;
  }

  const ToolComponent = selectedTool.component;

  return <ToolComponent />;
}
