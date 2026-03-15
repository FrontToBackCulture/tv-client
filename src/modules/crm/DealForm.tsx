// src/modules/crm/DealForm.tsx
// Modal form for creating/editing deals

import { useState } from "react";
import { useCreateDeal, useUpdateDeal } from "../../hooks/crm";
import {
  Deal,
  DEAL_STAGES,
  DEAL_SOLUTIONS,
} from "../../lib/crm/types";
import { FormModal } from "../../components/ui/FormModal";
import { FormField, Input, Select, Textarea } from "../../components/ui";
import { toast } from "../../stores/toastStore";

interface DealFormProps {
  deal?: Deal;
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function DealForm({ deal, companyId, onClose, onSaved }: DealFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>({
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
          updates: formData,
        });
      } else {
        await createMutation.mutateAsync(formData as any);
      }
      toast.success(isEditing ? "Deal updated" : "Deal created");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save deal");
    }
  }

  return (
    <FormModal
      title={isEditing ? "Edit Deal" : "New Deal"}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? "Save Changes" : "Create Deal"}
      isSaving={isSaving}
      error={error}
      maxWidth="max-w-md"
    >
      <FormField label="Deal Name" required>
        <Input
          type="text"
          value={formData.name || ""}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Stage">
          <Select
            value={formData.stage || "qualified"}
            onChange={(e) =>
              setFormData({
                ...formData,
                stage: e.target.value as Deal["stage"],
              })
            }
          >
            {DEAL_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Solution">
          <Select
            value={formData.solution || "ap_automation"}
            onChange={(e) =>
              setFormData({
                ...formData,
                solution: e.target.value as Deal["solution"],
              })
            }
          >
            {DEAL_SOLUTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Value">
          <Input
            type="number"
            value={formData.value || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                value: e.target.value ? parseInt(e.target.value) : 0,
              })
            }
            placeholder="0"
          />
        </FormField>

        <FormField label="Currency">
          <Select
            value={formData.currency || "SGD"}
            onChange={(e) =>
              setFormData({ ...formData, currency: e.target.value })
            }
          >
            <option value="SGD">SGD</option>
            <option value="USD">USD</option>
            <option value="MYR">MYR</option>
          </Select>
        </FormField>
      </div>

      <FormField label="Expected Close Date">
        <Input
          type="date"
          value={formData.expected_close_date || ""}
          onChange={(e) =>
            setFormData({ ...formData, expected_close_date: e.target.value })
          }
        />
      </FormField>

      <FormField label="Description">
        <Input
          type="text"
          value={formData.description || ""}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="Brief description..."
        />
      </FormField>

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
