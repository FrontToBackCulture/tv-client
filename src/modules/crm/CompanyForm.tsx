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
import { FormModal } from "../../components/ui/FormModal";
import { FormField, Input, Select, Textarea, inputClass, labelClass } from "../../components/ui";
import { toast } from "../../stores/toastStore";

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
      toast.success(isEditing ? "Company updated" : "Company created");
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
    <FormModal
      title={isEditing ? "Edit Company" : "New Company"}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? "Save Changes" : "Create Company"}
      isSaving={isSaving}
      error={error}
    >
      <FormField label="Company Name" required>
        <Input
          type="text"
          value={formData.name || ""}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </FormField>

      <FormField label="Display Name">
        <Input
          type="text"
          value={formData.display_name || ""}
          onChange={(e) =>
            setFormData({ ...formData, display_name: e.target.value })
          }
          placeholder="Friendly name (optional)"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Stage">
          <Select
            value={formData.stage || "prospect"}
            onChange={(e) =>
              setFormData({
                ...formData,
                stage: e.target.value as Company["stage"],
              })
            }
          >
            {COMPANY_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Source">
          <Select
            value={formData.source || "manual"}
            onChange={(e) =>
              setFormData({
                ...formData,
                source: e.target.value as Company["source"],
              })
            }
          >
            {COMPANY_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField label="Industry">
        <Input
          type="text"
          value={formData.industry || ""}
          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
          placeholder="e.g., F&B, Retail"
        />
      </FormField>

      <FormField label="Website">
        <Input
          type="url"
          value={formData.website || ""}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          placeholder="https://"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Client Folder Path">
          <Input
            type="text"
            value={formData.client_folder_path || ""}
            onChange={(e) =>
              setFormData({ ...formData, client_folder_path: e.target.value })
            }
            placeholder="3_Clients/by_industry/fnb/..."
          />
        </FormField>

        <FormField label="Domain ID">
          <Input
            type="text"
            value={formData.domain_id || ""}
            onChange={(e) =>
              setFormData({ ...formData, domain_id: e.target.value })
            }
            placeholder="e.g., koi, suntec"
          />
        </FormField>
      </div>

      <div>
        <label className={labelClass}>
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
            className={`flex-1 ${inputClass}`}
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

      <FormField label="Notes">
        <Textarea
          value={formData.notes || ""}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
        />
      </FormField>
    </FormModal>
  );
}
