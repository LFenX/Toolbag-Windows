import { describe, expect, it } from "vitest";

import { useWorkspaceStore } from "./workspace-store";

describe("workspace store", () => {
  it("stores the current search query", () => {
    useWorkspaceStore.getState().setSearch("env");

    expect(useWorkspaceStore.getState().search).toBe("env");

    useWorkspaceStore.getState().setSearch("");
  });

  it("stores workspace filters and dialog state", () => {
    useWorkspaceStore.getState().setCategoryFilter("system");
    useWorkspaceStore.getState().setAddToolDialogOpen(true);

    expect(useWorkspaceStore.getState().categoryFilter).toBe("system");
    expect(useWorkspaceStore.getState().isAddToolDialogOpen).toBe(true);

    useWorkspaceStore.getState().setCategoryFilter("all");
    useWorkspaceStore.getState().setAddToolDialogOpen(false);
  });
});
