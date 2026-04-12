// Cockpit hooks — daily focus, delivery projects (read-only view), escalations.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { cockpitKeys } from "./keys";
import {
  DailyFocus,
  DailyFocusUpdate,
  DeliveryProject,
  Escalation,
  EscalationInsert,
  EscalationUpdate,
  WeeklySummary,
  EscalationCategory,
  ESCALATION_CATEGORIES,
  PlanWeekProgress,
  PlanWeekProgressUpdate,
  todayIsoDate,
  parseWorkstream,
  computeHealth,
} from "../../lib/cockpit/types";

// The task_status row id for "Blocked" — known constant.
const BLOCKED_STATUS_ID = "0121906b-d025-4e9f-9e3e-c50cd6bfe85b";

// ============================================================================
// Daily focus
// ============================================================================

async function fetchOrCreateDailyFocus(date: string): Promise<DailyFocus> {
  const { data, error } = await supabase
    .from("daily_focus")
    .select("*")
    .eq("focus_date", date)
    .maybeSingle();
  if (error) throw new Error(`fetch daily_focus: ${error.message}`);
  if (data) return data as DailyFocus;

  const { data: created, error: insertErr } = await supabase
    .from("daily_focus")
    .insert({ focus_date: date })
    .select()
    .single();
  if (insertErr) throw new Error(`create daily_focus: ${insertErr.message}`);
  return created as DailyFocus;
}

export function useDailyFocus(date: string = todayIsoDate()) {
  return useQuery({
    queryKey: cockpitKeys.dailyFocusFor(date),
    queryFn: () => fetchOrCreateDailyFocus(date),
    staleTime: 5000,
  });
}

export function useUpdateDailyFocus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, updates }: { date: string; updates: DailyFocusUpdate }) => {
      const { data, error } = await supabase
        .from("daily_focus")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("focus_date", date)
        .select()
        .single();
      if (error) throw new Error(`update daily_focus: ${error.message}`);
      return data as DailyFocus;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: cockpitKeys.dailyFocusFor(data.focus_date) });
    },
  });
}

export function useToggleSalesSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (focus: DailyFocus): Promise<DailyFocus> => {
      const now = new Date();
      if (focus.sales_session_start) {
        const started = new Date(focus.sales_session_start).getTime();
        const hours = Math.max(0, (now.getTime() - started) / 3_600_000);
        const { data, error } = await supabase
          .from("daily_focus")
          .update({
            sales_hours_actual: Number((Number(focus.sales_hours_actual) + hours).toFixed(3)),
            sales_session_start: null,
            updated_at: now.toISOString(),
          })
          .eq("id", focus.id)
          .select()
          .single();
        if (error) throw new Error(`stop session: ${error.message}`);
        return data as DailyFocus;
      } else {
        const { data, error } = await supabase
          .from("daily_focus")
          .update({
            sales_session_start: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", focus.id)
          .select()
          .single();
        if (error) throw new Error(`start session: ${error.message}`);
        return data as DailyFocus;
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: cockpitKeys.dailyFocusFor(data.focus_date) });
    },
  });
}

// ============================================================================
// Delivery projects — read-only view over projects + crm_companies + tasks
// ============================================================================

interface ProjectRow {
  id: string;
  name: string;
  status: string | null;
  health: string | null;
  priority: number | null;
  lead: string | null;
  target_date: string | null;
  updated_at: string;
  company_id: string;
  company: { id: string; name: string; display_name: string | null; domain_id: string | null; stage: string | null } | null;
}

interface TaskRow {
  project_id: string;
  updated_at: string;
  due_date: string | null;
  status_id: string;
  status: { type: string } | null;
}

