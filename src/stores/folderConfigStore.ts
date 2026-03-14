// src/stores/folderConfigStore.ts
// Persisted store for configurable knowledge base folder names

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FolderConfig, FOLDER_CONFIG_DEFAULTS } from "../lib/folderConfig";

interface FolderConfigState {
  config: FolderConfig;
  setFolderName: (key: keyof FolderConfig, value: string) => void;
  resetToDefaults: () => void;
}

export const useFolderConfigStore = create<FolderConfigState>()(
  persist(
    (set) => ({
      config: { ...FOLDER_CONFIG_DEFAULTS },
      setFolderName: (key, value) =>
        set((state) => ({
          config: { ...state.config, [key]: value },
        })),
      resetToDefaults: () => set({ config: { ...FOLDER_CONFIG_DEFAULTS } }),
    }),
    { name: "tv-client-folder-config" }
  )
);
