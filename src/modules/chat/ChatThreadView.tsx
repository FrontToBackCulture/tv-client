// Thread conversation view — messages with grouped authorship and entity context

import { useRef, useEffect, useState, useMemo } from "react";
import { Hash, MessageSquare, Loader2 } from "lucide-react";
import { useDiscussions, useCreateDiscussion, useUpdateDiscussion, useDeleteDiscussion } from "../../hooks/useDiscussions";
import { useCreateNotification } from "../../hooks/useNotifications";
import { useCreateDiscussionMention, type EntitySearchResult } from "../../hooks/chat";
import { useAuth } from "../../stores/authStore";
import { useUsers } from "../../hooks/work";
import { DiscussionItem } from "../../components/discussions/DiscussionItem";
import { ChatComposer } from "./ChatComposer";
import { ChatEntityCard } from "./ChatEntityCard";
import type { Thread } from "../../hooks/chat";

function parseMentions(text: string): string[] {
  const matches = text.match(/@([\w-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

interface ChatThreadViewProps {
  thread: Thread;
  onMarkRead: () => void;
}

export function ChatThreadView({ thread, onMarkRead }: ChatThreadViewProps) {
  const { data: discussions, isLoading } = useDiscussions(thread.entity_type, thread.entity_id);
  const createMutation = useCreateDiscussion();
  const updateMutation = useUpdateDiscussion();
  const deleteMutation = useDeleteDiscussion();
  const createNotification = useCreateNotification();
  const createMention = useCreateDiscussionMention();

  const listRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const authUser = useAuth((s) => s.user);
  const { data: allUsers = [] } = useUsers();
  const currentUserFromAuth = authUser?.name || authUser?.login || "unknown";
  const matchedUser = allUsers.find(
    (u) => u.github_username === authUser?.login || u.microsoft_email === authUser?.login || u.name === currentUserFromAuth
  );
  const currentUser = matchedUser?.name || currentUserFromAuth;
  const currentUserAliases = [
    authUser?.login, authUser?.name, matchedUser?.name, matchedUser?.github_username, matchedUser?.microsoft_email
  ].filter((n): n is string => !!n && n !== currentUser);

  useEffect(() => {
    onMarkRead();
  }, [thread.id, discussions?.length]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [discussions?.length]);

  const topLevel = useMemo(
    () => discussions?.filter((d) => !d.parent_id) ?? [],
    [discussions]
  );
  const repliesByParent = useMemo(() => {
    const map = new Map<string, typeof discussions>();
    discussions?.forEach((d) => {
      if (d.parent_id) {
        const existing = map.get(d.parent_id) || [];
        existing.push(d);
        map.set(d.parent_id, existing);
      }
    });
    return map;
  }, [discussions]);

  async function handleSubmit(body: string, entityMentions: EntitySearchResult[]) {
    const result = await createMutation.mutateAsync({
      entity_type: thread.entity_type,
      entity_id: thread.entity_id,
      author: currentUser,
      body,
      parent_id: replyingTo || undefined,
    });

    const mentions = parseMentions(body);
    const preview = body.length > 100 ? body.slice(0, 100) + "..." : body;
    const notifiedUsers = new Set<string>();

    for (const mentioned of mentions) {
      notifiedUsers.add(mentioned.toLowerCase());
      createNotification.mutate({
        recipient: mentioned,
        type: "mention",
        discussion_id: result.id,
        entity_type: thread.entity_type,
        entity_id: thread.entity_id,
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
          entity_type: thread.entity_type,
          entity_id: thread.entity_id,
          actor: currentUser,
          body_preview: preview,
        });
      }
    }

    for (const em of entityMentions) {
      createMention.mutate({
        discussion_id: result.id,
        mention_type: em.type,
        mention_ref: em.id,
      });
    }

    setReplyingTo(null);
  }

  function handleUpdate(id: string, newBody: string) {
    updateMutation.mutate({ id, body: newBody });
  }

  function handleDelete(id: string) {
    deleteMutation.mutate({ id, entity_type: thread.entity_type, entity_id: thread.entity_id });
  }

  const isAnchored = thread.entity_type !== "general";
  const threadTitle = thread.title || thread.body.slice(0, 60) || "Untitled thread";

  return (
    <div className="flex flex-col h-full bg-[var(--bg-page)] dark:bg-[var(--bg-page)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] flex items-center justify-center flex-shrink-0">
          <Hash size={13} className="text-[var(--text-muted)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-[15px] text-[var(--text-primary)] truncate leading-tight">
            {threadTitle}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            {isAnchored && (
              <ChatEntityCard entityType={thread.entity_type} entityId={thread.entity_id} />
            )}
            {discussions && (
              <span className="text-[10px] text-[var(--text-muted)]">
                {discussions.length} message{discussions.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Message list */}
      <div ref={listRef} className="flex-1 overflow-auto scrollbar-auto-hide">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="text-[var(--color-accent)] animate-spin" />
          </div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--color-teal-light)] to-[var(--bg-muted)] flex items-center justify-center mb-4">
              <MessageSquare size={20} className="text-[var(--color-accent)]" />
            </div>
            <p className="text-[13px] font-medium text-[var(--text-secondary)]">
              Start the conversation
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-[240px]">
              Messages here are visible to your team and AI assistants
            </p>
          </div>
        ) : (
          <div className="px-3 py-2">
            {topLevel.map((discussion, i) => (
              <div
                key={discussion.id}
                className="animate-fade-slide-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <DiscussionItem
                  discussion={discussion}
                  currentUser={currentUser}
                  currentUserAliases={currentUserAliases}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onReply={(parentId) => setReplyingTo(parentId)}
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

      {/* Composer */}
      <ChatComposer
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSubmit={handleSubmit}
        disabled={createMutation.isPending}
      />
    </div>
  );
}
