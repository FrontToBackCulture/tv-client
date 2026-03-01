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
};
