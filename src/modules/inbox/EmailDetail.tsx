// src/modules/inbox/EmailDetail.tsx

import { useState } from "react";
import { cn } from "../../lib/cn";
import {
  Archive,
  Reply,
  ReplyAll,
  Forward,
  MoreHorizontal,
  Paperclip,
  ExternalLink,
  Building2,
  Link2,
  ChevronDown,
  Mail,
} from "lucide-react";
import type { Email } from "../../lib/inbox/types";
import ReactMarkdown from "react-markdown";

interface EmailDetailProps {
  email: Email | undefined;
  body: string;
  isLoading: boolean;
  onArchive: () => void;
  onReply?: () => void;
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EmailDetail({
  email,
  body,
  isLoading,
  onArchive,
  onReply,
}: EmailDetailProps) {
  const [showAllHeaders, setShowAllHeaders] = useState(false);

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
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

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-zinc-800">
        <button
          onClick={onReply}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          <Reply size={14} />
          Reply
        </button>
        <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
          <ReplyAll size={16} />
        </button>
        <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
          <Forward size={16} />
        </button>
        <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700 mx-1" />
        <button
          onClick={onArchive}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          title="Archive"
        >
          <Archive size={16} />
        </button>
        <div className="flex-1" />
        <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
          <MoreHorizontal size={16} />
        </button>
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
              {(email.from.name || email.from.email).charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {email.from.name || email.from.email}
                </span>
                {email.linkedCompanyName && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded">
                    <Building2 size={10} />
                    {email.linkedCompanyName}
                  </span>
                )}
              </div>
              <div className="text-sm text-zinc-500">
                <span>{email.from.email}</span>
              </div>

              {/* To/CC */}
              <button
                onClick={() => setShowAllHeaders(!showAllHeaders)}
                className="flex items-center gap-1 text-sm text-zinc-500 mt-1 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                <span>
                  To: {email.to.map((t) => t.name || t.email).join(", ")}
                </span>
                <ChevronDown
                  size={14}
                  className={cn("transition-transform", showAllHeaders && "rotate-180")}
                />
              </button>

              {showAllHeaders && email.cc && email.cc.length > 0 && (
                <div className="text-sm text-zinc-500 mt-1">
                  CC: {email.cc.map((c) => c.name || c.email).join(", ")}
                </div>
              )}

              <div className="text-xs text-zinc-400 mt-1">
                {formatFullDate(email.receivedAt)}
              </div>
            </div>
          </div>

          {/* Classification badge */}
          {email.classification && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 dark:bg-zinc-900 rounded-lg">
              <span
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded",
                  email.classification.category === "client" &&
                    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
                  email.classification.category === "deal" &&
                    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
                  email.classification.category === "lead" &&
                    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
                  email.classification.category === "internal" &&
                    "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400",
                  email.classification.category === "vendor" &&
                    "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
                  email.classification.category === "noise" &&
                    "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500"
                )}
              >
                {email.classification.category}
              </span>
              <span
                className={cn(
                  "text-xs px-2 py-1 rounded",
                  email.classification.priority === "high" &&
                    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
                  email.classification.priority === "medium" &&
                    "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
                  email.classification.priority === "low" &&
                    "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                )}
              >
                {email.classification.priority} priority
              </span>
              {email.classification.summary && (
                <span className="text-sm text-zinc-600 dark:text-zinc-400 ml-2">
                  {email.classification.summary}
                </span>
              )}
            </div>
          )}

          {/* Attachments */}
          {email.hasAttachments && email.attachments && email.attachments.length > 0 && (
            <div className="mb-4 p-3 bg-slate-50 dark:bg-zinc-900 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                <Paperclip size={14} />
                <span>{email.attachments.length} attachment(s)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {email.attachments.map((att, idx) => (
                  <button
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg hover:border-teal-500 transition-colors"
                  >
                    <Paperclip size={14} className="text-zinc-400" />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {att.name}
                    </span>
                    <ExternalLink size={12} className="text-zinc-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>

          {/* Link to CRM */}
          {email.linkedCompanyId && (
            <div className="mt-8 pt-4 border-t border-slate-200 dark:border-zinc-800">
              <button className="flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400 hover:underline">
                <Link2 size={14} />
                View {email.linkedCompanyName} in CRM
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
