// src/modules/email/ContactForm.tsx
// Modal form for creating a new contact (now creates crm_contacts)

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateEmailContact } from "../../hooks/email";

interface ContactFormProps {
  onClose: () => void;
}

export function ContactForm({ onClose }: ContactFormProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const createContact = useCreateEmailContact();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    await createContact.mutateAsync({
      email: email.trim(),
      name: name.trim() || email.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[400px] max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">New Contact</h2>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="contact@example.com"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="John Doe"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createContact.isPending}
              className="px-3 py-1.5 text-xs bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
            >
              {createContact.isPending ? "Creating..." : "Create Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
