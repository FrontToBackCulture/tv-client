// Single comment in a discussion thread — shared across Chat module and entity panels

import { useState } from "react";
import { Pencil, Trash2, Check, X, Reply } from "lucide-react";
import type { Discussion } from "../../hooks/useDiscussions";

/** Render body text with @mentions and [[entity]] links highlighted */
function renderBodyWithMentions(text: string): React.ReactNode {
  // Split on @mentions and [[entity:label|id]] patterns
  const parts = text.split(/(@[\w-]+|\[\[[\w]+:[^|]+\|[^\]]+\]\])/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="font-medium text-[var(--color-accent)]">
          {part}
        </span>
      );
    }
    // [[type:Label|uuid]]
    const entityMatch = part.match(/^\[\[([\w]+):([^|]+)\|([^\]]+)\]\]$/);
    if (entityMatch) {
      const [, type, label] = entityMatch;
      const colors: Record<string, string> = {
        company: "text-[var(--color-info)]",
        task: "text-[var(--color-warning)]",
        project: "text-[var(--color-purple)]",
      };
      return (
        <span key={i} className={`font-medium ${colors[type] || "text-[var(--color-accent)]"}`}>
          {label}
        </span>
      );
    }
    return part;
  });
}

// Author colors for visual distinction
const authorColors: Record<string, string> = {
  melvin: "text-[var(--color-teal)]",
  darren: "text-[var(--color-info)]",
  "bot-mel": "text-[var(--color-purple)]",
  "bot-dar": "text-[var(--color-info-dark)]",
  "mel-tv": "text-[var(--color-teal)]",
};

function getAuthorColor(author: string): string {
  return authorColors[author] || "text-[var(--text-secondary)]";
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
  currentUserAliases?: string[];
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
      className={`group px-3 py-2 transition-colors duration-100 ${
        isReply
          ? "ml-6 border-l-2 border-[var(--border-default)]"
          : "hover:bg-[var(--bg-muted)]/50 dark:hover:bg-[var(--bg-muted)]/50 rounded-lg"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`text-[11px] font-semibold ${getAuthorColor(discussion.author)}`}>
          {discussion.author}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          {formatRelativeTime(discussion.created_at)}
        </span>
        {discussion.updated_at !== discussion.created_at && (
          <span className="text-[10px] text-[var(--text-muted)] italic">
            (edited)
          </span>
        )}
        {/* Actions */}
        {!isEditing && (
          <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {onReply && !isReply && (
              <button
                onClick={() => onReply(discussion.id)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--bg-muted)] transition-colors duration-100"
                title="Reply"
              >
                <Reply size={12} />
              </button>
            )}
            {isOwn && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors duration-100"
                title="Edit"
              >
                <Pencil size={12} />
              </button>
            )}
            <button
              onClick={() => onDelete(discussion.id)}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-colors duration-100"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {isEditing ? (
        <div className="flex gap-1.5 items-start mt-1">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="flex-1 text-[13px] bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] border-0 rounded-xl px-3 py-1.5 text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <button onClick={handleSave} className="p-1 rounded-md text-[var(--color-accent)] hover:bg-[var(--color-teal-light)]">
            <Check size={14} />
          </button>
          <button onClick={handleCancel} className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={14} />
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed">
          {renderBodyWithMentions(discussion.body)}
        </p>
      )}
    </div>
  );
}
