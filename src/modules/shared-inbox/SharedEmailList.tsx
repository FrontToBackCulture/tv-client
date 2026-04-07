// src/modules/shared-inbox/SharedEmailList.tsx

import { useState } from "react";
import { cn } from "../../lib/cn";
import { Search, Paperclip } from "lucide-react";
import { staggerStyle } from "../../hooks/useStaggeredList";
import type { SharedEmail } from "../../hooks/useSharedInbox";
import { formatDateRelative as formatDate } from "../../lib/date";

interface SharedEmailListProps {
  emails: SharedEmail[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

export function SharedEmailList({
  emails,
  selectedId,
  onSelect,
  isLoading,
}: SharedEmailListProps) {
  const [search, setSearch] = useState("");

  const filteredEmails = search
    ? emails.filter(
        (e) =>
          (e.subject || "").toLowerCase().includes(search.toLowerCase()) ||
          (e.from_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (e.from_email || "").toLowerCase().includes(search.toLowerCase()),
      )
    : emails;

  if (isLoading) {
    return (
      <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
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
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-100 dark:bg-zinc-900 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
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
          filteredEmails.map((email, i) => (
            <div
              key={email.id}
              onClick={() => onSelect(email.id)}
              style={staggerStyle(i)}
              className={cn(
                "px-3 py-3 border-b border-zinc-100 dark:border-zinc-900 cursor-pointer transition-colors animate-fade-slide-in",
                selectedId === email.id
                  ? "bg-teal-50 dark:bg-teal-900/20"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
                !email.is_read_in_source && "bg-blue-50/50 dark:bg-blue-900/10",
              )}
            >
              <div className="flex items-start gap-2">
                {/* Unread indicator */}
                <div className="pt-1.5">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      !email.is_read_in_source ? "bg-blue-500" : "bg-transparent",
                    )}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  {/* From & Date */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-sm truncate",
                        !email.is_read_in_source
                          ? "font-semibold text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300",
                      )}
                      title={email.from_name || email.from_email || ""}
                    >
                      {email.from_name || email.from_email || "Unknown"}
                    </span>
                    {email.received_at && (
                      <span className="text-xs text-zinc-500 flex-shrink-0">
                        {formatDate(email.received_at)}
                      </span>
                    )}
                  </div>

                  {/* Subject */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={cn(
                        "text-sm truncate",
                        !email.is_read_in_source
                          ? "font-medium text-zinc-800 dark:text-zinc-200"
                          : "text-zinc-600 dark:text-zinc-400",
                      )}
                      title={email.subject || "(No subject)"}
                    >
                      {email.subject || "(No subject)"}
                    </span>
                  </div>

                  {/* Preview */}
                  {email.preview && (
                    <p className="text-xs text-zinc-500 truncate mt-1" title={email.preview}>
                      {email.preview}
                    </p>
                  )}

                  {/* Tags */}
                  {email.has_attachments && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Paperclip size={12} className="text-zinc-400" />
                    </div>
                  )}
                </div>
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
