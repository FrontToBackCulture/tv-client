// Task Advisor — proactive bot-mel check-ins via chat
// Runs on app startup + every 2 hours. Posts to discussions as bot-mel.
// Calls Claude Haiku to compose a natural, advisory message about your tasks.
// Reply handler: when user replies, kicks off Claude Code to process and act.

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "../../lib/supabase";
import { toSGTDateString } from "../../lib/date";
import type { TaskWithRelations } from "../../lib/work/types";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserId } from "../work/useUsers";
import { useJobsStore } from "../../stores/jobsStore";
import { useClaudeRunStore } from "../../stores/claudeRunStore";

const INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const LAST_RUN_KEY = "tv-task-advisor-last-run";
const BOT_AUTHOR = "bot-mel";
const RECIPIENT = "melvin";

// ---------------------------------------------------------------------------
// Time helpers (SGT)
// ---------------------------------------------------------------------------

function getSGTHour(): number {
  const h = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    hour12: false,
  });
  return parseInt(h, 10);
}

function getSGTTimeString(): string {
  return new Date().toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getRemainingWorkHours(): number {
  const hour = getSGTHour();
  if (hour < 9) return 15; // 9am–12am
  if (hour >= 24) return 0;
  return Math.max(0, 24 - hour);
}

function priorityLabel(p: number | null): string {
  switch (p) {
    case 1: return "URGENT";
    case 2: return "HIGH";
    case 3: return "MED";
    case 4: return "LOW";
    default: return "—";
  }
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

interface TaskSnapshot {
  overdue: TaskWithRelations[];
  dueToday: TaskWithRelations[];
  inProgress: TaskWithRelations[];
  completedToday: TaskWithRelations[];
  upcoming: TaskWithRelations[];
}

async function gatherMyTasks(userId: string): Promise<TaskSnapshot> {
  const today = toSGTDateString();

  // Get task IDs assigned to this user
  const { data: assignments } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("user_id", userId);

  if (!assignments?.length) {
    return { overdue: [], dueToday: [], inProgress: [], completedToday: [], upcoming: [] };
  }

  const taskIds = assignments.map((a) => a.task_id);

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      `
      *,
      status:task_statuses(id, name, type, color),
      project:projects(id, name),
      company:crm_companies!tasks_company_id_fkey(id, name, display_name)
    `
    )
    .in("id", taskIds);

  if (!tasks) {
    return { overdue: [], dueToday: [], inProgress: [], completedToday: [], upcoming: [] };
  }

  const snapshot: TaskSnapshot = {
    overdue: [],
    dueToday: [],
    inProgress: [],
    completedToday: [],
    upcoming: [],
  };

  const threeDaysOut = new Date();
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);
  const cutoff = toSGTDateString(threeDaysOut);

  for (const t of tasks as TaskWithRelations[]) {
    const statusType = (t.status as unknown as { type?: string })?.type;

    // Completed tasks — only track if completed today
    if (statusType === "complete") {
      const completedDate = (t.completed_at || t.updated_at || "").slice(0, 10);
      if (completedDate === today) {
        snapshot.completedToday.push(t);
      }
      continue;
    }

    const dueDate = t.due_date?.slice(0, 10);

    // Classify: overdue > due today > in progress > upcoming
    if (dueDate && dueDate < today) {
      snapshot.overdue.push(t);
    } else if (dueDate && dueDate === today) {
      snapshot.dueToday.push(t);
    } else if (statusType === "in_progress") {
      snapshot.inProgress.push(t);
    } else if (dueDate && dueDate <= cutoff) {
      snapshot.upcoming.push(t);
    }
  }

  // Most overdue first
  snapshot.overdue.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  return snapshot;
}

// ---------------------------------------------------------------------------
// Haiku message composition
// ---------------------------------------------------------------------------

function formatTaskLine(t: TaskWithRelations): string {
  const prio = priorityLabel(t.priority);
  const project = (t.project as unknown as { name?: string })?.name || "No project";
  const statusType = (t.status as unknown as { type?: string })?.type;
  const due = t.due_date ? t.due_date.slice(0, 10) : "no date";

  // Note if in progress (useful context for overdue/due-today items)
  const statusNote = statusType === "in_progress" ? ", in progress" : "";
  return `- [${prio}] ${t.title} (due ${due}${statusNote}) — ${project}`;
}

