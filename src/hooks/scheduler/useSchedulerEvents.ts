import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { schedulerKeys } from "./keys";

interface JobStartedPayload {
  jobId: string;
  runId: string;
  jobName: string;
}

interface JobCompletedPayload {
  jobId: string;
  runId: string;
  jobName: string;
  status: string;
  durationSecs: number | null;
  outputPreview: string;
  error: string | null;
  slackPosted: boolean;
}

interface JobProgressPayload {
  jobId: string;
  runId: string;
  step: string;
}

// Store for tracking running jobs (shared across components)
interface RunningJob {
  runId: string;
  jobName: string;
  startedAt: number;
  step: string;
}

interface RunningJobsState {
  runningJobs: Record<string, RunningJob>;
  addRunning: (jobId: string, runId: string, jobName: string) => void;
  removeRunning: (jobId: string) => void;
  updateStep: (jobId: string, step: string) => void;
}

export const useRunningJobsStore = create<RunningJobsState>((set) => ({
  runningJobs: {},
  addRunning: (jobId, runId, jobName) =>
    set((s) => ({
      runningJobs: {
        ...s.runningJobs,
        [jobId]: { runId, jobName, startedAt: Date.now(), step: "Starting..." },
      },
    })),
  removeRunning: (jobId) =>
    set((s) => {
      const { [jobId]: _, ...rest } = s.runningJobs;
      return { runningJobs: rest };
    }),
  updateStep: (jobId, step) =>
    set((s) => {
      const job = s.runningJobs[jobId];
      if (!job) return s;
      return {
        runningJobs: { ...s.runningJobs, [jobId]: { ...job, step } },
      };
    }),
}));

export function useSchedulerEvents() {
  const qc = useQueryClient();
  const addRunning = useRunningJobsStore((s) => s.addRunning);
  const removeRunning = useRunningJobsStore((s) => s.removeRunning);
  const updateStep = useRunningJobsStore((s) => s.updateStep);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<JobStartedPayload>("scheduler:job-started", (event) => {
      const { jobId, runId, jobName } = event.payload;
      addRunning(jobId, runId, jobName);
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<JobProgressPayload>("scheduler:job-progress", (event) => {
      const { jobId, step } = event.payload;
      updateStep(jobId, step);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<JobCompletedPayload>("scheduler:job-completed", (event) => {
      const { jobId } = event.payload;
      removeRunning(jobId);
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.runs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [qc, addRunning, removeRunning, updateStep]);
}

/** Hook that returns elapsed seconds for a running job, updating every second */
export function useElapsedTime(jobId: string | null): number | null {
  const running = useRunningJobsStore((s) =>
    jobId ? s.runningJobs[jobId] : undefined
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  if (!running) return null;
  return Math.floor((Date.now() - running.startedAt) / 1000);
}
