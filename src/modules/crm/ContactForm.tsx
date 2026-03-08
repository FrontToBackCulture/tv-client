// src/modules/crm/ContactForm.tsx
// Modal form for creating/editing contacts

import { useState } from "react";
import { useCreateContact, useUpdateContact } from "../../hooks/crm";
import { Contact, ContactInsert, ContactUpdate } from "../../lib/crm/types";
import { FormModal } from "../../components/ui/FormModal";
import { FormField, Input, Textarea, CheckboxField } from "../../components/ui";
import { toast } from "../../stores/toastStore";

interface ContactFormProps {
  contact?: Contact;
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ContactForm({
  contact,
  companyId,
  onClose,
  onSaved,
}: ContactFormProps) {
  const [formData, setFormData] = useState<ContactInsert | ContactUpdate>({
    company_id: companyId,
    name: contact?.name || "",
    email: contact?.email || "",
    phone: contact?.phone || "",
    role: contact?.role || "",
    department: contact?.department || "",
    linkedin_url: contact?.linkedin_url || "",
    notes: contact?.notes || "",
    is_primary: contact?.is_primary || false,
    is_active: contact?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateContact();
  const updateMutation = useUpdateContact();

  const isEditing = !!contact;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      setError("Name and email are required");
      return;
    }

    setError(null);

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: contact.id,
          updates: formData as ContactUpdate,
        });
      } else {
        await createMutation.mutateAsync(formData as ContactInsert);
      }
      toast.success(isEditing ? "Contact updated" : "Contact created");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact");
    }
  }

  return (
    <FormModal
      title={isEditing ? "Edit Contact" : "New Contact"}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? "Save Changes" : "Create Contact"}
      isSaving={isSaving}
      error={error}
      maxWidth="max-w-md"
    >
      <FormField label="Name" required>
        <Input
          type="text"
          value={formData.name || ""}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </FormField>

      <FormField label="Email" required>
        <Input
          type="email"
          value={formData.email || ""}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
        />
      </FormField>

      <FormField label="Phone">
        <Input
          type="tel"
          value={formData.phone || ""}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Role">
          <Input
            type="text"
            value={formData.role || ""}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            placeholder="e.g., CEO, CFO"
          />
        </FormField>

        <FormField label="Department">
          <Input
            type="text"
            value={formData.department || ""}
            onChange={(e) =>
              setFormData({ ...formData, department: e.target.value })
            }
            placeholder="e.g., Finance"
          />
        </FormField>
      </div>

      <FormField label="LinkedIn URL">
        <Input
          type="url"
          value={formData.linkedin_url || ""}
          onChange={(e) =>
            setFormData({ ...formData, linkedin_url: e.target.value })
          }
          placeholder="https://linkedin.com/in/..."
        />
      </FormField>

      <FormField label="Notes">
        <Textarea
          value={formData.notes || ""}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
        />
      </FormField>

      <div className="flex items-center gap-4">
        <CheckboxField
          label="Primary contact"
          checked={formData.is_primary || false}
          onChange={(checked) =>
            setFormData({ ...formData, is_primary: checked })
          }
        />

        <CheckboxField
          label="Active"
          checked={formData.is_active ?? true}
          onChange={(checked) =>
            setFormData({ ...formData, is_active: checked })
          }
        />
      </div>
    </FormModal>
  );
}
