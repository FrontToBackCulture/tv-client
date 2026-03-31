// Left panel — thread inbox with entity-type accents and unread tracking

import { Plus, MessageSquare, Hash, Building2, CheckSquare, FolderOpen, Briefcase, FileText, Globe, Mail, Search } from "lucide-react";
import { useState, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import type { Thread } from "../../hooks/chat";

const entityMeta: Record<string, { icon: LucideIcon; label: string; accent: string; border: string }> = {
  general:      { icon: Hash,        label: "General",  accent: "text-slate-500 dark:text-slate-400",  border: "border-l-slate-400 dark:border-l-slate-600" },
  crm_company:  { icon: Building2,   label: "Company",  accent: "text-[var(--color-info)] dark:text-[var(--color-info)]",      border: "border-l-[var(--color-info)]" },
  crm_deal:     { icon: Briefcase,   label: "Deal",     accent: "text-[var(--color-success)] dark:text-[var(--color-success)]", border: "border-l-[var(--color-success)]" },
  task:         { icon: CheckSquare,  label: "Task",     accent: "text-[var(--color-warning)] dark:text-[var(--color-warning)]", border: "border-l-[var(--color-warning)]" },
  project:      { icon: FolderOpen,   label: "Project",  accent: "text-[var(--color-purple)] dark:text-[var(--color-purple)]",  border: "border-l-[var(--color-purple)]" },
  file:         { icon: FileText,     label: "File",     accent: "text-slate-400 dark:text-slate-500",  border: "border-l-slate-300 dark:border-l-slate-700" },
  domain:       { icon: Globe,        label: "Domain",   accent: "text-[var(--color-teal)] dark:text-[var(--color-teal)]",      border: "border-l-[var(--color-teal)]" },
  campaign:     { icon: Mail,         label: "Campaign", accent: "text-[var(--color-magenta)] dark:text-[var(--color-magenta)]", border: "border-l-[var(--color-magenta)]" },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
}

interface ChatInboxProps {
  threads: Thread[];
  readPositions: Map<string, string>;
  selectedThreadId: string | null;
  onSelect: (thread: Thread) => void;
  onNewThread: () => void;
}

export function ChatInbox({
  threads,
  readPositions,
  selectedThreadId,
  onSelect,
  onNewThread,
}: ChatInboxProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.toLowerCase();
    return threads.filter(
      (t) =>
        (t.title || "").toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.author.toLowerCase().includes(q)
    );
  }, [threads, search]);

  const unreadCount = useMemo(() => {
    return threads.filter((t) => {
      const readAt = readPositions.get(t.id);
      return !readAt || new Date(t.last_activity_at) > new Date(readAt);
    }).length;
  }, [threads, readPositions]);

  return (
    <div className="flex flex-col h-full border-r border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="px-3.5 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg text-[var(--text-primary)] tracking-tight">Chat</h2>
            {unreadCount > 0 && (
              <span className="text-[10px] font-semibold text-white bg-[var(--color-accent)] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onNewThread}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--bg-muted)] dark:hover:bg-[var(--bg-muted)] transition-all duration-150"
            title="New thread"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads..."
            className="w-full text-[12px] bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] border-0 rounded-lg pl-8 pr-2.5 py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-auto scrollbar-auto-hide px-1.5 pb-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] flex items-center justify-center mb-3">
              <MessageSquare size={18} className="text-[var(--text-muted)]" />
            </div>
            <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-1">
              {search ? "No matching threads" : "No conversations yet"}
            </p>
            {!search && (
              <button
                onClick={onNewThread}
                className="text-[11px] font-medium text-[var(--color-accent)] hover:underline underline-offset-2 mt-0.5"
              >
                Start a thread
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((thread, i) => {
              const meta = entityMeta[thread.entity_type] || entityMeta.general;
              const Icon = meta.icon;
              const isSelected = thread.id === selectedThreadId;
              const readAt = readPositions.get(thread.id);
              const isUnread = !readAt || new Date(thread.last_activity_at) > new Date(readAt);
              const title = thread.title || thread.body.slice(0, 50) || "Untitled";

              return (
                <button
                  key={thread.id}
                  onClick={() => onSelect(thread)}
                  className={`w-full text-left px-2.5 py-2 flex items-start gap-2.5 rounded-lg border-l-[3px] transition-all duration-150 animate-fade-slide-in ${meta.border} ${
                    isSelected
                      ? "bg-[var(--color-teal-light)] dark:bg-[var(--color-teal-light)]"
                      : "hover:bg-[var(--bg-muted)] dark:hover:bg-[var(--bg-muted)]"
                  }`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {/* Entity icon */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isSelected ? "bg-[var(--color-teal-light)] dark:bg-[var(--color-teal-dark)]" : "bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)]"
                  }`}>
                    <Icon size={13} className={meta.accent} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 py-0.5">
                    <span className={`block text-[12px] leading-tight truncate ${
                      isUnread
                        ? "font-semibold text-[var(--text-primary)]"
                        : "font-medium text-[var(--text-secondary)]"
                    }`}>
                      {title}
                    </span>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-[var(--text-muted)] truncate">
                        {thread.author}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] opacity-40">·</span>
                      <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                        {formatRelativeTime(thread.last_activity_at)}
                      </span>
                    </div>
                  </div>

                  {/* Unread indicator */}
                  {isUnread && (
                    <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] mt-2 flex-shrink-0 ring-2 ring-[var(--bg-surface)] dark:ring-[var(--bg-surface)]" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
