// src/modules/crm/ActivityForm.tsx
// Modal form for creating activities

import { useState } from "react";
import { useCreateActivity } from "../../hooks/useCRM";
import { Activity, ActivityInsert, ACTIVITY_TYPES } from "../../lib/crm/types";
import { X } from "lucide-react";

interface ActivityFormProps {
  companyId: string;
  dealId?: string;
  contactId?: string;
  initialType?: Activity["type"];
  onClose: () => void;
  onSaved: () => void;
}

export function ActivityForm({
  companyId,
  dealId,
  contactId,
  initialType = "note",
  onClose,
  onSaved,
}: ActivityFormProps) {
  const [formData, setFormData] = useState<ActivityInsert>({
    company_id: companyId,
    deal_id: dealId || null,
    contact_id: contactId || null,
    type: initialType,
    subject: "",
    content: "",
    activity_date: new Date().toISOString(),
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateActivity();
  const isSaving = createMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.subject && !formData.content) {
      setError("Subject or content is required");
      return;
    }

    setError(null);

    try {
      await createMutation.mutateAsync(formData);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save activity");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">New Activity</h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-130px)]"
        >
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Type
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as Activity["type"],
                })
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            >
              {ACTIVITY_TYPES.filter((t) => t.value !== "stage_change").map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={formData.subject || ""}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="Brief summary..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Content
            </label>
            <textarea
              value={formData.content || ""}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              rows={5}
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="Details..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Date
            </label>
            <input
              type="datetime-local"
              value={formData.activity_date?.slice(0, 16) || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  activity_date: new Date(e.target.value).toISOString(),
                })
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>
        </form>

        <div className="p-4 border-t border-slate-200 dark:border-zinc-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Saving..." : "Create Activity"}
          </button>
        </div>
      </div>
    </div>
  );
}