function buildPromptData(snapshot: TaskSnapshot): string {
  const lines: string[] = [];

  if (snapshot.overdue.length > 0) {
    lines.push(`OVERDUE (${snapshot.overdue.length}):`);
    snapshot.overdue.forEach((t) => lines.push(formatTaskLine(t)));
    lines.push("");
  }

  if (snapshot.dueToday.length > 0) {
    lines.push(`DUE TODAY (${snapshot.dueToday.length}):`);
    snapshot.dueToday.forEach((t) => lines.push(formatTaskLine(t)));
    lines.push("");
  }

  if (snapshot.inProgress.length > 0) {
    lines.push(`IN PROGRESS — not due today (${snapshot.inProgress.length}):`);
    snapshot.inProgress.forEach((t) => lines.push(formatTaskLine(t)));
    lines.push("");
  }

  if (snapshot.completedToday.length > 0) {
    lines.push(`COMPLETED TODAY (${snapshot.completedToday.length}):`);
    snapshot.completedToday.forEach((t) => lines.push(`- ✓ ${t.title}`));
    lines.push("");
  }

  if (snapshot.upcoming.length > 0) {
    lines.push(`COMING UP — next 3 days (${snapshot.upcoming.length}):`);
    snapshot.upcoming.forEach((t) => lines.push(formatTaskLine(t)));
    lines.push("");
  }

  const totalActive = snapshot.overdue.length + snapshot.dueToday.length + snapshot.inProgress.length;
  lines.push(`Total active tasks: ${totalActive}`);
  lines.push(`Current time: ${getSGTTimeString()} SGT`);
  lines.push(`Hours until midnight: ~${getRemainingWorkHours()}`);

  return lines.join("\n");
}

