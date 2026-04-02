// src/modules/email/GroupDetailPanel.tsx
// Right panel showing group details, member list, and add/remove contacts

import { useState, useMemo, useRef, useEffect } from "react";
import { X, FolderOpen, Trash2, Plus, UserMinus, Search } from "lucide-react";
import {
  useEmailGroup,
  useEmailContacts,
  useDeleteEmailGroup,
  useAddContactToGroup,
  useRemoveContactFromGroup,
} from "../../hooks/email";
import { CONTACT_STATUSES } from "../../lib/email/types";
import { formatDate } from "../../lib/date";

interface GroupDetailPanelProps {
  groupId: string;
  onClose: () => void;
}

export function GroupDetailPanel({ groupId, onClose }: GroupDetailPanelProps) {
  const { data: group, isLoading: groupLoading } = useEmailGroup(groupId);
  const { data: members = [], isLoading: membersLoading } = useEmailContacts({ groupId });
  const { data: allContacts = [] } = useEmailContacts();
  const deleteGroup = useDeleteEmailGroup();
  const addToGroup = useAddContactToGroup();
  const removeFromGroup = useRemoveContactFromGroup();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddPicker) {
      searchInputRef.current?.focus();
    }
  }, [showAddPicker]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const filteredContacts = useMemo(() => {
    const available = allContacts.filter((c) => !memberIds.has(c.id));
    if (!addSearch) return available.slice(0, 20);
    const q = addSearch.toLowerCase();
    return available
      .filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          (c.name && c.name.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [allContacts, memberIds, addSearch]);

  if (groupLoading) {
    return (
      <div className="w-[420px] border-l border-zinc-100 dark:border-zinc-800/50 flex items-center justify-center text-xs text-zinc-400">
        Loading...
      </div>
    );
  }

  if (!group) return null;

  return (
    <div className="w-[420px] border-l border-zinc-100 dark:border-zinc-800/50 flex flex-col bg-white dark:bg-zinc-950 overflow-auto">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen size={14} className="flex-shrink-0 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
            {group.name}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded"
            title="Delete group"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50">
          <p className="text-xs text-red-700 dark:text-red-400 mb-2">
            Delete <strong>{group.name}</strong>? This will remove all member associations.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                await deleteGroup.mutateAsync(groupId);
                onClose();
              }}
              disabled={deleteGroup.isPending}
              className="px-2.5 py-1 text-[11px] font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleteGroup.isPending ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Details */}
      <div className="px-4 py-4 space-y-4">
        <div className="space-y-2">
          {group.description && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{group.description}</p>
          )}
          <DetailRow label="Members" value={String(group.memberCount ?? 0)} />
          <DetailRow label="Created" value={formatDate(group.created_at)} />
        </div>

        {/* Member list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Members
            </h3>
            <button
              onClick={() => {
                setShowAddPicker(!showAddPicker);
                setAddSearch("");
              }}
              className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
              title="Add contact to group"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Add contact picker */}
          {showAddPicker && (
            <div className="mb-3 border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                <Search size={11} className="text-zinc-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search contacts..."
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  className="flex-1 text-xs bg-transparent text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none"
                />
              </div>
              <div className="max-h-48 overflow-auto">
                {filteredContacts.length === 0 ? (
                  <p className="px-3 py-2 text-[10px] text-zinc-400">
                    {addSearch ? "No matching contacts" : "All contacts already in group"}
                  </p>
                ) : (
                  filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => {
                        addToGroup.mutate({ contactId: contact.id, groupId });
                      }}
                      disabled={addToGroup.isPending}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 transition-colors"
                    >
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                        {contact.name || contact.email}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">{contact.email}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {membersLoading ? (
            <p className="text-xs text-zinc-400">Loading...</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-zinc-400">No members in this group.</p>
          ) : (
            <div className="space-y-1">
              {members.map((contact) => {
                const statusDef = CONTACT_STATUSES.find((s) => s.value === contact.edm_status);
                return (
                  <div
                    key={contact.id}
                    className="group/member flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                        {contact.name || contact.email}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">{contact.email}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {statusDef && statusDef.value !== "active" && (
                        <span className="text-[10px] text-zinc-400">{statusDef.label}</span>
                      )}
                      <button
                        onClick={() => removeFromGroup.mutate({ contactId: contact.id, groupId })}
                        className="p-0.5 opacity-0 group-hover/member:opacity-100 text-zinc-400 hover:text-red-500 rounded transition-opacity"
                        title="Remove from group"
                      >
                        <UserMinus size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-700 dark:text-zinc-300">{value}</span>
    </div>
  );
}
