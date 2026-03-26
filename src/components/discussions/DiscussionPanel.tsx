// src/components/discussions/DiscussionPanel.tsx
// Universal discussion panel — attach to any entity
// Supports @mentions with autocomplete and notification creation

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { MessageSquare, Send, X } from "lucide-react";
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

  // Get current user — match against users table name (same as @mention autocomplete)
  const user = useAuth((s) => s.user);
  const currentUserFromAuth = user?.name || user?.login || "unknown";
  // Find matching user in the users table to get the canonical name
  const matchedUser = allUsers.find(
    (u) => u.github_username === user?.login || u.microsoft_email === user?.login || u.name === currentUserFromAuth
  );
  const currentUser = matchedUser?.name || currentUserFromAuth;
  // Collect all possible names for ownership matching
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

    // Check if we're in a mention: find last @ before cursor
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

    // Replace the @query with @username
    const atIdx = textBeforeCursor.lastIndexOf("@");
    const newText = textBeforeCursor.slice(0, atIdx) + `@${username} ` + textAfterCursor;
    setBody(newText);
    setMentionQuery(null);

    // Restore focus and cursor
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

    // Notify @mentioned users
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

    // Notify the parent comment author on reply (if not already notified via @mention)
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
    // Find the comment being deleted to notify mentioned users
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
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={14} className="text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Discussion
          </span>
          {discussions && discussions.length > 0 && (
            <span className="text-[10px] text-zinc-400 bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
              {discussions.length}
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Comment list */}
      <div ref={listRef} className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-zinc-400">Loading...</span>
          </div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4">
            <MessageSquare size={24} className="text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              No comments yet
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {topLevel.map((discussion) => (
              <div key={discussion.id}>
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
                {/* Replies */}
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
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2 relative">
        {/* @mention autocomplete dropdown */}
        {mentionQuery !== null && filteredMentions.length > 0 && (
          <div
            ref={mentionRef}
            className="absolute bottom-full left-2 right-2 mb-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg overflow-hidden z-10"
          >
            {filteredMentions.map((user, i) => (
              <button
                key={user.name}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent textarea blur
                  insertMention(user.name);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                  i === mentionIndex
                    ? "bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="font-medium">@{user.name}</span>
                <span className="text-[10px] text-zinc-400">{user.type}</span>
              </button>
            ))}
          </div>
        )}

        {/* Reply indicator */}
        {replyingTo && (
          <div className="flex items-center gap-1.5 mb-1.5 px-1">
            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
              Replying to comment
            </span>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-0.5 rounded text-zinc-400 hover:text-zinc-600"
            >
              <X size={10} />
            </button>
          </div>
        )}

        <div className="flex gap-1.5 items-end">
          <textarea
            ref={inputRef}
            value={body}
            onChange={handleInputChange}
            placeholder={replyingTo ? "Write a reply..." : "Add a comment... (@ to mention)"}
            rows={1}
            className="flex-1 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-600"
            onKeyDown={handleKeyDown}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || createMutation.isPending}
            className="p-1.5 rounded-md text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Send (⌘+Enter)"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 mt-1 px-1">
          {currentUser} · ⌘+Enter to send · @ to mention
        </p>
      </div>
    </div>
  );
}