async function composeMessage(snapshot: TaskSnapshot): Promise<string | null> {
  const apiKey = await invoke<string | null>("settings_get_anthropic_key");
  if (!apiKey) {
    console.warn("[task-advisor] No Anthropic API key configured");
    return null;
  }

  const totalActive =
    snapshot.overdue.length + snapshot.dueToday.length + snapshot.inProgress.length;

  // Nothing to say
  if (totalActive === 0 && snapshot.completedToday.length === 0) {
    return null;
  }

  const taskData = buildPromptData(snapshot);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: `You are bot-mel, a blunt and practical task advisor. You're checking in on @melvin's task list throughout the day. Be direct — no fluff, no cheerleading, no bullet points, no emojis.

Your job:
- Highlight what matters most right now given the time of day and hours remaining
- Call out if they're avoiding the hard or important stuff (high priority / overdue items not in progress)
- Note if the pace is on track or falling behind
- If time is running short, suggest what to defer to tomorrow
- Acknowledge progress when tasks have been completed — but briefly, then move on to what's next
- If everything looks good, say so in one line and move on

Write conversationally, like a blunt colleague checking in. 3-5 sentences max. Always address as @melvin. Reference specific task names when relevant. Do NOT use markdown formatting.`,
      messages: [
        {
          role: "user",
          content: `Here's the current task status:\n\n${taskData}\n\nGive your check-in.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error("[task-advisor] API error:", response.status);
    return null;
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || null;
}

// ---------------------------------------------------------------------------
// Post to discussions
// ---------------------------------------------------------------------------

async function postMessage(
  message: string,
  queryClient: QueryClient
): Promise<void> {
  // Each check-in gets its own thread (unique entity_id with timestamp)
  const entityId = `task-advisor:${Date.now()}`;

  const timeLabel = new Date().toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const insertParams: Record<string, unknown> = {
    entity_type: "general",
    entity_id: entityId,
    author: BOT_AUTHOR,
    body: message,
    title: `Check-in — ${timeLabel}`,
  };

  const { data: discussion, error } = await supabase
    .from("discussions")
    .insert(insertParams)
    .select()
    .single();

  if (error) {
    console.error("[task-advisor] Failed to post:", error.message);
    return;
  }

  // Notify @melvin
  const preview =
    message.length > 100 ? message.slice(0, 100) + "..." : message;
  await supabase.from("notifications").insert({
    recipient: RECIPIENT,
    type: "mention",
    discussion_id: discussion.id,
    entity_type: "general",
    entity_id: entityId,
    actor: BOT_AUTHOR,
    body_preview: preview,
  });

  // Refresh UI
  queryClient.invalidateQueries({ queryKey: ["discussions"] });
  queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runTaskAdvisor(
  queryClient: QueryClient,
  userId: string
): Promise<void> {
  console.log("[task-advisor] Running check...");

  try {
    const snapshot = await gatherMyTasks(userId);
    const message = await composeMessage(snapshot);

    if (!message) {
      console.log("[task-advisor] Nothing to report");
    } else {
      await postMessage(message, queryClient);
      console.log("[task-advisor] Posted check-in");
    }
  } catch (err) {
    console.error("[task-advisor] Error:", err);
  }

  localStorage.setItem(LAST_RUN_KEY, new Date().toISOString());
}

/** Manually trigger a check-in. Returns when done. */
export async function triggerTaskAdvisor(
  queryClient: QueryClient,
  userId: string
): Promise<void> {
  await runTaskAdvisor(queryClient, userId);
}

// ---------------------------------------------------------------------------
// Reply handler — user replies to bot-mel, Claude Code processes + acts
// ---------------------------------------------------------------------------

interface ClaudeStreamEvent {
  run_id: string;
  event_type: string; // "text" | "tool_use" | "tool_result" | "result" | "error"
  content: string;
  metadata?: Record<string, unknown>;
}

// Track which discussion IDs we've already processed to avoid double-handling
const processedReplies = new Set<string>();

// Store Claude session IDs per thread for conversation continuity
const threadSessions = new Map<string, string>();

async function handleBotMention(
  discussion: { id: string; entity_type: string; entity_id: string; body: string; author: string; parent_id: string | null; attachments?: string[] },
  userId: string,
  queryClient: QueryClient
): Promise<void> {
  // Skip bot messages or already-processed
  if (discussion.author === BOT_AUTHOR) return;
  if (processedReplies.has(discussion.id)) return;
  processedReplies.add(discussion.id);

  console.log("[bot-mel] Processing mention:", discussion.body.slice(0, 80));

  const { addJob, updateJob } = useJobsStore.getState();
  const { createRun, addEvent, completeRun, expandRun } =
    useClaudeRunStore.getState();

  const runId = `bot-mel-reply-${Date.now()}`;
  const jobName = "bot-mel — processing request";

  addJob({ id: runId, name: jobName, status: "running", message: "Reading your message..." });
  createRun({ id: runId, name: jobName, domainName: "", tableId: "" });
  expandRun(runId);

  // Gather conversation history for this thread
  const { data: threadMessages } = await supabase
    .from("discussions")
    .select("author, body, attachments, created_at")
    .eq("entity_type", discussion.entity_type)
    .eq("entity_id", discussion.entity_id)
    .order("created_at", { ascending: true })
    .limit(20);

  const conversationHistory = (threadMessages || [])
    .map((m) => {
      let line = `${m.author}: ${m.body}`;
      const imgs = (m.attachments as string[] | null) || [];
      if (imgs.length > 0) {
        line += `\n[${imgs.length} image(s) attached]`;
      }
      return line;
    })
    .join("\n\n");

  // If the message includes images, save to temp files for Claude to read
  const imageAttachments = discussion.attachments || [];
  let imageContext = "";

  if (imageAttachments.length > 0) {
    const savedPaths: string[] = [];

    for (let i = 0; i < imageAttachments.length; i++) {
      const url = imageAttachments[i];
      try {
        const resp = await fetch(url);
        const arrayBuf = await resp.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuf);
        let binary = "";
        for (let j = 0; j < uint8.length; j++) {
          binary += String.fromCharCode(uint8[j]);
        }
        const base64Data = btoa(binary);
        const tmpPath = `/tmp/bot-mel-img-${Date.now()}-${i}.png`;
        await invoke("write_file_base64", { path: tmpPath, data: base64Data });
        savedPaths.push(tmpPath);
      } catch (err) {
        console.warn("[bot-mel] Could not save image to temp:", err);
      }
    }

    if (savedPaths.length > 0) {
      imageContext = `\n\n## Screenshots attached:\nUse the Read tool to view these image files — they contain context for the request:\n${savedPaths.map((p) => `- ${p}`).join("\n")}`;
    } else {
      imageContext = `\n\n## Screenshots attached:\n${imageAttachments.length} screenshot(s) attached. URLs:\n${imageAttachments.map((u) => `- ${u}`).join("\n")}`;
    }
  }

  // Build context based on thread type
  const isTaskAdvisorThread = discussion.entity_id.startsWith("task-advisor:");
  let taskContext = "";

  if (isTaskAdvisorThread) {
    // Include full task data for task advisor threads
    const snapshot = await gatherMyTasks(userId);
    const taskData = buildPromptData(snapshot);
    const allTasks = [
      ...snapshot.overdue,
      ...snapshot.dueToday,
      ...snapshot.inProgress,
      ...snapshot.upcoming,
    ];

    const { data: doneStatuses } = await supabase
      .from("task_statuses")
      .select("id, name")
      .eq("type", "complete")
      .eq("name", "Done")
      .limit(1);
    const doneStatusId = doneStatuses?.[0]?.id || "unknown";

    const taskRef = allTasks
      .map((t) => {
        const project = (t.project as unknown as { name?: string })?.name || "No project";
        return `- "${t.title}" → id: ${t.id} (project: ${project}, project_id: ${t.project_id}, due: ${t.due_date || "none"}, priority: ${t.priority})`;
      })
      .join("\n");

    taskContext = `
## Current task data:
${taskData}

## Task ID reference (use these exact IDs when calling update-task):
${taskRef}

## Task status rules:
- To mark done: update status_id to "${doneStatusId}" (the global "Done" status)
- To defer: update due_date (YYYY-MM-DD format)
- To change priority: update priority (1=Urgent, 2=High, 3=Medium, 4=Low)
- To kill/cancel: update status_id to "${doneStatusId}"`;
  }

  const prompt = `You are bot-mel — Melvin's blunt, practical AI assistant in a chat thread. @melvin just sent you a message. Read the conversation and do what he's asking.

## Conversation so far:
${conversationHistory}
${imageContext}
${taskContext}

## What to do:
1. Understand what @melvin is asking for.
2. If screenshots are attached, read the image files to understand the context.
3. Use the available MCP tools to execute the request: update tasks, look up CRM data, log activities, create tasks, get project info, etc.
4. After completing the work, output ONLY your final reply to @melvin as plain text. Be conversational and direct — that's bot-mel's style. No emojis, no excessive formatting.

## Important:
- Only act on what @melvin explicitly asked for. Don't assume or over-reach.
- If something is ambiguous, ask for clarification instead of guessing.
- Do NOT call add-discussion. Your text output will be posted to the chat automatically.
- Your final output should be ONLY the reply text — no JSON, no code blocks, no tool call summaries.
- If you can't do something with the available tools, say so directly.`;

  // Use the reply's parent_id to stay in the same thread
  // (parent_id points to root message, or if reply IS root, use its id)
  const threadRootId = discussion.parent_id || discussion.id;

  // Listen for Claude stream events — collect the result text
  let resultText = "";

  // Check for existing session for this thread
  const existingSessionId = threadSessions.get(discussion.entity_id) || undefined;

  const unlisten = await listen<ClaudeStreamEvent>("claude-stream", (event) => {
    const data = event.payload;
    if (data.run_id !== runId) return;

    if (data.event_type === "init" && data.metadata?.session_id) {
      // Store session ID for future continuations
      threadSessions.set(discussion.entity_id, data.metadata.session_id as string);
    }

    if (data.event_type === "result") {
      const isError = (data.metadata?.is_error as boolean) ?? false;
      const costUsd = (data.metadata?.cost_usd as number) ?? 0;
      const durationMs = (data.metadata?.duration_ms as number) ?? 0;
      resultText = data.content;
      completeRun(runId, data.content, isError, costUsd, durationMs);
      updateJob(runId, {
        status: isError ? "failed" : "completed",
        message: isError ? "Failed to process reply" : `Done — ${(durationMs / 1000).toFixed(0)}s`,
      });
    } else if (data.event_type === "error") {
      addEvent(runId, { type: "error", content: data.content, timestamp: Date.now() });
    } else {
      addEvent(runId, { type: data.event_type, content: data.content, timestamp: Date.now() });
      if (data.event_type === "tool_use" || data.event_type === "text") {
        updateJob(runId, { message: data.content.slice(0, 100) });
      }
    }
  });

  try {
    addEvent(runId, { type: "init", content: existingSessionId ? "Resuming session..." : "Processing your reply...", timestamp: Date.now() });
    updateJob(runId, { message: existingSessionId ? "Resuming Claude session..." : "Claude is working on your request..." });

    await invoke("claude_run", {
      runId,
      request: {
        prompt,
        allowed_tools: [
          // Tasks
          "mcp__tv-mcp__update-task",
          "mcp__tv-mcp__get-task",
          "mcp__tv-mcp__create-task",
          "mcp__tv-mcp__list-tasks",
          // CRM
          "mcp__tv-mcp__find-crm-company",
          "mcp__tv-mcp__get-crm-company",
          "mcp__tv-mcp__log-crm-activity",
          "mcp__tv-mcp__list-crm-activities",
          "mcp__tv-mcp__update-crm-company",
          "mcp__tv-mcp__find-crm-contact",
          "mcp__tv-mcp__create-crm-contact",
          // Projects
          "mcp__tv-mcp__get-project",
          "mcp__tv-mcp__list-projects",
          "mcp__tv-mcp__update-project",
          "mcp__tv-mcp__add-project-session",
          "mcp__tv-mcp__create-project-update",
          // Supabase (for direct queries when needed)
          "mcp__supabase__execute_sql",
        ],
        model: "sonnet",
        max_budget_usd: 0.5,
        resume_session_id: existingSessionId,
      },
    });

    // Post the result as a single clean reply in the chat thread
    if (resultText && resultText.trim()) {
      const replyBody = `@melvin ${resultText.trim()}`;

      await supabase.from("discussions").insert({
        entity_type: "general",
        entity_id: discussion.entity_id,
        author: BOT_AUTHOR,
        body: replyBody,
        parent_id: threadRootId,
      });

      // Notify
      const preview = replyBody.length > 100 ? replyBody.slice(0, 100) + "..." : replyBody;
      await supabase.from("notifications").insert({
        recipient: RECIPIENT,
        type: "mention",
        discussion_id: discussion.id,
        entity_type: "general",
        entity_id: discussion.entity_id,
        actor: BOT_AUTHOR,
        body_preview: preview,
      });
    }

    // Refresh everything
    queryClient.invalidateQueries({ queryKey: ["discussions"] });
    queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["work"] });
  } catch (e) {
    addEvent(runId, { type: "error", content: String(e), timestamp: Date.now() });
    completeRun(runId, String(e), true, 0, 0);
    updateJob(runId, { status: "failed", message: String(e).slice(0, 100) });

    // Post error message to chat
    await supabase.from("discussions").insert({
      entity_type: "general",
      entity_id: discussion.entity_id,
      author: BOT_AUTHOR,
      body: "Something went wrong processing your request. Check the Jobs panel for details.",
      parent_id: threadRootId,
    });
    queryClient.invalidateQueries({ queryKey: ["discussions"] });
    queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
  } finally {
    unlisten();
  }
}

