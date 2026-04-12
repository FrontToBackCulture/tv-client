// The 12-week plan — one entry per week.
// Edit these to update what shows up in the cockpit "Targets" card.
// Plan starts Monday Apr 13, 2026.
//
// Full plan reference: _team/melvin/plan.md in tv-knowledge.

export interface PlanWeek {
  weekNumber: number;
  monthNumber: 1 | 2 | 3;
  phase: string;
  startDate: string; // ISO Monday (YYYY-MM-DD)
  mainGoal: string;
  buildTarget: string;
  salesHoursTarget: number;
  outboundWeeklyTarget: number;
}

const DEFAULT_OUTBOUND_WEEKLY = 25;

export const PLAN_WEEKS: PlanWeek[] = [
  {
    weekNumber: 1,
    monthNumber: 1,
    phase: "Month 1 — Foundation",
    startDate: "2026-04-13",
    mainGoal: "Baseline & defend. Sacred sales mornings. Log every interrupt honestly.",
    buildTarget: "No build — measure only. Friday retro ranks top 3 interrupt categories.",
    salesHoursTarget: 20,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 2,
    monthNumber: 1,
    phase: "Month 1 — Foundation",
    startDate: "2026-04-20",
    mainGoal: "Pipeline acceleration. 2 expansion conversations, 2 new proposals out.",
    buildTarget: "Build: generic data troubleshooting skill (FEED→UNIFY→ENRICH→LAUNCH diagnostic).",
    salesHoursTarget: 20,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 3,
    monthNumber: 1,
    phase: "Month 1 — Foundation",
    startDate: "2026-04-27",
    mainGoal: "Pricing decision + first close at new pricing.",
    buildTarget: "Build: website sprint — case study, About, Book-a-Demo CTA, pricing page, vertical pages.",
    salesHoursTarget: 22,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 4,
    monthNumber: 1,
    phase: "Month 1 — Foundation",
    startDate: "2026-05-04",
    mainGoal: "4-week retro. Is escalation log shrinking? Target: 100 outbound sent, 5+ active proposals, 1-2 closes.",
    buildTarget: "Build: incident response comms drafter skill.",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 5,
    monthNumber: 2,
    phase: "Month 2 — Onboarding Scaffolder",
    startDate: "2026-05-11",
    mainGoal: "Onboarding scaffolder kickoff. Reference existing standard 5-layer F&B deployment.",
    buildTarget: "Build: onboarding scaffolder skill — part 1 (connector selection + 2 base workflows).",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 6,
    monthNumber: 2,
    phase: "Month 2 — Onboarding Scaffolder",
    startDate: "2026-05-18",
    mainGoal: "Sales cadence holds. Customer conversations feeding onboarding skill requirements.",
    buildTarget: "Build: onboarding scaffolder — part 2 (starter dashboards + field mappings).",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 7,
    monthNumber: 2,
    phase: "Month 2 — Onboarding Scaffolder",
    startDate: "2026-05-25",
    mainGoal: "Sales push — closing deals with 9+ month runway target in view.",
    buildTarget: "Build: onboarding scaffolder — part 3 (reconciliation templates + field defaults).",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 8,
    monthNumber: 2,
    phase: "Month 2 — Onboarding Scaffolder",
    startDate: "2026-06-01",
    mainGoal: "Onboarding scaffolder v0 ship. Use it on the next real client.",
    buildTarget: "Build: onboarding scaffolder — v0 ship + first client test run.",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 9,
    monthNumber: 3,
    phase: "Month 3 — Customer-Facing Skills",
    startDate: "2026-06-08",
    mainGoal: "Payrec diagnoser focus. Review Q2 sales trajectory.",
    buildTarget: "Build: Payrec mismatch diagnoser skill (customer-facing).",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 10,
    monthNumber: 3,
    phase: "Month 3 — Customer-Facing Skills",
    startDate: "2026-06-15",
    mainGoal: "Sales push continues. Fundraising narrative sharpening based on data.",
    buildTarget: "Build: custom field generator skill (50-100 templated fields per client).",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 11,
    monthNumber: 3,
    phase: "Month 3 — Customer-Facing Skills",
    startDate: "2026-06-22",
    mainGoal: "Iterate on shipped skills + final sales push for Q2.",
    buildTarget: "Build: iterate — fix the worst eval failures across shipped skills.",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
  {
    weekNumber: 12,
    monthNumber: 3,
    phase: "Month 3 — Close Q2",
    startDate: "2026-06-29",
    mainGoal: "Q2 retro. Runway extended? Engine metric trending right? Fundraising materials drafted, not open yet.",
    buildTarget: "Build: fundraising deck draft + data room skeleton.",
    salesHoursTarget: 24,
    outboundWeeklyTarget: DEFAULT_OUTBOUND_WEEKLY,
  },
];

export const PLAN_START = PLAN_WEEKS[0].startDate;
export const PLAN_END_INCLUSIVE = "2026-07-03"; // Friday of week 12

// Derived daily target — weekly target / 5 working days.
export function dailySalesTargetFor(week: PlanWeek): number {
  return Math.round((week.salesHoursTarget / 5) * 10) / 10;
}

// Derived daily outbound target — weekly / 5.
export function dailyOutboundTargetFor(week: PlanWeek): number {
  return Math.ceil(week.outboundWeeklyTarget / 5);
}

// ============================================================================
// Month aggregates — sum of the 4 weeks in each month of the plan.
// ============================================================================

export interface PlanMonth {
  monthNumber: 1 | 2 | 3;
  phase: string;
  weeks: PlanWeek[];
  salesHoursTarget: number;
  outboundTarget: number;
}

export function getMonth(monthNumber: 1 | 2 | 3): PlanMonth {
  const weeks = PLAN_WEEKS.filter((w) => w.monthNumber === monthNumber);
  return {
    monthNumber,
    phase: weeks[0]?.phase.replace(/^Month \d+ — /, "") ?? "",
    weeks,
    salesHoursTarget: weeks.reduce((s, w) => s + w.salesHoursTarget, 0),
    outboundTarget: weeks.reduce((s, w) => s + w.outboundWeeklyTarget, 0),
  };
}

export function getCurrentMonth(today: Date = new Date()): PlanMonth {
  const { week } = getCurrentPlanWeek(today);
  return getMonth(week.monthNumber);
}

/**
 * Resolve the active plan week based on today's date.
 * - If today is before the plan starts → returns week 1 with "upcoming"
 * - If today is during the plan → returns the matching week
 * - If today is after the plan → returns the last week with "past"
 */
export interface CurrentPlanWeek {
  week: PlanWeek;
  state: "upcoming" | "active" | "past";
  daysIntoWeek: number;
}

export function getCurrentPlanWeek(today: Date = new Date()): CurrentPlanWeek {
  // Singapore time rough normalize (plan is SGT-based)
  const sgt = new Date(today.getTime() + (8 * 60 - today.getTimezoneOffset()) * 60000);
  const todayIso = sgt.toISOString().slice(0, 10);

  if (todayIso < PLAN_START) {
    return { week: PLAN_WEEKS[0], state: "upcoming", daysIntoWeek: 0 };
  }
  if (todayIso > PLAN_END_INCLUSIVE) {
    return { week: PLAN_WEEKS[PLAN_WEEKS.length - 1], state: "past", daysIntoWeek: 7 };
  }

  // Find the latest week whose startDate is <= today
  let active = PLAN_WEEKS[0];
  for (const w of PLAN_WEEKS) {
    if (w.startDate <= todayIso) active = w;
    else break;
  }
  const start = new Date(active.startDate + "T00:00:00Z");
  const daysIntoWeek = Math.floor((Date.parse(todayIso + "T00:00:00Z") - start.getTime()) / 86_400_000);
  return { week: active, state: "active", daysIntoWeek };
}
