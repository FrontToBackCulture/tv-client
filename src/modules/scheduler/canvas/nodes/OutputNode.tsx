import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Send } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AutomationNode, OutputConfig } from "../types";

export const OutputNode = memo(function OutputNode({ data, selected }: NodeProps<AutomationNode>) {
  const config = data.config as OutputConfig;
  const modeLabel = config.post_mode === "same_thread" ? "Same thread" : "New thread";

  return (
    <div className={cn(
      "w-[180px] rounded-lg border bg-white dark:bg-zinc-900 shadow-sm transition-shadow",
      selected ? "border-teal-500 ring-2 ring-teal-500/20 shadow-md" : "border-zinc-200 dark:border-zinc-800",
    )}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
      <div className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 dark:bg-teal-950/30 rounded-t-lg border-b border-zinc-200 dark:border-zinc-800">
        <Send size={12} className="text-teal-500 dark:text-teal-400" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          Output
        </span>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        <p className="text-xs text-zinc-700 dark:text-zinc-300">{modeLabel}</p>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{config.bot_author}</p>
      </div>
    </div>
  );
});
