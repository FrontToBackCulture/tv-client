// src/modules/email/ContactsView.tsx
// Contact list with search, filter by status, import button

import { useState, useMemo } from "react";
import { Plus, Upload, Search } from "lucide-react";
import { useEmailContacts } from "../../hooks/email";
import type { EmailContact } from "../../lib/email/types";
import { CONTACT_STATUSES } from "../../lib/email/types";

interface ContactsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewContact: () => void;
  onImport: () => void;
}

export function ContactsView({ selectedId, onSelect, onNewContact, onImport }: ContactsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { data: contacts = [], isLoading } = useEmailContacts({
    search: search || undefined,
    status: statusFilter as EmailContact["status"],
  });

  const sorted = useMemo(() => {
    return [...contacts].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [contacts]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Contacts</h1>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {contacts.length} contacts
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onImport}
              className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Import CSV"
            >
              <Upload size={14} />
            </button>
            <button
              onClick={onNewContact}
              className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setStatusFilter(undefined)}
            className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
              !statusFilter
                ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            All
          </button>
          {CONTACT_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(statusFilter === s.value ? undefined : s.value)}
              className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                statusFilter === s.value
                  ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
            {search ? "No contacts found" : "No contacts yet. Import a CSV or add one manually."}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {sorted.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                isSelected={contact.id === selectedId}
                onClick={() => onSelect(contact.id === selectedId ? null : contact.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactRow({
  contact,
  isSelected,
  onClick,
}: {
  contact: EmailContact;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusDef = CONTACT_STATUSES.find((s) => s.value === contact.status);
  const statusColors: Record<string, string> = {
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    gray: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
        isSelected ? "bg-zinc-50 dark:bg-zinc-900/50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
            {contact.first_name || contact.last_name
              ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
              : contact.email}
          </p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
            {contact.email}
          </p>
        </div>
        {statusDef && (
          <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded ${statusColors[statusDef.color] || statusColors.gray}`}>
            {statusDef.label}
          </span>
        )}
      </div>
    </button>
  );
}
