// src/stores/botSettingsStore.ts
// Persisted store for bot module settings

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BotSettingsState {
  // Path to the _team directory (or wherever bots reside)
  botsPath: string;
  setBotsPath: (path: string) => void;
  // Path to the sessions directory (e.g. _team/melvin/sessions)
  sessionsPath: string;
  setSessionsPath: (path: string) => void;
}

export const useBotSettingsStore = create<BotSettingsState>()(
  persist(
    (set) => ({
      botsPath: "",
      setBotsPath: (path) => set({ botsPath: path }),
      sessionsPath: "",
      setSessionsPath: (path) => set({ sessionsPath: path }),
    }),
    { name: "tv-client-bot-settings" }
  )
);
