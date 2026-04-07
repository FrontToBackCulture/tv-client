import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AutomationNode, LoopConfig } from "../types";

export const LoopNode = memo(function LoopNode({ data, selected }: NodeProps<AutomationNode>) {
  const config = data.config as LoopConfig;
  const variable = config.item_variable || "item";

  return (
    <div className={cn(
      "w-[180px] rounded-lg border bg-white dark:bg-zinc-900 shadow-sm transition-shadow",
      selected ? "border-teal-500 ring-2 ring-teal-500/20 shadow-md" : "border-zinc-200 dark:border-zinc-800",
    )}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-b border-zinc-200 dark:border-zinc-800 bg-emerald-50 dark:bg-emerald-950/30">
        <Repeat size={12} className="text-emerald-500 dark:text-emerald-400" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-500 dark:text-emerald-400">
          Loop
        </span>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          For each <span className="font-mono text-emerald-600 dark:text-emerald-400">{variable}</span>
        </p>
        <p className="text-[10px] text-zinc-400">{config.mode ?? "sequential"}</p>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
    </div>
  );
});