export function useDeliveryProjects() {
  return useQuery({
    queryKey: cockpitKeys.deliveryStates(),
    queryFn: async (): Promise<DeliveryProject[]> => {
      // Pull active work projects with a linked CLIENT company.
      // Pre-sales stages (prospect, opportunity) and partner work are excluded —
      // the cockpit delivery grid is for client delivery tracking only.
      const { data: projectRows, error: pErr } = await supabase
        .from("projects")
        .select(
          "id, name, status, health, priority, lead, target_date, updated_at, company_id, " +
          "company:crm_companies!inner(id, name, display_name, domain_id, stage)"
        )
        .eq("project_type", "work")
        .is("archived_at", null)
        .not("company_id", "is", null)
        .eq("company.stage", "client")
        .order("updated_at", { ascending: false });
      if (pErr) throw new Error(`fetch delivery projects: ${pErr.message}`);

      const projects = ((projectRows ?? []) as unknown as ProjectRow[])
        .filter((p) => p.company?.stage === "client");
      if (projects.length === 0) return [];

      const ids = projects.map((p) => p.id);

      // Pull all tasks for those projects with their status type.
      const { data: taskRows, error: tErr } = await supabase
        .from("tasks")
        .select("project_id, updated_at, due_date, status_id, status:task_statuses(type)")
        .in("project_id", ids);
      if (tErr) throw new Error(`fetch delivery tasks: ${tErr.message}`);

      const tasks = (taskRows ?? []) as unknown as TaskRow[];

      // Aggregate by project_id.
      type Agg = {
        open: number;
        in_progress: number;
        blocked: number;
        overdue: number;
        total: number;
        last_activity: string | null;
      };
      const now = new Date();
      const agg = new Map<string, Agg>();
      for (const p of projects) {
        agg.set(p.id, {
          open: 0,
          in_progress: 0,
          blocked: 0,
          overdue: 0,
          total: 0,
          last_activity: null,
        });
      }
      for (const t of tasks) {
        const a = agg.get(t.project_id);
        if (!a) continue;
        a.total += 1;
        const type = t.status?.type ?? "todo";
        if (type !== "complete") {
          a.open += 1;
          if (type === "in_progress") a.in_progress += 1;
          if (t.status_id === BLOCKED_STATUS_ID) a.blocked += 1;
          if (t.due_date) {
            const due = new Date(t.due_date);
            if (due < now) a.overdue += 1;
          }
        }
        if (!a.last_activity || t.updated_at > a.last_activity) {
          a.last_activity = t.updated_at;
        }
      }

      const enriched: DeliveryProject[] = projects.map((p) => {
        const a = agg.get(p.id)!;
        const company = p.company;
        const explicit = (p.health as DeliveryProject["health"]) ?? null;
        return {
          id: p.id,
          name: p.name,
          workstream: parseWorkstream(p.name),
          status: p.status,
          health: explicit,
          derived_health: computeHealth({
            explicit,
            blocked: a.blocked,
            overdue: a.overdue,
            total: a.total,
          }),
          priority: p.priority,
          lead: p.lead,
          target_date: p.target_date,
          updated_at: p.updated_at,
          company_id: p.company_id,
          company_name: company?.display_name || company?.name || "Unknown",
          company_domain_id: company?.domain_id ?? null,
          open_tasks: a.open,
          in_progress_tasks: a.in_progress,
          blocked_tasks: a.blocked,
          overdue_tasks: a.overdue,
          total_tasks: a.total,
          last_task_activity: a.last_activity,
        };
      });

      // Sort: blocked first, then overdue desc, then open desc, then recency.
      enriched.sort((x, y) => {
        if ((y.blocked_tasks > 0 ? 1 : 0) !== (x.blocked_tasks > 0 ? 1 : 0)) {
          return (y.blocked_tasks > 0 ? 1 : 0) - (x.blocked_tasks > 0 ? 1 : 0);
        }
        if (y.overdue_tasks !== x.overdue_tasks) return y.overdue_tasks - x.overdue_tasks;
        if (y.open_tasks !== x.open_tasks) return y.open_tasks - x.open_tasks;
        return (y.last_task_activity ?? "").localeCompare(x.last_task_activity ?? "");
      });

      return enriched;
    },
  });
}

