// src/modules/crm/ContactListView.tsx
// Contact list with edit functionality

import { useState } from "react";
import { Contact } from "../../lib/crm/types";
import { ContactForm } from "./ContactForm";
import { Pencil, Mail, Phone, PhoneCall, Users, Loader2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { useApolloRevealPhone } from "../../hooks/apollo/useApollo";

interface ContactListViewProps {
  contacts: Contact[];
  onContactUpdated?: () => void;
}

export function ContactListView({ contacts, onContactUpdated }: ContactListViewProps) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const revealPhone = useApolloRevealPhone();

  if (contacts.length === 0) {
    return <EmptyState icon={Users} message="No contacts yet" />;
  }

  return (
    <>
      <div className="space-y-1">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="px-4 py-3 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 group transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {contact.name}
                  </h4>
                  {contact.is_primary && (
                    <span className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-xs rounded">
                      Primary
                    </span>
                  )}
                  {!contact.is_active && (
                    <span className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-500 text-xs rounded">
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
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      <Phone size={12} />
                      {contact.phone}
                    </a>
                  ) : contact.source_id ? (
                    <button
                      onClick={() => revealPhone.mutate(contact.id, { onSuccess: () => onContactUpdated?.() })}
                      disabled={revealPhone.isPending}
                      className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 disabled:opacity-50"
                      title="Request phone number from Apollo (1 mobile credit)"
                    >
                      {revealPhone.isPending ? <Loader2 size={12} className="animate-spin" /> : <PhoneCall size={12} />}
                      Request Phone
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                onClick={() => setEditingContact(contact)}
                className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
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
          companyId={editingContact.company_id!}
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
