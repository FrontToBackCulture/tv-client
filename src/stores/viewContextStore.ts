// src/stores/viewContextStore.ts
// Lightweight store for modules to report their current view/tab/screen.
// The help bot reads this to give context-aware answers.

import { create } from "zustand";

interface ViewContext {
  /** Current tab/view name within the module (e.g. "pipeline", "board") */
  view: string | null;
  /** Human-readable label for the view (e.g. "Pipeline", "Board View") */
  viewLabel: string | null;
  /** Extra detail like selected entity (e.g. "Company: Acme Corp") */
  detail: string | null;
}

interface ViewContextState extends ViewContext {
  setView: (view: string, viewLabel: string) => void;
  setDetail: (detail: string | null) => void;
  clear: () => void;
}

export const useViewContextStore = create<ViewContextState>((set) => ({
  view: null,
  viewLabel: null,
  detail: null,

  setView: (view, viewLabel) => set({ view, viewLabel, detail: null }),
  setDetail: (detail) => set({ detail }),
  clear: () => set({ view: null, viewLabel: null, detail: null }),
}));
