import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Brain } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AutomationNode, AiProcessConfig } from "../types";

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-6-20260401": "Sonnet 4.6",
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
};

export const AiProcessNode = memo(function AiProcessNode({ data, selected }: NodeProps<AutomationNode>) {
  const config = data.config as AiProcessConfig;
  const modelLabel = MODEL_LABELS[config.model] ?? config.model;

  const botLabel = config.bot_path
    ? config.bot_path.split("/").filter(Boolean).pop()
    : config.bot_author ?? null;

  return (
    <div className={cn(
      "w-[180px] rounded-lg border bg-white dark:bg-zinc-900 shadow-sm transition-shadow",
      selected ? "border-teal-500 ring-2 ring-teal-500/20 shadow-md" : "border-zinc-200 dark:border-zinc-800",
    )}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
      <div className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 rounded-t-lg border-b border-zinc-200 dark:border-zinc-800">
        <Brain size={12} className="text-purple-500 dark:text-purple-400" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400">
          Instruction
        </span>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        <p className="text-xs text-zinc-700 dark:text-zinc-300">{modelLabel}</p>
        {botLabel && (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{botLabel}</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
    </div>
  );
});
