// Floating node palette — click to add a new node to the canvas

import { useState } from "react";
import { Plus, Clock, Database, Puzzle, Zap, Brain, Send, Repeat, X } from "lucide-react";
import { useAddNode } from "@/hooks/scheduler";
import { cn } from "@/lib/cn";
import type { AutomationNodeType, NodeConfig } from "./types";

interface Props {
  automationId: string;
}

interface NodeOption {
  type: AutomationNodeType;
  label: string;
  icon: typeof Clock;
  accent: string;
  defaultConfig: NodeConfig;
}

const NODE_OPTIONS: NodeOption[] = [
  {
    type: "trigger",
    label: "Trigger",
    icon: Clock,
    accent: "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30",
    defaultConfig: { trigger_type: "scheduled", cron_expression: null, active_hours: null },
  },
  {
    type: "data_source",
    label: "Data Source",
    icon: Database,
    accent: "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30",
    defaultConfig: { sources: { tasks: false, deals: false, emails: false, projects: false, calendar: false }, custom_source_ids: [] },
  },
  {
    type: "skills",
    label: "Skills",
    icon: Puzzle,
    accent: "text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30",
    defaultConfig: { skill_refs: [] },
  },
  {
    type: "loop",
    label: "Loop",
    icon: Repeat,
    accent: "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
    defaultConfig: { mode: "sequential", item_variable: "item" },
  },
  {
    type: "action",
    label: "Action",
    icon: Zap,
    accent: "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30",
    defaultConfig: { operation: "update", target_schema: "public", target_table: "", match_key: null, source_query: null, field_mapping: null, static_values: null },
  },
  {
    type: "ai_process",
    label: "Instructions",
    icon: Brain,
    accent: "text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/30",
    defaultConfig: { model: "sonnet", system_prompt: null, bot_path: null, additional_instructions: null },
  },
  {
    type: "output",
    label: "Output",
    icon: Send,
    accent: "text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/30",
    defaultConfig: { output_type: "chat_thread", post_mode: "new_thread", thread_title: null, thread_id: null, bot_author: "bot-mel", aggregation_instructions: null },
  },
];

export function NodePalette({ automationId }: Props) {
  const [open, setOpen] = useState(false);
  const addNode = useAddNode();

  function handleAdd(option: NodeOption) {
    const offsetX = 100 + Math.random() * 400;
    const offsetY = 50 + Math.random() * 200;

    addNode.mutate({
      automationId,
      nodeType: option.type,
      position_x: offsetX,
      position_y: offsetY,
      config: option.defaultConfig,
    });
    setOpen(false);
  }

  return (
    <div className="absolute top-3 right-3 z-10">
      {open ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg p-1 space-y-0.5 min-w-[160px]">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Add Node</span>
            <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              <X size={12} />
            </button>
          </div>
          {NODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.type}
                onClick={() => handleAdd(opt)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                  opt.accent,
                )}
              >
                <Icon size={14} />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">{opt.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 shadow-sm transition-colors"
        >
          <Plus size={14} />
          Add Node
        </button>
      )}
    </div>
  );
}
