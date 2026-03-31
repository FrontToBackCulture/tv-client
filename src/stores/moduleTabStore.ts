// src/stores/moduleTabStore.ts
// Manages top-level module tabs (Notion-style). Persisted to localStorage.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ModuleId } from "./appStore";

interface ModuleTabState {
  tabs: ModuleId[];
  activeTab: ModuleId;
  openTab: (id: ModuleId) => void;
  closeTab: (id: ModuleId) => void;
  setActiveTab: (id: ModuleId) => void;
  closeOtherTabs: (id: ModuleId) => void;
  closeTabsToRight: (id: ModuleId) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
}

// On first load (no persisted state), inherit from appStore's last module
function getInitialState(): { tabs: ModuleId[]; activeTab: ModuleId } {
  const lastModule = (localStorage.getItem("tv-client-last-module") as ModuleId) || "home";
  return { tabs: [lastModule], activeTab: lastModule };
}

const initial = getInitialState();

export const useModuleTabStore = create<ModuleTabState>()(
  persist(
    (set, get) => ({
      tabs: initial.tabs,
      activeTab: initial.activeTab,

      openTab: (id) => {
        const { tabs } = get();
        if (tabs.includes(id)) {
          set({ activeTab: id });
        } else {
          set({ tabs: [...tabs, id], activeTab: id });
        }
      },

      closeTab: (id) => {
        const { tabs, activeTab } = get();
        if (tabs.length <= 1) return; // Keep at least one tab
        const idx = tabs.indexOf(id);
        const newTabs = tabs.filter((t) => t !== id);
        if (activeTab === id) {
          // Switch to the tab at the same position, or the last one
          const newActive = idx < newTabs.length ? newTabs[idx] : newTabs[newTabs.length - 1];
          set({ tabs: newTabs, activeTab: newActive });
        } else {
          set({ tabs: newTabs });
        }
      },

      setActiveTab: (id) => set({ activeTab: id }),

      closeOtherTabs: (id) => set({ tabs: [id], activeTab: id }),

      closeTabsToRight: (id) => {
        const { tabs } = get();
        const idx = tabs.indexOf(id);
        if (idx === -1) return;
        set({ tabs: tabs.slice(0, idx + 1), activeTab: id });
      },

      reorderTab: (fromIndex, toIndex) => {
        const { tabs } = get();
        const newTabs = [...tabs];
        const [moved] = newTabs.splice(fromIndex, 1);
        newTabs.splice(toIndex, 0, moved);
        set({ tabs: newTabs });
      },
    }),
    {
      name: "tv-client-module-tabs",
    }
  )
);
