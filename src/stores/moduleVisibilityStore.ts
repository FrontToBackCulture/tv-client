// src/stores/moduleVisibilityStore.ts
// Module visibility toggle — hide/show modules in the sidebar
// Team config takes precedence over local storage when available

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useTeamConfigStore } from "./teamConfigStore";
import { useAuth } from "./authStore";

interface ModuleVisibilityState {
  hiddenModules: string[];
  toggleModule: (moduleId: string) => void;
  isModuleVisible: (moduleId: string) => boolean;
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
      isModuleVisible: (moduleId: string) => {
        // Check team config first
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
    { name: "tv-client-module-visibility" }
  )
);
