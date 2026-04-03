// Bot mention handler — when a user @mentions a bot in chat, invoke Claude Code to process + act

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "../../lib/supabase";
import { formatError } from "../../lib/formatError";
import type { QueryClient } from "@tanstack/react-query";
import { useJobsStore } from "../../stores/jobsStore";
import { useClaudeRunStore } from "../../stores/claudeRunStore";
import { gatherMyTasks, buildPromptData } from "./gatherContext";

const BOT_AUTHOR = "bot-mel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClaudeStreamEvent {
  run_id: string;
  event_type: string; // "text" | "tool_use" | "tool_result" | "result" | "error"
  content: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dedup state (bounded)
// ---------------------------------------------------------------------------

// Track which discussion IDs we've already processed to avoid double-handling
// Uses a Map with timestamps so we can evict old entries and prevent unbounded growth
const processedReplies = new Map<string, number>();
const PROCESSED_TTL_MS = 300_000; // 5 minutes

function markProcessed(id: string) {
  const now = Date.now();
  processedReplies.set(id, now);
  for (const [k, t] of processedReplies) {
    if (now - t > PROCESSED_TTL_MS) processedReplies.delete(k);
  }
}

// Store Claude session IDs per thread for conversation continuity
const MAX_THREAD_SESSIONS = 50;
const threadSessions = new Map<string, string>();

function setThreadSession(entityId: string, sessionId: string) {
  if (threadSessions.size >= MAX_THREAD_SESSIONS) {
    const oldest = threadSessions.keys().next().value;
    if (oldest) threadSessions.delete(oldest);
  }
  threadSessions.set(entityId, sessionId);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleBotMention(
  discussion: { id: string; entity_type: string; entity_id: string; body: string; author: string; parent_id: string | null; attachments?: string[] },
  userId: string,
  queryClient: QueryClient,
  botName: string = BOT_AUTHOR
): Promise<void> {
  // Skip bot messages or already-processed
  if (/^bot-/i.test(discussion.author)) return;
  if (processedReplies.has(discussion.id)) return;
  markProcessed(discussion.id);

  // Cross-instance dedup: check if any bot already replied to this message
  const threadRootIdCheck = discussion.parent_id || discussion.id;
  const { count: existingReplies } = await supabase
    .from("discussions")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", threadRootIdCheck)
    .eq("author", botName)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if (existingReplies && existingReplies > 0) {
    console.log(`[${botName}] Skipping — another instance already replied`);
    return;
  }

  console.log(`[${botName}] Processing mention:`, discussion.body.slice(0, 80));

  const { addJob, updateJob } = useJobsStore.getState();
  const { createRun, addEvent, completeRun, expandRun } =
    useClaudeRunStore.getState();

  const runId = `${botName}-reply-${Date.now()}`;
  const jobName = `${botName} — processing request`;

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
  const isDioThread = discussion.entity_id.startsWith("task-advisor:") || discussion.entity_id.startsWith("dio:");
  let taskContext = "";

  if (isDioThread) {
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

  const userName = discussion.author;

  const prompt = `You are ${botName} — an AI assistant in a chat thread. @${userName} just sent you a message. Read the conversation and do what they're asking.

## Conversation so far:
${conversationHistory}
${imageContext}
${taskContext}

## What to do:
1. Understand what @${userName} is asking for.
2. If screenshots are attached, read the image files to understand the context.
3. Use the available MCP tools to execute the request: update tasks, look up CRM data, log activities, create tasks, get project info, etc.
4. After completing the work, output ONLY your final reply to @${userName} as plain text. Be conversational and direct. No emojis, no excessive formatting.

## Important:
- Only act on what @${userName} explicitly asked for. Don't assume or over-reach.
- If something is ambiguous, ask for clarification instead of guessing.
- Do NOT call add-discussion. Your text output will be posted to the chat automatically.
- Your final output should be ONLY the reply text — no JSON, no code blocks, no tool call summaries.
- If you can't do something with the available tools, say so directly.`;

  const threadRootId = discussion.parent_id || discussion.id;

  // Listen for Claude stream events
  let resultText = "";
  const existingSessionId = threadSessions.get(discussion.entity_id) || undefined;

  const unlisten = await listen<ClaudeStreamEvent>("claude-stream", (event) => {
    const data = event.payload;
    if (data.run_id !== runId) return;

    if (data.event_type === "init" && data.metadata?.session_id) {
      setThreadSession(discussion.entity_id, data.metadata.session_id as string);
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

    // Post the result as a reply in the chat thread
    if (resultText && resultText.trim()) {
      const replyBody = `@${userName} ${resultText.trim()}`;

      await supabase.from("discussions").insert({
        entity_type: "general",
        entity_id: discussion.entity_id,
        author: botName,
        body: replyBody,
        parent_id: threadRootId,
      });

      const preview = replyBody.length > 100 ? replyBody.slice(0, 100) + "..." : replyBody;
      await supabase.from("notifications").insert({
        recipient: userName,
        type: "mention",
        discussion_id: discussion.id,
        entity_type: discussion.entity_type,
        entity_id: discussion.entity_id,
        actor: botName,
        body_preview: preview,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["discussions"] });
    queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["work"] });
  } catch (e) {
    const msg = formatError(e);
    addEvent(runId, { type: "error", content: msg, timestamp: Date.now() });
    completeRun(runId, msg, true, 0, 0);
    updateJob(runId, { status: "failed", message: msg.slice(0, 100) });

    await supabase.from("discussions").insert({
      entity_type: "general",
      entity_id: discussion.entity_id,
      author: botName,
      body: "Something went wrong processing your request. Check the Jobs panel for details.",
      parent_id: threadRootId,
    });
    queryClient.invalidateQueries({ queryKey: ["discussions"] });
    queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
  } finally {
    unlisten();
  }
}
