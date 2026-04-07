import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Puzzle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AutomationNode, SkillsConfig } from "../types";

export const SkillsNode = memo(function SkillsNode({ data, selected }: NodeProps<AutomationNode>) {
  const config = data.config as SkillsConfig;
  const lines = config.skill_refs?.map((r) => r.title) ?? [];
  if (lines.length === 0) lines.push("No skills");

  return (
    <div className={cn(
      "w-[180px] rounded-lg border bg-white dark:bg-zinc-900 shadow-sm transition-shadow",
      selected ? "border-teal-500 ring-2 ring-teal-500/20 shadow-md" : "border-zinc-200 dark:border-zinc-800",
    )}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-b border-zinc-200 dark:border-zinc-800 bg-indigo-50 dark:bg-indigo-950/30">
        <Puzzle size={12} className="text-indigo-500 dark:text-indigo-400" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
          Skills
        </span>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        {lines.slice(0, 3).map((line, i) => (
          <p key={i} className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{line}</p>
        ))}
        {lines.length > 3 && (
          <p className="text-[10px] text-zinc-400">+{lines.length - 3} more</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
    </div>
  );
});
