// Global "what entity is the user currently looking at" store.
//
// Each module (Work, Projects, CRM, …) syncs its local selection up via a
// useEffect. Consumers (Cmd+J chat modal, future agent panels) read from here.
// Decoupled from notificationNavStore: that one is ephemeral nav, this is
// durable focus state for the lifetime of the selection.

import { create } from "zustand";

export type EntityType =
  | "project"
  | "deal"
  | "task"
  | "company"
  | "contact"
  | "initiative"
  | "blog_article"
  | "skill"
  | "mcp_tool"
  | "domain"
  | "module";

export interface SelectedEntityRef {
  type: EntityType;
  id: string;
}

interface SelectedEntityState {
  current: SelectedEntityRef | null;
  setSelected: (ref: SelectedEntityRef | null) => void;

  chatModalOpen: boolean;
  openChatModal: () => void;
  closeChatModal: () => void;
}

export const useSelectedEntityStore = create<SelectedEntityState>((set) => ({
  current: null,
  setSelected: (ref) =>
    set((s) =>
      s.current?.type === ref?.type && s.current?.id === ref?.id ? s : { current: ref },
    ),

  chatModalOpen: false,
  openChatModal: () => set({ chatModalOpen: true }),
  closeChatModal: () => set({ chatModalOpen: false }),
}));
