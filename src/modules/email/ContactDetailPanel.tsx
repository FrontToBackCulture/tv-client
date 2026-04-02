// src/modules/email/ContactDetailPanel.tsx
// Right panel showing contact details (editable) and group memberships

import { useState, useEffect, useRef } from "react";
import { X, Mail, Tag, Plus, Trash2, ChevronDown } from "lucide-react";
import {
  useEmailContact,
  useEmailGroups,
  useAddContactToGroup,
  useRemoveContactFromGroup,
  useUpdateEmailContact,
} from "../../hooks/email";
import { CONTACT_STATUSES } from "../../lib/email/types";
import { formatDate } from "../../lib/date";

interface ContactDetailPanelProps {
  contactId: string;
  onClose: () => void;
}

export function ContactDetailPanel({ contactId, onClose }: ContactDetailPanelProps) {
  const { data: contact, isLoading } = useEmailContact(contactId);
  const { data: allGroups } = useEmailGroups();
  const addToGroup = useAddContactToGroup();
  const removeFromGroup = useRemoveContactFromGroup();
  const updateContact = useUpdateEmailContact();
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  if (isLoading) {
    return (
      <div className="w-[420px] border-l border-zinc-100 dark:border-zinc-800/50 flex items-center justify-center text-xs text-zinc-400">
        Loading...
      </div>
    );
  }

  if (!contact) return null;

  const statusDef = CONTACT_STATUSES.find((s) => s.value === contact.edm_status);
  const memberGroupIds = new Set((contact.groups || []).map((g) => g.id));
  const availableGroups = (allGroups || []).filter((g) => !memberGroupIds.has(g.id));

  const handleFieldSave = (field: string, value: string) => {
    const current = (contact as any)[field] || "";
    if (value.trim() === current) return;
    updateContact.mutate({
      id: contactId,
      updates: { [field]: value.trim() || null },
    });
  };

  return (
    <div className="w-[420px] border-l border-zinc-100 dark:border-zinc-800/50 flex flex-col bg-white dark:bg-zinc-950 overflow-auto">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <Mail size={14} className="flex-shrink-0 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
            {contact.name || contact.email}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
        >
          <X size={14} />
        </button>
      </div>

      {/* Details */}
      <div className="px-4 py-4 space-y-4">
        <div className="space-y-2">
          <EditableRow label="Email" value={contact.email} onSave={(v) => handleFieldSave("email", v)} />
          <EditableRow label="Name" value={contact.name || ""} onSave={(v) => handleFieldSave("name", v)} />
          <EditableRow label="Role" value={contact.role || ""} onSave={(v) => handleFieldSave("role", v)} />
          {/* Status toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Status</span>
            <div className="relative">
              <button
                onClick={() => setShowStatusPicker(!showStatusPicker)}
                className="flex items-center gap-1 text-xs rounded-md px-2 py-0.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    statusDef?.color === "green"
                      ? "bg-green-500"
                      : statusDef?.color === "red"
                        ? "bg-red-500"
                        : "bg-zinc-400"
                  }`}
                />
                <span className="text-zinc-700 dark:text-zinc-300">
                  {statusDef?.label || contact.edm_status}
                </span>
                <ChevronDown size={10} className="text-zinc-400" />
              </button>
              {showStatusPicker && (
                <div className="absolute right-0 top-full mt-1 z-10 w-36 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
                  {CONTACT_STATUSES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        if (s.value !== contact.edm_status) {
                          updateContact.mutate(
                            { id: contactId, updates: { edm_status: s.value } },
                            { onSuccess: () => setShowStatusPicker(false) }
                          );
                        } else {
                          setShowStatusPicker(false);
                        }
                      }}
                      disabled={updateContact.isPending}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 ${
                        s.value === contact.edm_status
                          ? "text-zinc-900 dark:text-zinc-100 font-medium"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          s.color === "green"
                            ? "bg-green-500"
                            : s.color === "red"
                              ? "bg-red-500"
                              : "bg-zinc-400"
                        }`}
                      />
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DetailRow label="Source" value={contact.source || "—"} />
          <DetailRow label="Added" value={formatDate(contact.created_at)} />
        </div>

        {/* Groups */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Groups
            </h3>
            {availableGroups.length > 0 && (
              <button
                onClick={() => setShowGroupPicker(!showGroupPicker)}
                className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
                title="Add to group"
              >
                <Plus size={12} />
              </button>
            )}
          </div>

          {/* Group picker dropdown */}
          {showGroupPicker && availableGroups.length > 0 && (
            <div className="mb-2 border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
              {availableGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    addToGroup.mutate(
                      { contactId, groupId: group.id },
                      { onSuccess: () => setShowGroupPicker(false) }
                    );
                  }}
                  disabled={addToGroup.isPending}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                >
                  {group.name}
                </button>
              ))}
            </div>
          )}

          {/* Current groups */}
          {contact.groups && contact.groups.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {contact.groups.map((group) => (
                <span
                  key={group.id}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-md group/tag"
                >
                  <Tag size={10} />
                  {group.name}
                  <button
                    onClick={() =>
                      removeFromGroup.mutate({ contactId, groupId: group.id })
                    }
                    className="ml-0.5 opacity-0 group-hover/tag:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity"
                    title="Remove from group"
                  >
                    <Trash2 size={9} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-zinc-400">No groups assigned</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EditableRow({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleCommit = () => {
    setEditing(false);
    if (draft.trim() !== value) {
      onSave(draft);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCommit();
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          className="text-xs text-right text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 hover:underline decoration-dashed underline-offset-2 cursor-text text-right"
        >
          {value || "—"}
        </button>
      )}
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
