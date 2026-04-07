// Floating chat popup for creating custom data sources via bot-mel conversation

import { useState, useEffect, useRef } from "react";
import { X, Brain, Loader2, Maximize2, Minimize2, Database, CheckCircle2, Table2 } from "lucide-react";
import { motion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useDiscussions, useCreateDiscussion } from "@/hooks/useDiscussions";
import { useCreateCustomDataSource, useUpdateCustomDataSource } from "@/hooks/scheduler";
import { useClaudeRunStore } from "@/stores/claudeRunStore";
import { handleBotMention } from "@/hooks/chat/botMentionHandler";
import { useCurrentUserId } from "@/hooks/work/useUsers";
import { BotChatComposer } from "./BotChatComposer";
import { cn } from "@/lib/cn";

interface Props {
  entityId: string;
  editingSourceId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

interface ParsedDatasource {
  name: string;
  description: string;
  sql_query: string;
}

function parseDatasourceBlock(body: string): ParsedDatasource | null {
  const match = body.match(/```datasource\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed.name && parsed.sql_query) return parsed;
  } catch {}
  return null;
}

export function DataSourceChatPopup({ entityId, editingSourceId, onClose, onDone }: Props) {
  const { data: messages = [] } = useDiscussions("general", entityId);
  const createMessage = useCreateDiscussion();
  const createCustomSource = useCreateCustomDataSource();
  const updateCustomSource = useUpdateCustomDataSource();
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const isEditing = !!editingSourceId;
  const [sizeLevel, setSizeLevel] = useState(0);
  const [addedSources, setAddedSources] = useState<Set<string>>(new Set());
  const [previewData, setPreviewData] = useState<{ name: string; rows: Record<string, unknown>[] } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Bot activity
  const runs = useClaudeRunStore((s) => s.runs);
  const activeRun = Object.values(runs).find(
    (r) => r.entityId === entityId && !r.isComplete
  );
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
      });
      console.log("[DataSourceChatPopup] message inserted", { id: inserted?.id, userId });
      if (!userId) {
        console.error("[DataSourceChatPopup] No userId — cannot trigger bot-mel handler");
        return;
      }
      if (inserted) {
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

  const [addError, setAddError] = useState<string | null>(null);

  async function handleAddOrUpdateSource(ds: ParsedDatasource) {
    setAddError(null);
    try {
      if (isEditing && editingSourceId) {
        // Update existing source
        await updateCustomSource.mutateAsync({
          id: editingSourceId,
          name: ds.name,
          description: ds.description ?? undefined,
          sql_query: ds.sql_query,
        });
        setAddedSources((prev) => new Set([...prev, ds.name]));
        return;
      }

      // Check if already exists (from auto-detection)
      const { data: existing } = await supabase
        .from("custom_data_sources")
        .select("id")
        .eq("name", ds.name)
        .limit(1);

      if (existing && existing.length > 0) {
        setAddedSources((prev) => new Set([...prev, ds.name]));
        return;
      }

      await createCustomSource.mutateAsync({
        name: ds.name,
        description: ds.description,
        sql_query: ds.sql_query,
      });
      setAddedSources((prev) => new Set([...prev, ds.name]));
    } catch (e: any) {
      const msg = e?.message || e?.toString?.() || JSON.stringify(e);
      setAddError(msg);
      console.error("Failed to save source:", e);
    }
  }

  async function handlePreview(ds: ParsedDatasource) {
    try {
      const { data, error } = await supabase.rpc("execute_custom_query", {
        query_text: ds.sql_query,
      });
      if (error) {
        console.error("Preview query error:", error);
        return;
      }
      setPreviewData({ name: ds.name, rows: (data as Record<string, unknown>[]) ?? [] });
    } catch (e) {
      console.error("Preview failed:", e);
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-purple-500" />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{isEditing ? "Edit Data Source" : "Create Data Source"}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSizeLevel((v) => (v + 1) % 3)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors" title="Resize">
            {sizeLevel === 2 ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button onClick={onDone} className="text-[10px] px-2 py-0.5 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors">Done</button>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><X size={14} /></button>
        </div>
      </div>

      {/* Preview table overlay */}
      {previewData && (
        <div className="absolute inset-0 z-10 bg-white dark:bg-zinc-950 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <Table2 size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{previewData.name}</span>
              <span className="text-[10px] text-zinc-400">{previewData.rows.length} rows</span>
            </div>
            <button onClick={() => setPreviewData(null)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-auto">
            {previewData.rows.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                  <tr>
                    {Object.keys(previewData.rows[0]).map((col) => (
                      <th key={col} className="px-3 py-1.5 text-left font-medium text-zinc-600 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-[200px] truncate">
                          {val == null ? <span className="text-zinc-300 dark:text-zinc-600">—</span> : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-zinc-400">No data returned</div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => {
          const isBot = msg.author.startsWith("bot-");
          const ds = isBot ? parseDatasourceBlock(msg.body) : null;
          const bodyWithoutDs = ds ? msg.body.replace(/```datasource[\s\S]*?```/, "").trim() : msg.body;
          const cleanBody = bodyWithoutDs.replace(/^@\S+\s*/, "");

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

              {/* Datasource card */}
              {ds && (
                <div className="mt-2 ml-0 p-3 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 space-y-2">
                  <div className="flex items-center gap-2">
                    <Database size={14} className="text-amber-500" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{ds.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{ds.description}</p>
                  <pre className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                    {ds.sql_query}
                  </pre>
                  <div className="flex flex-wrap items-center gap-2">
                    {addedSources.has(ds.name) ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={12} /> {isEditing ? "Updated" : "Added to sources"}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAddOrUpdateSource(ds)}
                        disabled={createCustomSource.isPending || updateCustomSource.isPending}
                        className="text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                      >
                        {(createCustomSource.isPending || updateCustomSource.isPending)
                          ? "Saving..."
                          : isEditing ? "Update source" : "Add as source"}
                      </button>
                    )}
                    <button
                      onClick={() => handlePreview(ds)}
                      className="text-xs px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                    >
                      Preview data
                    </button>
                    {addError && <span className="text-[10px] text-red-500">{addError}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Bot activity */}
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

      {/* Input */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 shrink-0">
        <BotChatComposer
          onSubmit={handleSend}
          placeholder="Describe what data you want..."
          disabled={!!activeRun || createMessage.isPending}
        />
      </div>
    </motion.div>
  );
}
