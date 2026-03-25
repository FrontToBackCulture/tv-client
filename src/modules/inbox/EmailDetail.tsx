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
import { Button, IconButton, Badge } from "../../components/ui";
import { HtmlEmailViewer } from "./HtmlEmailViewer";

interface EmailAddress {
  name: string;
  email: string;
}

interface EmailDetailData {
  id: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  classification?: {
    category: string;
    priority: string;
    summary?: string;
    actionRequired?: boolean;
  };
  linkedCompanyId?: string;
  linkedCompanyName?: string;
  attachments?: { name: string }[];
}

interface EmailDetailProps {
  email: EmailDetailData | undefined;
  body: string;
  isLoading: boolean;
  onArchive: () => void;
  onReply?: () => void;
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

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <Button icon={Reply} onClick={onReply} className="rounded-lg">
          Reply
        </Button>
        <IconButton icon={ReplyAll} label="Reply all" className="p-2 rounded-lg" />
        <IconButton icon={Forward} label="Forward" className="p-2 rounded-lg" />
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <IconButton icon={Archive} label="Archive" onClick={onArchive} className="p-2 rounded-lg" />
        <div className="flex-1" />
        <IconButton icon={MoreHorizontal} label="More options" className="p-2 rounded-lg" />
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
            <div className="flex items-center gap-2 mb-4 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <Badge
                color={
                  email.classification.category === "client" ? "blue"
                    : email.classification.category === "deal" ? "green"
                    : email.classification.category === "lead" ? "purple"
                    : email.classification.category === "vendor" ? "orange"
                    : "zinc"
                }
              >
                {email.classification.category}
              </Badge>
              <Badge
                color={
                  email.classification.priority === "high" ? "red"
                    : email.classification.priority === "medium" ? "yellow"
                    : "zinc"
                }
              >
                {email.classification.priority} priority
              </Badge>
              {email.classification.summary && (
                <span className="text-sm text-zinc-600 dark:text-zinc-400 ml-2">
                  {email.classification.summary}
                </span>
              )}
            </div>
          )}

          {/* Attachments */}
          {email.hasAttachments && email.attachments && email.attachments.length > 0 && (
            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                <Paperclip size={14} />
                <span>{email.attachments.length} attachment(s)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {email.attachments.map((att, idx) => (
                  <button
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-teal-500 transition-colors"
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

          {/* Body - HTML rendered in sandboxed iframe */}
          <HtmlEmailViewer html={body} />

          {/* Link to CRM */}
          {email.linkedCompanyId && (
            <div className="mt-8 pt-4 border-t border-zinc-200 dark:border-zinc-800">
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
