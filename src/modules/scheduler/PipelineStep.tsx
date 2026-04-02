// Shared pipeline step component for automation cards

import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface PipelineStepProps {
  icon: LucideIcon;
  step: string;
  title: string;
  lines: string[];
  accent: string;
  bg: string;
  isActive?: boolean;
  onClick?: () => void;
}

export function PipelineStep({
  icon: Icon,
  step,
  title,
  lines,
  accent,
  bg,
  isActive,
  onClick,
}: PipelineStepProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2.5 text-left transition-colors",
        bg,
        isActive && "ring-1 ring-inset ring-zinc-300 dark:ring-zinc-600",
        onClick && "hover:brightness-95 dark:hover:brightness-110 cursor-pointer",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} className={accent} />
        <span className={cn("text-[10px] font-bold uppercase tracking-wide", accent)}>
          {step}. {title}
        </span>
      </div>
      <ul className="space-y-0.5">
        {lines.map((line, i) => (
          <li key={i} className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight truncate">
            {line}
          </li>
        ))}
      </ul>
    </Comp>
  );
}
