// Instruction templates — saved AI process configurations

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useInstructionTemplates, useCreateInstructionTemplate, useUpdateInstructionTemplate, useDeleteInstructionTemplate } from "@/hooks/scheduler";

const MODEL_LABELS: Record<string, string> = {
  "sonnet": "Sonnet 4.6",
  "haiku": "Haiku 4.5",
  "opus": "Opus 4.6",
  "claude-sonnet-4-6-20250514": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-opus-4-6-20250603": "Opus 4.6",
};

interface EditState {
  id?: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
}

export function InstructionTemplatesSection() {
  const { data: templates = [] } = useInstructionTemplates();
  const createTemplate = useCreateInstructionTemplate();
  const updateTemplate = useUpdateInstructionTemplate();
  const deleteTemplate = useDeleteInstructionTemplate();
  const [editing, setEditing] = useState<EditState | null>(null);

  function handleSave() {
    if (!editing || !editing.name.trim() || !editing.system_prompt.trim()) return;
    if (editing.id) {
      updateTemplate.mutate({ id: editing.id, name: editing.name, description: editing.description || undefined, system_prompt: editing.system_prompt, model: editing.model });
    } else {
      createTemplate.mutate({ name: editing.name, description: editing.description || undefined, system_prompt: editing.system_prompt, model: editing.model });
    }
    setEditing(null);
  }

  return (
    <div className="space-y-3">
      {/* Template cards */}
      {templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {templates.map((t) => (
            <div key={t.id} className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{t.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium flex-shrink-0">
                      {MODEL_LABELS[t.model] || t.model}
                    </span>
                  </div>
                  {t.description && <div className="text-[10px] text-zinc-500 mb-1">{t.description}</div>}
                  <div className="text-[10px] text-zinc-400 line-clamp-3 font-mono">{t.system_prompt}</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => setEditing({ id: t.id, name: t.name, description: t.description || "", system_prompt: t.system_prompt, model: t.model })} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><Pencil size={12} /></button>
                  <button onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteTemplate.mutate(t.id); }} className="p-1 text-zinc-400 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {templates.length === 0 && !editing && (
        <div className="text-xs text-zinc-400 py-2">No instruction templates saved yet. Create one to reuse across automations.</div>
      )}

      {/* Create / Edit form */}
      {editing ? (
        <div className="rounded-lg border border-purple-500/50 bg-purple-50/30 dark:bg-purple-950/10 p-4 space-y-3">
          <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{editing.id ? "Edit Template" : "New Template"}</div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="text"
              placeholder="Template name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
              autoFocus
            />
            <select
              value={editing.model}
              onChange={(e) => setEditing({ ...editing, model: e.target.value })}
              className="text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
            >
              <option value="haiku">Haiku 4.5</option>
              <option value="sonnet">Sonnet 4.6</option>
              <option value="opus">Opus 4.6</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Description (optional)"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
          />
          <textarea
            placeholder="System prompt / instructions..."
            value={editing.system_prompt}
            onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })}
            rows={8}
            className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-2 font-mono resize-y"
          />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!editing.name.trim() || !editing.system_prompt.trim()} className="text-xs px-3 py-1.5 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors">
              {editing.id ? "Update" : "Create"}
            </button>
            <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing({ name: "", description: "", system_prompt: "", model: "sonnet" })}
          className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
        >
          <Plus size={12} /> New template
        </button>
      )}
    </div>
  );
}
