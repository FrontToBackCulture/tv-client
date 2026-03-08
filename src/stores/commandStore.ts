// src/stores/commandStore.ts
// Registry for contextual commands from active modules

import { create } from "zustand";
import { ReactNode, useEffect, useId } from "react";

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  shortcut?: string;
  section?: "general" | "contextual";
  action: () => void;
}

interface CommandState {
  /** Map of source → commands. Multiple components can register independently. */
  commandSources: Record<string, Command[]>;
  /** All contextual commands (computed from sources) */
  contextualCommands: Command[];
  /** Register commands under a unique source key */
  registerCommands: (sourceId: string, commands: Command[]) => void;
  /** Unregister a source */
  unregisterCommands: (sourceId: string) => void;
}

function flattenSources(sources: Record<string, Command[]>): Command[] {
  return Object.values(sources).flat();
}

export const useCommandStore = create<CommandState>((set) => ({
  commandSources: {},
  contextualCommands: [],
  registerCommands: (sourceId, commands) =>
    set((state) => {
      const next = { ...state.commandSources, [sourceId]: commands };
      return { commandSources: next, contextualCommands: flattenSources(next) };
    }),
  unregisterCommands: (sourceId) =>
    set((state) => {
      const next = { ...state.commandSources };
      delete next[sourceId];
      return { commandSources: next, contextualCommands: flattenSources(next) };
    }),
}));

/**
 * Hook for modules to register contextual commands.
 * Commands are automatically unregistered when the component unmounts.
 * Multiple components can register commands simultaneously — they stack.
 *
 * Usage:
 *   useRegisterCommands([
 *     { id: "export-csv", label: "Export CSV", action: () => exportCsv() },
 *   ], [dependency1, dependency2]);
 */
export function useRegisterCommands(commands: Command[], deps: unknown[]) {
  const sourceId = useId();
  const register = useCommandStore((s) => s.registerCommands);
  const unregister = useCommandStore((s) => s.unregisterCommands);

  useEffect(() => {
    register(sourceId, commands.map((c) => ({ ...c, section: "contextual" as const })));
    return () => unregister(sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
