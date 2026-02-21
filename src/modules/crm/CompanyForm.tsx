// src/modules/crm/CompanyForm.tsx
// Modal form for creating/editing companies

import { useState } from "react";
import { useCreateCompany, useUpdateCompany } from "../../hooks/crm";
import {
  Company,
  CompanyInsert,
  CompanyUpdate,
  COMPANY_STAGES,
  COMPANY_SOURCES,
} from "../../lib/crm/types";
import { X } from "lucide-react";

interface CompanyFormProps {
  company?: Company;
  onClose: () => void;
  onSaved: () => void;
}

export function CompanyForm({ company, onClose, onSaved }: CompanyFormProps) {
  const [formData, setFormData] = useState<CompanyInsert | CompanyUpdate>({
    name: company?.name || "",
    display_name: company?.display_name || "",
    industry: company?.industry || "",
    website: company?.website || "",
    stage: company?.stage || "prospect",
    source: company?.source || "manual",
    client_folder_path: company?.client_folder_path || "",
    domain_id: company?.domain_id || "",
    notes: company?.notes || "",
    tags: company?.tags || [],
  });
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateCompany();
  const updateMutation = useUpdateCompany();

  const isEditing = !!company;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name) {
      setError("Company name is required");
      return;
    }

    setError(null);

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: company.id,
          updates: formData as CompanyUpdate,
        });
      } else {
        await createMutation.mutateAsync(formData as CompanyInsert);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save company");
    }
  }

  function handleAddTag() {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()],
      });
      setTagInput("");
    }
  }

  function handleRemoveTag(tag: string) {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((t) => t !== tag) || [],
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {isEditing ? "Edit Company" : "New Company"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
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
              Company Name *
            </label>
            <input
              type="text"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={formData.display_name || ""}
              onChange={(e) =>
                setFormData({ ...formData, display_name: e.target.value })
              }
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="Friendly name (optional)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Stage
              </label>
              <select
                value={formData.stage || "prospect"}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    stage: e.target.value as Company["stage"],
                  })
                }
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                {COMPANY_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Source
              </label>
              <select
                value={formData.source || "manual"}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    source: e.target.value as Company["source"],
                  })
                }
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                {COMPANY_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Industry
            </label>
            <input
              type="text"
              value={formData.industry || ""}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="e.g., F&B, Retail"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Website
            </label>
            <input
              type="url"
              value={formData.website || ""}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="https://"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Client Folder Path
              </label>
              <input
                type="text"
                value={formData.client_folder_path || ""}
                onChange={(e) =>
                  setFormData({ ...formData, client_folder_path: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                placeholder="3_Clients/by_industry/fnb/..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Domain ID
              </label>
              <input
                type="text"
                value={formData.domain_id || ""}
                onChange={(e) =>
                  setFormData({ ...formData, domain_id: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                placeholder="e.g., koi, suntec"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Tags
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                placeholder="Add tag..."
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                Add
              </button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-500 dark:hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes || ""}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>
        </form>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Company"}
          </button>
        </div>
      </div>
    </div>
  );
}
