// DIO Automations — Data → Instruction → Output
// Lightweight automations stored in Supabase (dio_automations table).
// Each runs in-app via the Anthropic API on a configurable schedule.
// Reply handler: when user replies to a DIO thread, Claude Code processes + acts.

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "../../lib/supabase";
import { toSGTDateString } from "../../lib/date";
import type { TaskWithRelations } from "../../lib/work/types";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserId, useUsers } from "../work/useUsers";
import { useJobsStore } from "../../stores/jobsStore";
import { useClaudeRunStore } from "../../stores/claudeRunStore";

const CHECK_INTERVAL_MS = 60_000; // Check every 60s whether it's time to run
const BOT_AUTHOR = "bot-mel";

// ---------------------------------------------------------------------------
// Types (matches dio_automations table)
// ---------------------------------------------------------------------------

export interface DioSources {
  tasks: boolean;
  deals: boolean;
  emails: boolean;
  projects: boolean;
  calendar: boolean;
}

export type PostMode = "new_thread" | "same_thread";

export interface DioAutomation {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  interval_hours: number;
  active_hours: string | null;
  sources: DioSources;
  model: string;
  system_prompt: string | null;
  post_mode: PostMode;
  thread_id: string | null;
  thread_title: string | null;
  bot_author: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DioAutomationInput = Omit<DioAutomation, "id" | "created_at" | "updated_at" | "last_run_at">;

// ---------------------------------------------------------------------------
// Constants & defaults
// ---------------------------------------------------------------------------

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_THREAD_TITLE_NEW = "Check-in — {date} at {time}";
export const DEFAULT_THREAD_TITLE_SAME = "Daily Check-ins";

export const DEFAULT_SOURCES: DioSources = {
  tasks: true,
  deals: false,
  emails: false,
  projects: false,
  calendar: false,
};

export const SOURCE_OPTIONS = [
  { key: "tasks" as const, label: "My Tasks", desc: "Overdue, due today, in progress, upcoming 3 days" },
  { key: "deals" as const, label: "CRM Pipeline", desc: "Active deals with stage and expected close" },
  { key: "emails" as const, label: "Recent Emails", desc: "Top 10 inbox items by priority (requires Outlook)" },
  { key: "projects" as const, label: "Project Updates", desc: "Active work projects with open/overdue task counts" },
  { key: "calendar" as const, label: "Calendar Events", desc: "Today's remaining events (requires Outlook)" },
] as const;

export const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (fast, cheap)" },
  { value: "claude-sonnet-4-6-20260401", label: "Sonnet 4.6 (balanced)" },
] as const;

export const DEFAULT_SYSTEM_PROMPT = `You are bot-mel, a blunt and practical task advisor. You're checking in on the user's task list throughout the day. Be direct — no fluff, no cheerleading, no bullet points, no emojis.

Your job:
- Highlight what matters most right now given the time of day and hours remaining
- Call out if they're avoiding the hard or important stuff (high priority / overdue items not in progress)
- Note if the pace is on track or falling behind
- If time is running short, suggest what to defer to tomorrow
- Acknowledge progress when tasks have been completed — but briefly, then move on to what's next
- If everything looks good, say so in one line and move on

Write conversationally, like a blunt colleague checking in. 3-5 sentences max. Reference specific task names when relevant. Do NOT use markdown formatting.`;

// ---------------------------------------------------------------------------
// Supabase CRUD
// ---------------------------------------------------------------------------

export async function loadDioAutomations(): Promise<DioAutomation[]> {
  const { data, error } = await supabase
    .from("dio_automations")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[dio] Failed to load automations:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    ...row,
    sources: { ...DEFAULT_SOURCES, ...(row.sources as object) } as DioSources,
    post_mode: (row.post_mode === "same_thread" ? "same_thread" : "new_thread") as PostMode,
  }));
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

function parseActiveHours(ah: string | null): { start: number; end: number } | null {
  if (!ah || !ah.includes("-")) return null;
  const [s, e] = ah.split("-").map(Number);
  if (isNaN(s) || isNaN(e)) return null;
  return { start: s, end: e };
}

function isWithinActiveHours(automation: DioAutomation): boolean {
  const parsed = parseActiveHours(automation.active_hours);
  if (!parsed) return true;
  const h = getSGTHour();
  return h >= parsed.start && h < parsed.end;
}

