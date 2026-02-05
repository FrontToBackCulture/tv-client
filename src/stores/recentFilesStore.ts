// src/stores/recentFilesStore.ts
// Global store for recent files using Zustand with localStorage persistence

import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENT_FILES = 20;

export interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
  isDirectory: boolean;
}

interface RecentFilesState {
  files: RecentFile[];

  // Actions
  addRecentFile: (path: string, name: string, isDirectory?: boolean) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
}

export const useRecentFilesStore = create<RecentFilesState>()(
  persist(
    (set) => ({
      files: [],

      addRecentFile: (path: string, name: string, isDirectory: boolean = false) => {
        set((state) => {
          // Remove existing entry if present
          const filtered = state.files.filter((f) => f.path !== path);

          // Add to front
          const newFiles: RecentFile[] = [
            { path, name, timestamp: Date.now(), isDirectory },
            ...filtered,
          ].slice(0, MAX_RECENT_FILES);

          return { files: newFiles };
        });
      },

      removeRecentFile: (path: string) => {
        set((state) => ({
          files: state.files.filter((f) => f.path !== path),
        }));
      },

      clearRecentFiles: () => {
        set({ files: [] });
      },
    }),
    {
      name: "tv-client-recent-files",
    }
  )
);

// Hook wrapper for backward compatibility
export function useRecentFiles() {
  const store = useRecentFilesStore();

  // Group files by time period
  const groupedFiles = () => {
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;

    const groups: {
      today: RecentFile[];
      yesterday: RecentFile[];
      pastWeek: RecentFile[];
      earlier: RecentFile[];
    } = {
      today: [],
      yesterday: [],
      pastWeek: [],
      earlier: [],
    };

    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - oneDay;
    const weekStart = todayStart - oneWeek;

    for (const file of store.files) {
      if (file.timestamp >= todayStart) {
        groups.today.push(file);
      } else if (file.timestamp >= yesterdayStart) {
        groups.yesterday.push(file);
      } else if (file.timestamp >= weekStart) {
        groups.pastWeek.push(file);
      } else {
        groups.earlier.push(file);
      }
    }

    return groups;
  };

  return {
    recentFiles: store.files,
    groupedFiles,
    addRecentFile: store.addRecentFile,
    removeRecentFile: store.removeRecentFile,
    clearRecentFiles: store.clearRecentFiles,
  };
}
