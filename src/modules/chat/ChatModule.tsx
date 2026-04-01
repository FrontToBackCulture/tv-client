// Chat module — unified team conversations anchored to entities
// Reuses the existing discussions system with a dedicated inbox + thread layout

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useThreads, useChatReadPositions, useUpsertReadPosition, type Thread } from "../../hooks/chat";
import { useCreateDiscussion } from "../../hooks/useDiscussions";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../stores/authStore";
import { useUsers } from "../../hooks/work";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { ChatInbox } from "./ChatInbox";
import { ChatThreadView } from "./ChatThreadView";
import { NewThreadModal } from "./NewThreadModal";

export function ChatModule() {
  const { data: threads = [] } = useThreads();
  const createMutation = useCreateDiscussion();

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
  const [showNewThread, setShowNewThread] = useState(false);

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

  async function handleDeleteThread(thread: Thread) {
    // Delete all discussions for this entity
    const { error } = await supabase
      .from("discussions")
      .delete()
      .eq("entity_type", thread.entity_type)
      .eq("entity_id", thread.entity_id);

    if (error) {
      console.error("Failed to delete thread:", error);
      return;
    }

    // Clear selection if we deleted the active thread
    if (selectedThread?.entity_id === thread.entity_id && selectedThread?.entity_type === thread.entity_type) {
      setSelectedThread(null);
    }

    // Refresh data
    queryClient.invalidateQueries({ queryKey: ["discussions"] });
    queryClient.invalidateQueries({ queryKey: ["chat"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function handleCreateThread(params: {
    title: string;
    body: string;
    entityType: string;
    entityId: string;
  }) {
    const result = await createMutation.mutateAsync({
      entity_type: params.entityType,
      entity_id: params.entityId,
      author: currentUser,
      body: params.body,
      title: params.title,
    });

    setShowNewThread(false);

    const newThread: Thread = {
      id: result.id,
      entity_type: params.entityType,
      entity_id: params.entityId,
      author: currentUser,
      body: params.body,
      title: params.title,
      created_at: result.created_at,
      last_activity_at: result.created_at,
      message_count: 1,
      last_author: currentUser,
      participants: [currentUser.toLowerCase()],
    };
    setSelectedThread(newThread);

    // Mark as read after cache settles so creator doesn't see unread dot
    setTimeout(() => {
      upsertReadPosition.mutate({ userId: currentUser, threadId: result.id });
    }, 500);
  }

  return (
    <div className="h-full flex bg-[var(--bg-page)] dark:bg-[var(--bg-page)]">
      {/* Left panel — inbox */}
      <div className="w-[280px] flex-shrink-0">
        <ChatInbox
          threads={threads}
          readPositions={readPositions}
          selectedThreadId={selectedThread?.id ?? null}
          currentUser={currentUser}
          onSelect={setSelectedThread}
          onNewThread={() => setShowNewThread(true)}
          onDeleteThread={handleDeleteThread}
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
              onClick={() => setShowNewThread(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-accent)] bg-[var(--color-teal-light)] dark:bg-[var(--color-teal-light)] rounded-lg hover:opacity-80 transition-opacity duration-150"
            >
              New thread
              <ArrowRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* New thread modal */}
      {showNewThread && (
        <NewThreadModal
          onClose={() => setShowNewThread(false)}
          onCreate={handleCreateThread}
        />
      )}
    </div>
  );
}
