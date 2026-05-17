import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { EnvironmentOverviewTool } from "./EnvironmentOverviewTool";
import { useEnvironmentScanStore } from "./store";

function renderEnvironmentOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(<EnvironmentOverviewTool />, { wrapper: Wrapper });
}

beforeEach(() => {
  useEnvironmentScanStore.getState().reset();
});

describe("EnvironmentOverviewTool", () => {
  it("renders fallback environment data in browser preview mode", async () => {
    renderEnvironmentOverview();

    expect(await screen.findByRole("heading", { name: "环境概览" })).toBeInTheDocument();
    expect(screen.getAllByText(/Windows 11 Pro 24H2/).length).toBeGreaterThan(0);
    expect(screen.getByText(/扫描完成/)).toBeInTheDocument();
  });

  it("renders item cards with name and value", async () => {
    renderEnvironmentOverview();

    await screen.findByRole("heading", { name: "环境概览" });
    expect(screen.getAllByText(/Intel Core i7/).length).toBeGreaterThan(0);
  });

  it("filters items by search query and highlights matches", async () => {
    const user = userEvent.setup();
    renderEnvironmentOverview();

    const search = await screen.findByLabelText("搜索环境信息");
    await user.type(search, "PowerShell");

    expect(
      screen.getAllByText((_, el) => el?.textContent === "PATH · PowerShell").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("PowerShell")[0].tagName).toBe("MARK");
  });

  it("filters by parent category from the sidebar", async () => {
    const user = userEvent.setup();
    renderEnvironmentOverview();

    await screen.findByRole("heading", { name: "环境概览" });
    const pathButton = screen.getByRole("button", { name: "分类 PATH" });
    await user.click(pathButton);

    expect(screen.getByText("PATH · PowerShell")).toBeInTheDocument();
    expect(screen.queryByText("Intel Core i7-13700H · 8 核 / 16 线程")).not.toBeInTheDocument();
  });

  it("filters by child category in the tree", async () => {
    const user = userEvent.setup();
    renderEnvironmentOverview();

    const runtimeButton = await screen.findByRole("button", { name: "分类 开发运行时" });
    await user.click(runtimeButton);

    expect(screen.getAllByText("node").length).toBeGreaterThan(0);
    expect(screen.queryByText("TEMP")).not.toBeInTheDocument();
  });

  it("expands a card in-place on click", async () => {
    const user = userEvent.setup();
    renderEnvironmentOverview();

    await screen.findByRole("heading", { name: "环境概览" });
    const defenderCard = screen.getAllByText("Microsoft Defender")[0].closest("button");
    expect(defenderCard).not.toBeNull();
    if (!defenderCard) return;

    await user.click(defenderCard);

    expect(screen.getByText("原始值")).toBeInTheDocument();
    expect(screen.getByText("关键字段")).toBeInTheDocument();
  });

  it("supports the issue-only filter toggle", async () => {
    const user = userEvent.setup();
    renderEnvironmentOverview();

    await screen.findByRole("heading", { name: "环境概览" });
    await user.click(screen.getByRole("button", { name: "仅异常项" }));

    expect(screen.getByText("没有匹配的环境项")).toBeInTheDocument();
  });
});
