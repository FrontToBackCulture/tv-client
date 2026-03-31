// Universal discussion panel — attach to any entity
// Supports @mentions with autocomplete and notification creation

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { MessageSquare, Send, X, CornerDownLeft } from "lucide-react";
import { useDiscussions, useCreateDiscussion, useUpdateDiscussion, useDeleteDiscussion } from "../../hooks/useDiscussions";
import { useCreateNotification } from "../../hooks/useNotifications";
import { useAuth } from "../../stores/authStore";
import { useUsers } from "../../hooks/work";
import { DiscussionItem } from "./DiscussionItem";

interface DiscussionPanelProps {
  entityType: string;
  entityId: string;
  onClose?: () => void;
}

/** Extract @mentions from text, returns unique lowercase usernames */
function parseMentions(text: string): string[] {
  const matches = text.match(/@([\w-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export function DiscussionPanel({ entityType, entityId, onClose }: DiscussionPanelProps) {
  const { data: discussions, isLoading } = useDiscussions(entityType, entityId);
  const createMutation = useCreateDiscussion();
  const updateMutation = useUpdateDiscussion();
  const deleteMutation = useDeleteDiscussion();
  const createNotification = useCreateNotification();

  const [body, setBody] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Team members for @mention autocomplete
  const { data: allUsers = [] } = useUsers();
  const mentionableUsers = useMemo(
    () => allUsers.map((u) => ({ name: u.name, type: u.type })),
    [allUsers]
  );

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRef = useRef<HTMLDivElement>(null);

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers
      .filter((u) => u.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, mentionableUsers]);

  // Get current user
  const user = useAuth((s) => s.user);
  const currentUserFromAuth = user?.name || user?.login || "unknown";
  const matchedUser = allUsers.find(
    (u) => u.github_username === user?.login || u.microsoft_email === user?.login || u.name === currentUserFromAuth
  );
  const currentUser = matchedUser?.name || currentUserFromAuth;
  const currentUserAliases = [
    user?.login, user?.name, matchedUser?.name, matchedUser?.github_username, matchedUser?.microsoft_email
  ].filter((n): n is string => !!n && n !== currentUser);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Auto-scroll to bottom when new comments arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [discussions?.length]);

  // Detect @ trigger in textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setBody(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);

    const atMatch = textBeforeCursor.match(/@([\w-]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  // Insert mention at cursor position
  const insertMention = useCallback((username: string) => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = body.slice(0, cursorPos);
    const textAfterCursor = body.slice(cursorPos);

    const atIdx = textBeforeCursor.lastIndexOf("@");
    const newText = textBeforeCursor.slice(0, atIdx) + `@${username} ` + textAfterCursor;
    setBody(newText);
    setMentionQuery(null);

    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = atIdx + username.length + 2;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [body]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;

    const result = await createMutation.mutateAsync({
      entity_type: entityType,
      entity_id: entityId,
      author: currentUser,
      body: trimmed,
      parent_id: replyingTo || undefined,
    });

    // Create notifications for @mentions + reply notifications
    const mentions = parseMentions(trimmed);
    const preview = trimmed.length > 100 ? trimmed.slice(0, 100) + "..." : trimmed;
    const notifiedUsers = new Set<string>();

    for (const mentioned of mentions) {
      notifiedUsers.add(mentioned.toLowerCase());
      createNotification.mutate({
        recipient: mentioned,
        type: "mention",
        discussion_id: result.id,
        entity_type: entityType,
        entity_id: entityId,
        actor: currentUser,
        body_preview: preview,
      });
    }

    if (replyingTo && discussions) {
      const parentComment = discussions.find((d) => d.id === replyingTo);
      if (parentComment && !notifiedUsers.has(parentComment.author.toLowerCase()) && parentComment.author.toLowerCase() !== currentUser.toLowerCase()) {
        createNotification.mutate({
          recipient: parentComment.author,
          type: "reply",
          discussion_id: result.id,
          entity_type: entityType,
          entity_id: entityId,
          actor: currentUser,
          body_preview: preview,
        });
      }
    }

    setBody("");
    setMentionQuery(null);
    setReplyingTo(null);
    inputRef.current?.focus();
  }

  function handleUpdate(id: string, newBody: string) {
    updateMutation.mutate({ id, body: newBody });
  }

  function handleDelete(id: string) {
    const comment = discussions?.find((d) => d.id === id);
    if (comment) {
      const mentions = parseMentions(comment.body);
      for (const mentioned of mentions) {
        if (mentioned.toLowerCase() === currentUser.toLowerCase()) continue;
        createNotification.mutate({
          recipient: mentioned,
          type: "resolved",
          discussion_id: id,
          entity_type: entityType,
          entity_id: entityId,
          actor: currentUser,
          body_preview: `Resolved: ${comment.body.slice(0, 80)}`,
        });
      }
    }
    deleteMutation.mutate({ id, entity_type: entityType, entity_id: entityId });
  }

  // Keyboard navigation for mention dropdown
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex].name);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Group discussions: top-level + replies
  const topLevel = discussions?.filter((d) => !d.parent_id) ?? [];
  const repliesByParent = new Map<string, typeof discussions>();
  discussions?.forEach((d) => {
    if (d.parent_id) {
      const existing = repliesByParent.get(d.parent_id) || [];
      existing.push(d);
      repliesByParent.set(d.parent_id, existing);
    }
  });

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border-l border-[var(--border-default)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border-default)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={13} className="text-[var(--text-muted)]" />
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">
            Discussion
          </span>
          {discussions && discussions.length > 0 && (
            <span className="text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-muted)] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {discussions.length}
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors duration-150"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Comment list */}
      <div ref={listRef} className="flex-1 overflow-auto scrollbar-auto-hide">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <span className="text-[11px] text-[var(--text-muted)]">Loading...</span>
          </div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-muted)] flex items-center justify-center mb-2.5">
              <MessageSquare size={16} className="text-[var(--text-muted)]" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              No comments yet
            </p>
          </div>
        ) : (
          <div className="py-1">
            {topLevel.map((discussion, i) => (
              <div key={discussion.id} className="animate-fade-slide-in" style={{ animationDelay: `${i * 30}ms` }}>
                <DiscussionItem
                  discussion={discussion}
                  currentUser={currentUser}
                  currentUserAliases={currentUserAliases}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onReply={(parentId) => {
                    setReplyingTo(parentId);
                    inputRef.current?.focus();
                  }}
                />
                {repliesByParent.get(discussion.id)?.map((reply) => (
                  <DiscussionItem
                    key={reply.id}
                    discussion={reply}
                    currentUser={currentUser}
                    currentUserAliases={currentUserAliases}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    isReply
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border-default)] p-2.5 relative flex-shrink-0">
        {/* @mention autocomplete dropdown */}
        {mentionQuery !== null && filteredMentions.length > 0 && (
          <div
            ref={mentionRef}
            className="absolute bottom-full left-2.5 right-2.5 mb-1.5 bg-[var(--bg-elevated)] dark:bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden z-10 animate-fade-slide-in"
          >
            <div className="px-2.5 py-1.5 border-b border-[var(--border-default)]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                People
              </span>
            </div>
            {filteredMentions.map((u, i) => (
              <button
                key={u.name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(u.name);
                }}
                className={`w-full text-left px-3 py-2 text-[12px] flex items-center gap-2.5 transition-colors duration-100 ${
                  i === mentionIndex
                    ? "bg-[var(--color-teal-light)] dark:bg-[var(--color-teal-light)]"
                    : "hover:bg-[var(--bg-muted)] dark:hover:bg-[var(--bg-muted)]"
                }`}
              >
                <span className="font-medium text-[var(--color-accent)]">@</span>
                <span className="font-medium text-[var(--text-primary)]">{u.name}</span>
                <span className="text-[10px] text-[var(--text-muted)] ml-auto capitalize">{u.type}</span>
              </button>
            ))}
          </div>
        )}

        {/* Reply indicator */}
        {replyingTo && (
          <div className="flex items-center gap-1.5 mb-2 px-0.5">
            <CornerDownLeft size={11} className="text-[var(--color-accent)]" />
            <span className="text-[11px] font-medium text-[var(--color-accent)]">
              Replying
            </span>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end min-w-0">
          <div className="flex-1 min-w-0">
            <textarea
              ref={inputRef}
              value={body}
              onChange={handleInputChange}
              placeholder={replyingTo ? "Write a reply..." : "Comment — @ to mention"}
              rows={1}
              className="w-full text-[13px] bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] border-0 rounded-xl px-3 py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition-shadow duration-150 overflow-x-hidden overflow-y-auto"
              style={{ maxHeight: 100 }}
              onKeyDown={handleKeyDown}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 100) + "px";
              }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || createMutation.isPending}
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            title="Send (⌘+Enter)"
          >
            <Send size={13} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1.5 px-0.5">
          <span className="text-[10px] text-[var(--text-muted)]">
            <kbd className="px-1 py-0.5 rounded bg-[var(--bg-muted)] text-[9px] font-mono">⌘↵</kbd> send
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">
            <kbd className="px-1 py-0.5 rounded bg-[var(--bg-muted)] text-[9px] font-mono">@</kbd> mention
          </span>
        </div>
      </div>
    </div>
  );
}
