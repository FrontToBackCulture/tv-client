export const financeKeys = {
  all: ["finance"] as const,
  connection: () => [...financeKeys.all, "connection"] as const,
  syncRuns: () => [...financeKeys.all, "sync-runs"] as const,
};
