// ---------------------------------------------------------------------------
// Workspace appearance overrides
//
// Per-user, per-device overrides for how workspaces look (color, etc.). These
// live in localStorage and do NOT touch the gateway `workspaces` table — they
// are purely personal preferences and don't affect other members of the same
// workspace.
//
// Lookup order when rendering the accent (see `useWorkspaceAccent` in Shell):
//   1. Local override for this workspace → use it
//   2. Gateway `workspaces.color` from the workspace store → use it
//   3. Fallback to VAL teal
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkspaceAppearanceState {
  /** workspace id → hex color (e.g. "#f59e0b"). */
  colorOverrides: Record<string, string>;

  setColor: (workspaceId: string, color: string) => void;
  clearColor: (workspaceId: string) => void;
}

export const useWorkspaceAppearanceStore = create<WorkspaceAppearanceState>()(
  persist(
    (set) => ({
      colorOverrides: {},

      setColor: (workspaceId, color) =>
        set((state) => ({
          colorOverrides: { ...state.colorOverrides, [workspaceId]: color },
        })),

      clearColor: (workspaceId) =>
        set((state) => {
          const next = { ...state.colorOverrides };
          delete next[workspaceId];
          return { colorOverrides: next };
        }),
    }),
    {
      // Global (not workspace-scoped) — this IS a cross-workspace preference.
      name: "tv-client-workspace-appearance",
    },
  ),
);
