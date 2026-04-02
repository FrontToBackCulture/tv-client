// src/modules/email/ContactsView.tsx
// Contact list with tree sidebar for grouping, search, inline edit/delete actions

import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { Plus, Upload, Pencil, Trash2 } from "lucide-react";
import { useEmailContacts, useEmailGroups, useDeleteEmailContact } from "../../hooks/email";
import { supabase } from "../../lib/supabase";
import type { EmailContact } from "../../lib/email/types";
import { CONTACT_STATUSES } from "../../lib/email/types";
import { emailKeys } from "../../hooks/email/keys";
import { EmailTreeSidebar, type GroupByOption, type TreeSelection } from "./EmailTreeSidebar";

// ─── Grouping helpers ─────────────────────────────────────────────────────────

interface ContactWithGroupNames extends EmailContact {
  _groupNames: string[];
}

function useContactsWithGroupNames() {
  const { data: contacts = [], isLoading: loadingContacts } = useEmailContacts();
  const { data: groups = [], isLoading: loadingGroups } = useEmailGroups();

  // Fetch all contact-group memberships
  const { data: memberships = [] } = useQuery({
    queryKey: [...emailKeys.contacts(), "all-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_contact_groups")
        .select("contact_id, group_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const enriched = useMemo(() => {
    // Build group id → name map
    const groupNameMap = new Map<string, string>();
    for (const g of groups) groupNameMap.set(g.id, g.name);

    // Build contact id → group names
    const contactGroupMap = new Map<string, string[]>();
    for (const m of memberships) {
      const name = groupNameMap.get(m.group_id);
      if (!name) continue;
      const existing = contactGroupMap.get(m.contact_id) || [];
      existing.push(name);
      contactGroupMap.set(m.contact_id, existing);
    }

    return contacts.map((c) => ({
      ...c,
      _groupNames: contactGroupMap.get(c.id) || [],
    })) as ContactWithGroupNames[];
  }, [contacts, groups, memberships]);

  return { data: enriched, isLoading: loadingContacts || loadingGroups };
}

const STATUS_LABELS: Record<string, string> = {};
for (const s of CONTACT_STATUSES) STATUS_LABELS[s.value] = s.label;

const contactGroupByOptions: GroupByOption<ContactWithGroupNames>[] = [
  {
    key: "status",
    label: "Status",
    getGroup: (c) => c.edm_status || "active",
    getLabel: (v) => STATUS_LABELS[v] ?? v,
    sortGroups: (a, b) => {
      const order = ["active", "unsubscribed", "bounced"];
      return order.indexOf(a) - order.indexOf(b);
    },
  },
  {
    key: "source",
    label: "Source",
    getGroup: (c) => c.source || "(no source)",
  },
  {
    key: "group",
    label: "Group",
    getGroup: (c) => c._groupNames?.length ? c._groupNames : ["(no group)"],
  },
];

// ─── View ─────────────────────────────────────────────────────────────────────

interface ContactsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewContact: () => void;
  onImport: () => void;
}

