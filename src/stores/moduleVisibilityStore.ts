// src/stores/moduleVisibilityStore.ts
// Module visibility toggle — hide/show modules in the sidebar
// Workspace modules → team config → local storage (in priority order)

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createWorkspaceScopedStorage } from "../lib/workspaceScopedStorage";
import { useTeamConfigStore } from "./teamConfigStore";
import { useAuth } from "./authStore";
import { useWorkspaceStore } from "./workspaceStore";
import { useModeStore } from "./modeStore";
import { modeFiltersModules, modulesForMode } from "../config/modes";

interface ModuleVisibilityState {
  hiddenModules: string[];
  toggleModule: (moduleId: string) => void;
  /** Returns whether a module should appear in the sidebar. When `ignoreMode`
   *  is true, the mode-based narrowing filter is skipped — used by the
   *  "redirect away from hidden active tab" safety net so that cross-mode
   *  tabs (explicitly opened via shortcut or deep link) aren't force-closed
   *  on every mode switch. */
  isModuleVisible: (moduleId: string, opts?: { ignoreMode?: boolean }) => boolean;
  setHiddenModules: (modules: string[]) => void;
}

export const useModuleVisibilityStore = create<ModuleVisibilityState>()(
  persist(
    (set, get) => ({
      hiddenModules: [],
      toggleModule: (moduleId: string) => {
        const { hiddenModules } = get();
        if (hiddenModules.includes(moduleId)) {
          set({ hiddenModules: hiddenModules.filter((id) => id !== moduleId) });
        } else {
          set({ hiddenModules: [...hiddenModules, moduleId] });
        }
      },
      isModuleVisible: (moduleId: string, opts?: { ignoreMode?: boolean }) => {
        // Home and Settings are always visible — every workspace needs them
        if (moduleId === "home" || moduleId === "settings") return true;

        // Personal-workspace-only modules. Hard-gated by workspace slug so
        // they never leak into ThinkVAL or client workspaces even if someone
        // deep-links or if a future bug bypasses the normal allowlist. Match
        // the same "melly" slug used by the personal connector registry
        // (src/modules/settings/integrations/connectors.personal.tsx).
        const PERSONAL_ONLY_MODULES = new Set(["investment"]);
        const PERSONAL_WORKSPACE_SLUGS = new Set(["melly"]);
        if (PERSONAL_ONLY_MODULES.has(moduleId)) {
          const ws = useWorkspaceStore.getState().getActiveWorkspace();
          return ws != null && PERSONAL_WORKSPACE_SLUGS.has(ws.slug);
        }

        // Mode filter (narrowing): when a non-`all` mode is active, the module
        // must be in that mode's universal ∪ primary set. `all` mode skips
        // this step and falls through to the existing visibility rules.
        // Callers can pass { ignoreMode: true } to bypass this layer — used
        // for tab-level checks where cross-mode tabs are allowed to stick
        // around even though they're hidden from the sidebar.
        if (!opts?.ignoreMode) {
          const activeMode = useModeStore.getState().activeMode;
          if (modeFiltersModules(activeMode)) {
            const allowed = modulesForMode(activeMode);
            if (!allowed.has(moduleId as never)) return false;
          }
        }

        // Check workspace module allowlist first (highest priority)
        const ws = useWorkspaceStore.getState().getActiveWorkspace();
        if (ws?.modules) {
          return ws.modules.includes(moduleId);
        }
        // Check team config
        const user = useAuth.getState().user;
        const teamConfig = useTeamConfigStore.getState();
        if (user && teamConfig.config) {
          const visibleModules = teamConfig.getVisibleModules(user.login);
          if (visibleModules !== "all") {
            return visibleModules.includes(moduleId as never);
          }
        }
        // Fall back to local storage
        return !get().hiddenModules.includes(moduleId);
      },
      setHiddenModules: (modules: string[]) => {
        set({ hiddenModules: modules });
      },
    }),
    {
      name: "tv-client-module-visibility",
      storage: createJSONStorage(() => createWorkspaceScopedStorage()),
    }
  )
);