// ============================================================================
// Escalations
// ============================================================================

export function useUnresolvedEscalations() {
  return useQuery({
    queryKey: cockpitKeys.escalationsUnresolved(),
    queryFn: async (): Promise<Escalation[]> => {
      const { data, error } = await supabase
        .from("escalations")
        .select("*")
        .eq("resolved", false)
        .order("occurred_at", { ascending: false });
      if (error) throw new Error(`fetch escalations: ${error.message}`);
      return (data ?? []) as Escalation[];
    },
    staleTime: 5000,
  });
}

export function useRecentEscalations(days = 7) {
  return useQuery({
    queryKey: [...cockpitKeys.escalations(), "recent", days],
    queryFn: async (): Promise<Escalation[]> => {
      const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString();
      const { data, error } = await supabase
        .from("escalations")
        .select("*")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false });
      if (error) throw new Error(`fetch recent escalations: ${error.message}`);
      return (data ?? []) as Escalation[];
    },
  });
}

export function useLogEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (insert: EscalationInsert): Promise<Escalation> => {
      const { data, error } = await supabase
        .from("escalations")
        .insert(insert)
        .select()
        .single();
      if (error) throw new Error(`log escalation: ${error.message}`);

      const today = todayIsoDate();
      const { data: focus } = await supabase
        .from("daily_focus")
        .select("*")
        .eq("focus_date", today)
        .maybeSingle();
      if (focus) {
        await supabase
          .from("daily_focus")
          .update({
            interrupts_count: (focus.interrupts_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", focus.id);
      }
      return data as Escalation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cockpitKeys.escalations() });
      qc.invalidateQueries({ queryKey: cockpitKeys.dailyFocus() });
    },
  });
}

export function useUpdateEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: EscalationUpdate }) => {
      const payload: EscalationUpdate & { resolved_at?: string | null } = { ...updates };
      if (updates.resolved === true && payload.resolved_at === undefined) {
        payload.resolved_at = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from("escalations")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(`update escalation: ${error.message}`);
      return data as Escalation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: cockpitKeys.escalations() }),
  });
}

// ============================================================================
// Weekly summary
// ============================================================================

export function useWeeklySummary() {
  return useQuery({
    queryKey: cockpitKeys.weeklySummary(weekStartIso()),
    queryFn: async (): Promise<WeeklySummary> => {
      const weekStart = weekStartIso();
      const { data: focuses, error: fe } = await supabase
        .from("daily_focus")
        .select("*")
        .gte("focus_date", weekStart);
      if (fe) throw new Error(`fetch weekly focus: ${fe.message}`);

      const { data: escs, error: ee } = await supabase
        .from("escalations")
        .select("*")
        .gte("occurred_at", `${weekStart}T00:00:00Z`);
      if (ee) throw new Error(`fetch weekly escalations: ${ee.message}`);

      const totals = (focuses ?? []).reduce(
        (acc, f) => {
          acc.sales_hours_total += Number(f.sales_hours_actual ?? 0);
          acc.sales_hours_target += Number(f.sales_hours_target ?? 0);
          acc.outbound_sent += Number(f.outbound_sent ?? 0);
          acc.outbound_target += Number(f.outbound_target ?? 0);
          return acc;
        },
        { sales_hours_total: 0, sales_hours_target: 0, outbound_sent: 0, outbound_target: 0 }
      );

      const byCategory = ESCALATION_CATEGORIES.reduce(
        (acc, cat) => ({ ...acc, [cat]: 0 }),
        {} as Record<EscalationCategory, number>
      );
      for (const e of escs ?? []) byCategory[e.category as EscalationCategory] = (byCategory[e.category as EscalationCategory] ?? 0) + 1;

      return {
        week_start: weekStart,
        sales_hours_total: Number(totals.sales_hours_total.toFixed(2)),
        sales_hours_target: Number(totals.sales_hours_target.toFixed(2)),
        outbound_sent: totals.outbound_sent,
        outbound_target: totals.outbound_target,
        escalations_total: (escs ?? []).length,
        escalations_by_category: byCategory,
      };
    },
  });
}

