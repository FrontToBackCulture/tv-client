// src/stores/appStore.ts

import { create } from "zustand";

export type ModuleId = "library" | "work" | "inbox" | "crm" | "console";

interface AppState {
  // Navigation
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;

  // Sync status
  syncStatus: "idle" | "syncing" | "synced" | "error";
  setSyncStatus: (status: AppState["syncStatus"]) => void;

  // Terminal
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminal: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  activeModule: "library",
  setActiveModule: (module) => set({ activeModule: module }),

  // Sync
  syncStatus: "idle",
  setSyncStatus: (status) => set({ syncStatus: status }),

  // Terminal
  terminalOpen: false,
  setTerminalOpen: (open) => set({ terminalOpen: open }),
  toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
}));