export function ContactsView({ selectedId, onSelect, onNewContact, onImport }: ContactsViewProps) {
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("status");
  const [treeSelection, setTreeSelection] = useState<TreeSelection>({ groupValue: null });
  const deleteContact = useDeleteEmailContact();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: allContacts, isLoading } = useContactsWithGroupNames();

  // Apply search filter
  const searched = useMemo(() => {
    if (!search) return allContacts;
    const q = search.toLowerCase();
    return allContacts.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.name && c.name.toLowerCase().includes(q)),
    );
  }, [allContacts, search]);

  // Apply tree filter
  const activeOption = contactGroupByOptions.find((o) => o.key === groupBy) ?? contactGroupByOptions[0];
  const filtered = useMemo(() => {
    if (!treeSelection.groupValue) return searched;
    return searched.filter((c) => {
      const val = activeOption.getGroup(c);
      const keys = Array.isArray(val) ? val : [val];
      return keys.includes(treeSelection.groupValue!);
    });
  }, [searched, treeSelection.groupValue, activeOption]);

  // Sort by created_at desc
  const sorted = useMemo(() => {
    return [...filtered].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
  }, [filtered]);

  const handleDelete = async (id: string) => {
    await deleteContact.mutateAsync(id);
    if (selectedId === id) onSelect(null);
    setDeleteConfirmId(null);
  };

  return (
    <div className="h-full flex">
      <EmailTreeSidebar
        items={searched}
        groupByOptions={contactGroupByOptions}
        activeGroupBy={groupBy}
        onGroupByChange={setGroupBy}
        selection={treeSelection}
        onSelectionChange={setTreeSelection}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search contacts..."
        title="Contacts"
        totalCount={allContacts.length}
      />

      {/* List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {sorted.length}{treeSelection.groupValue ? ` in ${activeOption.getLabel?.(treeSelection.groupValue) ?? treeSelection.groupValue}` : ""} contact{sorted.length !== 1 ? "s" : ""}
          </p>
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

        <ContactList
          isLoading={isLoading}
          sorted={sorted}
          selectedId={selectedId}
          deleteConfirmId={deleteConfirmId}
          onSelect={onSelect}
          onDeleteClick={setDeleteConfirmId}
          onDeleteConfirm={handleDelete}
          onDeleteCancel={() => setDeleteConfirmId(null)}
          isDeleting={deleteContact.isPending}
          search={search}
        />
      </div>
    </div>
  );
}

// ─── Virtualized List ─────────────────────────────────────────────────────────

const CONTACT_ROW_HEIGHT = 52;

function ContactList({
  isLoading, sorted, selectedId, deleteConfirmId, onSelect,
  onDeleteClick, onDeleteConfirm, onDeleteCancel, isDeleting, search,
}: {
  isLoading: boolean;
  sorted: EmailContact[];
  selectedId: string | null;
  deleteConfirmId: string | null;
  onSelect: (id: string | null) => void;
  onDeleteClick: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
  isDeleting: boolean;
  search: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CONTACT_ROW_HEIGHT,
    overscan: 15,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-xs text-zinc-400">
        {search ? "No contacts found" : "No contacts yet. Import a CSV or add one manually."}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const contact = sorted[virtualRow.index];
          return (
            <div
              key={contact.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: CONTACT_ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="border-b border-zinc-100 dark:border-zinc-800/50"
            >
              <ContactRow
                contact={contact}
                isSelected={contact.id === selectedId}
                isDeleteConfirm={contact.id === deleteConfirmId}
                onClick={() => onSelect(contact.id === selectedId ? null : contact.id)}
                onEdit={() => onSelect(contact.id)}
                onDeleteClick={() => onDeleteClick(contact.id)}
                onDeleteConfirm={() => onDeleteConfirm(contact.id)}
                onDeleteCancel={onDeleteCancel}
                isDeleting={isDeleting}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  isSelected,
  isDeleteConfirm,
  onClick,
  onEdit,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
  isDeleting,
}: {
  contact: EmailContact;
  isSelected: boolean;
  isDeleteConfirm: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDeleteClick: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  isDeleting: boolean;
}) {
  const statusDef = CONTACT_STATUSES.find((s) => s.value === contact.edm_status);
  const statusColors: Record<string, string> = {
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    gray: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  if (isDeleteConfirm) {
    return (
      <div className="px-4 py-3 bg-red-50 dark:bg-red-950/30">
        <p className="text-xs text-red-700 dark:text-red-400 mb-2">
          Delete <strong>{contact.name || contact.email}</strong>?
        </p>
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteConfirm(); }}
            disabled={isDeleting}
            className="px-2.5 py-1 text-[11px] font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteCancel(); }}
            className="px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`group/row w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer ${
        isSelected ? "bg-zinc-50 dark:bg-zinc-900/50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
            {contact.name || contact.email}
          </p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
            {contact.email}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* Action icons — visible on hover */}
          <div className="hidden group-hover/row:flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
              className="p-1 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>
          {statusDef && (
            <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded ${statusColors[statusDef.color] || statusColors.gray}`}>
              {statusDef.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
