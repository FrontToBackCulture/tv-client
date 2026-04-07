import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { useCustomDataSources } from "@/hooks/scheduler";
import { cn } from "@/lib/cn";
import type { AutomationNode, DataSourceConfig } from "../types";

const SOURCE_LABELS: Record<string, string> = {
  tasks: "Tasks",
  deals: "Deals",
  emails: "Emails",
  projects: "Projects",
  calendar: "Calendar",
};

export const DataSourceNode = memo(function DataSourceNode({ data, selected }: NodeProps<AutomationNode>) {
  const config = data.config as DataSourceConfig;
  const { data: customSources = [] } = useCustomDataSources();

  const lines: string[] = [
    // Built-in sources
    ...Object.entries(config.sources ?? {})
      .filter(([, v]) => v)
      .map(([k]) => SOURCE_LABELS[k] ?? k),
    // Custom sources
    ...(config.custom_source_ids ?? []).map((id) => {
      const cs = customSources.find((s) => s.id === id);
      return cs ? cs.name : "Custom";
    }),
  ];

  if (lines.length === 0) lines.push("No sources");

  return (
    <div className={cn(
      "w-[180px] rounded-lg border bg-white dark:bg-zinc-900 shadow-sm transition-shadow",
      selected ? "border-teal-500 ring-2 ring-teal-500/20 shadow-md" : "border-zinc-200 dark:border-zinc-800",
    )}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-400 !border-white dark:!border-zinc-900" />
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-b border-zinc-200 dark:border-zinc-800 bg-blue-50 dark:bg-blue-950/30">
        <Database size={12} className="text-blue-500 dark:text-blue-400" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-500 dark:text-blue-400">
          Data
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
