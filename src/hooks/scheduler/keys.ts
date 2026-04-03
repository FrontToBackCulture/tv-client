// React Query key factory for scheduler

export const schedulerKeys = {
  all: ["scheduler"] as const,
  jobs: () => [...schedulerKeys.all, "jobs"] as const,
  job: (id: string) => [...schedulerKeys.all, "job", id] as const,
  runs: (jobId?: string) => [...schedulerKeys.all, "runs", jobId] as const,
  run: (jobId: string, runId: string) =>
    [...schedulerKeys.all, "run", jobId, runId] as const,
  status: () => [...schedulerKeys.all, "status"] as const,
  runSteps: (runId: string) =>
    [...schedulerKeys.all, "run-steps", runId] as const,
  automations: () => [...schedulerKeys.all, "automations"] as const,
  automation: (id: string) => [...schedulerKeys.all, "automation", id] as const,
  automationNodes: (id: string) => [...schedulerKeys.all, "nodes", id] as const,
  automationEdges: (id: string) => [...schedulerKeys.all, "edges", id] as const,
};
