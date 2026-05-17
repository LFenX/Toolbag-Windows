import { describe, expect, it } from "vitest";

import { formatDuration, formatLastResult, formatLastRun, getRiskDisplay } from "./display";

describe("tool display helpers", () => {
  it("shows all risk levels distinctly", () => {
    expect(getRiskDisplay("safe").label).toBe("安全");
    expect(getRiskDisplay("caution").label).toBe("谨慎");
    expect(getRiskDisplay("elevated").label).toBe("需提权");
  });

  it("formats empty run stats", () => {
    expect(formatLastRun(null)).toBe("未运行");
    expect(formatDuration(null)).toBe("未运行");
    expect(formatLastResult("cancelled")).toBe("已取消");
  });
});
