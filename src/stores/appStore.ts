// src/stores/appStore.ts

import { create } from "zustand";

const VALID_MODULES = ["home", "library", "projects", "metadata", "work", "inbox", "calendar", "chat", "crm", "domains", "analytics", "product", "gallery", "lab", "mcp-tools", "portal", "scheduler", "repos", "email", "blog", "guides", "s3browser", "prospecting", "public-data", "referrals", "finance", "shared-inbox", "settings"] as const;

export type ModuleId = (typeof VALID_MODULES)[number];
export type Theme = "light" | "dark";
// Sub-view within the Settings module. Used as a deep-link hint when opening
// the settings tab from another surface (e.g., StatusBar "View All Jobs").
export type SettingsView =
  | "keys" | "val" | "outlook" | "linkedin" | "ga4"
  | "sync" | "folders" | "notion" | "bg-sync"
  | "mcp" | "claude" | "bots" | "project-fields" | "task-fields" | "portal"
  | "appearance"
  | "team" | "diagnostics" | "jobs"
  | null;
const LAST_MODULE_KEY = "tv-client-last-module";

// Modules that have been folded into another module. The legacy ID is
// silently rewritten so old deep links and stored last-module values keep
// working. When rewriting from a URL we also stamp the appropriate sub-tab
// so the user lands where they expect.
const LEGACY_MODULE_REDIRECTS: Record<string, { module: ModuleId; tab?: string }> = {
  skills: { module: "lab", tab: "skills" },
};

// Get initial module: URL param (multi-window) > localStorage (resume) > default
function getInitialModule(): ModuleId {
  if (typeof window === "undefined") return "library";
  // Secondary windows use URL param
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("module");
  if (fromUrl) {
    const redirect = LEGACY_MODULE_REDIRECTS[fromUrl];
    if (redirect) {
      params.set("module", redirect.module);
      if (redirect.tab && !params.has("tab")) params.set("tab", redirect.tab);
      const target = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.replaceState({}, "", target);
      return redirect.module;
    }
    if (VALID_MODULES.includes(fromUrl as ModuleId)) {
      return fromUrl as ModuleId;
    }
  }
  // Primary window resumes last module
  const stored = localStorage.getItem(LAST_MODULE_KEY);
  if (stored) {
    const redirect = LEGACY_MODULE_REDIRECTS[stored];
    if (redirect) {
      localStorage.setItem(LAST_MODULE_KEY, redirect.module);
      return redirect.module;
    }
    if (VALID_MODULES.includes(stored as ModuleId)) {
      return stored as ModuleId;
    }
  }
  return "library";
}

// Check if this is a secondary (module-specific) window
export function isSecondaryWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("module");
}

// Read the *resolved* light/dark from <html> — themeStore owns the source
// of truth; this just mirrors the current state for legacy consumers like
// AG Grid theme styles that read `useAppStore((s) => s.theme)`.
function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
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

  // Settings deep-link hint — set by callers that want the settings module
  // to open on a specific sub-view. The module consumes this on mount and
  // clears it via setSettingsView(null).
  settingsView: SettingsView;
  setSettingsView: (view: SettingsView) => void;
}

// themeStore owns theme application; this mirror just reflects current state.
const initialTheme = getInitialTheme();

export const useAppStore = create<AppState>((set) => ({
  // Theme — read-only mirror of the resolved light/dark state for legacy
  // consumers (AG Grid styles etc.). To change theme, use
  // useThemeStore.setTheme() in themeStore.ts.
  theme: initialTheme,
  setTheme: (theme) => {
    // Legacy callers asking for "light"/"dark" map to default themes.
    import("./themeStore").then(({ useThemeStore }) => {
      useThemeStore.getState().setTheme(theme === "dark" ? "aurora" : "aurora-day");
    });
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === "dark" ? "light" : "dark";
      import("./themeStore").then(({ useThemeStore }) => {
        useThemeStore.getState().setTheme(newTheme === "dark" ? "aurora" : "aurora-day");
      });
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

  // Settings deep-link hint
  settingsView: null,
  setSettingsView: (view) => set({ settingsView: view }),
}));

// Mirror the resolved light/dark state for AG Grid + other legacy readers
// whenever themeStore re-applies theme (it toggles the .dark class).
if (typeof window !== "undefined") {
  const observer = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const next: Theme = isDark ? "dark" : "light";
    if (useAppStore.getState().theme !== next) {
      useAppStore.setState({ theme: next });
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}
