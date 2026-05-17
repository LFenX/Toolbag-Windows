import { render, screen } from "@testing-library/react";
import { MonitorCog } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fallbackTools } from "../../shared/tauri/types";
import { ToolPage } from "./ToolPage";

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useTools: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: mocks.useParams,
}));

vi.mock("./useTools", () => ({
  useTools: mocks.useTools,
}));

function MergedTool() {
  return <div>merged manifest tool</div>;
}

beforeEach(() => {
  mocks.useParams.mockReturnValue({ toolId: "environment-overview" });
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

describe("ToolPage", () => {
  it("renders the component from the composed tool definition", () => {
    render(<ToolPage />);

    expect(screen.getByText("merged manifest tool")).toBeInTheDocument();
  });
});
