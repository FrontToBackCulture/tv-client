// Thread conversation view — messages with grouped authorship and entity context

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Hash, MessageSquare, Loader2, Sparkles, Brain, Copy, Check } from "lucide-react";
import { useClaudeRunStore } from "../../stores/claudeRunStore";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { useDiscussions, useCreateDiscussion, useUpdateDiscussion, useDeleteDiscussion } from "../../hooks/useDiscussions";
import { useCreateNotification } from "../../hooks/useNotifications";
import { useCreateDiscussionMention, type EntitySearchResult } from "../../hooks/chat";
import { useAuth } from "../../stores/authStore";
import { useUsers } from "../../hooks/work";
import { supabase } from "../../lib/supabase";
import { DiscussionItem } from "../../components/discussions/DiscussionItem";
import { ChatComposer } from "./ChatComposer";
import { ChatEntityCard } from "./ChatEntityCard";
import { SkillChips } from "./SkillChips";
import { EntityRefProvider } from "./entityRefs/EntityRefContext";
import { EntityActionSheet } from "./entityRefs/EntityActionSheet";
import { useEntityRefs } from "./entityRefs/useEntityRefs";
import type { EntityRef } from "./entityRefs/parseEntityRefs";
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
  const queryClient = useQueryClient();

  const listRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState<string | null>(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [copiedSession, setCopiedSession] = useState(false);
  const [openEntity, setOpenEntity] = useState<EntityRef | null>(null);

  // Batch-fetch entity data for all refs across all messages in this thread
  const allBodies = useMemo(() => (discussions ?? []).map((d) => d.body).join("\n"), [discussions]);
  const { data: entities } = useEntityRefs(allBodies);

  const copySessionId = useCallback(async () => {
    if (!thread.session_id) return;
    try {
      await navigator.clipboard.writeText(thread.session_id);
      setCopiedSession(true);
      setTimeout(() => setCopiedSession(false), 1500);
    } catch (err) {
      console.error("Failed to copy session id:", err);
    }
  }, [thread.session_id]);

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

  // Roll up agent metrics across every bot reply in this thread that has them.
  // Only SDK-routed runs persist agent_metrics, so this naturally skips
  // legacy CLI replies and human messages.
  const threadMetrics = useMemo(() => {
    if (!discussions) return null;
    let cost = 0;
    let duration = 0;
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheCreate = 0;
    let count = 0;
    for (const d of discussions) {
      const m = d.agent_metrics;
      if (!m) continue;
      count += 1;
      cost += m.cost_usd ?? 0;
      duration += m.duration_ms ?? 0;
      input += m.input_tokens ?? 0;
      output += m.output_tokens ?? 0;
      cacheRead += m.cache_read_tokens ?? 0;
      cacheCreate += m.cache_creation_tokens ?? 0;
    }
    if (count === 0) return null;
    return { cost, duration, input, output, cacheRead, cacheCreate, count };
  }, [discussions]);
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

  // Generate thread title using Claude Haiku
  const generateTitle = useCallback(async () => {
    if (!discussions || discussions.length === 0) return;
    setIsGeneratingTitle(true);
    try {
      const apiKey = await invoke<string | null>("settings_get_anthropic_key");
      if (!apiKey) {
        console.error("No Anthropic API key configured");
        return;
      }

      // Gather conversation content (first 20 messages)
      const messages = discussions.slice(0, 20).map((d) =>
        `${d.author}: ${d.body}`
      ).join("\n");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 60,
          messages: [{
            role: "user",
            content: `Generate a short, descriptive title (max 8 words) for this conversation thread. Return ONLY the title, nothing else.\n\nConversation:\n${messages}`,
          }],
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const title = data.content?.[0]?.text?.trim();
      if (!title) return;

      // Update the title on the first (oldest) discussion in this entity group
      const oldest = [...discussions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )[0];

      await supabase
        .from("discussions")
        .update({ title })
        .eq("id", oldest.id);

      // Refresh
      queryClient.invalidateQueries({ queryKey: ["discussions"] });
      queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
    } catch (err) {
      console.error("Failed to generate title:", err);
    } finally {
      setIsGeneratingTitle(false);
    }
  }, [discussions, queryClient]);

  async function handleSubmit(body: string, entityMentions: EntitySearchResult[], attachments?: string[]) {
    const result = await createMutation.mutateAsync({
      entity_type: thread.entity_type,
      entity_id: thread.entity_id,
      author: currentUser,
      body,
      parent_id: replyingTo || undefined,
      ...(attachments?.length ? { attachments } : {}),
    });

    const mentions = parseMentions(body);
    const preview = body.length > 100 ? body.slice(0, 100) + "..." : body;
    const notifiedUsers = new Set<string>();

    // Resolve team mentions to individual members
    const resolvedMentions: string[] = [];
    for (const mentioned of mentions) {
      // Check if this is a team slug
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user:users(name)")
        .eq("team_id", (
          await supabase.from("teams").select("id").eq("slug", mentioned).limit(1)
        ).data?.[0]?.id || "__none__");

      if (teamMembers && teamMembers.length > 0) {
        // It's a team — fan out to all members
        for (const tm of teamMembers) {
          const memberName = (tm.user as unknown as { name: string })?.name;
          if (memberName) resolvedMentions.push(memberName.toLowerCase());
        }
      } else {
        // It's a regular user mention
        resolvedMentions.push(mentioned.toLowerCase());
      }
    }

    for (const recipient of resolvedMentions) {
      if (notifiedUsers.has(recipient)) continue;
      if (recipient === currentUser.toLowerCase()) continue;
      notifiedUsers.add(recipient);
      createNotification.mutate({
        recipient,
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

    // Mark thread as read after cache settles so sender doesn't see unread dot
    // Delay ensures last_read_at is set after last_activity_at refreshes
    setTimeout(() => onMarkRead(), 500);
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
    <EntityRefProvider entities={entities} onOpen={(ref) => setOpenEntity(ref)}>
    <div className="relative flex flex-col h-full bg-[var(--bg-page)] dark:bg-[var(--bg-page)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] flex items-center justify-center flex-shrink-0">
          <Hash size={13} className="text-[var(--text-muted)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-[15px] text-[var(--text-primary)] truncate leading-tight">
              {threadTitle}
            </h2>
            <button
              onClick={generateTitle}
              disabled={isGeneratingTitle || !discussions?.length}
              className="flex-shrink-0 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-teal-light)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
              title="Generate title with AI"
            >
              {isGeneratingTitle ? (
                <Loader2 size={12} className="animate-spin text-[var(--color-accent)]" />
              ) : (
                <Sparkles size={12} />
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {isAnchored && (
              <ChatEntityCard entityType={thread.entity_type} entityId={thread.entity_id} />
            )}
            {discussions && (
              <span className="text-[10px] text-[var(--text-muted)]">
                {discussions.length} message{discussions.length !== 1 ? "s" : ""}
              </span>
            )}
            {threadMetrics && (
              <span
                title={[
                  `${threadMetrics.count} bot ${threadMetrics.count === 1 ? "reply" : "replies"}`,
                  `cost: $${threadMetrics.cost.toFixed(6)}`,
                  `duration: ${(threadMetrics.duration / 1000).toFixed(1)}s`,
                  `input: ${threadMetrics.input.toLocaleString()}`,
                  `output: ${threadMetrics.output.toLocaleString()}`,
                  threadMetrics.cacheRead ? `cache read: ${threadMetrics.cacheRead.toLocaleString()}` : null,
                  threadMetrics.cacheCreate ? `cache write: ${threadMetrics.cacheCreate.toLocaleString()}` : null,
                ]
                  .filter(Boolean)
                  .join("\n")}
                className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[10px] font-mono text-[var(--text-muted)] cursor-help"
              >
                <span>
                  {threadMetrics.cost === 0
                    ? "$0"
                    : threadMetrics.cost < 0.01
                      ? `$${threadMetrics.cost.toFixed(4)}`
                      : `$${threadMetrics.cost.toFixed(3)}`}
                </span>
                <span className="opacity-40">·</span>
                <span>
                  {threadMetrics.input >= 1000
                    ? `${(threadMetrics.input / 1000).toFixed(threadMetrics.input >= 10000 ? 0 : 1)}k`
                    : threadMetrics.input}{" "}
                  in /{" "}
                  {threadMetrics.output >= 1000
                    ? `${(threadMetrics.output / 1000).toFixed(threadMetrics.output >= 10000 ? 0 : 1)}k`
                    : threadMetrics.output}{" "}
                  out
                </span>
              </span>
            )}
            {thread.session_id && (
              <button
                onClick={copySessionId}
                title={`Claude Code session — click to copy\n${thread.session_id}`}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--color-accent)] transition-colors"
              >
                <span className="truncate max-w-[110px]">{thread.session_id.slice(0, 8)}</span>
                {copiedSession ? (
                  <Check size={10} className="text-[var(--color-accent)]" />
                ) : (
                  <Copy size={10} />
                )}
              </button>
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
          <div className="py-2">
            {(() => {
              // Flatten all messages in order: top-level interleaved with their replies
              const allMessages: { discussion: typeof topLevel[0]; isReply: boolean }[] = [];
              for (const discussion of topLevel) {
                allMessages.push({ discussion, isReply: false });
                const replies = repliesByParent.get(discussion.id) ?? [];
                for (const reply of replies) {
                  allMessages.push({ discussion: reply, isReply: true });
                }
              }

              return allMessages.map(({ discussion, isReply: isReplyMsg }, i) => {
                // Determine if this is a continuation from the same author
                const prev = i > 0 ? allMessages[i - 1] : null;
                const isContinuation = !isReplyMsg && prev && !prev.isReply &&
                  prev.discussion.author === discussion.author &&
                  // Only group if within 5 minutes of each other
                  (new Date(discussion.created_at).getTime() - new Date(prev.discussion.created_at).getTime()) < 5 * 60 * 1000;

                return (
                  <div
                    key={discussion.id}
                    className="animate-fade-slide-in"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  >
                    <DiscussionItem
                      discussion={discussion}
                      currentUser={currentUser}
                      currentUserAliases={currentUserAliases}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      onReply={isReplyMsg ? undefined : (parentId) => setReplyingTo(parentId)}
                      isReply={isReplyMsg}
                      isContinuation={!!isContinuation}
                    />
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Inline bot activity — shown when bot-mel is processing in this thread */}
      <BotActivityIndicator entityId={thread.entity_id} />

      {/* Skill suggestion chips — relevant skills for this thread context */}
      <SkillChips
        entityType={thread.entity_type}
        entityId={thread.entity_id}
        recentMessages={(discussions ?? []).slice(-5).map((d) => d.body)}
        bot="bot-mel"
        onInvoke={(text) => setPrefillText(text)}
      />

      {/* Composer */}
      <ChatComposer
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSubmit={handleSubmit}
        disabled={createMutation.isPending}
        prefillText={prefillText}
        onPrefillConsumed={() => setPrefillText(null)}
      />

      {/* Entity action sheet — slides up when an inline entity card is clicked */}
      <EntityActionSheet
        entityRef={openEntity}
        entities={entities}
        onClose={() => setOpenEntity(null)}
      />
    </div>
    </EntityRefProvider>
  );
}

/** Inline bot activity — shows Claude's tool use and progress within the chat thread */
function BotActivityIndicator({ entityId }: { entityId: string }) {
  const runs = useClaudeRunStore((s) => s.runs);

  // Find the active (or just-completed) run for this thread
  const activeRun = Object.values(runs).find(
    (r) => r.entityId === entityId && !r.isComplete
  );

  if (!activeRun) return null;

  // Show the last few meaningful events
  const recentEvents = activeRun.events
    .filter((e) => e.type === "tool_use" || e.type === "text" || e.type === "init")
    .slice(-5);

  return (
    <div className="px-5 py-3 border-t border-[var(--border-default)] bg-[var(--bg-surface)] animate-fade-slide-in">
      <div className="flex items-center gap-2 mb-2">
        <Brain size={14} className="text-purple-400 animate-pulse" />
        <span className="text-[12px] font-medium text-purple-400">bot-mel is working...</span>
        <Loader2 size={12} className="text-[var(--text-muted)] animate-spin" />
      </div>
      {recentEvents.length > 0 && (
        <div className="ml-[22px] space-y-1">
          {recentEvents.map((event, i) => {
            const isLatest = i === recentEvents.length - 1;
            return (
              <div
                key={`${event.timestamp}-${i}`}
                className={`text-[11px] font-mono truncate ${
                  isLatest ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)] opacity-50"
                }`}
              >
                {event.type === "tool_use" && <span className="text-[var(--color-accent)]">{">"} </span>}
                {event.content.slice(0, 120)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
