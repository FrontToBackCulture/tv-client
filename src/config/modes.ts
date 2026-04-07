// src/config/modes.ts
// Mode configuration — functional areas of the app (Sell / Support / Marketing / All).
// A mode reshapes the sidebar and keeps its own tab state. The `all` mode is
// admin-only and disables mode-based filtering (shows everything visible per
// existing team/workspace config).

import type { ModuleId } from "../stores/appStore";

export type Mode = "sell" | "support" | "marketing" | "all";

export const ALL_MODES: Mode[] = ["sell", "support", "marketing", "all"];

interface ModeConfig {
  label: string;
  shortcut: string;
  landing: ModuleId;
  /** Always visible in this mode (universal rail — Home, Inbox, Chat). */
  universal: ModuleId[];
  /** Mode-specific primary modules shown in the sidebar. */
  primary: ModuleId[];
  /** Restricts the mode tab to admin users only. */
  adminOnly?: boolean;
}

export const MODES: Record<Mode, ModeConfig> = {
  sell: {
    label: "Sell",
    shortcut: "⌘⇧1",
    landing: "home",
    universal: ["home", "inbox", "chat"],
    primary: [
      "projects",
      "prospecting",
      "email",
      "calendar",
      "analytics",
      "public-data",
      "referrals",
      "shared-inbox",
      "library",
    ],
  },
  support: {
    label: "Support",
    shortcut: "⌘⇧2",
    landing: "home",
    universal: ["home", "inbox", "chat"],
    primary: [
      "domains",
      "projects",
      "portal",
      "guides",
      "calendar",
      "analytics",
      "referrals",
      "shared-inbox",
      "library",
    ],
  },
  marketing: {
    label: "Marketing",
    shortcut: "⌘⇧3",
    landing: "home",
    universal: ["home", "inbox", "chat"],
    primary: [
      "blog",
      "email",
      "gallery",
      "guides",
      "projects",
      "analytics",
      "library",
    ],
  },
  all: {
    label: "All",
    shortcut: "⌘⇧0",
    landing: "home",
    universal: [],
    // Empty primary signals "bypass mode filter" — isModuleVisible falls
    // through to existing team/workspace/local rules.
    primary: [],
    adminOnly: true,
  },
};

/** Returns the combined set of modules allowed in a mode (universal ∪ primary).
 *  Empty set for `all` mode — caller should treat that as "no mode filter". */
export function modulesForMode(mode: Mode): Set<ModuleId> {
  const cfg = MODES[mode];
  return new Set<ModuleId>([...cfg.universal, ...cfg.primary]);
}

/** True when the given mode applies a narrowing filter. `all` mode does not. */
export function modeFiltersModules(mode: Mode): boolean {
  return MODES[mode].primary.length > 0;
}
