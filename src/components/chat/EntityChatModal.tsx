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

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { X, Brain, Loader2, PanelLeft, PanelRight, Square, StopCircle } from "lucide-react";
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
import { getEntityChatConfig, getModuleChatConfig } from "../../lib/entityChatConfig";
import { resolveBot } from "../../lib/botRouting";
import { ActiveAgentsRail } from "./ActiveAgentsRail";
import { useBotSettingsStore } from "../../stores/botSettingsStore";
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

// Per-bot palette used by the avatar (gradient) and author label (text color).
// Mirrors the colors in DiscussionItem so the Chat module + the modal agree.
const BOT_PALETTE: Record<string, { gradient: string; text: string }> = {
  "bot-mel":      { gradient: "from-purple-500 to-purple-700",   text: "text-purple-500" },
  "bot-delivery": { gradient: "from-emerald-500 to-emerald-700", text: "text-emerald-500" },
  "bot-sales":    { gradient: "from-amber-500 to-amber-700",     text: "text-amber-600" },
  "bot-domain":   { gradient: "from-cyan-500 to-cyan-700",       text: "text-cyan-500" },
  "bot-builder":  { gradient: "from-blue-500 to-blue-700",       text: "text-blue-500" },
};

function botPalette(name: string) {
  return BOT_PALETTE[name] ?? BOT_PALETTE["bot-mel"];
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
                // Re-key on entity only — NOT on layout. Swapping layout used
                // to remount the body, which created a brief overlap of old +
                // new motion.divs (the "two modals visible at once" bug).
                key={`${entity.type}:${entity.id}`}
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

interface RunEvent {
  type: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown> | null;
}

function ActivityEvent({ event }: { event: RunEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isExpandable = event.type === "tool_use" || event.type === "tool_result" || event.type === "thinking";
  const meta = event.metadata as { input?: unknown; tool?: string } | undefined;

  if (event.type === "thinking") {
    return (
      <div className="text-[11px] italic text-zinc-500 dark:text-zinc-400">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-left w-full hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <span className="text-purple-400 mr-1">∴</span>
          {expanded ? event.content : event.content.slice(0, 160) + (event.content.length > 160 ? "…" : "")}
        </button>
      </div>
    );
  }

  if (event.type === "tool_use") {
    return (
      <div className="text-[11px] font-mono">
        <button
          onClick={() => isExpandable && setExpanded((v) => !v)}
          className="text-left w-full text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
        >
          <span>› {event.content}</span>
        </button>
        {expanded && meta?.input != null && (
          <pre className="mt-1 ml-3 text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap break-all bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded p-1.5 max-h-[200px] overflow-auto">
            {JSON.stringify(meta.input, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  if (event.type === "tool_result") {
    const truncated = event.content.length > 200;
    return (
      <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
        <button
          onClick={() => truncated && setExpanded((v) => !v)}
          className="text-left w-full hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          <span className="text-green-600 dark:text-green-500 mr-1">✓</span>
          <span className="whitespace-pre-wrap">
            {expanded ? event.content : event.content.slice(0, 200) + (truncated ? " …" : "")}
          </span>
        </button>
      </div>
    );
  }

  if (event.type === "error") {
    return (
      <div className="text-[11px] text-red-600 dark:text-red-400">
        <span className="mr-1">⚠</span>
        {event.content}
      </div>
    );
  }

  if (event.type === "text") {
    return (
      <div className="text-[11px] text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
        {event.content.slice(0, 240)}
        {event.content.length > 240 && "…"}
      </div>
    );
  }

  // init / other
  return <div className="text-[11px] text-zinc-400 dark:text-zinc-600">{event.content}</div>;
}

function EntityChatBody({ entity, onClose, layout, onLayoutChange }: BodyProps) {
  // Use the per-module config when the scope is module-level (e.g. CRM Chat,
  // Companies Chat) instead of the generic "Module Chat" fallback.
  const config = entity.type === "module"
    ? getModuleChatConfig(entity.id)
    : getEntityChatConfig(entity.type);
  const entityId = `entity-chat:${entity.type}:${entity.id}`;
  // Show which specialist bot will actually handle this scope. Same routing
  // logic that botMentionHandler uses, so the header is truthful.
  const routingOverrides = useBotSettingsStore((s) => s.routingOverrides);
  const resolvedBot = resolveBot(
    {
      entityType: entity.type,
      id: entity.id,
      subtype: entity.subtype,
    },
    routingOverrides,
  );

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

  const stopRun = useCallback(async () => {
    if (!liveRun) return;
    try {
      await invoke("agent_run_cancel", { runId: liveRun.id });
    } catch (e) {
      console.error("[EntityChatModal] cancel failed:", e);
    }
  }, [liveRun]);

  // Esc while a run is active stops the run instead of closing the modal.
  // Capture phase so we beat the parent's Esc-to-close handler.
  useEffect(() => {
    if (!liveRun) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        void stopRun();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [liveRun, stopRun]);
  // Surface every event type so the user can see what the agent is actually
  // doing (thinking, tool calls + args, tool results, errors).
  const allEvents =
    activeRun?.events.filter(
      (e) => e.type === "thinking" || e.type === "tool_use" || e.type === "tool_result" || e.type === "text" || e.type === "init" || e.type === "error",
    ) ?? [];
  const [showAllEvents, setShowAllEvents] = useState(false);
  const visibleEvents = showAllEvents ? allEvents : allEvents.slice(-6);

  async function handleSend(body: string, attachmentUrls?: string[]) {
    const trimmed = body.trim();
    if ((!trimmed && !attachmentUrls?.length) || !userName || createMessage.isPending) return;

    // Mention check must ignore @-strings inside markdown image syntax (`![alt](url)`)
    // and inside URLs — filenames like `CleanShot 09.35@2x.png` were tripping the
    // regex and stopping the bot from auto-firing.
    const stripped = trimmed
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\bhttps?:\/\/\S+/g, "");
    const hasAnyMention = /@[\w-]+/.test(stripped);
    const finalBody = hasAnyMention ? trimmed : `@bot-mel ${trimmed}`;
    const shouldFireBot = /@bot-\w+/.test(stripped) || !hasAnyMention;

    try {
      const inserted = await createMessage.mutateAsync({
        entity_type: "general",
        entity_id: entityId,
        author: userName,
        body: finalBody,
        parent_id: messages[0]?.id ?? undefined,
        origin: "project",
        ...(attachmentUrls?.length ? { attachments: attachmentUrls } : {}),
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
            attachments: attachmentUrls ?? [],
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

  // Rail visibility — persisted globally so it survives layout swaps and restarts.
  // Default: hidden in center (room is tight), shown in docked modes.
  const [showRail, setShowRail] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("tv-client-entitychat-rail");
    if (stored === "true") return true;
    if (stored === "false") return false;
    return layout !== "center";
  });
  const setShowRailPersisted = (v: boolean) => {
    setShowRail(v);
    if (typeof window !== "undefined") localStorage.setItem("tv-client-entitychat-rail", String(v));
  };

  // Bump container width when the rail is open so the conversation column
  // doesn't shrink uncomfortably.
  const containerClass =
    layout === "center"
      ? cn(
          "w-full h-full max-h-[820px] rounded-2xl border border-zinc-200 dark:border-zinc-800",
          showRail ? "max-w-[1180px]" : "max-w-[960px]",
        )
      : layout === "left"
        ? cn(
            "h-full rounded-r-2xl border-r border-y border-zinc-200 dark:border-zinc-800",
            showRail ? "w-[760px]" : "w-[520px]",
          )
        : cn(
            "h-full rounded-l-2xl border-l border-y border-zinc-200 dark:border-zinc-800",
            showRail ? "w-[760px]" : "w-[520px]",
          );

  // No per-layout motion animation here — layout swaps are pure CSS class
  // changes. Mount/unmount animation lives on the outer wrapper (the
  // backdrop fades in/out via AnimatePresence). Animating the body too
  // caused old + new motion.divs to coexist briefly when switching dock
  // direction, producing a visible "two modals" flash.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "bg-white dark:bg-zinc-950 shadow-2xl flex flex-row overflow-hidden",
        containerClass,
      )}
    >
      <ActiveAgentsRail
        collapsed={!showRail}
        onToggle={() => setShowRailPersisted(!showRail)}
        currentEntityId={entityId}
        layout={layout}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/70 dark:border-zinc-800/70 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("rounded-full p-2 shrink-0 bg-gradient-to-br text-white", botPalette(resolvedBot).gradient)}>
            <Brain size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{config.label}</div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                → {resolvedBot}
              </span>
            </div>
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
              <div className={cn("w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center text-white mb-4", botPalette(resolvedBot).gradient)}>
                <Brain size={22} />
              </div>
              <div className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
                Chat about {entity.name}
              </div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-md">
                {resolvedBot} is scoped to this {entity.type}. Ask anything — I'll only
                act on this entity unless you say otherwise.
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isBot = msg.author.startsWith("bot-");
            // Pull image URLs out of the body so we can render them as
            // thumbnails (instead of leaving raw `![filename](url)` markdown
            // visible on the user bubble).
            const inlineImages: string[] = [];
            const cleanBody = msg.body
              .replace(/^@\S+\s*/, "")
              .replace(/\[\[[\w]+:[^|\]]+(?:\|[^\]]+)?\]\]/g, "")
              .replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_m, url) => {
                inlineImages.push(url);
                return "";
              })
              .trim();
            // De-dupe: composer appends `![](url)` for the same URLs it stores
            // in `attachments`, so we'd render each image twice without this.
            const seen = new Set<string>();
            const allImages = [...(msg.attachments ?? []), ...inlineImages].filter((url) => {
              if (seen.has(url)) return false;
              seen.add(url);
              return true;
            });

            if (isBot) {
              const palette = botPalette(msg.author);
              // Assistant: flows full-width, no bubble, just a small header.
              return (
                <div key={msg.id} className="flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    <div className={cn("w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white", palette.gradient)}>
                      <Brain size={14} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className={cn("text-xs font-semibold mb-1", palette.text)}>{msg.author}</div>
                    <div className={cn(MARKDOWN_STYLE, "text-zinc-800 dark:text-zinc-100")}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanBody}</ReactMarkdown>
                    </div>
                    {allImages.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {allImages.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                            <img
                              src={url}
                              alt=""
                              loading="lazy"
                              className="max-h-44 max-w-xs rounded-lg border border-zinc-200 dark:border-zinc-800 object-cover hover:opacity-90 transition-opacity"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // User: right-aligned subtle bubble.
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] flex flex-col items-end gap-2">
                  {cleanBody && (
                    <div className="rounded-2xl px-4 py-3 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 text-[14px] leading-7 whitespace-pre-wrap">
                      {cleanBody}
                    </div>
                  )}
                  {allImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-end">
                      {allImages.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={url}
                            alt=""
                            loading="lazy"
                            className="max-h-44 max-w-xs rounded-lg border border-zinc-200 dark:border-zinc-800 object-cover hover:opacity-90 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {activeRun && (
            <div className="flex gap-3">
              <div className="shrink-0 mt-0.5">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white",
                    botPalette(resolvedBot).gradient,
                    !activeRun.isComplete && "animate-pulse",
                  )}
                >
                  <Brain size={14} />
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn("text-xs font-semibold", botPalette(resolvedBot).text)}>{resolvedBot}</div>
                  {!activeRun.isComplete && (
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Loader2 size={11} className="animate-spin" />
                      <span>working ({allEvents.length} steps)</span>
                    </div>
                  )}
                  {!activeRun.isComplete && (
                    <button
                      onClick={() => void stopRun()}
                      title="Stop (Esc)"
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[10px] text-zinc-600 dark:text-zinc-300 hover:border-red-400 hover:text-red-500 transition-colors"
                    >
                      <StopCircle size={11} />
                      <span>stop</span>
                    </button>
                  )}
                  {allEvents.length > 6 && (
                    <button
                      onClick={() => setShowAllEvents((v) => !v)}
                      className="ml-auto text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    >
                      {showAllEvents ? "Collapse" : `Show all ${allEvents.length}`}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-2.5 max-h-[400px] overflow-y-auto">
                  {visibleEvents.map((event, i) => (
                    <ActivityEvent key={`${event.timestamp}-${i}`} event={event} />
                  ))}
                  {visibleEvents.length === 0 && (
                    <div className="text-xs text-zinc-400 italic">starting…</div>
                  )}
                </div>
                {activeRun.isComplete && (
                  <div className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-600 flex items-center gap-3">
                    {activeRun.durationMs > 0 && <span>{(activeRun.durationMs / 1000).toFixed(1)}s</span>}
                    {activeRun.costUsd > 0 && <span>${activeRun.costUsd.toFixed(3)}</span>}
                    <span>{allEvents.length} steps</span>
                    {activeRun.isError && <span className="text-red-500">errored</span>}
                  </div>
                )}
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
      </div>
    </motion.div>
  );
}
