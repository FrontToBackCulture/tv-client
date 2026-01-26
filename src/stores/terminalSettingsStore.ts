// src/stores/terminalSettingsStore.ts
// Persisted store for default terminal working directories per module

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ModuleId } from "./appStore";

interface TerminalSettingsState {
  // Module ID → default directory path
  paths: Partial<Record<ModuleId, string>>;
  getPath: (moduleId: ModuleId) => string | undefined;
  setPath: (moduleId: ModuleId, path: string) => void;
  removePath: (moduleId: ModuleId) => void;
}

export const useTerminalSettingsStore = create<TerminalSettingsState>()(
  persist(
    (set, get) => ({
      paths: {},

      getPath: (moduleId) => get().paths[moduleId],

      setPath: (moduleId, path) =>
        set((state) => ({
          paths: { ...state.paths, [moduleId]: path },
        })),

      removePath: (moduleId) =>
        set((state) => {
          const { [moduleId]: _, ...rest } = state.paths;
          void _;
          return { paths: rest };
        }),
    }),
    { name: "tv-desktop-terminal-settings" }
  )
);
