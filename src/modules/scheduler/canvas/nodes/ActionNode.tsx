import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AutomationNode, ActionConfig } from "../types";

const OP_LABELS: Record<string, string> = {
  insert: "Insert",
  update: "Update",
  upsert: "Upsert",
  delete: "Delete",
};

export const ActionNode = memo(function ActionNode({ data, selected }: NodeProps<AutomationNode>) {
  const config = data.config as ActionConfig;
  const opLabel = OP_LABELS[config.operation] ?? config.operation;
  const table = config.target_table || "no target";
  const matchKey = config.match_key;

  return (
    <div className={cn(
      "w-[180px] rounded-lg border bg-white dark:bg-zinc-900 shadow-sm transition-shadow",
      selected ? "border-teal-500 ring-2 ring-teal-500/20 shadow-md" : "border-zinc-200 dark:border-zinc-800",
    )}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-b border-zinc-200 dark:border-zinc-800 bg-amber-50 dark:bg-amber-950/30">
        <Zap size={12} className="text-amber-500 dark:text-amber-400" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-500 dark:text-amber-400">
          Action
        </span>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {opLabel} <span className="font-normal text-zinc-500">{table}</span>
        </p>
        {matchKey && (
          <p className="text-[10px] text-zinc-400">on {matchKey}</p>
        )}
        {config.source_query && (
          <p className="text-[10px] text-zinc-400 truncate">
            {config.source_query.slice(0, 40)}...
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
    </div>
  );
});
