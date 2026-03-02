// src/stores/activityBarStore.ts
// Activity bar expand/collapse state

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActivityBarState {
  isExpanded: boolean;
  toggleExpanded: () => void;
}

export const useActivityBarStore = create<ActivityBarState>()(
  persist(
    (set, get) => ({
      isExpanded: false,
      toggleExpanded: () => set({ isExpanded: !get().isExpanded }),
    }),
    { name: "tv-client-activity-bar" }
  )
);
