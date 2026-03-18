// src/components/discussions/DiscussionItem.tsx
// Single comment in a discussion thread

import { useState } from "react";
import { Pencil, Trash2, Check, X, Reply } from "lucide-react";
import type { Discussion } from "../../hooks/useDiscussions";

/** Render body text with @mentions highlighted */
function renderBodyWithMentions(text: string): React.ReactNode {
  const parts = text.split(/(@[\w-]+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-teal-600 dark:text-teal-400 font-medium">
        {part}
      </span>
    ) : (
      part
    )
  );
}

// Author colors for visual distinction
const authorColors: Record<string, string> = {
  melvin: "text-teal-600 dark:text-teal-400",
  darren: "text-blue-600 dark:text-blue-400",
  "bot-mel": "text-purple-600 dark:text-purple-400",
  "bot-dar": "text-indigo-600 dark:text-indigo-400",
};

function getAuthorColor(author: string): string {
  return authorColors[author] || "text-zinc-600 dark:text-zinc-400";
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
}

interface DiscussionItemProps {
  discussion: Discussion;
  currentUser: string;
  currentUserAliases?: string[]; // Additional names to match for ownership (github login, etc.)
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  onReply?: (parentId: string) => void;
  isReply?: boolean;
}

export function DiscussionItem({
  discussion,
  currentUser,
  currentUserAliases = [],
  onUpdate,
  onDelete,
  onReply,
  isReply = false,
}: DiscussionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(discussion.body);
  // Match ownership against canonical name + any aliases (github login, display name)
  const allNames = [currentUser, ...currentUserAliases].map((n) => n.toLowerCase());
  const isOwn = allNames.includes(discussion.author.toLowerCase());

  function handleSave() {
    if (editBody.trim() && editBody !== discussion.body) {
      onUpdate(discussion.id, editBody.trim());
    }
    setIsEditing(false);
  }

  function handleCancel() {
    setEditBody(discussion.body);
    setIsEditing(false);
  }

  return (
    <div
      className={`group px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
        isReply ? "ml-6 border-l-2 border-zinc-200 dark:border-zinc-800" : ""
      }`}
    >
      {/* Header: author + time + actions */}
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`text-xs font-semibold ${getAuthorColor(discussion.author)}`}>
          {discussion.author}
        </span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
          {formatRelativeTime(discussion.created_at)}
        </span>
        {discussion.updated_at !== discussion.created_at && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600 italic">
            (edited)
          </span>
        )}
        {/* Actions — always visible (small team, everyone can delete) */}
        {!isEditing && (
          <div className="ml-auto flex gap-0.5">
            {onReply && !isReply && (
              <button
                onClick={() => onReply(discussion.id)}
                className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                title="Reply"
              >
                <Reply size={12} />
              </button>
            )}
            {isOwn && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                title="Edit"
              >
                <Pencil size={12} />
              </button>
            )}
            <button
              onClick={() => onDelete(discussion.id)}
              className="p-0.5 rounded text-zinc-400 hover:text-red-500"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {isEditing ? (
        <div className="flex gap-1.5 items-start">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="flex-1 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <button onClick={handleSave} className="p-1 text-teal-600 hover:text-teal-700">
            <Check size={14} />
          </button>
          <button onClick={handleCancel} className="p-1 text-zinc-400 hover:text-zinc-600">
            <X size={14} />
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
          {renderBodyWithMentions(discussion.body)}
        </p>
      )}
    </div>
  );
}