function isDue(automation: DioAutomation): boolean {
  if (!automation.last_run_at) return true;
  const elapsed = Date.now() - new Date(automation.last_run_at).getTime();
  return elapsed >= automation.interval_hours * 3600000;
}

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
// Additional data sources
// ---------------------------------------------------------------------------

interface GatheredContext {
  sections: string[];
}

async function gatherActiveDeals(): Promise<string | null> {
  const { data: deals } = await supabase
    .from("projects")
    .select("name, deal_stage, deal_value, deal_expected_close, company:crm_companies!projects_company_id_fkey(name, display_name)")
    .eq("project_type", "deal")
    .is("archived_at", null)
    .not("deal_stage", "in", "(won,lost)")
    .order("deal_expected_close", { ascending: true, nullsFirst: false })
    .limit(10);

  if (!deals?.length) return null;

  const lines = ["ACTIVE DEALS (" + deals.length + "):"];
  for (const d of deals) {
    const company = (d.company as unknown as { display_name?: string; name?: string })?.display_name
      || (d.company as unknown as { name?: string })?.name || "Unknown";
    const value = d.deal_value ? `$${Number(d.deal_value).toLocaleString()}` : "no value";
    const close = d.deal_expected_close ? `close: ${d.deal_expected_close.slice(0, 10)}` : "no close date";
    lines.push(`- ${company} — ${d.deal_stage || "unknown stage"} — ${value} (${close})`);
  }
  return lines.join("\n");
}

async function gatherRecentEmails(): Promise<string | null> {
  try {
    const emails = await invoke<Array<{
      subject: string;
      from_name: string;
      importance: string;
      is_read: boolean;
      received_at: string;
    }>>("outlook_list_emails", { folder: null, category: null, status: "unread", search: null, limit: 10, offset: 0 });

    if (!emails?.length) return null;

    const lines = [`RECENT EMAILS (${emails.length} unread):`];
    for (const e of emails) {
      const prio = e.importance === "high" ? "[HIGH] " : "";
      const ago = formatTimeAgo(e.received_at);
      lines.push(`- ${prio}${e.subject} — ${e.from_name} (${ago})`);
    }
    return lines.join("\n");
  } catch {
    return null; // Outlook not connected
  }
}

