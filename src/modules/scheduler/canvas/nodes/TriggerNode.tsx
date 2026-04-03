import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AutomationNode, TriggerConfig } from "../types";

const CRON_LABELS: Record<string, string> = {
  "0 * * * *": "Every hour",
  "0 */2 * * *": "Every 2 hours",
  "0 */4 * * *": "Every 4 hours",
  "0 */6 * * *": "Every 6 hours",
  "0 9 * * *": "Every morning (9am)",
  "0 9 * * 1-5": "Weekdays 9am",
  "0 9,17 * * *": "Twice daily",
  "0 0 * * *": "Daily midnight",
};

export const TriggerNode = memo(function TriggerNode({ data, selected }: NodeProps<AutomationNode>) {
  const config = data.config as TriggerConfig;
  const cronLabel = config.cron_expression
    ? CRON_LABELS[config.cron_expression] ?? config.cron_expression
    : "Manual only";

  return (
    <div className={cn(
      "w-[180px] rounded-lg border bg-white dark:bg-zinc-900 shadow-sm transition-shadow",
      selected ? "border-teal-500 ring-2 ring-teal-500/20 shadow-md" : "border-zinc-200 dark:border-zinc-800",
    )}>
      <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-t-lg border-b border-zinc-200 dark:border-zinc-800">
        {data.isRunning ? (
          <Loader2 size={12} className="animate-spin text-blue-500" />
        ) : (
          <Clock size={12} className="text-blue-500" />
        )}
        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Trigger
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{cronLabel}</p>
        {config.active_hours && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Active {config.active_hours.replace("-", "–")}h
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-blue-500 !border-white dark:!border-zinc-900" />
    </div>
  );
});
