// src/modules/crm/ActivityForm.tsx
// Modal form for creating activities

import { useState } from "react";
import { useCreateActivity } from "../../hooks/crm";
import { Activity, ActivityInsert, ACTIVITY_TYPES } from "../../lib/crm/types";
import { FormModal } from "../../components/ui/FormModal";
import { FormField, Input, Select, Textarea } from "../../components/ui";
import { toast } from "../../stores/toastStore";

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
    project_id: dealId || null,
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
      toast.success("Activity logged");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save activity");
    }
  }

  return (
    <FormModal
      title="Log Activity"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Log Activity"
      isSaving={isSaving}
      error={error}
      maxWidth="max-w-md"
    >
      <FormField label="Type">
        <Select
          value={formData.type}
          onChange={(e) =>
            setFormData({
              ...formData,
              type: e.target.value as Activity["type"],
            })
          }
        >
          {ACTIVITY_TYPES.filter((t) => t.value !== "stage_change").map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Subject">
        <Input
          type="text"
          value={formData.subject || ""}
          onChange={(e) =>
            setFormData({ ...formData, subject: e.target.value })
          }
          placeholder="Brief summary..."
        />
      </FormField>

      <FormField label="Content">
        <Textarea
          value={formData.content || ""}
          onChange={(e) =>
            setFormData({ ...formData, content: e.target.value })
          }
          rows={5}
          placeholder="Details..."
        />
      </FormField>

      <FormField label="Date">
        <Input
          type="datetime-local"
          value={formData.activity_date?.slice(0, 16) || ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              activity_date: new Date(e.target.value).toISOString(),
            })
          }
        />
      </FormField>
    </FormModal>
  );
}
