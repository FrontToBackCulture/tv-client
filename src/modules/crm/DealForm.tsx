// src/modules/crm/DealForm.tsx
// Modal form for creating/editing deals

import { useState } from "react";
import { useCreateDeal, useUpdateDeal } from "../../hooks/useCRM";
import {
  Deal,
  DealInsert,
  DealUpdate,
  DEAL_STAGES,
  DEAL_SOLUTIONS,
} from "../../lib/crm/types";
import { X } from "lucide-react";

interface DealFormProps {
  deal?: Deal;
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function DealForm({ deal, companyId, onClose, onSaved }: DealFormProps) {
  const [formData, setFormData] = useState<DealInsert | DealUpdate>({
    company_id: companyId,
    name: deal?.name || "",
    description: deal?.description || "",
    stage: deal?.stage || "qualified",
    solution: deal?.solution || "ap_automation",
    value: deal?.value || 0,
    currency: deal?.currency || "SGD",
    expected_close_date: deal?.expected_close_date || "",
    notes: deal?.notes || "",
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateDeal();
  const updateMutation = useUpdateDeal();

  const isEditing = !!deal;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name) {
      setError("Deal name is required");
      return;
    }

    setError(null);

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: deal.id,
          updates: formData as DealUpdate,
        });
      } else {
        await createMutation.mutateAsync(formData as DealInsert);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save deal");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {isEditing ? "Edit Deal" : "New Deal"}
          </h2>
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
              Deal Name *
            </label>
            <input
              type="text"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Stage
              </label>
              <select
                value={formData.stage || "qualified"}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    stage: e.target.value as Deal["stage"],
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Solution
              </label>
              <select
                value={formData.solution || "ap_automation"}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    solution: e.target.value as Deal["solution"],
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                {DEAL_SOLUTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Value
              </label>
              <input
                type="number"
                value={formData.value || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    value: e.target.value ? parseInt(e.target.value) : 0,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Currency
              </label>
              <select
                value={formData.currency || "SGD"}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                <option value="SGD">SGD</option>
                <option value="USD">USD</option>
                <option value="MYR">MYR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Expected Close Date
            </label>
            <input
              type="date"
              value={formData.expected_close_date || ""}
              onChange={(e) =>
                setFormData({ ...formData, expected_close_date: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Description
            </label>
            <input
              type="text"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes || ""}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
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
            {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
