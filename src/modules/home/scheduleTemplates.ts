// Daily schedule templates — what the day should look like, block by block.
// The cockpit renders these with a "you are here" highlight based on wall clock.
// Real Outlook events get merged in at render time (see TodayScheduleCard).
//
// Day types:
//   outbound-day   (Mon, Wed, Fri) — sales power block + afternoon ops
//   meeting-day    (Tue, Thu)      — customer meetings both halves
//   deep-friday    (Fri)           — same as outbound-day but with Fri retro at 17:00
//   saturday-build (Sat)           — deep build
//   sunday-prep    (Sun)           — prep checklist for the week
//
// Edit the blocks here to change what the cockpit shows.

export type ScheduleKind = "outbound-day" | "meeting-day" | "deep-friday" | "saturday-build" | "sunday-prep";

export interface ScheduleBlock {
  id: string;
  /** 24h time, HH:MM */
  startTime: string;
  /** 24h time, HH:MM, exclusive end */
  endTime: string;
  label: string;
  /** Short note. Short enough to fit in a sidebar line. */
  note?: string;
  /** Visual treatment */
  emphasis?: "sacred" | "normal" | "break" | "off";
}

const RITUAL: ScheduleBlock[] = [
  { id: "startup", startTime: "07:30", endTime: "08:30", label: "Personal startup", note: "Coffee, scan overnight for fires only", emphasis: "normal" },
  { id: "ritual", startTime: "08:30", endTime: "09:00", label: "Focus ritual", note: "Pipeline review · today's one thing · first meeting prep", emphasis: "normal" },
];

const WRAP: ScheduleBlock[] = [
  { id: "team-1", startTime: "13:00", endTime: "14:00", label: "Team window 1", note: "Office hours · unblocks · Slack triage · escalation triage", emphasis: "normal" },
  { id: "team-2", startTime: "17:00", endTime: "18:00", label: "Team window 2", note: "Pipeline wrap · tomorrow prep · escalation review", emphasis: "normal" },
  { id: "wrap", startTime: "18:00", endTime: "18:30", label: "Day wrap", note: "Log day's real numbers · tomorrow's one thing", emphasis: "normal" },
  { id: "off", startTime: "18:30", endTime: "21:30", label: "Off", note: "Dinner · family · decompress · non-negotiable", emphasis: "off" },
  { id: "evening-build", startTime: "21:30", endTime: "24:00", label: "Evening build", note: "This week's skill target — no Slack, no reactive work", emphasis: "normal" },
];

