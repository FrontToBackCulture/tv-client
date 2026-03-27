// Claude Run Store — tracks output from claude CLI background runs
// Used by the Cleanup tab's "Convert to SQL" feature and displayed in the StatusBar

import { create } from "zustand";

export interface ClaudeRunEvent {
  type: string; // "init", "text", "tool_use", "tool_result", "error"
  content: string;
  timestamp: number;
}

export interface ClaudeRun {
  id: string;
  name: string;
  domainName: string;
  tableId: string;
  events: ClaudeRunEvent[];
  result: string | null;
  isComplete: boolean;
  isError: boolean;
  costUsd: number;
  durationMs: number;
}

interface ClaudeRunState {
  runs: Record<string, ClaudeRun>;
  expandedRunId: string | null;

  createRun: (run: Pick<ClaudeRun, "id" | "name" | "domainName" | "tableId">) => void;
  addEvent: (runId: string, event: ClaudeRunEvent) => void;
  completeRun: (runId: string, result: string, isError: boolean, costUsd: number, durationMs: number) => void;
  removeRun: (runId: string) => void;
  expandRun: (runId: string | null) => void;
}

export const useClaudeRunStore = create<ClaudeRunState>((set) => ({
  runs: {},
  expandedRunId: null,

  createRun: (run) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [run.id]: {
          ...run,
          events: [],
          result: null,
          isComplete: false,
          isError: false,
          costUsd: 0,
          durationMs: 0,
        },
      },
    })),

  addEvent: (runId, event) =>
    set((state) => {
      const run = state.runs[runId];
      if (!run) return state;
      return {
        runs: {
          ...state.runs,
          [runId]: { ...run, events: [...run.events, event] },
        },
      };
    }),

  completeRun: (runId, result, isError, costUsd, durationMs) =>
    set((state) => {
      const run = state.runs[runId];
      if (!run) return state;
      return {
        runs: {
          ...state.runs,
          [runId]: { ...run, result, isComplete: true, isError, costUsd, durationMs },
        },
      };
    }),

  removeRun: (runId) =>
    set((state) => {
      const { [runId]: _, ...rest } = state.runs;
      return {
        runs: rest,
        expandedRunId: state.expandedRunId === runId ? null : state.expandedRunId,
      };
    }),

  expandRun: (runId) => set({ expandedRunId: runId }),
}));
