import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { schedulerKeys } from "./keys";
import { supabase } from "../../lib/supabase";
import { useClaudeRunStore } from "../../stores/claudeRunStore";
import { useCurrentUserName } from "../work/useUsers";

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
  const currentUserName = useCurrentUserName();
  const currentUserNameRef = useRef(currentUserName);
  currentUserNameRef.current = currentUserName;

  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    listen<JobStartedPayload>("scheduler:job-started", (event) => {
      if (cancelled) return;
      const { jobId, runId, jobName } = event.payload;
      addRunning(jobId, runId, jobName);

      // Create a ClaudeRunStore entry so the StatusBar console drawer works.
      // Don't add to JobsStore here — the runner already persists the job_runs row
      // and JobsStore.hydrate() picks it up. Adding here causes duplicate entries.
      useClaudeRunStore.getState().createRun({
        id: runId,
        name: jobName,
        domainName: "",
        tableId: jobId,
      });
      // Auto-expand the console drawer
      useClaudeRunStore.getState().expandRun(runId);

      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });
    }).then((unlisten) => { if (cancelled) unlisten(); else unlisteners.push(unlisten); });

    // Stream claude output into the ClaudeRunStore for live console
    listen<{ run_id: string; event_type: string; content: string; metadata?: any }>("claude-stream", (event) => {
      if (cancelled) return;
      const { run_id, event_type, content, metadata } = event.payload;
      const store = useClaudeRunStore.getState();
      // Only process events for runs we're tracking (scheduler runs)
      if (!store.runs[run_id]) return;

      if (event_type === "result") {
        const isError = metadata?.is_error ?? false;
        const costUsd = metadata?.cost_usd ?? 0;
        store.completeRun(run_id, content, isError, costUsd, 0);
      } else {
        store.addEvent(run_id, { type: event_type, content, timestamp: Date.now() });
      }
    }).then((unlisten) => { if (cancelled) unlisten(); else unlisteners.push(unlisten); });

    listen<JobProgressPayload>("scheduler:job-progress", (event) => {
      if (cancelled) return;
      const { jobId, step } = event.payload;
      updateStep(jobId, step);
    }).then((unlisten) => { if (cancelled) unlisten(); else unlisteners.push(unlisten); });

    listen<JobCompletedPayload>("scheduler:job-completed", (event) => {
      if (cancelled) return;
      const { jobId, runId, jobName, status, durationSecs, outputPreview, error } = event.payload;
      removeRunning(jobId);

      // Complete the ClaudeRunStore entry if not already done by stream
      const store = useClaudeRunStore.getState();
      if (store.runs[runId] && !store.runs[runId].isComplete) {
        store.completeRun(
          runId,
          status === "success" ? outputPreview : (error || "Failed"),
          status !== "success",
          0,
          (durationSecs || 0) * 1000,
        );
      }

      qc.invalidateQueries({ queryKey: schedulerKeys.jobs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.runs() });
      qc.invalidateQueries({ queryKey: schedulerKeys.status() });

      // Post result to Chat — pass runId so we can fetch full output (not truncated preview)
      if (currentUserNameRef.current) {
        postJobResultToChat(jobId, runId, jobName, status, error, qc, currentUserNameRef.current);
      }
    }).then((unlisten) => { if (cancelled) unlisten(); else unlisteners.push(unlisten); });

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [qc, addRunning, removeRunning, updateStep]);
}

// ---------------------------------------------------------------------------
// Post job results to Chat (discussions table)
// ---------------------------------------------------------------------------

