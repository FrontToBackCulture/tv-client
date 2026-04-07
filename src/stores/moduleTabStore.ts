// src/stores/moduleTabStore.ts
// Manages top-level module tabs, scoped per mode. Each mode (sell, support,
// marketing, all) keeps its own tab list and active tab so switching modes
// swaps the entire tab bar. Persisted per workspace.
//
// All mutator methods operate on the *currently active mode* (read from
// modeStore on each call). Reads should go through the `useActiveTabs` /
// `useActiveTab` hooks below, which are reactive to both stores.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createWorkspaceScopedStorage } from "../lib/workspaceScopedStorage";
import { ModuleId } from "./appStore";
import { ALL_MODES, Mode, MODES } from "../config/modes";
import { useModeStore } from "./modeStore";

type TabsByMode = Record<Mode, ModuleId[]>;
type ActiveTabByMode = Record<Mode, ModuleId>;

interface ModuleTabState {
  tabsByMode: TabsByMode;
  activeTabByMode: ActiveTabByMode;
  openTab: (id: ModuleId) => void;
  closeTab: (id: ModuleId) => void;
  setActiveTab: (id: ModuleId) => void;
  closeOtherTabs: (id: ModuleId) => void;
  closeTabsToRight: (id: ModuleId) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
}

function buildInitialState(): { tabsByMode: TabsByMode; activeTabByMode: ActiveTabByMode } {
  const tabsByMode = {} as TabsByMode;
  const activeTabByMode = {} as ActiveTabByMode;
  for (const mode of ALL_MODES) {
    const landing = MODES[mode].landing;
    tabsByMode[mode] = [landing];
    activeTabByMode[mode] = landing;
  }
  return { tabsByMode, activeTabByMode };
}

const initial = buildInitialState();

function currentMode(): Mode {
  return useModeStore.getState().activeMode;
}

export const useModuleTabStore = create<ModuleTabState>()(
  persist(
    (set, get) => ({
      tabsByMode: initial.tabsByMode,
      activeTabByMode: initial.activeTabByMode,

      openTab: (id) => {
        const mode = currentMode();
        const { tabsByMode, activeTabByMode } = get();
        const tabs = tabsByMode[mode] ?? [];
        if (tabs.includes(id)) {
          set({ activeTabByMode: { ...activeTabByMode, [mode]: id } });
        } else {
          set({
            tabsByMode: { ...tabsByMode, [mode]: [...tabs, id] },
            activeTabByMode: { ...activeTabByMode, [mode]: id },
          });
        }
      },

      closeTab: (id) => {
        const mode = currentMode();
        const { tabsByMode, activeTabByMode } = get();
        const tabs = tabsByMode[mode] ?? [];
        if (tabs.length <= 1) return; // Keep at least one tab per mode
        const idx = tabs.indexOf(id);
        if (idx === -1) return;
        const newTabs = tabs.filter((t) => t !== id);
        const wasActive = activeTabByMode[mode] === id;
        const newActive = wasActive
          ? (idx < newTabs.length ? newTabs[idx] : newTabs[newTabs.length - 1])
          : activeTabByMode[mode];
        set({
          tabsByMode: { ...tabsByMode, [mode]: newTabs },
          activeTabByMode: { ...activeTabByMode, [mode]: newActive },
        });
      },

      setActiveTab: (id) => {
        const mode = currentMode();
        const { activeTabByMode } = get();
        set({ activeTabByMode: { ...activeTabByMode, [mode]: id } });
      },

      closeOtherTabs: (id) => {
        const mode = currentMode();
        const { tabsByMode, activeTabByMode } = get();
        set({
          tabsByMode: { ...tabsByMode, [mode]: [id] },
          activeTabByMode: { ...activeTabByMode, [mode]: id },
        });
      },

      closeTabsToRight: (id) => {
        const mode = currentMode();
        const { tabsByMode, activeTabByMode } = get();
        const tabs = tabsByMode[mode] ?? [];
        const idx = tabs.indexOf(id);
        if (idx === -1) return;
        set({
          tabsByMode: { ...tabsByMode, [mode]: tabs.slice(0, idx + 1) },
          activeTabByMode: { ...activeTabByMode, [mode]: id },
        });
      },

      reorderTab: (fromIndex, toIndex) => {
        const mode = currentMode();
        const { tabsByMode } = get();
        const tabs = tabsByMode[mode] ?? [];
        const newTabs = [...tabs];
        const [moved] = newTabs.splice(fromIndex, 1);
        newTabs.splice(toIndex, 0, moved);
        set({ tabsByMode: { ...tabsByMode, [mode]: newTabs } });
      },
    }),
    {
      name: "tv-client-module-tabs",
      version: 2,
      storage: createJSONStorage(() => createWorkspaceScopedStorage()),
      // Migrate v1 (flat `tabs` / `activeTab`) → v2 (per-mode). Existing tabs
      // land under `all`; other modes start fresh with their landing module.
      migrate: (persistedState: unknown, fromVersion: number) => {
        if (fromVersion < 2 && persistedState && typeof persistedState === "object") {
          const old = persistedState as { tabs?: ModuleId[]; activeTab?: ModuleId };
          const fresh = buildInitialState();
          if (Array.isArray(old.tabs) && old.tabs.length > 0) {
            fresh.tabsByMode.all = [...old.tabs];
            fresh.activeTabByMode.all = old.activeTab && old.tabs.includes(old.activeTab)
              ? old.activeTab
              : old.tabs[0];
          }
          return fresh;
        }
        return persistedState as ModuleTabState;
      },
    }
  )
);

// ─── Reactive hooks ───────────────────────────────────────────────────────────
// Components should use these instead of reading tabsByMode / activeTabByMode
// directly — they join modeStore + moduleTabStore so switching modes triggers
// a re-render with the new mode's tab slice.

export function useActiveTabs(): ModuleId[] {
  const mode = useModeStore((s) => s.activeMode);
  return useModuleTabStore((s) => s.tabsByMode[mode] ?? []);
}

export function useActiveTab(): ModuleId {
  const mode = useModeStore((s) => s.activeMode);
  return useModuleTabStore((s) => s.activeTabByMode[mode] ?? MODES[mode].landing);
}
