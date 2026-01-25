// src/stores/jobsStore.ts
// Background jobs state management

import { create } from "zustand";

export interface BackgroundJob {
  id: string;
  name: string;
  status: "running" | "completed" | "failed";
  progress?: number; // 0-100
  message?: string;
  startedAt: Date;
  completedAt?: Date;
}

interface JobsState {
  jobs: BackgroundJob[];

  // Actions
  addJob: (job: Omit<BackgroundJob, "startedAt">) => void;
  updateJob: (id: string, updates: Partial<BackgroundJob>) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],

  addJob: (job) =>
    set((state) => ({
      jobs: [
        ...state.jobs,
        { ...job, startedAt: new Date() },
      ],
    })),

  updateJob: (id, updates) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id
          ? {
              ...job,
              ...updates,
              completedAt:
                updates.status === "completed" || updates.status === "failed"
                  ? new Date()
                  : job.completedAt,
            }
          : job
      ),
    })),

  removeJob: (id) =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
    })),

  clearCompleted: () =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status === "running"),
    })),
}));

// Helper hooks
export function useRunningJobs() {
  return useJobsStore((state) => state.jobs.filter((j) => j.status === "running"));
}

export function useRecentJobs(limit = 5) {
  return useJobsStore((state) =>
    state.jobs
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit)
  );
}
