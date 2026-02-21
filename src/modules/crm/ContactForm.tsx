// src/modules/crm/ContactForm.tsx
// Modal form for creating/editing contacts

import { useState } from "react";
import { useCreateContact, useUpdateContact } from "../../hooks/crm";
import { Contact, ContactInsert, ContactUpdate } from "../../lib/crm/types";
import { X } from "lucide-react";

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
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden animate-modal-in">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {isEditing ? "Edit Contact" : "New Contact"}
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
              Name *
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
              Email *
            </label>
            <input
              type="email"
              value={formData.email || ""}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone || ""}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Role
              </label>
              <input
                type="text"
                value={formData.role || ""}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                placeholder="e.g., CEO, CFO"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Department
              </label>
              <input
                type="text"
                value={formData.department || ""}
                onChange={(e) =>
                  setFormData({ ...formData, department: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                placeholder="e.g., Finance"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              LinkedIn URL
            </label>
            <input
              type="url"
              value={formData.linkedin_url || ""}
              onChange={(e) =>
                setFormData({ ...formData, linkedin_url: e.target.value })
              }
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="https://linkedin.com/in/..."
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
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_primary || false}
                onChange={(e) =>
                  setFormData({ ...formData, is_primary: e.target.checked })
                }
                className="rounded border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-teal-500 focus:ring-teal-500"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Primary contact</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                className="rounded border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-teal-500 focus:ring-teal-500"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Active</span>
            </label>
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
            {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