// ---------------------------------------------------------------------------
// Hook — mount once at app root
// ---------------------------------------------------------------------------

export function useTaskAdvisor() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const ranRef = useRef(false);

  // Run on startup (after 8s delay, if 2h+ since last run)
  useEffect(() => {
    if (!userId || ranRef.current) return;
    ranRef.current = true;

    const lastRun = localStorage.getItem(LAST_RUN_KEY);
    const shouldRun =
      !lastRun || Date.now() - new Date(lastRun).getTime() > INTERVAL_MS;

    if (shouldRun) {
      const timer = setTimeout(() => {
        runTaskAdvisor(queryClient, userId).catch(console.warn);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [queryClient, userId]);

  // Recurring interval
  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(() => {
      runTaskAdvisor(queryClient, userId).catch(console.warn);
    }, INTERVAL_MS);

    return () => clearInterval(interval);
  }, [queryClient, userId]);

  // Bot mention handler — subscribe to new discussions that @mention bot-mel
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("bot-mel-mentions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "discussions",
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            entity_type: string;
            entity_id: string;
            author: string;
            body: string;
            parent_id: string | null;
            attachments: string[] | null;
          };

          // Skip bot's own messages
          if (row.author === BOT_AUTHOR) return;

          // Trigger on: (1) any @bot-mel mention, or (2) replies in task-advisor threads
          const mentionsBot = /@bot-mel\b/i.test(row.body);
          const isTaskAdvisorThread = row.entity_id.startsWith("task-advisor:");

          if (!mentionsBot && !isTaskAdvisorThread) return;

          handleBotMention(
            { ...row, attachments: row.attachments || [] },
            userId,
            queryClient
          ).catch((err) => {
            console.error("[bot-mel] Handler error:", err);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
