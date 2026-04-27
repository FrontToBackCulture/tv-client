// src/stores/botSettingsStore.ts
// Persisted store for bot module settings.
//
// Two layers:
//   - The legacy "Bot module" reads botsPath / sessionsPath.
//   - The Cmd+J chat (botRouting + botMentionHandler) reads
//     fleetFolderPath, botPathOverrides, routingOverrides.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BotName } from "../lib/botRouting";

export interface RoutingOverrideRule {
  // Same shape as Rule in botRouting.ts but plain JSON (no narrowing).
  match:
    | { kind: "entity"; entityType: string; subtype?: string }
    | { kind: "module"; module: string };
  bot: BotName;
}

interface BotSettingsState {
  // ─── Legacy Bot module ────────────────────────────────────────
  botsPath: string;
  setBotsPath: (path: string) => void;
  sessionsPath: string;
  setSessionsPath: (path: string) => void;

  // ─── Cmd+J chat routing ───────────────────────────────────────
  /** Override for the tv-bots fleet folder. Empty → use convention
   * `${knowledgeRoot}/../tv-bots/`. */
  fleetFolderPath: string;
  setFleetFolderPath: (p: string) => void;

  /** Per-bot CLAUDE.md path overrides. Empty/missing → use convention. */
  botPathOverrides: Partial<Record<BotName, string>>;
  setBotPathOverride: (bot: BotName, path: string) => void;
  clearBotPathOverride: (bot: BotName) => void;

  /** Per-scope routing overrides. null/empty → fall back to baked rules. */
  routingOverrides: RoutingOverrideRule[] | null;
  setRoutingOverrides: (rules: RoutingOverrideRule[] | null) => void;
}

export const useBotSettingsStore = create<BotSettingsState>()(
  persist(
    (set) => ({
      botsPath: "",
      setBotsPath: (path) => set({ botsPath: path }),
      sessionsPath: "",
      setSessionsPath: (path) => set({ sessionsPath: path }),

      fleetFolderPath: "",
      setFleetFolderPath: (p) => set({ fleetFolderPath: p }),

      botPathOverrides: {},
      setBotPathOverride: (bot, path) =>
        set((s) => ({
          botPathOverrides: { ...s.botPathOverrides, [bot]: path },
        })),
      clearBotPathOverride: (bot) =>
        set((s) => {
          const { [bot]: _drop, ...rest } = s.botPathOverrides;
          return { botPathOverrides: rest };
        }),

      routingOverrides: null,
      setRoutingOverrides: (rules) => set({ routingOverrides: rules }),
    }),
    { name: "tv-client-bot-settings" },
  ),
);
