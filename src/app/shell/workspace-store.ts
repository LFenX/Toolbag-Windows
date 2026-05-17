import { create } from "zustand";

interface WorkspaceState {
  categoryFilter: string;
  isAddToolDialogOpen: boolean;
  isCommandPaletteOpen: boolean;
  isSidebarCollapsed: boolean;
  search: string;
  setAddToolDialogOpen: (isOpen: boolean) => void;
  setCategoryFilter: (categoryFilter: string) => void;
  setCommandPaletteOpen: (isOpen: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSearch: (search: string) => void;
  toggleCommandPalette: () => void;
  toggleSidebar: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  categoryFilter: "all",
  isAddToolDialogOpen: false,
  isCommandPaletteOpen: false,
  isSidebarCollapsed: false,
  search: "",
  setAddToolDialogOpen: (isOpen) => { set({ isAddToolDialogOpen: isOpen }); },
  setCategoryFilter: (categoryFilter) => { set({ categoryFilter }); },
  setCommandPaletteOpen: (isOpen) => { set({ isCommandPaletteOpen: isOpen }); },
  setSidebarCollapsed: (collapsed) => { set({ isSidebarCollapsed: collapsed }); },
  setSearch: (search) => { set({ search }); },
  toggleCommandPalette: () =>
    { set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })); },
  toggleSidebar: () =>
    { set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })); },
}));
