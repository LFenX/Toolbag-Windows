import { create } from "zustand";

interface WorkspaceState {
  categoryFilter: string;
  isAddToolDialogOpen: boolean;
  search: string;
  setAddToolDialogOpen: (isOpen: boolean) => void;
  setCategoryFilter: (categoryFilter: string) => void;
  setSearch: (search: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  categoryFilter: "all",
  isAddToolDialogOpen: false,
  search: "",
  setAddToolDialogOpen: (isOpen) => {
    set({ isAddToolDialogOpen: isOpen });
  },
  setCategoryFilter: (categoryFilter) => {
    set({ categoryFilter });
  },
  setSearch: (search) => {
    set({ search });
  },
}));
