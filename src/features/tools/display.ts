import type { LastResult, RiskLevel } from "../../shared/tauri/types";

export function getRiskDisplay(riskLevel: RiskLevel) {
  switch (riskLevel) {
    case "safe":
      return {
        label: "安全",
        badgeVariant: "success" as const,
        valueClassName: "text-emerald-700",
      };
    case "caution":
      return {
        label: "谨慎",
        badgeVariant: "warning" as const,
        valueClassName: "text-amber-700",
      };
    case "elevated":
      return {
        label: "需提权",
        badgeVariant: "warning" as const,
        valueClassName: "text-red-700",
      };
  }
}

export function formatLastRun(lastRunAt: string | null) {
  if (!lastRunAt) {
    return "未运行";
  }
  return lastRunAt;
}

export function formatLastResult(lastResult: LastResult) {
  switch (lastResult) {
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "never":
      return "未运行";
  }
}

export function formatDuration(durationMs: number | null) {
  if (durationMs == null) {
    return "未运行";
  }
  if (durationMs < 1000) {
    return "< 1 秒";
  }
  return `${(durationMs / 1000).toFixed(1)} 秒`;
}
