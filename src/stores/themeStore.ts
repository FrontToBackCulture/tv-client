// src/stores/themeStore.ts
// Visual theme — each theme is a complete look (light or dark is part of
// the theme itself, no separate mode picker).
//
// Switching: <html data-theme="..."> + .dark class + CSS variable cascade.
// Workspace accent color tints whichever theme is active.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyTheme, type ThemeId, THEMES } from "../lib/themes";

const THEME_KEY = "tv-client-theme-v3";
const DEFAULT_THEME: ThemeId = "aurora";

interface ThemeState {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME,
      setTheme: (id) => {
        applyTheme(id);
        set({ themeId: id });
      },
    }),
    {
      name: THEME_KEY,
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.themeId);
      },
    },
  ),
);

// Apply on first import (covers cold boot before rehydrate finishes)
if (typeof window !== "undefined") {
  const raw = localStorage.getItem(THEME_KEY);
  let themeId: ThemeId = DEFAULT_THEME;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const stored = parsed.state?.themeId as ThemeId | undefined;
      if (stored && THEMES[stored]) themeId = stored;
    } catch {
      // Ignore malformed persisted state — fall through to default
    }
  }
  applyTheme(themeId);
}