function weekStartIso(): string {
  const now = new Date();
  const sgt = new Date(now.getTime() + (8 * 60 - now.getTimezoneOffset()) * 60000);
  const day = sgt.getUTCDay();
  const monOffset = (day + 6) % 7;
  const monday = new Date(sgt);
  monday.setUTCDate(sgt.getUTCDate() - monOffset);
  return monday.toISOString().slice(0, 10);
}

// ============================================================================
// Range summary — sum daily_focus + count escalations across any date range.
// Used by monthly summary (and anywhere else we need a window total).
// ============================================================================

export interface RangeSummary {
  sales_hours_total: number;
  outbound_sent: number;
  escalations_total: number;
}

export function useRangeSummary(startDate: string, endDateInclusive: string) {
  return useQuery({
    queryKey: [...cockpitKeys.all, "range_summary", startDate, endDateInclusive],
    queryFn: async (): Promise<RangeSummary> => {
      const { data: focuses, error: fe } = await supabase
        .from("daily_focus")
        .select("sales_hours_actual, outbound_sent")
        .gte("focus_date", startDate)
        .lte("focus_date", endDateInclusive);
      if (fe) throw new Error(`fetch range focus: ${fe.message}`);

      const { data: escs, error: ee } = await supabase
        .from("escalations")
        .select("id", { count: "exact", head: false })
        .gte("occurred_at", `${startDate}T00:00:00Z`)
        .lte("occurred_at", `${endDateInclusive}T23:59:59Z`);
      if (ee) throw new Error(`fetch range escalations: ${ee.message}`);

      const totals = (focuses ?? []).reduce(
        (acc, f) => {
          acc.sales_hours_total += Number(f.sales_hours_actual ?? 0);
          acc.outbound_sent += Number(f.outbound_sent ?? 0);
          return acc;
        },
        { sales_hours_total: 0, outbound_sent: 0 }
      );

      return {
        sales_hours_total: Number(totals.sales_hours_total.toFixed(2)),
        outbound_sent: totals.outbound_sent,
        escalations_total: (escs ?? []).length,
      };
    },
  });
}

// ============================================================================
// Plan week progress — per-week achievement tracking
// ============================================================================

export function usePlanWeekProgress(weekNumber: number, weekStart: string) {
  return useQuery({
    queryKey: cockpitKeys.planWeekProgress(weekNumber),
    queryFn: async (): Promise<PlanWeekProgress> => {
      const { data, error } = await supabase
        .from("weekly_plan_progress")
        .select("*")
        .eq("week_number", weekNumber)
        .maybeSingle();
      if (error) throw new Error(`fetch plan_week_progress: ${error.message}`);
      if (data) return data as PlanWeekProgress;

      const { data: created, error: insertErr } = await supabase
        .from("weekly_plan_progress")
        .insert({ week_number: weekNumber, week_start: weekStart })
        .select()
        .single();
      if (insertErr) throw new Error(`create plan_week_progress: ${insertErr.message}`);
      return created as PlanWeekProgress;
    },
    staleTime: 5000,
  });
}

export function useUpdatePlanWeekProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      weekNumber,
      updates,
    }: {
      weekNumber: number;
      updates: PlanWeekProgressUpdate;
    }): Promise<PlanWeekProgress> => {
      const { data, error } = await supabase
        .from("weekly_plan_progress")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("week_number", weekNumber)
        .select()
        .single();
      if (error) throw new Error(`update plan_week_progress: ${error.message}`);
      return data as PlanWeekProgress;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: cockpitKeys.planWeekProgress(data.week_number) });
    },
  });
}
