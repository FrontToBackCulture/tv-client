// src/stores/notificationNavStore.ts
// Ephemeral store for notification-triggered navigation
// When a notification is clicked, we set a target here.
// The target module reads it on mount/change and navigates to the entity.

import { create } from "zustand";

interface NotificationNavTarget {
  entityType: string;
  entityId: string;
  openDiscussion?: boolean; // auto-open the discussion panel
  timestamp: number; // to detect staleness
}

interface NotificationNavState {
  target: NotificationNavTarget | null;
  setTarget: (entityType: string, entityId: string, openDiscussion?: boolean) => void;
  clearTarget: () => void;
}

export const useNotificationNavStore = create<NotificationNavState>((set) => ({
  target: null,
  setTarget: (entityType, entityId, openDiscussion = true) =>
    set({ target: { entityType, entityId, openDiscussion, timestamp: Date.now() } }),
  clearTarget: () => set({ target: null }),
}));
