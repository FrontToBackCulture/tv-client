// Shared constants and components for the Prospecting module

import { cn } from "../../lib/cn";

export const PROSPECT_STAGES = [
  { value: "new",        label: "New",        color: "bg-zinc-400",    textColor: "text-zinc-600 dark:text-zinc-400",    bgColor: "bg-zinc-100 dark:bg-zinc-800" },
  { value: "researched", label: "Researched",  color: "bg-blue-400",    textColor: "text-blue-600 dark:text-blue-400",    bgColor: "bg-blue-50 dark:bg-blue-950/30" },
  { value: "drafted",    label: "Drafted",     color: "bg-amber-400",   textColor: "text-amber-600 dark:text-amber-400",  bgColor: "bg-amber-50 dark:bg-amber-950/30" },
  { value: "sent",       label: "Sent",        color: "bg-violet-400",  textColor: "text-violet-600 dark:text-violet-400", bgColor: "bg-violet-50 dark:bg-violet-950/30" },
  { value: "opened",     label: "Opened",      color: "bg-teal-400",    textColor: "text-teal-600 dark:text-teal-400",    bgColor: "bg-teal-50 dark:bg-teal-950/30" },
  { value: "replied",    label: "Replied",     color: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/30" },
] as const;

export type ProspectStage = (typeof PROSPECT_STAGES)[number]["value"];

export const STAGE_ORDER: Record<ProspectStage, number> = {
  new: 0, researched: 1, drafted: 2, sent: 3, opened: 4, replied: 5,
};

export function getStageConfig(stage: ProspectStage | string | null) {
  return PROSPECT_STAGES.find(s => s.value === stage) || PROSPECT_STAGES[0];
}

export function StageBadge({ stage, size = "sm" }: { stage: ProspectStage | string | null; size?: "sm" | "xs" }) {
  const config = getStageConfig(stage);
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full font-medium",
      config.textColor, config.bgColor,
      size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[8px] px-1.5 py-0.5",
    )}>
      <span className={cn("rounded-full", config.color, size === "sm" ? "w-1.5 h-1.5" : "w-1 h-1")} />
      {config.label}
    </span>
  );
}
