// src/stores/folderExpansionStore.ts
// Global store for folder expansion state

import { create } from "zustand";

interface FolderExpansionState {
  // Map of folder path -> expanded state
  expandedFolders: Set<string>;

  // Actions
  setExpanded: (path: string, expanded: boolean) => void;
  toggleExpanded: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  collapseToLevel: (maxLevel: number) => void;
  isExpanded: (path: string) => boolean;

  // Track all known folder paths for expand all
  registerFolder: (path: string, level: number) => void;
  registeredFolders: Map<string, number>; // path -> level
}

export const useFolderExpansionStore = create<FolderExpansionState>()((set, get) => ({
  expandedFolders: new Set<string>(),
  registeredFolders: new Map<string, number>(),

  setExpanded: (path: string, expanded: boolean) => {
    set((state) => {
      const newSet = new Set(state.expandedFolders);
      if (expanded) {
        newSet.add(path);
      } else {
        newSet.delete(path);
      }
      return { expandedFolders: newSet };
    });
  },

  toggleExpanded: (path: string) => {
    set((state) => {
      const newSet = new Set(state.expandedFolders);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return { expandedFolders: newSet };
    });
  },

  expandAll: () => {
    set((state) => {
      const newSet = new Set<string>();
      // Expand all registered folders
      state.registeredFolders.forEach((_, path) => {
        newSet.add(path);
      });
      return { expandedFolders: newSet };
    });
  },

  collapseAll: () => {
    set({ expandedFolders: new Set<string>() });
  },

  collapseToLevel: (maxLevel: number) => {
    set((state) => {
      const newSet = new Set<string>();
      // Only keep folders expanded that are at level < maxLevel
      state.registeredFolders.forEach((level, path) => {
        if (level < maxLevel) {
          newSet.add(path);
        }
      });
      return { expandedFolders: newSet };
    });
  },

  isExpanded: (path: string) => {
    return get().expandedFolders.has(path);
  },

  registerFolder: (path: string, level: number) => {
    set((state) => {
      const newMap = new Map(state.registeredFolders);
      if (!newMap.has(path)) {
        newMap.set(path, level);
        // Auto-expand root level only on initial registration
        if (level < 1) {
          const newExpandedSet = new Set(state.expandedFolders);
          newExpandedSet.add(path);
          return { registeredFolders: newMap, expandedFolders: newExpandedSet };
        }
      }
      return { registeredFolders: newMap };
    });
  },
}));

// Hook wrapper for convenience
export function useFolderExpansion() {
  const store = useFolderExpansionStore();

  return {
    isExpanded: store.isExpanded,
    setExpanded: store.setExpanded,
    toggleExpanded: store.toggleExpanded,
    expandAll: store.expandAll,
    collapseAll: store.collapseAll,
    collapseToLevel: store.collapseToLevel,
    registerFolder: store.registerFolder,
  };
}
