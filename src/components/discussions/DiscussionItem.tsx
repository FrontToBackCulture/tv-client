// Single message in a discussion thread — shared across Chat module and entity panels

import { useState, type ReactNode } from "react";
import { Pencil, Trash2, Check, X, Reply, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Discussion } from "../../hooks/useDiscussions";

// ---------------------------------------------------------------------------
// Mention + entity highlighting (applied inside markdown text nodes)
// ---------------------------------------------------------------------------

function processMentions(text: string): ReactNode {
  const parts = text.split(/(@[\w-]+|\[\[[\w]+:[^|]+\|[^\]]+\]\])/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 rounded px-0.5">
          {part}
        </span>
      );
    }
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

/** Walk children and replace string nodes with mention-processed nodes */
function MentionText({ children }: { children: ReactNode }): ReactNode {
  if (typeof children === "string") return processMentions(children);
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string" ? (
        <span key={i}>{processMentions(child)}</span>
      ) : (
        child
      )
    );
  }
  return children;
}

// ---------------------------------------------------------------------------
// Author identity
// ---------------------------------------------------------------------------

const authorMeta: Record<string, { color: string; bg: string; border: string }> = {
  "mel-tv":    { color: "text-teal-400",    bg: "bg-teal-500/20",    border: "border-l-teal-500/40" },
  "melvin":    { color: "text-teal-400",    bg: "bg-teal-500/20",    border: "border-l-teal-500/40" },
  "dachewsg":  { color: "text-blue-400",    bg: "bg-blue-500/20",    border: "border-l-blue-500/40" },
  "darren":    { color: "text-blue-400",    bg: "bg-blue-500/20",    border: "border-l-blue-500/40" },
  "YCVAL":     { color: "text-amber-400",   bg: "bg-amber-500/20",   border: "border-l-amber-500/40" },
  "GloriaGoh": { color: "text-pink-400",    bg: "bg-pink-500/20",    border: "border-l-pink-500/40" },
  "GeneFTBC":  { color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-l-emerald-500/40" },
};

function getAuthorStyle(author: string) {
  return authorMeta[author] || { color: "text-slate-400", bg: "bg-slate-500/20", border: "border-l-slate-500/40" };
}

function isBot(author: string): boolean {
  return author.startsWith("bot-");
}

function AuthorAvatar({ author }: { author: string }) {
  if (isBot(author)) {
    return (
      <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0 ring-1 ring-purple-500/20">
        <Bot size={14} className="text-purple-400" />
      </div>
    );
  }
  const style = getAuthorStyle(author);
  const initials = author.slice(0, 2).toUpperCase();
  return (
    <div className={`w-7 h-7 rounded-lg ${style.bg} flex items-center justify-center flex-shrink-0 ring-1 ring-white/5`}>
      <span className={`text-[10px] font-bold ${style.color}`}>{initials}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Markdown body renderer
// ---------------------------------------------------------------------------

function MessageBody({ body }: { body: string }) {
  return (
    <div className="prose-chat text-[13px] text-[var(--text-primary)] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">
              <MentionText>{children}</MentionText>
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-[var(--text-secondary)]">{children}</em>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.startsWith("language-");
            if (isBlock) {
              return (
                <code className="text-[12px] font-mono">{children}</code>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded-md bg-[var(--bg-muted)] text-[12px] font-mono text-[var(--color-accent)] ring-1 ring-[var(--border-default)]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 p-3 rounded-lg bg-[var(--bg-muted)] border border-[var(--border-default)] overflow-x-auto text-[12px] leading-relaxed">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="my-1.5 ml-4 space-y-0.5 list-disc marker:text-[var(--text-muted)]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 space-y-0.5 list-decimal marker:text-[var(--text-muted)]">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-[13px] pl-0.5">
              <MentionText>{children}</MentionText>
            </li>
          ),
          h1: ({ children }) => (
            <h1 className="text-[15px] font-bold mt-3 mb-1.5 text-[var(--text-primary)]">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[14px] font-bold mt-2.5 mb-1 text-[var(--text-primary)]">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13px] font-bold mt-2 mb-1 text-[var(--text-primary)]">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 pl-3 border-l-2 border-[var(--color-accent)]/40 text-[var(--text-secondary)] italic">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="my-3 border-[var(--border-default)]" />
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline underline-offset-2 hover:opacity-80">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-[var(--border-default)]">
              <table className="w-full text-[12px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-3 py-1.5 text-left font-semibold bg-[var(--bg-muted)] border-b border-[var(--border-default)]">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-b border-[var(--border-default)]">{children}</td>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DiscussionItemProps {
  discussion: Discussion;
  currentUser: string;
  currentUserAliases?: string[];
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  onReply?: (parentId: string) => void;
  isReply?: boolean;
  /** True when this message continues a group from the same author (compact mode) */
  isContinuation?: boolean;
}

export function DiscussionItem({
  discussion,
  currentUser,
  currentUserAliases = [],
  onUpdate,
  onDelete,
  onReply,
  isReply = false,
  isContinuation = false,
}: DiscussionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(discussion.body);
  const allNames = [currentUser, ...currentUserAliases].map((n) => n.toLowerCase());
  const isOwn = allNames.includes(discussion.author.toLowerCase());
  const isBotMessage = isBot(discussion.author);

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

  const showHeader = !isContinuation;
  const authorStyle = getAuthorStyle(discussion.author);
  const borderColor = isBotMessage ? "border-l-purple-500/40" : authorStyle.border;

  return (
    <div
      className={`group relative transition-colors duration-100 ${
        isReply
          ? "ml-9 pl-4 border-l-2 border-[var(--border-default)] py-1.5"
          : isContinuation
            ? `py-0.5 border-l-2 ${borderColor}`
            : `pt-3 pb-0.5 border-l-2 ${borderColor}`
      }`}
    >
      <div className={`flex gap-2.5 px-4 ${isContinuation ? "pl-[52px]" : ""}`}>
        {/* Avatar — only on first message of a group */}
        {!isReply && showHeader && <AuthorAvatar author={discussion.author} />}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header — only on first message of a group */}
          {showHeader && (
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={`text-[12px] font-semibold ${
                  isBotMessage ? "text-purple-400" : getAuthorStyle(discussion.author).color
                }`}
              >
                {discussion.author}
              </span>
              {isBotMessage && (
                <span className="text-[9px] font-medium uppercase tracking-wider text-purple-400/60 bg-purple-500/10 px-1.5 py-0.5 rounded">
                  bot
                </span>
              )}
              <span className="text-[10px] text-[var(--text-muted)]">
                {formatRelativeTime(discussion.created_at)}
              </span>
              {discussion.updated_at !== discussion.created_at && (
                <span className="text-[10px] text-[var(--text-muted)] italic">(edited)</span>
              )}
            </div>
          )}

          {/* Hover timestamp for continuation messages */}
          {isContinuation && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
              {new Date(discussion.created_at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          )}

          {/* Actions — shown on hover for all messages */}
          {!isEditing && (
            <div className="absolute right-3 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[var(--bg-surface)] rounded-md shadow-sm border border-[var(--border-default)] px-0.5 py-0.5 z-10">
              {onReply && !isReply && (
                <button
                  onClick={() => onReply(discussion.id)}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--bg-muted)] transition-colors duration-100"
                  title="Reply"
                >
                  <Reply size={12} />
                </button>
              )}
              {isOwn && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors duration-100"
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
              )}
              <button
                onClick={() => onDelete(discussion.id)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-colors duration-100"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}

          {/* Body */}
          {isEditing ? (
            <div className="flex gap-1.5 items-start mt-1">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="flex-1 text-[13px] bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] border-0 rounded-xl px-3 py-1.5 text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                rows={3}
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
            <>
              <MessageBody body={discussion.body} />

              {/* Image attachments */}
              {discussion.attachments && discussion.attachments.length > 0 && (
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  {discussion.attachments.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block group/img">
                      <img
                        src={url}
                        alt="attachment"
                        className="max-h-52 max-w-sm rounded-lg border border-[var(--border-default)] object-cover group-hover/img:opacity-90 transition-opacity cursor-pointer"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
}
