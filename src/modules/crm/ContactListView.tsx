// src/modules/crm/ContactListView.tsx
// Contact list with edit functionality

import { useState } from "react";
import { Contact } from "../../lib/crm/types";
import { ContactForm } from "./ContactForm";
import { Pencil, Mail, Phone, Users } from "lucide-react";

interface ContactListViewProps {
  contacts: Contact[];
  onContactUpdated?: () => void;
}

export function ContactListView({ contacts, onContactUpdated }: ContactListViewProps) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  if (contacts.length === 0) {
    return (
      <div className="text-center py-8">
        <Users size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
        <p className="text-zinc-500 text-sm">No contacts yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="px-4 py-3 border border-slate-200 dark:border-zinc-800 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800/50 group transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {contact.name}
                  </h4>
                  {contact.is_primary && (
                    <span className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-[11px] rounded">
                      Primary
                    </span>
                  )}
                  {!contact.is_active && (
                    <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-zinc-800 text-zinc-500 text-[11px] rounded">
                      Inactive
                    </span>
                  )}
                </div>
                {contact.role && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {contact.role}
                    {contact.department && ` · ${contact.department}`}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-1.5 text-sm">
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300"
                  >
                    <Mail size={12} />
                    {contact.email}
                  </a>
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      <Phone size={12} />
                      {contact.phone}
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditingContact(contact)}
                className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-slate-200 dark:hover:bg-zinc-700"
                title="Edit contact"
              >
                <Pencil size={14} />
              </button>
            </div>
            {contact.notes && (
              <p className="mt-2 text-xs text-zinc-500 line-clamp-2">
                {contact.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {editingContact && (
        <ContactForm
          contact={editingContact}
          companyId={editingContact.company_id}
          onClose={() => setEditingContact(null)}
          onSaved={() => {
            setEditingContact(null);
            onContactUpdated?.();
          }}
        />
      )}
    </>
  );
}
