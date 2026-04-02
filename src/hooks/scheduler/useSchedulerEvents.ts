import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { schedulerKeys } from "./keys";
import { supabase } from "../../lib/supabase";

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
      const { jobId, jobName, status, outputPreview, error } = event.payload;
      removeRunning(jobId);
      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.runs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });

      // Post result to Chat as bot-mel (same pattern as Task Advisor)
      postJobResultToChat(jobId, jobName, status, outputPreview, error, qc);
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [qc, addRunning, removeRunning, updateStep]);
}

// ---------------------------------------------------------------------------
// Post job results to Chat (discussions table)
// ---------------------------------------------------------------------------

async function postJobResultToChat(
  jobId: string,
  jobName: string,
  status: string,
  outputPreview: string,
  error: string | null,
  qc: ReturnType<typeof useQueryClient>,
): Promise<void> {
  try {
    // Look up the job to get bot_path → derive bot author
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("bot_path")
      .eq("id", jobId)
      .single();

    // Derive bot name from bot_path (e.g. "_team/melvin/bot-mel" → "bot-mel")
    const botAuthor = jobRow?.bot_path
      ? jobRow.bot_path.split("/").filter(Boolean).pop() || "bot-mel"
      : "bot-mel";

    const body = status === "success"
      ? outputPreview || "(no output)"
      : `Failed: ${error || "unknown error"}`;

    const truncatedBody = body.length > 3000
      ? body.slice(0, 3000) + "\n\n_(truncated — see Activity tab for full output)_"
      : body;

    const timeLabel = new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const statusEmoji = status === "success" ? "" : "[FAILED] ";
    const entityId = `job:${jobId}:${Date.now()}`;

    const { data: discussion, error: insertError } = await supabase
      .from("discussions")
      .insert({
        entity_type: "general",
        entity_id: entityId,
        author: botAuthor,
        body: truncatedBody,
        title: `${statusEmoji}${jobName} — ${timeLabel}`,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[scheduler] Failed to post to Chat:", insertError.message);
      return;
    }

    // Create notification
    const preview = truncatedBody.length > 100 ? truncatedBody.slice(0, 100) + "..." : truncatedBody;
    await supabase.from("notifications").insert({
      recipient: "mel-tv",
      type: "mention",
      discussion_id: discussion.id,
      entity_type: "general",
      entity_id: entityId,
      actor: botAuthor,
      body_preview: preview,
    });

    // Refresh Chat UI
    qc.invalidateQueries({ queryKey: ["discussions"] });
    qc.invalidateQueries({ queryKey: ["chat", "threads"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  } catch (err) {
    console.error("[scheduler] Error posting to Chat:", err);
  }
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
