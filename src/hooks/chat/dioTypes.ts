// DIO Automations — shared types and constants

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
  custom_source_ids: string[];
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
