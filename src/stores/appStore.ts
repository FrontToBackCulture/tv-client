// src/stores/appStore.ts

import { create } from "zustand";

export type ModuleId = "library" | "work" | "inbox" | "crm" | "bot" | "console" | "settings";
export type Theme = "light" | "dark";

// Get initial theme from localStorage or system preference
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("tv-desktop-theme") as Theme | null;
  if (stored) return stored;
  // Check system preference
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

// Apply theme to document
function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  localStorage.setItem("tv-desktop-theme", theme);
}

interface AppState {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Navigation
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;

  // Sync status
  syncStatus: "idle" | "syncing" | "synced" | "error";
  setSyncStatus: (status: AppState["syncStatus"]) => void;

  // Terminal
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminal: () => void;
}

// Initialize theme on load
const initialTheme = getInitialTheme();
applyTheme(initialTheme);

export const useAppStore = create<AppState>((set) => ({
  // Theme
  theme: initialTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === "dark" ? "light" : "dark";
      applyTheme(newTheme);
      return { theme: newTheme };
    }),

  // Navigation
  activeModule: "library",
  setActiveModule: (module) => set({ activeModule: module }),

  // Sync
  syncStatus: "idle",
  setSyncStatus: (status) => set({ syncStatus: status }),

  // Terminal
  terminalOpen: false,
  setTerminalOpen: (open) => set({ terminalOpen: open }),
  toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
}));
