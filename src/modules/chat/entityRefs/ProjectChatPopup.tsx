// Floating chat popup scoped to a specific project or deal.
// User talks to bot-mel about the project — bot-mel has MCP tools to
// update the project, log activities, save attachments, etc.

import { useState, useEffect, useRef } from "react";
import { X, Brain, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useDiscussions, useCreateDiscussion } from "../../../hooks/useDiscussions";
import { useClaudeRunStore } from "../../../stores/claudeRunStore";
import { handleBotMention } from "../../../hooks/chat/botMentionHandler";
import { useCurrentUserId } from "../../../hooks/work/useUsers";
import { useRepository } from "../../../stores/repositoryStore";
import { BotChatComposer } from "../../scheduler/canvas/panels/BotChatComposer";
import { cn } from "../../../lib/cn";

// Module-level dedup across StrictMode remounts — once we've seeded a given
// project chat, never seed it again in the same page load.
const seededEntityIds = new Set<string>();

interface Props {
  projectId: string;
  projectName: string;
  projectType: "project" | "deal";
  folderPath?: string | null;
  /** Optional: resume a specific session. Defaults to the legacy single-session id. */
  sessionEntityId?: string;
  onClose: () => void;
}

export function ProjectChatPopup({ projectId, projectName, projectType, folderPath, sessionEntityId, onClose }: Props) {
  const entityId = sessionEntityId ?? `project-chat:${projectId}`;
  const { data: messages = [] } = useDiscussions("general", entityId);
  const createMessage = useCreateDiscussion();
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const { activeRepository } = useRepository();
  const knowledgeRoot = activeRepository?.path ?? "";
  const [sizeLevel, setSizeLevel] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (initialized || messages.length > 0) {
      if (messages.length > 0) setInitialized(true);
      return;
    }
    if (seededEntityIds.has(entityId)) return;
    seededEntityIds.add(entityId);
    (async () => {
      const attachmentsAbs = folderPath && knowledgeRoot
        ? `${knowledgeRoot}/${folderPath}/attachments`
        : null;

      const folderInstructions = attachmentsAbs
        ? `

## Attachments folder (absolute path)
\`${attachmentsAbs}\`

When I attach screenshots or files, they get uploaded to Supabase storage and appear in my messages as markdown links like \`![name.png](https://<supabase>/storage/v1/object/public/chat-attachments/<file>)\`. To save them to this project's attachments folder:

1. Extract the URL(s) from my message.
2. Make sure the folder exists: \`mkdir -p "${attachmentsAbs}"\`
3. Download each file with curl, giving it a descriptive name: \`curl -sL "<url>" -o "${attachmentsAbs}/<descriptive-name>.<ext>"\`
4. Verify: \`ls -la "${attachmentsAbs}/"\`
5. Log an activity on the project mentioning what was saved and why.

Always use absolute paths for file operations. The project has many folders for different purposes — attachments live specifically in the \`attachments/\` subfolder.`
        : `

## Project folder
This project has no folder_path set. If I ask to save files, tell me to set the project's folder_path first (Projects → Manage → this project → Folder Path field).`;

      const refTag = `[[${projectType}:${projectId}|UPDATE]]`;
      const initialBody = `@bot-mel I'm looking at the ${projectType} ${refTag} "${projectName}". I may ask you to update its fields, log activities, or attach files. All actions should be scoped to this specific ${projectType}.${folderInstructions}

Acknowledge briefly and wait for my instructions.`;

      const { data: inserted, error } = await supabase
        .from("discussions")
        .insert({
          entity_type: "general",
          entity_id: entityId,
          author: "mel-tv",
          body: initialBody,
          title: `${projectType === "deal" ? "Deal" : "Project"}: ${projectName}`,
          origin: "project",
        })
        .select()
        .single();

      if (error || !inserted) {
        console.error("Failed to seed project chat:", error);
        return;
      }
      setInitialized(true);

      if (userId) {
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
    })();
  }, [entityId, projectId, projectName, projectType, userId, initialized, messages.length, queryClient, folderPath, knowledgeRoot]);

  const runs = useClaudeRunStore((s) => s.runs);
  const activeRun = Object.values(runs).find((r) => r.entityId === entityId && !r.isComplete);
  const recentEvents = activeRun?.events
    .filter((e) => e.type === "tool_use" || e.type === "text" || e.type === "init")
    .slice(-4) ?? [];

  async function handleSend(body: string) {
    const trimmed = body.trim();
    if (!trimmed || createMessage.isPending) return;
    const finalBody = /@bot-\w+/.test(trimmed) ? trimmed : `@bot-mel ${trimmed}`;
    try {
      const inserted = await createMessage.mutateAsync({
        entity_type: "general",
        entity_id: entityId,
        author: "mel-tv",
        body: finalBody,
        parent_id: messages[0]?.id ?? undefined,
        origin: "project",
      } as any);
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

  const sizes = [
    { w: "w-[420px]", h: "h-[500px]" },
    { w: "w-[640px]", h: "h-[600px]" },
    { w: "w-[880px]", h: "h-[720px]" },
  ];
  const { w: width, h: height } = sizes[sizeLevel];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={cn(
        "fixed bottom-6 right-6 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl flex flex-col z-[60] overflow-hidden transition-all duration-200",
        width,
        height,
      )}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Brain size={14} className="text-purple-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {projectType === "deal" ? "Deal Chat" : "Project Chat"}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{projectName}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSizeLevel((v) => (v + 1) % 3)}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            title="Resize"
          >
            {sizeLevel === 2 ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !initialized && (
          <div className="flex items-center justify-center h-full text-xs text-zinc-400">
            <Loader2 size={14} className="animate-spin mr-2" /> Starting chat...
          </div>
        )}

        {messages.map((msg) => {
          const isBot = msg.author.startsWith("bot-");
          const cleanBody = msg.body
            .replace(/^@\S+\s*/, "")
            .replace(/\[\[[\w]+:[^|\]]+(?:\|[^\]]+)?\]\]/g, "");

          return (
            <div key={msg.id} className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-xs whitespace-pre-wrap",
                  sizeLevel >= 1 ? "max-w-[80%]" : "max-w-[90%]",
                  isBot
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                    : "bg-teal-600 text-white",
                )}
              >
                {isBot && (
                  <span className="text-[10px] font-medium text-purple-500 dark:text-purple-400 block mb-1">
                    {msg.author}
                  </span>
                )}
                {cleanBody}
              </div>
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
                <div
                  key={`${event.timestamp}-${i}`}
                  className={`text-[10px] font-mono truncate ${
                    i === recentEvents.length - 1 ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-400 opacity-50"
                  }`}
                >
                  {event.type === "tool_use" && <span className="text-teal-500">{"> "}</span>}
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
          placeholder="Tell bot-mel what to update..."
          disabled={!!activeRun || createMessage.isPending || !initialized}
        />
      </div>
    </motion.div>
  );
}
