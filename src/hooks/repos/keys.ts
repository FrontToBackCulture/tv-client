// React Query key factory for repos

export const repoKeys = {
  all: ["repos"] as const,
  commits: (owner: string, repo: string) =>
    [...repoKeys.all, "commits", owner, repo] as const,
  releases: (owner: string, repo: string) =>
    [...repoKeys.all, "releases", owner, repo] as const,
  workflowRuns: (owner: string, repo: string) =>
    [...repoKeys.all, "workflow-runs", owner, repo] as const,
};
