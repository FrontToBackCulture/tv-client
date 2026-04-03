// Left panel — list of all automations, click to load canvas

import { Plus, Loader2, Database, Puzzle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AutomationGraph } from "./types";

interface Props {
  automations: AutomationGraph[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: (type: "dio" | "skill") => void;
}

export function AutomationList({ automations, isLoading, selectedId, onSelect, onNew }: Props) {
  return (
    <div className="w-[240px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 uppercase tracking-wide">
          Automations
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNew("dio")}
            title="New DIO automation"
            className="p-1 text-zinc-400 hover:text-blue-500 transition-colors"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => onNew("skill")}
            title="New Skill automation"
            className="p-1 text-zinc-400 hover:text-indigo-500 transition-colors"
          >
            <Puzzle size={12} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-zinc-400" />
          </div>
        ) : automations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No automations yet.</p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Click + to create one.</p>
          </div>
        ) : (
          automations.map((auto) => (
            <button
              key={auto.id}
              onClick={() => onSelect(auto.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-900 transition-colors",
                selectedId === auto.id
                  ? "bg-zinc-100 dark:bg-zinc-800"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
              )}
            >
              <div className="flex items-center gap-2">
                {auto.automation_type === "dio" ? (
                  <Database size={12} className={auto.enabled ? "text-blue-500" : "text-zinc-400"} />
                ) : (
                  <Puzzle size={12} className={auto.enabled ? "text-indigo-500" : "text-zinc-400"} />
                )}
                <span className={cn(
                  "text-sm truncate",
                  auto.enabled ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500",
                )}>
                  {auto.name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 ml-5">
                {!auto.enabled && (
                  <span className="text-[10px] text-zinc-400">disabled</span>
                )}
                {auto.last_run_status && (
                  <span className={cn(
                    "text-[10px]",
                    auto.last_run_status === "success" && "text-emerald-500",
                    auto.last_run_status === "failed" && "text-red-500",
                    auto.last_run_status === "running" && "text-blue-500",
                  )}>
                    {auto.last_run_status}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
