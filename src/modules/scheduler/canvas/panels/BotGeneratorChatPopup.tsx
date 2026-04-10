// Generic floating chat popup for generating content via bot-mel conversation
// Used by DataSource (SQL queries) and AiProcess (system prompts) nodes

import { useState, useEffect, useRef } from "react";
import { X, Brain, Loader2, Maximize2, Minimize2, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { useDiscussions, useCreateDiscussion } from "@/hooks/useDiscussions";
import { useClaudeRunStore } from "@/stores/claudeRunStore";
import { handleBotMention } from "@/hooks/chat/botMentionHandler";
import { useCurrentUserId, useCurrentUserName } from "@/hooks/work/useUsers";
import { BotChatComposer } from "./BotChatComposer";
import { cn } from "@/lib/cn";

interface Props {
  entityId: string;
  /** The title shown in the popup header (e.g. "Create Data Source", "Edit Instructions") */
  title: string;
  /** The fenced code block tag to look for in bot replies (e.g. "datasource", "instruction") */
  blockTag: string;
  /** Label for the apply button (e.g. "Add as source", "Apply instructions") */
  applyLabel: string;
  /** Called when the user clicks apply on a parsed block. Return true on success. */
  onApply: (content: string) => Promise<boolean> | boolean;
  /** Render function for the parsed block preview card */
  renderBlock?: (content: string) => React.ReactNode;
  onClose: () => void;
  onDone: () => void;
}

export function BotGeneratorChatPopup({
  entityId, title, blockTag, applyLabel, onApply, renderBlock, onClose, onDone,
}: Props) {
  const { data: messages = [] } = useDiscussions("general", entityId);
  const createMessage = useCreateDiscussion();
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const userName = useCurrentUserName();
  const [sizeLevel, setSizeLevel] = useState(0);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const runs = useClaudeRunStore((s) => s.runs);
  const activeRun = Object.values(runs).find(
    (r) => r.entityId === entityId && !r.isComplete
  );
  const recentEvents = activeRun?.events
    .filter((e) => e.type === "tool_use" || e.type === "text" || e.type === "init")
    .slice(-4) ?? [];

  async function handleSend(body: string) {
    const trimmed = body.trim();
    if (!trimmed || !userName || createMessage.isPending) return;
    const finalBody = /@bot-\w+/.test(trimmed) ? trimmed : `@bot-mel ${trimmed}`;
    try {
      const inserted = await createMessage.mutateAsync({
        entity_type: "general",
        entity_id: entityId,
        author: userName,
        body: finalBody,
        parent_id: messages[0]?.id ?? undefined,
      });
      if (userId && inserted) {
        handleBotMention(
          {
            id: inserted.id,
            entity_type: inserted.entity_type,
            entity_id: inserted.entity_id,
            body: inserted.body,
            author: inserted.author,
            parent_id: inserted.parent_id,
            attachments: [],
          },
          userId,
          queryClient,
          "bot-mel",
        ).catch((err) => console.error("[bot-mel] Handler error:", err));
      }
    } catch (e) {
      console.error("Failed to send:", e);
    }
  }

  function extractBlock(body: string): string | null {
    const re = new RegExp("```" + blockTag + "\\s*([\\s\\S]*?)```");
    const match = body.match(re);
    return match ? match[1].trim() : null;
  }

  async function handleApply(content: string, messageId: string) {
    setIsApplying(true);
    setError(null);
    try {
      const ok = await onApply(content);
      if (ok) setApplied((prev) => new Set([...prev, messageId]));
    } catch (e: any) {
      setError(e?.message || "Failed to apply");
    } finally {
      setIsApplying(false);
    }
  }

  const sizes = [
    { w: "w-[420px]", h: "h-[450px]" },
    { w: "w-[650px]", h: "h-[550px]" },
    { w: "w-[900px]", h: "h-[700px]" },
  ];
  const { w: width, h: height } = sizes[sizeLevel];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={cn(
        "absolute bottom-4 right-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden transition-all duration-200",
        width, height,
      )}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-purple-500" />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSizeLevel((v) => (v + 1) % 3)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            {sizeLevel === 2 ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button onClick={onDone} className="text-[10px] px-2 py-0.5 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors">Done</button>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><X size={14} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => {
          const isBot = msg.author.startsWith("bot-");
          const block = isBot ? extractBlock(msg.body) : null;
          const bodyWithoutBlock = block
            ? msg.body.replace(new RegExp("```" + blockTag + "[\\s\\S]*?```"), "").trim()
            : msg.body;
          const cleanBody = bodyWithoutBlock.replace(/^@\S+\s*/, "");

          return (
            <div key={msg.id}>
              <div className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
                <div className={cn(
                  "rounded-lg px-3 py-2 text-xs",
                  sizeLevel >= 1 ? "max-w-[80%]" : "max-w-[90%]",
                  isBot
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                    : "bg-teal-600 text-white"
                )}>
                  {isBot && (
                    <span className="text-[10px] font-medium text-purple-500 dark:text-purple-400 block mb-1">{msg.author}</span>
                  )}
                  {cleanBody && <p className="whitespace-pre-wrap">{cleanBody}</p>}
                </div>
              </div>

              {block && (
                <div className="mt-2 p-3 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 space-y-2">
                  {renderBlock ? renderBlock(block) : (
                    <pre className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                      {block}
                    </pre>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {applied.has(msg.id) ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={12} /> Applied
                      </span>
                    ) : (
                      <button
                        onClick={() => handleApply(block, msg.id)}
                        disabled={isApplying}
                        className="text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                      >
                        {isApplying ? "Applying..." : applyLabel}
                      </button>
                    )}
                    {error && <span className="text-[10px] text-red-500">{error}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {activeRun && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-lg px-3 py-2 bg-zinc-100 dark:bg-zinc-800">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain size={10} className="text-purple-400 animate-pulse" />
                <span className="text-[10px] font-medium text-purple-400">bot-mel is working...</span>
                <Loader2 size={10} className="text-zinc-400 animate-spin" />
              </div>
              {recentEvents.map((event, i) => (
                <div key={`${event.timestamp}-${i}`} className={`text-[10px] font-mono truncate ${i === recentEvents.length - 1 ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-400 opacity-50"}`}>
                  {event.type === "tool_use" && <span className="text-teal-500">{">"} </span>}
                  {event.content.slice(0, 100)}
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 shrink-0">
        <BotChatComposer
          onSubmit={handleSend}
          placeholder="Describe what you want..."
          disabled={!!activeRun || createMessage.isPending}
        />
      </div>
    </motion.div>
  );
}
