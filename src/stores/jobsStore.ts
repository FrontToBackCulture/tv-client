// src/stores/jobsStore.ts
// Background jobs state management — persisted to Supabase job_runs table

import { create } from "zustand";
import { supabase } from "../lib/supabase";

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
  hydrated: boolean;

  // Actions
  hydrate: () => Promise<void>;
  addJob: (job: Omit<BackgroundJob, "startedAt">) => void;
  updateJob: (id: string, updates: Partial<BackgroundJob>) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      // Reset any orphaned "running" ad-hoc jobs (no parent job_id) —
      // these were killed when the app restarted
      await supabase
        .from("job_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          output_preview: "Interrupted by app restart",
        })
        .eq("status", "running")
        .is("job_id", null);

      // Load recent (last 1 hour) completed/failed job runs for display
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("job_runs")
        .select("id, job_name, status, output_preview, started_at, finished_at")
        .gte("started_at", oneHourAgo)
        .order("started_at", { ascending: false })
        .limit(20);

      if (data && data.length > 0) {
        const jobs: BackgroundJob[] = data.map((row) => ({
          id: row.id,
          name: row.job_name,
          // DB uses "success" but BackgroundJob type uses "completed"
          status: (row.status === "success" ? "completed" : row.status) as BackgroundJob["status"],
          message: row.output_preview || undefined,
          startedAt: new Date(row.started_at),
          completedAt: row.finished_at ? new Date(row.finished_at) : undefined,
        }));

        set((state) => {
          // Merge: keep any in-memory jobs not in DB, add DB jobs not in memory
          const memIds = new Set(state.jobs.map((j) => j.id));
          const dbJobs = jobs.filter((j) => !memIds.has(j.id));
          return { jobs: [...state.jobs, ...dbJobs], hydrated: true };
        });
      } else {
        set({ hydrated: true });
      }
    } catch (err) {
      console.error("[jobsStore] hydrate failed:", err);
      set({ hydrated: true }); // Don't block UI
    }
  },

  addJob: (job) => {
    const now = new Date();
    const bgJob: BackgroundJob = { ...job, startedAt: now };

    // Optimistic: add to memory immediately
    set((state) => ({ jobs: [...state.jobs, bgJob] }));

    // Persist to Supabase (fire-and-forget) — map "completed" → "success" for DB check constraint
    const dbStatus = job.status === "completed" ? "success" : job.status;
    supabase
      .from("job_runs")
      .upsert({
        id: job.id,
        job_id: null, // ad-hoc, no parent job
        job_name: job.name,
        status: dbStatus,
        output_preview: job.message || null,
        started_at: now.toISOString(),
        trigger: "manual",
      }, { onConflict: "id" })
      .then(({ error }) => {
        if (error) console.error("[jobsStore] insert failed:", error);
      });
  },

  updateJob: (id, updates) => {
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
    }));

    // Persist to Supabase — note: job_runs.status uses "success" not "completed"
    const patch: Record<string, unknown> = {};
    if (updates.status) {
      patch.status = updates.status === "completed" ? "success" : updates.status;
    }
    if (updates.message !== undefined) patch.output_preview = updates.message;
    if (updates.status === "completed" || updates.status === "failed") {
      patch.finished_at = new Date().toISOString();
      const job = get().jobs.find((j) => j.id === id);
      if (job) {
        patch.duration_secs =
          (Date.now() - job.startedAt.getTime()) / 1000;
      }
    }

    if (Object.keys(patch).length > 0) {
      supabase
        .from("job_runs")
        .update(patch)
        .eq("id", id)
        .then(({ error }) => {
          if (error) console.error("[jobsStore] update failed:", error);
        });
    }
  },

  removeJob: (id) =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
    })),

  clearCompleted: () =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status === "running"),
    })),
    // Note: only clears from UI view, not from job_runs table in DB
}));

// Listen for backend job events (Rust → frontend) — uses addJob/updateJob which persist to Supabase
if (typeof window !== "undefined") {
  import("@tauri-apps/api/event").then(({ listen }) => {
    listen<{ id: string; name: string; status: string; message?: string; startedAt: string }>("jobs:update", (event) => {
      const { id, name, status, message } = event.payload;
      const store = useJobsStore.getState();
      const existing = store.jobs.find(j => j.id === id);
      if (existing) {
        store.updateJob(id, {
          status: status as BackgroundJob["status"],
          message: message || undefined,
        });
      } else {
        store.addJob({
          id,
          name,
          status: status as BackgroundJob["status"],
          message: message || undefined,
        });
      }
    });
  });
}

// Helper hooks
export function useRunningJobs() {
  const jobs = useJobsStore((state) => state.jobs);
  return jobs.filter((j) => j.status === "running");
}

export function useRecentJobs(limit = 5) {
  const jobs = useJobsStore((state) => state.jobs);
  return [...jobs]
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit);
}
