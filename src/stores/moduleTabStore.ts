// src/stores/moduleTabStore.ts
// Manages top-level module tabs, scoped per mode. Each mode (sell, support,
// marketing, all) keeps its own tab list and active tab so switching modes
// swaps the entire tab bar. Persisted per workspace.
//
// All mutator methods operate on the *currently active mode* (read from
// modeStore on each call). Reads should go through the `useActiveTabs` /
// `useActiveTab` / `useMountedTabs` hooks below, which are reactive to both
// stores.
//
// Soft-close model: closing a tab moves it to `hiddenTabsByMode` (LRU pool,
// capped at MAX_HIDDEN_PER_MODE) instead of unmounting. App.tsx renders the
// union of visible+hidden so reopening is instant — the module subtree stays
// mounted, queries stay subscribed, scroll/state preserved. The visible tab
// strip (ModuleTabBar) only shows `tabsByMode`.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createWorkspaceScopedStorage } from "../lib/workspaceScopedStorage";
import { ModuleId } from "./appStore";
import { ALL_MODES, Mode, MODES } from "../config/modes";
import { useModeStore } from "./modeStore";

type TabsByMode = Record<Mode, ModuleId[]>;
type ActiveTabByMode = Record<Mode, ModuleId>;

// Cap on soft-closed tabs kept mounted per mode. Bounded by total module
// count (~28), so even at the cap memory is predictable. Front of array =
// most recently hidden (LRU eviction from the back).
const MAX_HIDDEN_PER_MODE = 12;

interface ModuleTabState {
  tabsByMode: TabsByMode;
  hiddenTabsByMode: TabsByMode;
  activeTabByMode: ActiveTabByMode;
  openTab: (id: ModuleId) => void;
  closeTab: (id: ModuleId) => void;
  setActiveTab: (id: ModuleId) => void;
  closeOtherTabs: (id: ModuleId) => void;
  closeTabsToRight: (id: ModuleId) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
  evictHiddenTab: (id: ModuleId) => void;
}

function emptyTabsByMode(): TabsByMode {
  const out = {} as TabsByMode;
  for (const mode of ALL_MODES) out[mode] = [];
  return out;
}

function buildInitialState(): { tabsByMode: TabsByMode; hiddenTabsByMode: TabsByMode; activeTabByMode: ActiveTabByMode } {
  const tabsByMode = {} as TabsByMode;
  const hiddenTabsByMode = emptyTabsByMode();
  const activeTabByMode = {} as ActiveTabByMode;
  for (const mode of ALL_MODES) {
    const landing = MODES[mode].landing;
    tabsByMode[mode] = [landing];
    activeTabByMode[mode] = landing;
  }
  return { tabsByMode, hiddenTabsByMode, activeTabByMode };
}

const initial = buildInitialState();

function currentMode(): Mode {
  return useModeStore.getState().activeMode;
}

// Push id to front of hidden list (LRU), dedupe, cap at MAX_HIDDEN_PER_MODE.
function pushHidden(hidden: ModuleId[], id: ModuleId): ModuleId[] {
  const filtered = hidden.filter((t) => t !== id);
  return [id, ...filtered].slice(0, MAX_HIDDEN_PER_MODE);
}

