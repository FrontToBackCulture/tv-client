// Left panel — thread inbox with entity-type accents, unread tracking, pin & delete

import { Plus, MessageSquare, Hash, Building2, CheckSquare, FolderOpen, Briefcase, FileText, Globe, Mail, Search, Pin, Trash2 } from "lucide-react";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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

function threadKey(t: Thread): string {
  return `${t.entity_type}:${t.entity_id}`;
}

// ---------------------------------------------------------------------------
// Pinned threads — persisted per user in localStorage
// ---------------------------------------------------------------------------
const PINS_KEY = "tv-chat-pinned-threads";

function loadPins(): Set<string> {
  try {
    const stored = localStorage.getItem(PINS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function savePins(pins: Set<string>) {
  localStorage.setItem(PINS_KEY, JSON.stringify([...pins]));
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
interface ContextMenu {
  thread: Thread;
  x: number;
  y: number;
}

function ThreadContextMenu({ menu, isPinned, onPin, onDelete, onClose }: {
  menu: ContextMenu;
  isPinned: boolean;
  onPin: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] bg-[var(--bg-elevated)] dark:bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-lg py-1 animate-fade-slide-in"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        onClick={() => { onPin(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
      >
        <Pin size={13} className={isPinned ? "text-[var(--color-accent)]" : "text-[var(--text-muted)]"} />
        {isPinned ? "Unpin thread" : "Pin thread"}
      </button>
      <div className="mx-2 my-0.5 border-t border-[var(--border-default)]" />
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--color-error)] hover:bg-[var(--color-error-light)] transition-colors"
      >
        <Trash2 size={13} />
        Delete thread
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface ChatInboxProps {
  threads: Thread[];
  readPositions: Map<string, string>;
  selectedThreadId: string | null;
  onSelect: (thread: Thread) => void;
  onNewThread: () => void;
  onDeleteThread: (thread: Thread) => void;
}

export function ChatInbox({
  threads,
  readPositions,
  selectedThreadId,
  onSelect,
  onNewThread,
  onDeleteThread,
}: ChatInboxProps) {
  const [search, setSearch] = useState("");
  const [pins, setPins] = useState(loadPins);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Thread | null>(null);

  const togglePin = useCallback((thread: Thread) => {
    setPins((prev) => {
      const next = new Set(prev);
      const key = threadKey(thread);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      savePins(next);
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, thread: Thread) => {
    e.preventDefault();
    setContextMenu({ thread, x: e.clientX, y: e.clientY });
  }, []);

  const filtered = useMemo(() => {
    let list = threads;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          (t.title || "").toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q) ||
          t.author.toLowerCase().includes(q)
      );
    }
    // Sort: pinned first, then by last_activity_at (already sorted from hook)
    const pinned = list.filter((t) => pins.has(threadKey(t)));
    const unpinned = list.filter((t) => !pins.has(threadKey(t)));
    return [...pinned, ...unpinned];
  }, [threads, search, pins]);

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
              const isPinned = pins.has(threadKey(thread));
              const title = thread.title || thread.body.slice(0, 50) || "Untitled";

              return (
                <button
                  key={thread.id}
                  onClick={() => onSelect(thread)}
                  onContextMenu={(e) => handleContextMenu(e, thread)}
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
                    <div className="flex items-center gap-1">
                      {isPinned && <Pin size={10} className="text-[var(--color-accent)] flex-shrink-0" />}
                      <span className={`block text-[12px] leading-tight truncate ${
                        isUnread
                          ? "font-semibold text-[var(--text-primary)]"
                          : "font-medium text-[var(--text-secondary)]"
                      }`}>
                        {title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-[var(--text-muted)] truncate">
                        {thread.last_author || thread.author}
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

      {/* Context menu */}
      {contextMenu && (
        <ThreadContextMenu
          menu={contextMenu}
          isPinned={pins.has(threadKey(contextMenu.thread))}
          onPin={() => togglePin(contextMenu.thread)}
          onDelete={() => setConfirmDelete(contextMenu.thread)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDelete(null)}>
          <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
          <div
            className="relative bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl shadow-xl w-full max-w-[340px] border border-[var(--border-default)] p-5 animate-fade-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-[15px] text-[var(--text-primary)] mb-2">Delete thread?</h3>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-4">
              This will permanently delete all messages in "{confirmDelete.title || confirmDelete.body.slice(0, 40)}". This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteThread(confirmDelete);
                  setConfirmDelete(null);
                }}
                className="px-3 py-1.5 text-[12px] font-semibold text-white bg-[var(--color-error)] hover:opacity-90 rounded-lg transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
