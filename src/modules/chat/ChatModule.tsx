// Chat module — unified team conversations anchored to entities
// Reuses the existing discussions system with a dedicated inbox + thread layout

import { useState, useEffect, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/PageHeader";
import { useThreads, useChatReadPositions, useUpsertReadPosition, type Thread } from "../../hooks/chat";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../stores/authStore";
import { useUsers } from "../../hooks/work";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { ChatInbox } from "./ChatInbox";
import { ChatThreadView } from "./ChatThreadView";

export function ChatModule() {
  const { data: threads = [], isLoading: threadsLoading } = useThreads();

  // Resolve current user for read positions
  const authUser = useAuth((s) => s.user);
  const { data: allUsers = [] } = useUsers();
  const currentUserFromAuth = authUser?.name || authUser?.login || "unknown";
  const matchedUser = allUsers.find(
    (u) => u.github_username === authUser?.login || u.microsoft_email === authUser?.login || u.name === currentUserFromAuth
  );
  const currentUser = matchedUser?.name || currentUserFromAuth;

  const { data: readPositions = new Map() } = useChatReadPositions(currentUser);
  const upsertReadPosition = useUpsertReadPosition();

  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);

  // Keep selected thread data fresh
  useEffect(() => {
    if (selectedThread) {
      const fresh = threads.find((t) => t.id === selectedThread.id);
      if (fresh) setSelectedThread(fresh);
    }
  }, [threads]);

  // Handle notification navigation into chat
  const navTarget = useNotificationNavStore((s) => s.target);
  const clearNavTarget = useNotificationNavStore((s) => s.clearTarget);
  useEffect(() => {
    if (navTarget && navTarget.entityType === "general") {
      const thread = threads.find((t) => t.entity_id === navTarget.entityId);
      if (thread) {
        setSelectedThread(thread);
        clearNavTarget();
      }
    }
  }, [navTarget, threads, clearNavTarget]);

  const handleMarkRead = useCallback(() => {
    if (selectedThread) {
      upsertReadPosition.mutate({ userId: currentUser, threadId: selectedThread.id });
    }
  }, [selectedThread, currentUser, upsertReadPosition]);

  const queryClient = useQueryClient();

  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  async function handleDeleteThread(thread: Thread) {
    setDeletingThreadId(thread.entity_id);
    const { error } = await supabase
      .from("discussions")
      .delete()
      .eq("entity_type", thread.entity_type)
      .eq("entity_id", thread.entity_id);

    if (error) {
      console.error("Failed to delete thread:", error);
      setDeletingThreadId(null);
      return;
    }

    if (selectedThread?.entity_id === thread.entity_id && selectedThread?.entity_type === thread.entity_type) {
      setSelectedThread(null);
    }

    queryClient.invalidateQueries({ queryKey: ["discussions"] });
    queryClient.invalidateQueries({ queryKey: ["chat"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    setDeletingThreadId(null);
  }

  async function handleBulkDeleteThreads(threadsToDelete: Thread[]) {
    setIsBulkDeleting(true);

    // Build OR filter for all entity_type+entity_id pairs
    const conditions = threadsToDelete.map(
      (t) => `and(entity_type.eq.${t.entity_type},entity_id.eq.${t.entity_id})`
    );
    const { error } = await supabase
      .from("discussions")
      .delete()
      .or(conditions.join(","));

    if (error) {
      console.error("Failed to bulk delete threads:", error);
      setIsBulkDeleting(false);
      return;
    }

    // Clear selection if the active thread was deleted
    if (selectedThread && threadsToDelete.some(
      (t) => t.entity_id === selectedThread.entity_id && t.entity_type === selectedThread.entity_type
    )) {
      setSelectedThread(null);
    }

    queryClient.invalidateQueries({ queryKey: ["discussions"] });
    queryClient.invalidateQueries({ queryKey: ["chat"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    setIsBulkDeleting(false);
  }

  function handleNewThread() {
    // Create an empty General thread immediately — no modal, just start typing
    const entityId = crypto.randomUUID();
    const newThread: Thread = {
      id: "", // placeholder — real ID assigned on first message
      entity_type: "general",
      entity_id: entityId,
      author: currentUser,
      body: "",
      title: null,
      session_id: null,
      origin: "direct",
      created_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      message_count: 0,
      last_author: currentUser,
      participants: [currentUser.toLowerCase()],
    };
    setSelectedThread(newThread);
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-page)] dark:bg-[var(--bg-page)]">
      <PageHeader description="Team conversations anchored to entities, visible to everyone and AI." />
      <div className="flex-1 flex overflow-hidden">
      {/* Left panel — inbox */}
      <div className="w-[280px] flex-shrink-0">
        <ChatInbox
          threads={threads}
          readPositions={readPositions}
          selectedThreadId={selectedThread?.id ?? null}
          currentUser={currentUser}
          isLoading={threadsLoading}
          deletingThreadId={deletingThreadId}
          onSelect={setSelectedThread}
          onNewThread={handleNewThread}
          onDeleteThread={handleDeleteThread}
          onBulkDeleteThreads={handleBulkDeleteThreads}
          isBulkDeleting={isBulkDeleting}
        />
      </div>

      {/* Right panel — thread view or empty state */}
      <div className="flex-1 min-w-0">
        {selectedThread ? (
          <ChatThreadView
            thread={selectedThread}
            onMarkRead={handleMarkRead}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            {/* Ambient glow */}
            <div className="relative">
              <div className="absolute inset-0 blur-[80px] opacity-[0.08] bg-[var(--color-accent)] rounded-full w-[200px] h-[200px] -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--color-teal-light)] to-[var(--bg-muted)] flex items-center justify-center mb-5">
                <MessageSquare size={22} className="text-[var(--color-accent)]" />
              </div>
            </div>
            <h3 className="font-heading text-lg text-[var(--text-primary)] mb-1">
              Team Chat
            </h3>
            <p className="text-[12px] text-[var(--text-muted)] max-w-[260px] leading-relaxed">
              Conversations about your data — visible to the whole team and AI. Select a thread or start a new one.
            </p>
            <button
              onClick={handleNewThread}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-accent)] bg-[var(--color-teal-light)] dark:bg-[var(--color-teal-light)] rounded-lg hover:opacity-80 transition-opacity duration-150"
            >
              New thread
            </button>
          </div>
        )}
      </div>

      </div>
    </div>
  );
}
