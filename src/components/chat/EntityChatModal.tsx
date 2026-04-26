// Centered, focused chat modal scoped to whatever entity the user is looking
// at. Triggered by Cmd+J. Persists conversations in the same `discussions`
// table the corner popups use, but with a unified entity_id pattern:
//   entity-chat:{type}:{entity_id}
//
// botMentionHandler.ts routes any entity_id starting with `entity-chat:` to
// the Agent SDK sidecar, with tools/system-prompt loaded from entityChatConfig.
//
// This modal does NOT replace ProjectChatPopup or TaskChatPopup — both keep
// working with their existing `project-chat:` / `task-chat:` thread IDs.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Brain, Loader2, PanelLeft, PanelRight, Square } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useSelectedEntityStore } from "../../stores/selectedEntityStore";
import { useSelectedEntity } from "../../hooks/useSelectedEntity";
import { useDiscussions, useCreateDiscussion } from "../../hooks/useDiscussions";
import { useClaudeRunStore } from "../../stores/claudeRunStore";
import { handleBotMention } from "../../hooks/chat/botMentionHandler";
import { useCurrentUserId, useCurrentUserName } from "../../hooks/work/useUsers";
import { useCreateNotification } from "../../hooks/useNotifications";
import { getEntityChatConfig } from "../../lib/entityChatConfig";
import { BotChatComposer } from "../../modules/scheduler/canvas/panels/BotChatComposer";
import { cn } from "../../lib/cn";

type LayoutMode = "center" | "left" | "right";
const LAYOUT_STORAGE_KEY = "tv-client-entitychat-layout";

function readLayout(): LayoutMode {
  if (typeof window === "undefined") return "center";
  const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
  return stored === "left" || stored === "right" ? stored : "center";
}

function writeLayout(layout: LayoutMode) {
  if (typeof window !== "undefined") localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
}

const MARKDOWN_STYLE =
  "text-[14px] leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_strong]:font-semibold [&_em]:italic [&_h1]:text-base [&_h1]:font-semibold [&_h1]:my-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:my-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-1 [&_a]:text-teal-500 [&_a]:underline [&_code]:bg-zinc-200 dark:[&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_pre]:bg-zinc-100 dark:[&_pre]:bg-zinc-900 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-400 [&_blockquote]:pl-3 [&_blockquote]:italic [&_table]:my-2 [&_th]:font-semibold [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-300 dark:[&_th]:border-zinc-700 [&_td]:border [&_td]:border-zinc-300 dark:[&_td]:border-zinc-700";

export function EntityChatModal() {
  const open = useSelectedEntityStore((s) => s.chatModalOpen);
  const closeChatModal = useSelectedEntityStore((s) => s.closeChatModal);
  const entity = useSelectedEntity();
  const [layout, setLayoutState] = useState<LayoutMode>(() => readLayout());
  const setLayout = (l: LayoutMode) => {
    setLayoutState(l);
    writeLayout(l);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChatModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeChatModal]);

  if (!open) return null;

  const isCentered = layout === "center";

  // Portal to body so no ancestor `transform` (motion, popovers, etc.) breaks
  // our `position: fixed` positioning.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={cn(
            "fixed inset-0 z-[80] flex",
            isCentered ? "items-center justify-center p-8" : "pointer-events-none",
          )}
        >
          {isCentered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-black/40 pointer-events-auto"
              onClick={closeChatModal}
            />
          )}
          <div
            className={cn(
              "relative z-[81] flex pointer-events-auto",
              isCentered && "w-full h-full items-center justify-center",
              layout === "left" && "h-full",
              layout === "right" && "h-full ml-auto",
            )}
          >
            {entity ? (
              <EntityChatBody
                key={`${entity.type}:${entity.id}:${layout}`}
                entity={entity}
                onClose={closeChatModal}
                layout={layout}
                onLayoutChange={setLayout}
              />
            ) : (
              <NoEntityState onClose={closeChatModal} />
            )}
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function NoEntityState({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.96 }}
      transition={{ type: "spring", damping: 26, stiffness: 320 }}
      className="w-[520px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-7"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-purple-50 dark:bg-purple-950/40 p-2.5">
          <Brain size={20} className="text-purple-500" />
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">No entity selected</div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
            Open a project, deal, task, company, or contact, then press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">⌘J</kbd>{" "}
            to chat about it.
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
          <X size={18} />
        </button>
      </div>
    </motion.div>
  );
}

