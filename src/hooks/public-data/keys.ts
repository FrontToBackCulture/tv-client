export const publicDataKeys = {
  all: ["public-data"] as const,
  sources: () => [...publicDataKeys.all, "sources"] as const,
  source: (id: string) => [...publicDataKeys.sources(), id] as const,
  logs: () => [...publicDataKeys.all, "logs"] as const,
  logsBySource: (sourceId: string) => [...publicDataKeys.logs(), sourceId] as const,
};
