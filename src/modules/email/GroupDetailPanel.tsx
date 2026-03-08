// src/modules/email/GroupDetailPanel.tsx
// Right panel showing group details and member list

import { X, FolderOpen } from "lucide-react";
import { useEmailGroup, useEmailContacts } from "../../hooks/email";
import { CONTACT_STATUSES } from "../../lib/email/types";
import { formatDate } from "../../lib/date";

interface GroupDetailPanelProps {
  groupId: string;
  onClose: () => void;
}

export function GroupDetailPanel({ groupId, onClose }: GroupDetailPanelProps) {
  const { data: group, isLoading: groupLoading } = useEmailGroup(groupId);
  const { data: members = [], isLoading: membersLoading } = useEmailContacts({ groupId });

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
          {group.description && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{group.description}</p>
          )}
          <DetailRow label="Members" value={String(group.memberCount ?? 0)} />
          <DetailRow label="Created" value={formatDate(group.created_at)} />
        </div>

        {/* Member list */}
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
            Members
          </h3>
          {membersLoading ? (
            <p className="text-xs text-zinc-400">Loading...</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-zinc-400">No members in this group.</p>
          ) : (
            <div className="space-y-1">
              {members.map((contact) => {
                const statusDef = CONTACT_STATUSES.find((s) => s.value === contact.status);
                return (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                        {contact.first_name || contact.last_name
                          ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                          : contact.email}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">{contact.email}</p>
                    </div>
                    {statusDef && statusDef.value !== "active" && (
                      <span className="text-[10px] text-zinc-400">{statusDef.label}</span>
                    )}
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