export const useModuleTabStore = create<ModuleTabState>()(
  persist(
    (set, get) => ({
      tabsByMode: initial.tabsByMode,
      hiddenTabsByMode: initial.hiddenTabsByMode,
      activeTabByMode: initial.activeTabByMode,

      openTab: (id) => {
        const mode = currentMode();
        const { tabsByMode, hiddenTabsByMode, activeTabByMode } = get();
        const tabs = tabsByMode[mode] ?? [];
        const hidden = hiddenTabsByMode[mode] ?? [];
        if (tabs.includes(id)) {
          set({ activeTabByMode: { ...activeTabByMode, [mode]: id } });
          return;
        }
        // Reopen from hidden pool — keeps subtree mounted (instant).
        const wasHidden = hidden.includes(id);
        set({
          tabsByMode: { ...tabsByMode, [mode]: [...tabs, id] },
          hiddenTabsByMode: wasHidden
            ? { ...hiddenTabsByMode, [mode]: hidden.filter((t) => t !== id) }
            : hiddenTabsByMode,
          activeTabByMode: { ...activeTabByMode, [mode]: id },
        });
      },

      closeTab: (id) => {
        const mode = currentMode();
        const { tabsByMode, hiddenTabsByMode, activeTabByMode } = get();
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
          hiddenTabsByMode: {
            ...hiddenTabsByMode,
            [mode]: pushHidden(hiddenTabsByMode[mode] ?? [], id),
          },
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
        const { tabsByMode, hiddenTabsByMode, activeTabByMode } = get();
        const tabs = tabsByMode[mode] ?? [];
        const closed = tabs.filter((t) => t !== id);
        let nextHidden = hiddenTabsByMode[mode] ?? [];
        for (const t of closed) nextHidden = pushHidden(nextHidden, t);
        set({
          tabsByMode: { ...tabsByMode, [mode]: [id] },
          hiddenTabsByMode: { ...hiddenTabsByMode, [mode]: nextHidden },
          activeTabByMode: { ...activeTabByMode, [mode]: id },
        });
      },

      closeTabsToRight: (id) => {
        const mode = currentMode();
        const { tabsByMode, hiddenTabsByMode, activeTabByMode } = get();
        const tabs = tabsByMode[mode] ?? [];
        const idx = tabs.indexOf(id);
        if (idx === -1) return;
        const closed = tabs.slice(idx + 1);
        let nextHidden = hiddenTabsByMode[mode] ?? [];
        for (const t of closed) nextHidden = pushHidden(nextHidden, t);
        set({
          tabsByMode: { ...tabsByMode, [mode]: tabs.slice(0, idx + 1) },
          hiddenTabsByMode: { ...hiddenTabsByMode, [mode]: nextHidden },
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

      evictHiddenTab: (id) => {
        const mode = currentMode();
        const { hiddenTabsByMode } = get();
        const hidden = hiddenTabsByMode[mode] ?? [];
        if (!hidden.includes(id)) return;
        set({
          hiddenTabsByMode: {
            ...hiddenTabsByMode,
            [mode]: hidden.filter((t) => t !== id),
          },
        });
      },
    }),
    {
      name: "tv-client-module-tabs",
      version: 3,
      storage: createJSONStorage(() => createWorkspaceScopedStorage()),
      // v1 → v2: flat tabs/activeTab → per-mode.
      // v2 → v3: add hiddenTabsByMode (initialized empty per mode).
      migrate: (persistedState: unknown, fromVersion: number) => {
        let state: any = persistedState;
        if (fromVersion < 2 && state && typeof state === "object") {
          const old = state as { tabs?: ModuleId[]; activeTab?: ModuleId };
          const fresh = buildInitialState();
          if (Array.isArray(old.tabs) && old.tabs.length > 0) {
            fresh.tabsByMode.all = [...old.tabs];
            fresh.activeTabByMode.all = old.activeTab && old.tabs.includes(old.activeTab)
              ? old.activeTab
              : old.tabs[0];
          }
          state = fresh;
        }
        if (fromVersion < 3 && state && typeof state === "object") {
          if (!state.hiddenTabsByMode) state.hiddenTabsByMode = emptyTabsByMode();
        }
        return state as ModuleTabState;
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

// All modules to keep mounted in the DOM for the active mode: visible tabs
// plus the soft-closed (hidden) pool. App.tsx renders this list; only the
// active tab is `display:block`. Reopening a hidden tab is instant because
// its subtree never unmounted.
export function useMountedTabs(): ModuleId[] {
  const mode = useModeStore((s) => s.activeMode);
  const visible = useModuleTabStore((s) => s.tabsByMode[mode] ?? []);
  const hidden = useModuleTabStore((s) => s.hiddenTabsByMode[mode] ?? []);
  const seen = new Set<ModuleId>();
  const out: ModuleId[] = [];
  for (const id of visible) if (!seen.has(id)) { seen.add(id); out.push(id); }
  for (const id of hidden) if (!seen.has(id)) { seen.add(id); out.push(id); }
  return out;
}
