// Product module query keys

export const productKeys = {
  all: ["product"] as const,

  // Core entities
  modules: () => [...productKeys.all, "modules"] as const,
  module: (id: string) => [...productKeys.modules(), id] as const,

  features: () => [...productKeys.all, "features"] as const,
  featuresByModule: (moduleId: string) => [...productKeys.features(), "module", moduleId] as const,
  feature: (id: string) => [...productKeys.features(), id] as const,

  connectors: () => [...productKeys.all, "connectors"] as const,
  connector: (id: string) => [...productKeys.connectors(), id] as const,

  solutions: () => [...productKeys.all, "solutions"] as const,
  solution: (id: string) => [...productKeys.solutions(), id] as const,

  releases: () => [...productKeys.all, "releases"] as const,
  release: (id: string) => [...productKeys.releases(), id] as const,

  deployments: () => [...productKeys.all, "deployments"] as const,
  deployment: (id: string) => [...productKeys.deployments(), id] as const,

  // Supporting
  activity: () => [...productKeys.all, "activity"] as const,
  activityByEntity: (type: string, id: string) => [...productKeys.activity(), type, id] as const,
  taskLinks: () => [...productKeys.all, "task-links"] as const,
  stats: () => [...productKeys.all, "stats"] as const,
};
