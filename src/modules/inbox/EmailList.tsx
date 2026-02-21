// src/modules/inbox/EmailList.tsx

import { useState } from "react";
import { cn } from "../../lib/cn";
import {
  Search,
  Archive,
  MailOpen,
  Paperclip,
  Building2,
  Handshake,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import type { OutlookEmail } from "../../hooks/useOutlook";
import { formatDateRelative as formatDate } from "../../lib/date";

interface EmailListProps {
  emails: OutlookEmail[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkRead: (id: string) => void;
  isLoading: boolean;
}

function getCategoryIcon(category?: string) {
  switch (category) {
    case "client":
      return <Building2 size={12} className="text-blue-500" />;
    case "deal":
      return <Handshake size={12} className="text-green-500" />;
    case "lead":
      return <UserPlus size={12} className="text-purple-500" />;
    default:
      return null;
  }
}

export function EmailList({
  emails,
  selectedId,
  onSelect,
  onArchive,
  onMarkRead,
  isLoading,
}: EmailListProps) {
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredEmails = search
    ? emails.filter(
        (e) =>
          e.subject.toLowerCase().includes(search.toLowerCase()) ||
          e.fromName.toLowerCase().includes(search.toLowerCase()) ||
          e.fromEmail.toLowerCase().includes(search.toLowerCase())
      )
    : emails;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading emails...</div>
      </div>
    );
  }

  return (
    <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-950">
      {/* Search */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-100 dark:bg-zinc-900 border border-transparent rounded-lg focus:outline-none focus:border-teal-500 dark:focus:border-teal-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
          />
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto">
        {filteredEmails.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            <p>No emails found</p>
          </div>
        ) : (
          filteredEmails.map((email) => (
            <div
              key={email.id}
              onClick={() => onSelect(email.id)}
              onMouseEnter={() => setHoveredId(email.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                "px-3 py-3 border-b border-zinc-100 dark:border-zinc-900 cursor-pointer transition-colors",
                selectedId === email.id
                  ? "bg-teal-50 dark:bg-teal-900/20"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
                !email.isRead && "bg-blue-50/50 dark:bg-blue-900/10"
              )}
            >
              <div className="flex items-start gap-2">
                {/* Unread indicator */}
                <div className="pt-1.5">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      !email.isRead ? "bg-blue-500" : "bg-transparent"
                    )}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  {/* From & Date */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-sm truncate",
                        !email.isRead
                          ? "font-semibold text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300"
                      )}
                    >
                      {email.fromName || email.fromEmail}
                    </span>
                    <span className="text-xs text-zinc-500 flex-shrink-0">
                      {formatDate(email.receivedAt)}
                    </span>
                  </div>

                  {/* Subject */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {email.actionRequired && (
                      <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
                    )}
                    {getCategoryIcon(email.category)}
                    <span
                      className={cn(
                        "text-sm truncate",
                        !email.isRead
                          ? "font-medium text-zinc-800 dark:text-zinc-200"
                          : "text-zinc-600 dark:text-zinc-400"
                      )}
                    >
                      {email.subject || "(No subject)"}
                    </span>
                  </div>

                  {/* Preview */}
                  <p className="text-xs text-zinc-500 truncate mt-1">
                    {email.bodyPreview}
                  </p>

                  {/* Tags */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {email.hasAttachments && (
                      <Paperclip size={12} className="text-zinc-400" />
                    )}
                    {email.linkedCompanyName && (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400">
                        {email.linkedCompanyName}
                      </span>
                    )}
                    {email.aiSummary && hoveredId === email.id && (
                      <span className="text-xs text-teal-600 dark:text-teal-400 truncate">
                        {email.aiSummary}
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                {hoveredId === email.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!email.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkRead(email.id);
                        }}
                        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        title="Mark as read"
                      >
                        <MailOpen size={14} className="text-zinc-500" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchive(email.id);
                      }}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      title="Archive"
                    >
                      <Archive size={14} className="text-zinc-500" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-center">
        {filteredEmails.length} email{filteredEmails.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
