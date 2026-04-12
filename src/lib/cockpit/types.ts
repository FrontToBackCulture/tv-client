// Cockpit types — daily focus, delivery projects, escalations.
//
// Delivery is NOT a separate table. It's a read-only view over `projects`
// where project_type='work' AND company_id IS NOT NULL — i.e. work projects
// linked to a CRM company. Task state is aggregated from `tasks` joined via
// `task_statuses` (type = 'todo' | 'in_progress' | 'complete').

// ============================================================================
// Escalation categories (the interrupt log)
// ============================================================================

export type EscalationCategory =
  | "troubleshooting"
  | "incident"
  | "onboarding"
  | "engagement"
  | "self-service"
  | "team-unblock"
  | "sales-fire"
  | "other";

export const ESCALATION_CATEGORIES: EscalationCategory[] = [
  "troubleshooting",
  "incident",
  "onboarding",
  "engagement",
  "self-service",
  "team-unblock",
  "sales-fire",
  "other",
];

// ============================================================================
// Daily focus
// ============================================================================

export interface DailyFocus {
  id: string;
  focus_date: string; // YYYY-MM-DD
  one_thing: string | null;
  sales_hours_target: number;
  sales_hours_actual: number;
  sales_session_start: string | null;
  interrupts_count: number;
  outbound_target: number;
  outbound_sent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type DailyFocusUpdate = Partial<
  Omit<DailyFocus, "id" | "focus_date" | "created_at" | "updated_at">
>;

// ============================================================================
// Delivery project — derived from projects + crm_companies + task aggregates
// ============================================================================

export type DeliveryHealth = "on_track" | "at_risk" | "off_track" | null;

export interface DeliveryProject {
  id: string;                   // projects.id
  name: string;                 // projects.name (e.g. "KOI — Onboarding")
  workstream: string;           // parsed from name after " — "
  status: string | null;        // projects.status
  health: DeliveryHealth;       // projects.health as-is
  derived_health: DeliveryHealth; // health ?? computed from task state
  priority: number | null;
  lead: string | null;
  target_date: string | null;
  updated_at: string;
  company_id: string;
  company_name: string;
  company_domain_id: string | null;
  open_tasks: number;
  in_progress_tasks: number;
  blocked_tasks: number;
  overdue_tasks: number;
  total_tasks: number;
  last_task_activity: string | null;
}

// Compute a fallback health signal from task aggregates when projects.health is null.
export function computeHealth(args: {
  explicit: DeliveryHealth;
  blocked: number;
  overdue: number;
  total: number;
}): DeliveryHealth {
  if (args.explicit) return args.explicit;
  if (args.total === 0) return null;
  if (args.blocked > 0 || args.overdue >= 5) return "off_track";
  if (args.overdue > 0) return "at_risk";
  return "on_track";
}

// ============================================================================
// Escalations
// ============================================================================

export interface Escalation {
  id: string;
  occurred_at: string;
  client_name: string | null;
  company_id: string | null;
  category: EscalationCategory;
  time_spent_minutes: number | null;
  was_me: boolean;
  resolved: boolean;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
}

export type EscalationInsert = Omit<Escalation, "id" | "created_at">;
export type EscalationUpdate = Partial<EscalationInsert>;

// ============================================================================
// Weekly summary
// ============================================================================

export interface WeeklySummary {
  week_start: string;
  sales_hours_total: number;
  sales_hours_target: number;
  outbound_sent: number;
  outbound_target: number;
  escalations_total: number;
  escalations_by_category: Record<EscalationCategory, number>;
}

// ============================================================================
// Plan week progress — per-week achievement tracking
// ============================================================================

export interface PlanWeekProgress {
  id: string;
  week_number: number;
  week_start: string;
  goal_achieved: boolean | null;
  build_shipped: boolean | null;
  notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PlanWeekProgressUpdate = Partial<
  Pick<PlanWeekProgress, "goal_achieved" | "build_shipped" | "notes" | "reviewed_at">
>;

// ============================================================================
// Helpers
// ============================================================================

export function todayIsoDate(): string {
  const now = new Date();
  const sgt = new Date(now.getTime() + (8 * 60 - now.getTimezoneOffset()) * 60000);
  return sgt.toISOString().slice(0, 10);
}

export function categoryLabel(cat: EscalationCategory): string {
  switch (cat) {
    case "troubleshooting": return "Troubleshooting";
    case "incident": return "Incident";
    case "onboarding": return "Onboarding";
    case "engagement": return "Engagement";
    case "self-service": return "Self-Service";
    case "team-unblock": return "Team Unblock";
    case "sales-fire": return "Sales Fire";
    case "other": return "Other";
  }
}

export function healthLabel(h: DeliveryHealth): string {
  if (h === "on_track") return "On track";
  if (h === "at_risk") return "At risk";
  if (h === "off_track") return "Off track";
  return "—";
}

export function healthColor(h: DeliveryHealth): string {
  if (h === "on_track") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (h === "at_risk") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  if (h === "off_track") return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
}

// Parse "{Client} — {Workstream}" → { workstream }
export function parseWorkstream(name: string): string {
  const idx = name.indexOf(" — ");
  if (idx >= 0) return name.slice(idx + 3).trim();
  const idxDash = name.indexOf(" - ");
  if (idxDash >= 0) return name.slice(idxDash + 3).trim();
  return name;
}
