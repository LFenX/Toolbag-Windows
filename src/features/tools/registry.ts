import { MonitorCog } from "lucide-react";

import { EnvironmentOverviewTool } from "./environment-overview/EnvironmentOverviewTool";
import type { ToolDefinition } from "./types";

export const localToolRegistry: ToolDefinition[] = [
  {
    id: "environment-overview",
    name: "环境概览",
    description: "查看 Toolbag 当前运行环境、应用信息和 Windows 本机环境信息。",
    category: "系统",
    version: "1.0.0",
    icon: MonitorCog,
    routePath: "/tools/environment-overview",
    tags: ["系统", "诊断", "只读"],
    riskLevel: "safe",
    requiresElevation: false,
    permissionRequirement: "普通权限",
    dataAccess: "仅读取本地环境信息",
    detailDescription:
      "展示本机操作系统、CPU、内存、磁盘、网卡、进程、服务、驱动、环境变量和常用只读配置。",
    lastRunAt: "刚刚",
    runCount: 1,
    averageDurationMs: 800,
    lastResult: "success",
    component: EnvironmentOverviewTool,
  },
];

export function getLocalTool(toolId: string) {
  return localToolRegistry.find((tool) => tool.id === toolId);
}
