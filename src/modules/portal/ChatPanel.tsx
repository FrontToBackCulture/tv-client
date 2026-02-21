// src/modules/portal/ChatPanel.tsx

import { useState, useRef, useEffect } from "react";
import { X, Send, Eye, EyeOff, CheckCircle } from "lucide-react";
import {
  useConversation,
  useMessages,
  useSendMessage,
  useUpdateConversation,
} from "../../hooks/portal";
import { useAuth } from "../../stores/authStore";
import { cn } from "../../lib/cn";
import { EmptyState } from "../../components/EmptyState";
import type { Message } from "../../lib/portal/types";

interface ChatPanelProps {
  conversationId: string;
  onClose: () => void;
}

export function ChatPanel({ conversationId, onClose }: ChatPanelProps) {
  const { user } = useAuth();
  const { data: conversation } = useConversation(conversationId);
  const { data: messages } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const updateConversation = useUpdateConversation();

  const [input, setInput] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const content = input.trim();
    setInput("");

    try {
      await sendMessage.mutateAsync({
        conversation_id: conversationId,
        sender_type: "agent",
        sender_id: user?.id?.toString(),
        sender_name: user?.name || user?.login || "Agent",
        content,
        content_type: isInternal ? "internal_note" : "text",
      });
    } catch (err) {
      console.error("[portal] Failed to send message:", err);
      setInput(content); // Restore input on failure
    }

    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleResolve = () => {
    updateConversation.mutate({
      id: conversationId,
      status: "resolved",
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {conversation?.customer_name || "Anonymous"}
          </div>
          {conversation?.customer_email && (
            <div className="text-[11px] text-zinc-400 truncate">
              {conversation.customer_email}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {conversation?.status !== "resolved" &&
            conversation?.status !== "closed" && (
              <button
                onClick={handleResolve}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 rounded transition-colors"
                title="Resolve conversation"
              >
                <CheckCircle size={13} />
                Resolve
              </button>
            )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(!messages || messages.length === 0) && (
          <EmptyState message="No messages yet" className="mt-8" />
        )}

        {messages?.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-zinc-200 dark:border-zinc-800 p-3">
        {/* Internal note toggle */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setIsInternal(!isInternal)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border transition-colors",
              isInternal
                ? "border-amber-400 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400"
            )}
          >
            {isInternal ? <EyeOff size={11} /> : <Eye size={11} />}
            {isInternal ? "Internal note" : "Reply"}
          </button>
          {isInternal && (
            <span className="text-[10px] text-amber-500">
              Only visible to your team
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isInternal ? "Add internal note..." : "Type a reply..."
            }
            rows={1}
            className={cn(
              "flex-1 px-3 py-2 text-sm border rounded-lg resize-none bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none",
              isInternal
                ? "border-amber-300 dark:border-amber-500/40 focus:border-amber-500"
                : "border-zinc-200 dark:border-zinc-700 focus:border-teal-500"
            )}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
            className={cn(
              "px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50",
              isInternal
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-teal-600 hover:bg-teal-500"
            )}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isCustomer = message.sender_type === "customer";
  const isInternal = message.content_type === "internal_note";
  const isSystem = message.sender_type === "system";

  if (isSystem) {
    return (
      <div className="text-center text-[11px] text-zinc-400 py-1">
        {message.content}
      </div>
    );
  }

  return (
    <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[80%] px-3 py-2 rounded-lg",
          isInternal
            ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200"
            : isCustomer
              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              : "bg-teal-600 text-white"
        )}
      >
        {/* Sender name */}
        <div
          className={cn(
            "text-[11px] font-medium mb-0.5",
            isInternal
              ? "text-amber-600 dark:text-amber-400"
              : isCustomer
                ? "text-zinc-500"
                : "text-white/70"
          )}
        >
          {isInternal && "🔒 "}
          {message.sender_name || (isCustomer ? "Customer" : "Agent")}
        </div>

        {/* Content */}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>

        {/* Timestamp */}
        <div
          className={cn(
            "text-[10px] mt-1",
            isInternal
              ? "text-amber-500/60"
              : isCustomer
                ? "text-zinc-400"
                : "text-white/50"
          )}
        >
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
