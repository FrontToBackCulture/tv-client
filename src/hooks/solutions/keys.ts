export const solutionKeys = {
  all: ["solutions"] as const,

  templates: () => [...solutionKeys.all, "templates"] as const,
  template: (id: string) => [...solutionKeys.templates(), id] as const,
  templateBySlug: (slug: string) => [...solutionKeys.templates(), "slug", slug] as const,

  instances: () => [...solutionKeys.all, "instances"] as const,
  instancesByDomain: (domain: string) => [...solutionKeys.instances(), "domain", domain] as const,
  instance: (id: string) => [...solutionKeys.instances(), id] as const,
};