async function postJobResultToChat(
  jobId: string,
  runId: string,
  jobName: string,
  status: string,
  error: string | null,
  qc: ReturnType<typeof useQueryClient>,
  recipientName: string,
): Promise<void> {
  try {
    // Look up the automation's output node config + job bot_path
    // Try by job_id first (legacy), then by automation id directly
    let { data: automation } = await supabase
      .from("automations")
      .select("id")
      .eq("job_id", jobId)
      .single();
    if (!automation) {
      const res = await supabase
        .from("automations")
        .select("id")
        .eq("id", jobId)
        .single();
      automation = res.data;
    }

    let postMode = "new_thread";
    let threadTitle: string | null = null;
    let botAuthor = "bot-mel";

    if (automation) {
      const { data: outputNode } = await supabase
        .from("automation_nodes")
        .select("config")
        .eq("automation_id", automation.id)
        .eq("node_type", "output")
        .single();

      if (outputNode?.config) {
        const c = outputNode.config as { post_mode?: string; thread_title?: string; bot_author?: string };
        postMode = c.post_mode || "new_thread";
        threadTitle = c.thread_title || null;
        botAuthor = c.bot_author || "bot-mel";
      }
    }

    // Fallback: derive bot from job row if not set on output node
    if (botAuthor === "bot-mel") {
      const { data: jobRow } = await supabase.from("jobs").select("bot_path").eq("id", jobId).single();
      if (jobRow?.bot_path) {
        botAuthor = jobRow.bot_path.split("/").filter(Boolean).pop() || "bot-mel";
      }
    }

    // Fetch the FULL output from the job_runs table (not the truncated preview)
    let fullOutput = "";
    if (status === "success") {
      const { data: runRow } = await supabase.from("job_runs").select("output").eq("id", runId).single();
      fullOutput = runRow?.output || "";
    }

    const body = status === "success"
      ? fullOutput || "(no output)"
      : `Failed: ${error || "unknown error"}`;

    const mentionedBody = `@${recipientName}\n\n${body}`;
    const truncatedBody = mentionedBody.length > 3000
      ? mentionedBody.slice(0, 3000) + "\n\n_(truncated — see Activity tab for full output)_"
      : mentionedBody;

    const statusEmoji = status === "success" ? "" : "[FAILED] ";

    // Same thread: use a fixed entity_id so all runs reply to the same thread
    // New thread: use a unique entity_id per run
    const entityId = postMode === "same_thread"
      ? `job:${jobId}`
      : `job:${jobId}:${Date.now()}`;

    // Resolve title with variable substitution
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short" });
    const timeStr = now.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true });
    const dayStr = now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", weekday: "long" });
    const resolvedTitle = (threadTitle || `${jobName} — {date} at {time}`)
      .replace("{date}", dateStr)
      .replace("{time}", timeStr)
      .replace("{day}", dayStr);

    if (postMode === "same_thread") {
      // Check if thread already exists — if so, reply to it
      const { data: existingThread } = await supabase
        .from("discussions")
        .select("id")
        .eq("entity_type", "general")
        .eq("entity_id", entityId)
        .is("parent_id", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingThread) {
        // Post as a new top-level message in the same thread (not a reply)
        await supabase.from("discussions").insert({
          entity_type: "general",
          entity_id: entityId,
          author: botAuthor,
          body: truncatedBody,
          title: `${statusEmoji}${resolvedTitle}`,
        });


        const preview = truncatedBody.length > 100 ? truncatedBody.slice(0, 100) + "..." : truncatedBody;
        await supabase.from("notifications").insert({
          recipient: recipientName,
          type: "mention",
          discussion_id: existingThread.id,
          entity_type: "general",
          entity_id: entityId,
          actor: botAuthor,
          body_preview: preview,
        });

        qc.invalidateQueries({ queryKey: ["discussions"] });
        qc.invalidateQueries({ queryKey: ["chat", "threads"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
        return;
      }
      // If no existing thread, fall through to create one
    }

    const { data: discussion, error: insertError } = await supabase
      .from("discussions")
      .insert({
        entity_type: "general",
        entity_id: entityId,
        author: botAuthor,
        body: truncatedBody,
        title: `${statusEmoji}${resolvedTitle}`,
        origin: "automation",
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
      recipient: recipientName,
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
