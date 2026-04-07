// src/stores/modeStore.ts
// Active mode state — which functional area (Sell/Support/Marketing/All) the
// user is currently in. Modes reshape the sidebar (via isModuleVisible) and
// keep independent tab state (via moduleTabStore). Persisted per workspace.
//
// Initial mode resolution order:
//   1. ?mode=X URL query param (secondary windows / deep links)
//   2. Persisted value in workspace-scoped localStorage
//   3. Default: "all" (admins get the unfiltered view; non-admins are
//      auto-switched to "sell" once team config loads — see App.tsx).

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createWorkspaceScopedStorage } from "../lib/workspaceScopedStorage";
import { ALL_MODES, Mode } from "../config/modes";

interface ModeState {
  activeMode: Mode;
  setMode: (mode: Mode) => void;
}

function getInitialMode(): Mode {
  if (typeof window === "undefined") return "all";
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("mode") as Mode | null;
  if (fromUrl && (ALL_MODES as string[]).includes(fromUrl)) {
    return fromUrl;
  }
  return "all";
}

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      activeMode: getInitialMode(),
      setMode: (mode) => set({ activeMode: mode }),
    }),
    {
      name: "tv-client-active-mode",
      storage: createJSONStorage(() => createWorkspaceScopedStorage()),
    }
  )
);
