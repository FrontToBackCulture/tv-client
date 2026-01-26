// src/stores/tabStore.ts
// Global store for managing open file/folder tabs in the Library module

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tab {
  id: string; // path as unique key
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface SplitFile {
  path: string;
  name: string;
  isDirectory: boolean;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;

  // Split pane (independent of tabs)
  splitFile: SplitFile | null;
  splitOpen: boolean;

  openTab: (path: string, name: string, isDirectory: boolean) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (id: string) => void;

  // Split actions
  openSplit: () => void; // opens split pane (shows picker if no file)
  setSplitFile: (path: string, name: string, isDirectory: boolean) => void;
  closeSplit: () => void;
}

export const useTabStore = create<TabState>()(
  persist(
    (set) => ({
      tabs: [],
      activeTabId: null,
      splitFile: null,
      splitOpen: false,

      openTab: (path: string, name: string, isDirectory: boolean) => {
        set((state) => {
          const existing = state.tabs.find((t) => t.id === path);
          if (existing) {
            return { activeTabId: path };
          }
          return {
            tabs: [...state.tabs, { id: path, path, name, isDirectory }],
            activeTabId: path,
          };
        });
      },

      closeTab: (id: string) => {
        set((state) => {
          const idx = state.tabs.findIndex((t) => t.id === id);
          const newTabs = state.tabs.filter((t) => t.id !== id);

          let newActiveId = state.activeTabId;
          if (state.activeTabId === id) {
            if (newTabs.length === 0) {
              newActiveId = null;
            } else if (idx < newTabs.length) {
              newActiveId = newTabs[idx].id;
            } else {
              newActiveId = newTabs[newTabs.length - 1].id;
            }
          }

          return { tabs: newTabs, activeTabId: newActiveId };
        });
      },

      setActiveTab: (id: string) => {
        set({ activeTabId: id });
      },

      closeAllTabs: () => {
        set({ tabs: [], activeTabId: null, splitOpen: false, splitFile: null });
      },

      closeOtherTabs: (id: string) => {
        set((state) => ({
          tabs: state.tabs.filter((t) => t.id === id),
          activeTabId: id,
        }));
      },

      openSplit: () => {
        set({ splitOpen: true });
      },

      setSplitFile: (path: string, name: string, isDirectory: boolean) => {
        set({ splitFile: { path, name, isDirectory }, splitOpen: true });
      },

      closeSplit: () => {
        set({ splitOpen: false, splitFile: null });
      },
    }),
    {
      name: "tv-desktop-tabs",
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        splitFile: state.splitFile,
        // Don't persist splitOpen — start closed
      }),
    }
  )
);
