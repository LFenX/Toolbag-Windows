import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MonitorCog } from "lucide-react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fallbackTools } from "../../shared/tauri/types";
import { ToolPage } from "./ToolPage";

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useTools: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: mocks.useParams,
  Link: ({ children, ...rest }: PropsWithChildren<Record<string, unknown>>) => {
    void rest;
    return <a href="#">{children}</a>;
  },
  useNavigate: () => () => undefined,
}));

vi.mock("./useTools", () => ({
  useTools: mocks.useTools,
}));

function MergedTool() {
  return <div>merged manifest tool</div>;
}

beforeEach(() => {
  mocks.useParams.mockReturnValue({ toolId: "com.lfen.toolbag.environment-overview" });
  mocks.useTools.mockReturnValue({
    data: [
      {
        ...fallbackTools[0],
        icon: MonitorCog,
        component: MergedTool,
      },
    ],
  });
});

function Wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ToolPage", () => {
  it("renders the builtin component for the environment-overview tool", () => {
    render(<ToolPage />, { wrapper: Wrapper });

    // EnvironmentOverviewTool is the registered builtin renderer and renders the page heading.
    expect(screen.getByRole("heading", { name: "环境概览" })).toBeInTheDocument();
  });

  it("shows the not-found state for an unknown tool id", () => {
    mocks.useParams.mockReturnValue({ toolId: "unknown-tool" });
    render(<ToolPage />, { wrapper: Wrapper });

    expect(screen.getByText("工具不存在")).toBeInTheDocument();
  });
});