export const SCHEDULES: Record<ScheduleKind, ScheduleBlock[]> = {
  "outbound-day": [
    ...RITUAL,
    { id: "sales-am", startTime: "09:00", endTime: "12:00", label: "SALES POWER BLOCK", note: "Outbound · proposals · follow-ups · log every interrupt", emphasis: "sacred" },
    { id: "lunch", startTime: "12:00", endTime: "13:00", label: "Lunch", note: "Real break · off screens", emphasis: "break" },
    { id: "team-1", startTime: "13:00", endTime: "14:00", label: "Team window 1", note: "Office hours · unblocks · escalation triage", emphasis: "normal" },
    { id: "afternoon", startTime: "14:00", endTime: "17:00", label: "Afternoon block", note: "Product direction · strategic finance · ops · team 1:1s", emphasis: "normal" },
    { id: "team-2", startTime: "17:00", endTime: "18:00", label: "Team window 2", note: "Pipeline wrap · tomorrow prep · escalation review", emphasis: "normal" },
    { id: "wrap", startTime: "18:00", endTime: "18:30", label: "Day wrap", note: "Log day's real numbers · tomorrow's one thing", emphasis: "normal" },
    { id: "off", startTime: "18:30", endTime: "21:30", label: "Off", note: "Dinner · family · decompress", emphasis: "off" },
    { id: "evening-build", startTime: "21:30", endTime: "24:00", label: "Evening build", note: "This week's skill target — no reactive work", emphasis: "normal" },
  ],
  "meeting-day": [
    ...RITUAL,
    { id: "meetings-am", startTime: "09:00", endTime: "12:00", label: "CUSTOMER MEETINGS (AM)", note: "Discovery · demos · closing · expansion calls", emphasis: "sacred" },
    { id: "lunch", startTime: "12:00", endTime: "13:00", label: "Lunch", note: "Real break · off screens", emphasis: "break" },
    { id: "team-1", startTime: "13:00", endTime: "14:00", label: "Team window 1", note: "Unblocks · escalation triage", emphasis: "normal" },
    { id: "meetings-pm", startTime: "14:00", endTime: "17:00", label: "CUSTOMER MEETINGS (PM)", note: "Discovery · demos · closing · follow-ups", emphasis: "sacred" },
    ...WRAP.filter((b) => !["team-1"].includes(b.id)),
  ],
  "deep-friday": [
    ...RITUAL,
    { id: "sales-am", startTime: "09:00", endTime: "12:00", label: "SALES POWER BLOCK", note: "Outbound · proposals · weekly pipeline push", emphasis: "sacred" },
    { id: "lunch", startTime: "12:00", endTime: "13:00", label: "Lunch", note: "Real break", emphasis: "break" },
    { id: "team-1", startTime: "13:00", endTime: "14:00", label: "Team window 1", note: "Unblocks · escalation triage", emphasis: "normal" },
    { id: "deep-pm", startTime: "14:00", endTime: "17:00", label: "Deep work block", note: "The ONE thing only I can do this week · no context-switching", emphasis: "normal" },
    { id: "retro", startTime: "17:00", endTime: "17:30", label: "WEEKLY RETRO", note: "Sales UP · interrupts DOWN? · decide weekend's build", emphasis: "sacred" },
    { id: "team-2", startTime: "17:30", endTime: "18:30", label: "Team window 2 + wrap", note: "End-of-week close · next Monday prep", emphasis: "normal" },
    { id: "off", startTime: "18:30", endTime: "24:00", label: "Off — weekend starts", note: "Rest · Saturday is a build day", emphasis: "off" },
  ],
  "saturday-build": [
    { id: "sat-startup", startTime: "08:00", endTime: "09:00", label: "Personal startup", note: "Coffee · review the build target for this week", emphasis: "normal" },
    { id: "sat-am", startTime: "09:00", endTime: "12:30", label: "DEEP BUILD · morning", note: "This week's skill target · ship ugly", emphasis: "sacred" },
    { id: "sat-lunch", startTime: "12:30", endTime: "13:30", label: "Lunch", note: "Real break", emphasis: "break" },
    { id: "sat-pm", startTime: "13:30", endTime: "18:00", label: "DEEP BUILD · afternoon", note: "Continue · test · iterate", emphasis: "sacred" },
    { id: "sat-off", startTime: "18:00", endTime: "24:00", label: "Off", note: "Dinner · family · rest", emphasis: "off" },
  ],
  "sunday-prep": [
    { id: "sun-startup", startTime: "09:00", endTime: "09:30", label: "Personal startup", note: "Coffee · light scan", emphasis: "normal" },
    { id: "sun-ship", startTime: "09:30", endTime: "13:00", label: "Ship build v0 + test", note: "Finish this week's skill target · run it once · iterate", emphasis: "sacred" },
    { id: "sun-lunch", startTime: "13:00", endTime: "14:00", label: "Lunch", note: "Real break", emphasis: "break" },
    { id: "sun-prep", startTime: "14:00", endTime: "15:30", label: "WEEK PREP", note: "Write 25 outbound targets · review pipeline · Monday's one thing", emphasis: "sacred" },
    { id: "sun-off", startTime: "15:30", endTime: "24:00", label: "Off — real rest", note: "Non-negotiable · you need to be sharp Monday", emphasis: "off" },
  ],
};

export function scheduleKindForDay(day: number): ScheduleKind {
  // day: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  switch (day) {
    case 0: return "sunday-prep";
    case 1: return "outbound-day";
    case 2: return "meeting-day";
    case 3: return "outbound-day";
    case 4: return "meeting-day";
    case 5: return "deep-friday";
    case 6: return "saturday-build";
    default: return "outbound-day";
  }
}

export function dayTypeLabel(kind: ScheduleKind): string {
  switch (kind) {
    case "outbound-day": return "Outbound Day";
    case "meeting-day": return "Customer Meeting Day";
    case "deep-friday": return "Deep Friday";
    case "saturday-build": return "Saturday Build";
    case "sunday-prep": return "Sunday Prep";
  }
}

/** Convert HH:MM to a Date on the given reference date (same local day). */
export function blockDate(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Returns true if `now` is within the block on the given day. */
export function isBlockActive(block: ScheduleBlock, now: Date, base: Date): boolean {
  const start = blockDate(base, block.startTime);
  const end = blockDate(base, block.endTime === "24:00" ? "23:59" : block.endTime);
  return now >= start && now < end;
}
