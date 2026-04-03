// Context gathering for DIO automations and bot mentions
// Fetches tasks, deals, emails, projects, calendar events from various sources

import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../../lib/supabase";
import { toSGTDateString } from "../../lib/date";
import type { TaskWithRelations } from "../../lib/work/types";
import type { DioSources } from "./dioTypes";

// ---------------------------------------------------------------------------
// Time helpers (SGT)
// ---------------------------------------------------------------------------

export function getSGTHour(): number {
  const h = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    hour12: false,
  });
  return parseInt(h, 10);
}

export function getSGTTimeString(): string {
  return new Date().toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function getRemainingWorkHours(): number {
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

export interface TaskSnapshot {
  overdue: TaskWithRelations[];
  dueToday: TaskWithRelations[];
  inProgress: TaskWithRelations[];
  completedToday: TaskWithRelations[];
  upcoming: TaskWithRelations[];
}

export async function gatherMyTasks(userId: string): Promise<TaskSnapshot> {
  const today = toSGTDateString();

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

    if (statusType === "complete") {
      const completedDate = (t.completed_at || t.updated_at || "").slice(0, 10);
      if (completedDate === today) {
        snapshot.completedToday.push(t);
      }
      continue;
    }

    const dueDate = t.due_date?.slice(0, 10);

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

  snapshot.overdue.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  return snapshot;
}

// ---------------------------------------------------------------------------
// Additional data sources
// ---------------------------------------------------------------------------

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

async function gatherProjectUpdates(_userId: string): Promise<string | null> {
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("project_type", "work")
    .eq("status", "active")
    .is("archived_at", null)
    .limit(10);

  if (!projects?.length) return null;

  const today = toSGTDateString();
  const doneIds = await getDoneStatusIds();
  const projectIds = projects.map((p) => p.id);

  // Batch fetch all open tasks for these projects in one query
  const { data: openTasks } = await supabase
    .from("tasks")
    .select("project_id, due_date")
    .in("project_id", projectIds)
    .not("status_id", "in", `(${doneIds})`);

  // Aggregate counts client-side
  const openByProject = new Map<string, number>();
  const overdueByProject = new Map<string, number>();
  for (const t of openTasks || []) {
    openByProject.set(t.project_id, (openByProject.get(t.project_id) || 0) + 1);
    if (t.due_date && t.due_date.slice(0, 10) < today) {
      overdueByProject.set(t.project_id, (overdueByProject.get(t.project_id) || 0) + 1);
    }
  }

  const lines = [`ACTIVE PROJECTS (${projects.length}):`];
  for (const p of projects) {
    const openCount = openByProject.get(p.id) || 0;
    const overdueCount = overdueByProject.get(p.id) || 0;
    const overdueNote = overdueCount > 0 ? `, ${overdueCount} overdue` : ", none overdue";
    lines.push(`- ${p.name} — ${openCount} open tasks${overdueNote}`);
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

// ---------------------------------------------------------------------------
// Aggregate context
// ---------------------------------------------------------------------------

export interface GatheredContext {
  sections: string[];
}

export async function gatherContext(userId: string, sources: DioSources): Promise<GatheredContext> {
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

  sections.push(`Current time: ${getSGTTimeString()} SGT\nHours until midnight: ~${getRemainingWorkHours()}`);

  return { sections };
}

// ---------------------------------------------------------------------------
// Prompt formatting
// ---------------------------------------------------------------------------

export function formatTaskLine(t: TaskWithRelations): string {
  const prio = priorityLabel(t.priority);
  const project = (t.project as unknown as { name?: string })?.name || "No project";
  const statusType = (t.status as unknown as { type?: string })?.type;
  const due = t.due_date ? t.due_date.slice(0, 10) : "no date";

  const statusNote = statusType === "in_progress" ? ", in progress" : "";
  return `- [${prio}] ${t.title} (due ${due}${statusNote}) — ${project}`;
}

export function buildPromptData(snapshot: TaskSnapshot): string {
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
