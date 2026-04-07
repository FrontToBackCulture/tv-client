// Trigger presets — saved schedule configurations

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTriggerPresets, useCreateTriggerPreset, useUpdateTriggerPreset, useDeleteTriggerPreset } from "@/hooks/scheduler";
import { ScheduleSection } from "../ScheduleSection";

const CRON_LABELS: Record<string, string> = {
  "0 * * * *": "Every hour",
  "0 */2 * * *": "Every 2 hours",
  "0 */4 * * *": "Every 4 hours",
  "0 */6 * * *": "Every 6 hours",
  "0 9 * * *": "Every morning (9am)",
  "0 9 * * 1-5": "Weekdays 9am",
  "0 9,17 * * *": "Twice daily",
  "0 0 * * *": "Daily midnight",
  "": "Manual only",
};

interface EditState {
  id?: string;
  name: string;
  description: string;
  cron_expression: string;
  active_hours: string | null;
}

export function TriggerPresetsSection() {
  const { data: presets = [] } = useTriggerPresets();
  const createPreset = useCreateTriggerPreset();
  const updatePreset = useUpdateTriggerPreset();
  const deletePreset = useDeleteTriggerPreset();
  const [editing, setEditing] = useState<EditState | null>(null);

  function handleSave() {
    if (!editing || !editing.name.trim()) return;
    if (editing.id) {
      updatePreset.mutate({ id: editing.id, name: editing.name, description: editing.description || undefined, cron_expression: editing.cron_expression, active_hours: editing.active_hours });
    } else {
      createPreset.mutate({ name: editing.name, description: editing.description || undefined, cron_expression: editing.cron_expression, active_hours: editing.active_hours });
    }
    setEditing(null);
  }

  return (
    <div className="space-y-3">
      {/* Built-in presets (read-only) */}
      <div>
        <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Built-in</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Object.entries(CRON_LABELS).map(([cron, label]) => (
            <div key={cron || "manual"} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2">
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</div>
              <code className="text-[10px] text-zinc-400">{cron || "(no schedule)"}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Saved presets */}
      {presets.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Saved</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {presets.map((p) => (
              <div key={p.id} className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{p.name}</div>
                    {p.description && <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{p.description}</div>}
                    <code className="text-[10px] text-zinc-400 mt-1 block">{CRON_LABELS[p.cron_expression] || p.cron_expression || "Manual"}</code>
                    {p.active_hours && <div className="text-[10px] text-zinc-400">Active {p.active_hours}h</div>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setEditing({ id: p.id, name: p.name, description: p.description || "", cron_expression: p.cron_expression, active_hours: p.active_hours })} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><Pencil size={12} /></button>
                    <button onClick={() => { if (confirm("Delete this preset?")) deletePreset.mutate(p.id); }} className="p-1 text-zinc-400 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit form */}
      {editing ? (
        <div className="rounded-lg border border-teal-500/50 bg-teal-50/30 dark:bg-teal-950/10 p-4 space-y-3">
          <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{editing.id ? "Edit Preset" : "New Preset"}</div>
          <input
            type="text"
            placeholder="Preset name"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
            autoFocus
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
          />
          <ScheduleSection
            cron={editing.cron_expression}
            onCronChange={(cron) => setEditing({ ...editing, cron_expression: cron })}
            activeHours={editing.active_hours}
            onActiveHoursChange={(ah) => setEditing({ ...editing, active_hours: ah })}
          />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!editing.name.trim()} className="text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {editing.id ? "Update" : "Create"}
            </button>
            <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing({ name: "", description: "", cron_expression: "0 9 * * 1-5", active_hours: null })}
          className="flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
        >
          <Plus size={12} /> New preset
        </button>
      )}
    </div>
  );
}