interface BodyProps {
  entity: NonNullable<ReturnType<typeof useSelectedEntity>>;
  onClose: () => void;
  layout: LayoutMode;
  onLayoutChange: (l: LayoutMode) => void;
}

// Extract @mentions from a message body — anything matching @\w[\w-]*
function extractMentions(body: string): string[] {
  const matches = body.match(/@([\w-]+)/g) ?? [];
  return matches.map((m) => m.slice(1).toLowerCase());
}

function EntityChatBody({ entity, onClose, layout, onLayoutChange }: BodyProps) {
  const config = getEntityChatConfig(entity.type);
  const entityId = `entity-chat:${entity.type}:${entity.id}`;

  const { data: messages = [] } = useDiscussions("general", entityId);
  const createMessage = useCreateDiscussion();
  const createNotification = useCreateNotification();
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const userName = useCurrentUserName();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const runs = useClaudeRunStore((s) => s.runs);
  const liveRun = Object.values(runs).find((r) => r.entityId === entityId && !r.isComplete);

  const [snapshotMsgCount, setSnapshotMsgCount] = useState<number | null>(null);
  useEffect(() => {
    if (liveRun) setSnapshotMsgCount(messages.length);
  }, [liveRun?.id]);
  useEffect(() => {
    if (snapshotMsgCount !== null && messages.length > snapshotMsgCount) {
      setSnapshotMsgCount(null);
    }
  }, [messages.length, snapshotMsgCount]);

  const latestRun = Object.values(runs)
    .filter((r) => r.entityId === entityId)
    .sort((a, b) => (a.events.at(-1)?.timestamp ?? 0) - (b.events.at(-1)?.timestamp ?? 0))
    .at(-1);
  const activeRun = liveRun ?? (snapshotMsgCount !== null ? latestRun : undefined);
  const recentEvents =
    activeRun?.events
      .filter((e) => e.type === "tool_use" || e.type === "text" || e.type === "init")
      .slice(-4) ?? [];

  async function handleSend(body: string) {
    const trimmed = body.trim();
    if (!trimmed || !userName || createMessage.isPending) return;

    // Mention semantics:
    //   plain text                     → auto @bot-mel, bot fires
    //   "@darren ..."                  → no auto-mention, bot stays silent,
    //                                    darren gets notified
    //   "@bot-mel @darren ..."         → bot fires AND darren notified
    const hasAnyMention = /@[\w-]+/.test(trimmed);
    const finalBody = hasAnyMention ? trimmed : `@bot-mel ${trimmed}`;
    const shouldFireBot = /@bot-\w+/.test(finalBody);

    try {
      const inserted = await createMessage.mutateAsync({
        entity_type: "general",
        entity_id: entityId,
        author: userName,
        body: finalBody,
        parent_id: messages[0]?.id ?? undefined,
        origin: "project",
      } as any);

      // Fire notifications for any human (non-bot, non-self) mentioned.
      const mentions = extractMentions(finalBody);
      const preview = finalBody.length > 100 ? finalBody.slice(0, 100) + "..." : finalBody;
      const notified = new Set<string>();
      for (const recipient of mentions) {
        if (notified.has(recipient)) continue;
        if (recipient.startsWith("bot-")) continue; // bots aren't notified
        if (recipient === userName.toLowerCase()) continue;
        notified.add(recipient);
        createNotification.mutate({
          recipient,
          type: "mention",
          discussion_id: inserted?.id,
          entity_type: "general",
          entity_id: entityId,
          actor: userName,
          body_preview: preview,
        } as any);
      }

      if (shouldFireBot && userId && inserted) {
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

  const containerClass =
    layout === "center"
      ? "w-full h-full max-w-[960px] max-h-[820px] rounded-2xl border border-zinc-200 dark:border-zinc-800"
      : layout === "left"
        ? "w-[520px] h-full rounded-r-2xl border-r border-y border-zinc-200 dark:border-zinc-800"
        : "w-[520px] h-full rounded-l-2xl border-l border-y border-zinc-200 dark:border-zinc-800";

  const motionInitial =
    layout === "center"
      ? { opacity: 0, y: 12, scale: 0.98 }
      : layout === "left"
        ? { opacity: 0, x: -40 }
        : { opacity: 0, x: 40 };
  const motionAnimate =
    layout === "center" ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, x: 0 };
  const motionExit = motionInitial;

  return (
    <motion.div
      initial={motionInitial}
      animate={motionAnimate}
      exit={motionExit}
      transition={{ type: "spring", damping: 28, stiffness: 360 }}
      className={cn(
        "bg-white dark:bg-zinc-950 shadow-2xl flex flex-col overflow-hidden",
        containerClass,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/70 dark:border-zinc-800/70 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-full bg-purple-50 dark:bg-purple-950/40 p-2 shrink-0">
            <Brain size={16} className="text-purple-500" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{config.label}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{entity.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 mr-1 p-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900">
            <button
              onClick={() => onLayoutChange("left")}
              title="Dock left"
              className={cn(
                "p-1 rounded",
                layout === "left"
                  ? "bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                  : "text-zinc-400 hover:text-zinc-600",
              )}
            >
              <PanelLeft size={13} />
            </button>
            <button
              onClick={() => onLayoutChange("center")}
              title="Center"
              className={cn(
                "p-1 rounded",
                layout === "center"
                  ? "bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                  : "text-zinc-400 hover:text-zinc-600",
              )}
            >
              <Square size={13} />
            </button>
            <button
              onClick={() => onLayoutChange("right")}
              title="Dock right"
              className={cn(
                "p-1 rounded",
                layout === "right"
                  ? "bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                  : "text-zinc-400 hover:text-zinc-600",
              )}
            >
              <PanelRight size={13} />
            </button>
          </div>
          <kbd className="text-[10px] px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">esc</kbd>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages — Claude.ai-style: user bubbled right, bot flows full width */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-6 py-8 space-y-8">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white mb-4">
                <Brain size={22} />
              </div>
              <div className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
                Chat about {entity.name}
              </div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-md">
                bot-mel is scoped to this {entity.type}. Ask anything — I'll only act on
                this entity unless you say otherwise.
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isBot = msg.author.startsWith("bot-");
            const cleanBody = msg.body
              .replace(/^@\S+\s*/, "")
              .replace(/\[\[[\w]+:[^|\]]+(?:\|[^\]]+)?\]\]/g, "");

            if (isBot) {
              // Assistant: flows full-width, no bubble, just a small header.
              return (
                <div key={msg.id} className="flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white">
                      <Brain size={14} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{msg.author}</div>
                    <div className={cn(MARKDOWN_STYLE, "text-zinc-800 dark:text-zinc-100")}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanBody}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            }

            // User: right-aligned subtle bubble.
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 text-[14px] leading-7 whitespace-pre-wrap">
                  {cleanBody}
                </div>
              </div>
            );
          })}

          {activeRun && (
            <div className="flex gap-3">
              <div className="shrink-0 mt-0.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white animate-pulse">
                  <Brain size={14} />
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">bot-mel</div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  <Loader2 size={12} className="animate-spin" />
                  <span>working...</span>
                </div>
                <div className="space-y-1">
                  {recentEvents.map((event, i) => (
                    <div
                      key={`${event.timestamp}-${i}`}
                      className={`text-xs font-mono truncate ${
                        i === recentEvents.length - 1
                          ? "text-zinc-600 dark:text-zinc-300"
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}
                    >
                      {event.type === "tool_use" && <span className="text-teal-500">{"› "}</span>}
                      {event.content.slice(0, 140)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer — anchored bottom, no divider (Claude/ChatGPT style) */}
      <div className="shrink-0 bg-white dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-[760px]">
          <BotChatComposer
            onSubmit={handleSend}
            placeholder={`Message bot-mel about this ${entity.type}...`}
            disabled={!!activeRun || createMessage.isPending}
          />
          <div className="px-3 pb-2 text-[10px] text-zinc-400 dark:text-zinc-600 text-center">
            <kbd className="px-1 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">enter</kbd> send ·{" "}
            <kbd className="px-1 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">shift+enter</kbd> newline ·{" "}
            <kbd className="px-1 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">esc</kbd> close
          </div>
        </div>
      </div>
    </motion.div>
  );
}