async function gatherProjectUpdates(userId: string): Promise<string | null> {
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("project_type", "work")
    .eq("status", "active")
    .is("archived_at", null)
    .limit(10);

  if (!projects?.length) return null;

  const today = toSGTDateString();
  const lines = [`ACTIVE PROJECTS (${projects.length}):`];

  for (const p of projects) {
    const { count: openCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", p.id)
      .not("status_id", "in", `(${await getDoneStatusIds()})`);

    const { count: overdueCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", p.id)
      .not("status_id", "in", `(${await getDoneStatusIds()})`)
      .lt("due_date", today);

    const overdueNote = (overdueCount ?? 0) > 0 ? `, ${overdueCount} overdue` : ", none overdue";
    lines.push(`- ${p.name} — ${openCount ?? 0} open tasks${overdueNote}`);
  }
  return lines.join("\n");
}

let _doneStatusIdsCache: string | null = null;
async function getDoneStatusIds(): Promise<string> {
  if (_doneStatusIdsCache) return _doneStatusIdsCache;
  const { data } = await supabase.from("task_statuses").select("id").eq("type", "complete");
  _doneStatusIdsCache = (data || []).map((s) => `'${s.id}'`).join(",") || "'__none__'";
  return _doneStatusIdsCache;
}

async function gatherCalendarEvents(): Promise<string | null> {
  try {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await invoke<Array<{
      subject: string;
      start_at: string;
      end_at: string;
      is_all_day: boolean;
      location: string;
      is_online_meeting: boolean;
    }>>("outlook_list_events", {
      startTime: now.toISOString(),
      endTime: endOfDay.toISOString(),
      limit: 10,
    });

    if (!events?.length) return null;

    const lines = [`TODAY'S REMAINING EVENTS (${events.length}):`];
    for (const e of events) {
      const start = new Date(e.start_at).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false });
      const durationMin = Math.round((new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000);
      const duration = durationMin >= 60 ? `${Math.floor(durationMin / 60)}h${durationMin % 60 ? ` ${durationMin % 60}m` : ""}` : `${durationMin}m`;
      const loc = e.is_online_meeting ? "online" : (e.location || "");
      const locNote = loc ? `, ${loc}` : "";
      lines.push(`- ${start} — ${e.subject} (${duration}${locNote})`);
    }
    return lines.join("\n");
  } catch {
    return null; // Outlook not connected
  }
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function gatherContext(userId: string, sources: AdvisorSources): Promise<GatheredContext> {
  const results = await Promise.allSettled([
    sources.tasks ? gatherMyTasks(userId).then(buildPromptData) : Promise.resolve(null),
    sources.deals ? gatherActiveDeals() : Promise.resolve(null),
    sources.emails ? gatherRecentEmails() : Promise.resolve(null),
    sources.projects ? gatherProjectUpdates(userId) : Promise.resolve(null),
    sources.calendar ? gatherCalendarEvents() : Promise.resolve(null),
  ]);

  const sections: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) sections.push(r.value);
  }

  // Always add time context
  sections.push(`Current time: ${getSGTTimeString()} SGT\nHours until midnight: ~${getRemainingWorkHours()}`);

  return { sections };
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

async function composeMessage(
  context: GatheredContext,
  userName: string,
  systemPromptOverride?: string | null,
  model?: string,
): Promise<string | null> {
  const apiKey = await invoke<string | null>("settings_get_anthropic_key");
  if (!apiKey) {
    console.warn("[task-advisor] No Anthropic API key configured");
    return null;
  }

  // Nothing to say if no data sections
  if (context.sections.length <= 1) { // only time context
    return null;
  }

  const contextData = context.sections.join("\n\n---\n\n");

  const basePrompt = systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
  const systemPrompt = `${basePrompt}\n\nAlways address as @${userName}.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here's your current status:\n\n${contextData}\n\nGive your check-in.`,
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

function resolveThreadTitle(template: string): string {
  const now = new Date();
  const vars: Record<string, string> = {
    date: now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" }),
    time: now.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true }),
    day: now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", weekday: "long" }),
    month: now.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", month: "short", year: "numeric" }),
  };
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`);
}

async function postMessage(
  message: string,
  recipient: string,
  queryClient: QueryClient,
  postMode: PostMode,
  threadId: string,
  threadTitle: string,
  author: string = BOT_AUTHOR,
): Promise<void> {
  const resolvedTitle = resolveThreadTitle(threadTitle);

  if (postMode === "same_thread") {
    // Find existing root for this thread
    const { data: existing } = await supabase
      .from("discussions")
      .select("id")
      .eq("entity_type", "general")
      .eq("entity_id", threadId)
      .is("parent_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (existing) {
      const { data: reply, error } = await supabase
        .from("discussions")
        .insert({
          entity_type: "general",
          entity_id: threadId,
          author,
          body: message,
          parent_id: existing.id,
        })
        .select()
        .single();

      if (error) {
        console.error("[dio] Failed to post reply:", error.message);
        return;
      }

      const preview = message.length > 100 ? message.slice(0, 100) + "..." : message;
      await supabase.from("notifications").insert({
        recipient,
        type: "mention",
        discussion_id: reply.id,
        entity_type: "general",
        entity_id: threadId,
        actor: author,
        body_preview: preview,
      });
    } else {
      const { data: root, error } = await supabase
        .from("discussions")
        .insert({
          entity_type: "general",
          entity_id: threadId,
          author,
          body: message,
          title: resolvedTitle,
        })
        .select()
        .single();

      if (error) {
        console.error("[dio] Failed to create thread:", error.message);
        return;
      }

      const preview = message.length > 100 ? message.slice(0, 100) + "..." : message;
      await supabase.from("notifications").insert({
        recipient,
        type: "mention",
        discussion_id: root.id,
        entity_type: "general",
        entity_id: threadId,
        actor: author,
        body_preview: preview,
      });
    }
  } else {
    const entityId = `dio:${Date.now()}`;

    const { data: discussion, error } = await supabase
      .from("discussions")
      .insert({
        entity_type: "general",
        entity_id: entityId,
        author,
        body: message,
        title: resolvedTitle,
      })
      .select()
      .single();

    if (error) {
      console.error("[dio] Failed to post:", error.message);
      return;
    }

    const preview = message.length > 100 ? message.slice(0, 100) + "..." : message;
    await supabase.from("notifications").insert({
      recipient,
      type: "mention",
      discussion_id: discussion.id,
      entity_type: "general",
      entity_id: entityId,
      actor: author,
      body_preview: preview,
    });
  }

  // Refresh UI
  queryClient.invalidateQueries({ queryKey: ["discussions"] });
  queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runDioAutomation(
  automation: DioAutomation,
  queryClient: QueryClient,
  userId: string,
  userName: string,
): Promise<void> {
  console.log(`[dio] Running "${automation.name}"...`);

  const pm = automation.post_mode;
  const tid = automation.thread_id || `dio:${automation.id}:daily`;
  const ttl = automation.thread_title || (pm === "same_thread" ? DEFAULT_THREAD_TITLE_SAME : DEFAULT_THREAD_TITLE_NEW);

  try {
    const context = await gatherContext(userId, automation.sources);
    const message = await composeMessage(context, userName, automation.system_prompt, automation.model);

    if (!message) {
      console.log(`[dio] "${automation.name}" — nothing to report`);
    } else {
      await postMessage(message, userName, queryClient, pm, tid, ttl, automation.bot_author);
      console.log(`[dio] "${automation.name}" — posted as ${automation.bot_author}`);
    }
  } catch (err) {
    console.error(`[dio] "${automation.name}" error:`, err);
  }

  // Update last_run_at in Supabase
  await supabase
    .from("dio_automations")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", automation.id);
}

/** Manually trigger a DIO automation by ID. */
export async function triggerDioAutomation(
  automationId: string,
  queryClient: QueryClient,
  userId: string,
  userName: string,
): Promise<void> {
  const automations = await loadDioAutomations();
  const auto = automations.find((a) => a.id === automationId);
  if (!auto) {
    console.error(`[dio] Automation ${automationId} not found`);
    return;
  }
  await runDioAutomation(auto, queryClient, userId, userName);
  queryClient.invalidateQueries({ queryKey: ["dio-automations"] });
}

// Legacy alias for existing callers
export async function triggerTaskAdvisor(
  queryClient: QueryClient,
  userId: string,
  userName: string,
): Promise<void> {
  await triggerDioAutomation("task-advisor", queryClient, userId, userName);
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
  const isDioThread = discussion.entity_id.startsWith("task-advisor:") || discussion.entity_id.startsWith("dio:");
  let taskContext = "";

  if (isDioThread) {
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

  const userName = discussion.author;

  const prompt = `You are bot-mel — a blunt, practical AI assistant in a chat thread. @${userName} just sent you a message. Read the conversation and do what they're asking.

## Conversation so far:
${conversationHistory}
${imageContext}
${taskContext}

## What to do:
1. Understand what @${userName} is asking for.
2. If screenshots are attached, read the image files to understand the context.
3. Use the available MCP tools to execute the request: update tasks, look up CRM data, log activities, create tasks, get project info, etc.
4. After completing the work, output ONLY your final reply to @${userName} as plain text. Be conversational and direct — that's bot-mel's style. No emojis, no excessive formatting.

## Important:
- Only act on what @${userName} explicitly asked for. Don't assume or over-reach.
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
      const replyBody = `@${userName} ${resultText.trim()}`;

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
        recipient: userName,
        type: "mention",
        discussion_id: discussion.id,
        entity_type: discussion.entity_type,
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
  const { data: allUsers = [] } = useUsers();
  const userName = allUsers.find((u) => u.id === userId)?.name || "user";
  const ranRef = useRef(false);

  // Run all due DIO automations on startup + every 60s
  useEffect(() => {
    if (!userId || !userName || userName === "user") return;

    async function checkAndRunAll() {
      try {
        const automations = await loadDioAutomations();
        for (const auto of automations) {
          if (!auto.enabled) continue;
          if (!isWithinActiveHours(auto)) continue;
          if (!isDue(auto)) continue;
          await runDioAutomation(auto, queryClient, userId, userName);
        }
        queryClient.invalidateQueries({ queryKey: ["dio-automations"] });
      } catch (err) {
        console.warn("[dio] Check failed:", err);
      }
    }

    // Startup check (once, after 8s delay)
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    if (!ranRef.current) {
      ranRef.current = true;
      startupTimer = setTimeout(checkAndRunAll, 8000);
    }

    // Recurring check every 60s
    const interval = setInterval(checkAndRunAll, CHECK_INTERVAL_MS);

    return () => {
      if (startupTimer) clearTimeout(startupTimer);
      clearInterval(interval);
    };
  }, [queryClient, userId, userName]);

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
          const isDioThread = row.entity_id.startsWith("task-advisor:") || row.entity_id.startsWith("dio:");

          if (!mentionsBot && !isDioThread) return;

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
