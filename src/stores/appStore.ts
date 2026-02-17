// src/stores/appStore.ts

import { create } from "zustand";

export type ModuleId = "library" | "work" | "inbox" | "crm" | "product" | "bot" | "system" | "settings";
export type Theme = "light" | "dark";
export type SettingsView = "keys" | "val" | "sync" | "mcp" | "claude" | "bots" | null;

const VALID_MODULES: ModuleId[] = ["library", "work", "inbox", "crm", "product", "bot", "system", "settings"];
const LAST_MODULE_KEY = "tv-client-last-module";

// Get initial module: URL param (multi-window) > localStorage (resume) > default
function getInitialModule(): ModuleId {
  if (typeof window === "undefined") return "library";
  // Secondary windows use URL param
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("module") as ModuleId | null;
  if (fromUrl && VALID_MODULES.includes(fromUrl)) {
    return fromUrl;
  }
  // Primary window resumes last module
  const stored = localStorage.getItem(LAST_MODULE_KEY) as ModuleId | null;
  if (stored && VALID_MODULES.includes(stored)) {
    return stored;
  }
  return "library";
}

// Check if this is a secondary (module-specific) window
export function isSecondaryWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("module");
}

// Get initial theme from localStorage or system preference
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("tv-client-theme") as Theme | null;
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
  localStorage.setItem("tv-client-theme", theme);
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

  // Playground
  playgroundMode: boolean;
  togglePlayground: () => void;

  // Settings deep-link
  settingsView: SettingsView;
  setSettingsView: (view: SettingsView) => void;
  openSettings: (view?: SettingsView) => void;
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
  activeModule: getInitialModule(),
  setActiveModule: (module) => {
    localStorage.setItem(LAST_MODULE_KEY, module);
    set({ activeModule: module });
  },

  // Sync
  syncStatus: "idle",
  setSyncStatus: (status) => set({ syncStatus: status }),

  // Terminal
  terminalOpen: false,
  setTerminalOpen: (open) => set({ terminalOpen: open }),
  toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),

  // Playground
  playgroundMode: false,
  togglePlayground: () => set((state) => ({ playgroundMode: !state.playgroundMode })),

  // Settings deep-link
  settingsView: null,
  setSettingsView: (view) => set({ settingsView: view }),
  openSettings: (view) => {
    localStorage.setItem(LAST_MODULE_KEY, "settings");
    set({ activeModule: "settings", settingsView: view ?? null });
  },
}));

// Sync theme across windows via localStorage storage event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "tv-client-theme" && e.newValue) {
      const newTheme = e.newValue as Theme;
      applyTheme(newTheme);
      useAppStore.setState({ theme: newTheme });
    }
  });
}
