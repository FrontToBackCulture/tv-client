// Shared schedule section for both DIO and Skill automation cards.
// User-friendly preset selector — no raw cron exposed.

import { useState } from "react";
import { cn } from "../../lib/cn";

const SCHEDULE_PRESETS = [
  { label: "Every hour", cron: "0 * * * *", desc: "Runs at the top of every hour" },
  { label: "Every 2 hours", cron: "0 */2 * * *", desc: "Runs every 2 hours" },
  { label: "Every 4 hours", cron: "0 */4 * * *", desc: "Runs every 4 hours" },
  { label: "Every 6 hours", cron: "0 */6 * * *", desc: "Runs every 6 hours" },
  { label: "Every morning (9am)", cron: "0 9 * * *", desc: "Runs daily at 9:00am" },
  { label: "Weekdays 9am", cron: "0 9 * * 1-5", desc: "Runs Mon–Fri at 9:00am" },
  { label: "Twice daily (9am, 5pm)", cron: "0 9,17 * * *", desc: "Runs at 9:00am and 5:00pm" },
  { label: "Daily midnight", cron: "0 0 * * *", desc: "Runs at midnight" },
  { label: "Manual only", cron: "", desc: "Only runs when you click 'Run now'" },
];

interface ScheduleSectionProps {
  cron: string;
  onCronChange: (cron: string) => void;
  activeHours: string | null;
  onActiveHoursChange: (ah: string | null) => void;
}

export function ScheduleSection({ cron, onCronChange, activeHours, onActiveHoursChange }: ScheduleSectionProps) {
  const [activeHoursEnabled, setActiveHoursEnabled] = useState(!!activeHours);
  const [activeStart, setActiveStart] = useState(() => {
    if (activeHours?.includes("-")) return Number(activeHours.split("-")[0]) || 9;
    return 9;
  });
  const [activeEnd, setActiveEnd] = useState(() => {
    if (activeHours?.includes("-")) return Number(activeHours.split("-")[1]) || 21;
    return 21;
  });

  const currentPreset = SCHEDULE_PRESETS.find((p) => p.cron === cron);
  const currentLabel = currentPreset?.desc || (cron ? `Custom: ${cron}` : "Manual only");

  function toggleActiveHours() {
    const next = !activeHoursEnabled;
    setActiveHoursEnabled(next);
    onActiveHoursChange(next ? `${activeStart}-${activeEnd}` : null);
  }

  function changeStart(v: number) {
    setActiveStart(v);
    onActiveHoursChange(`${v}-${activeEnd}`);
  }

  function changeEnd(v: number) {
    setActiveEnd(v);
    onActiveHoursChange(`${activeStart}-${v}`);
  }

  return (
    <div className="px-4 py-3 space-y-3 border-t border-zinc-200 dark:border-zinc-800">
      {/* Schedule presets */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Schedule</label>
        <div className="flex flex-wrap gap-1.5">
          {SCHEDULE_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => onCronChange(p.cron)}
              className={cn("px-2.5 py-1 text-xs rounded-md border transition-colors",
                cron === p.cron
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{currentLabel}</div>
      </div>

      {/* Active hours */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Active hours</label>
          <button type="button" role="switch" aria-checked={activeHoursEnabled} onClick={toggleActiveHours}
            className={cn("relative inline-flex h-3.5 w-7 shrink-0 items-center rounded-full transition-colors",
              activeHoursEnabled ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-600")}>
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full bg-white dark:bg-zinc-200 transition-transform", activeHoursEnabled ? "translate-x-3.5" : "translate-x-0.5")} />
          </button>
        </div>
        {activeHoursEnabled ? (
          <div className="flex items-center gap-1.5">
            <select value={activeStart} onChange={(e) => changeStart(Number(e.target.value))}
              className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-1.5 py-1.5 text-xs">
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
            </select>
            <span className="text-zinc-500 dark:text-zinc-400 text-xs">–</span>
            <select value={activeEnd} onChange={(e) => changeEnd(Number(e.target.value))}
              className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-1.5 py-1.5 text-xs">
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
            </select>
            <span className="text-zinc-500 dark:text-zinc-400 text-[10px]">SGT</span>
          </div>
        ) : (
          <div className="text-xs text-zinc-500 dark:text-zinc-400 py-1.5">All day</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers to convert DIO interval_hours ↔ cron
// ---------------------------------------------------------------------------

export function intervalHoursToCron(hours: number): string {
  if (hours === 1) return "0 * * * *";
  return `0 */${hours} * * *`;
}

export function cronToIntervalHours(cron: string): number | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour] = parts;
  if (min !== "0") return null;
  if (hour === "*") return 1;
  if (hour.startsWith("*/")) {
    const n = parseInt(hour.slice(2));
    return isNaN(n) ? null : n;
  }
  return null;
}
