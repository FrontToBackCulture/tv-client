// src/stores/helpStore.ts
// Zustand store for in-app help bot (no persistence — chat clears on restart)

import { create } from "zustand";

export interface HelpMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  highlightTarget?: string | null;
}

interface HelpState {
  isOpen: boolean;
  messages: HelpMessage[];
  isLoading: boolean;
  highlightTarget: string | null;
  error: string | null;

  open: () => void;
  close: () => void;
  toggle: () => void;
  addMessage: (msg: HelpMessage) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHighlightTarget: (target: string | null) => void;
  clearHighlight: () => void;
}

export const useHelpStore = create<HelpState>((set) => ({
  isOpen: false,
  messages: [],
  isLoading: false,
  highlightTarget: null,
  error: null,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [], error: null }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setHighlightTarget: (target) => set({ highlightTarget: target }),
  clearHighlight: () => set({ highlightTarget: null }),
}));
