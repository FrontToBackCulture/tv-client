// src/modules/settings/TaskFieldsView.tsx
// Settings view to configure which fields appear on task list & detail per project type

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  useTaskFieldsStore,
  getTaskFieldDefs,
  COMMON_TASK_FIELDS,
  DEAL_TASK_FIELDS,
} from "../../stores/taskFieldsStore";
import { cn } from "../../lib/cn";

const PROJECT_TYPES = [
  { key: "work", label: "Work" },
  { key: "deal", label: "Deal" },
] as const;

export function TaskFieldsView() {
  const [activeType, setActiveType] = useState<string>("work");
  const store = useTaskFieldsStore();
  const fields = getTaskFieldDefs(activeType);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Task Fields</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Configure which fields appear on task lists and detail panels per project type.
        </p>
      </div>

      {/* Type tabs */}
      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
        {PROJECT_TYPES.map((pt) => (
          <button
            key={pt.key}
            onClick={() => setActiveType(pt.key)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeType === pt.key
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            {pt.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => store.resetToDefaults(activeType)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>

      {/* Field list */}
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
        {/* Common fields */}
        <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-700">
          Common Fields
        </div>
        {fields.filter(f => COMMON_TASK_FIELDS.some(c => c.key === f.key)).map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            onToggle={() => store.toggleField(activeType, field.key)}
          />
        ))}

        {/* Deal fields (only shown when deal type is selected) */}
        {activeType === "deal" && (
          <>
            <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-t border-b border-zinc-200 dark:border-zinc-700">
              Deal Fields
            </div>
            {fields.filter(f => DEAL_TASK_FIELDS.some(d => d.key === f.key)).map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                onToggle={() => store.toggleField(activeType, field.key)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function FieldRow({ field, onToggle }: { field: { key: string; label: string; context: string; enabled: boolean }; onToggle: () => void }) {
  const contextLabel = field.context === "both" ? "List + Detail" : field.context === "list" ? "List only" : "Detail only";

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={field.enabled}
          onChange={onToggle}
          className="sr-only peer"
        />
        <div className="w-8 h-4 bg-zinc-300 dark:bg-zinc-600 peer-checked:bg-teal-500 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4" />
      </label>
      <span className={cn("text-sm flex-1", field.enabled ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400")}>
        {field.label}
      </span>
      <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
        {contextLabel}
      </span>
      <span className="text-[10px] text-zinc-400 font-mono">
        {field.key}
      </span>
    </div>
  );
}
