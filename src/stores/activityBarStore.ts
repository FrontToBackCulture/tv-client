// src/stores/activityBarStore.ts
// Activity bar expand/hidden state

import { create } from "zustand";
import { persist } from "zustand/middleware";

type SidebarMode = "expanded" | "collapsed" | "hidden";
type SidebarTab = "nav" | "inbox" | "calendar" | "search";

interface ActivityBarState {
  isExpanded: boolean;
  mode: SidebarMode;
  activeTab: SidebarTab;
  width: number;
  pendingTaskId: string | null;
  pendingProjectId: string | null;
  toggleExpanded: () => void;
  setMode: (mode: SidebarMode) => void;
  setActiveTab: (tab: SidebarTab) => void;
  setWidth: (width: number) => void;
  openTask: (taskId: string) => void;
  clearPendingTask: () => void;
  openProject: (projectId: string) => void;
  clearPendingProject: () => void;
}

export const useActivityBarStore = create<ActivityBarState>()(
  persist(
    (set, get) => ({
      isExpanded: false,
      mode: "expanded" as SidebarMode,
      activeTab: "nav" as SidebarTab,
      width: 220,
      pendingTaskId: null,
      pendingProjectId: null,
      toggleExpanded: () => {
        const current = get().mode;
        if (current === "expanded") set({ isExpanded: false, mode: "hidden" });
        else set({ isExpanded: true, mode: "expanded" });
      },
      setMode: (mode: SidebarMode) => set({ mode, isExpanded: mode === "expanded" }),
      setActiveTab: (tab: SidebarTab) => set({ activeTab: tab }),
      setWidth: (width: number) => set({ width: Math.min(400, Math.max(180, width)) }),
      openTask: (taskId: string) => set({ pendingTaskId: taskId }),
      clearPendingTask: () => set({ pendingTaskId: null }),
      openProject: (projectId: string) => set({ pendingProjectId: projectId, pendingTaskId: null }),
      clearPendingProject: () => set({ pendingProjectId: null }),
    }),
    { name: "tv-client-activity-bar" }
  )
);
