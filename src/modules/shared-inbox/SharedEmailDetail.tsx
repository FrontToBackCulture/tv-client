// src/modules/shared-inbox/SharedEmailDetail.tsx

import { useState } from "react";
import { cn } from "../../lib/cn";
import { ChevronDown, ExternalLink, Mail, Paperclip } from "lucide-react";
import { HtmlEmailViewer } from "../inbox/HtmlEmailViewer";
import type { SharedEmail } from "../../hooks/useSharedInbox";

interface SharedEmailDetailProps {
  email: SharedEmail | undefined;
  body: string;
  isLoading: boolean;
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-SG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SharedEmailDetail({ email, body, isLoading }: SharedEmailDetailProps) {
  const [showAllHeaders, setShowAllHeaders] = useState(false);

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <Mail size={48} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-700" />
          <p className="text-zinc-500">Select an email to read</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="animate-pulse text-zinc-400">Loading email...</div>
      </div>
    );
  }

  const toNames = (email.to_addresses || []).map((t) => t.name || t.email).join(", ");
  const ccNames = (email.cc_addresses || []).map((c) => c.name || c.email).join(", ");

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex-1" />
        {email.web_link && (
          <a
            href={email.web_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-teal-600 transition-colors"
          >
            <ExternalLink size={12} />
            Open in Outlook
          </a>
        )}
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* Subject */}
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            {email.subject || "(No subject)"}
          </h1>

          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-medium flex-shrink-0">
              {(email.from_name || email.from_email || "?").charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {email.from_name || email.from_email || "Unknown"}
                </span>
              </div>
              <div className="text-sm text-zinc-500">
                <span>{email.from_email}</span>
              </div>

              {/* To/CC */}
              {toNames && (
                <button
                  onClick={() => setShowAllHeaders(!showAllHeaders)}
                  className="flex items-center gap-1 text-sm text-zinc-500 mt-1 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  <span>To: {toNames}</span>
                  <ChevronDown
                    size={14}
                    className={cn("transition-transform", showAllHeaders && "rotate-180")}
                  />
                </button>
              )}

              {showAllHeaders && ccNames && (
                <div className="text-sm text-zinc-500 mt-1">CC: {ccNames}</div>
              )}

              {email.received_at && (
                <div className="text-xs text-zinc-400 mt-1">
                  {formatFullDate(email.received_at)}
                </div>
              )}
            </div>
          </div>

          {/* Attachments indicator */}
          {email.has_attachments && (
            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Paperclip size={14} />
                <span>This email has attachments (view in Outlook)</span>
              </div>
            </div>
          )}

          {/* Body */}
          <HtmlEmailViewer html={body} />
        </div>
      </div>
    </div>
  );
}
