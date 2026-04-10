// Data source config panel — DIO sources or Skill picker

import { useState } from "react";
import { X, Database, Trash2, MessageCircle, Loader2, Shield, Table2, Eye, Sparkles } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCustomDataSources,
  useDeleteCustomDataSource,
  useUpdateCustomDataSource,
} from "@/hooks/scheduler";
import { handleBotMention } from "@/hooks/chat/botMentionHandler";
import { useCurrentUserId, useCurrentUserName } from "@/hooks/work/useUsers";
import { supabase } from "@/lib/supabase";
import { DataSourceChatPopup } from "./DataSourceChatPopup";
import type { DataSourceConfig } from "../types";

interface Props {
  config: DataSourceConfig;
  onChange: (config: DataSourceConfig) => void;
}

export function DataSourceConfigPanel({ config, onChange }: Props) {
  return <DioSources config={config} onChange={onChange} />;
}

// ---------------------------------------------------------------------------
// DIO: unified data source list (system + custom)
// ---------------------------------------------------------------------------

function DioSources({ config, onChange }: { config: DataSourceConfig; onChange: (c: DataSourceConfig) => void }) {
  const selectedCustomIds = new Set(config.custom_source_ids ?? []);
  const { data: allSources = [] } = useCustomDataSources();
  const deleteCustomSource = useDeleteCustomDataSource();
  const updateCustomSource = useUpdateCustomDataSource();
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  const userName = useCurrentUserName();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ name: string; sql: string; rows: Record<string, unknown>[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [chatEntityId, setChatEntityId] = useState<string | null>(() => {
    try { return localStorage.getItem("tv-datasource-chat-entity") || null; } catch { return null; }
  });
  const [editingSourceId, setEditingSourceId] = useState<string | null>(() => {
    try { return localStorage.getItem("tv-datasource-chat-editing") || null; } catch { return null; }
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  function toggleSource(id: string) {
    const current = config.custom_source_ids ?? [];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    onChange({ ...config, custom_source_ids: next });
  }

  async function openChat(initialMessage: string, title: string, sourceId?: string) {
    if (!userName) return;
    setIsCreating(true);
    try {
      const entityId = `datasource-gen:${crypto.randomUUID()}`;
      const body = `@bot-mel ${initialMessage}`;
      const { data: inserted, error } = await supabase
        .from("discussions")
        .insert({
          entity_type: "general",
          entity_id: entityId,
          author: userName,
          body,
          title,
        })
        .select()
        .single();
      if (error || !inserted) { console.error("Failed to create chat:", error); return; }

      localStorage.setItem("tv-datasource-chat-entity", entityId);
      if (sourceId) localStorage.setItem("tv-datasource-chat-editing", sourceId);
      else localStorage.removeItem("tv-datasource-chat-editing");
      setChatEntityId(entityId);
      setEditingSourceId(sourceId ?? null);
      setChatOpen(true);

      // Directly invoke the bot mention handler — bypass realtime subscription
      // which can be dropped/inconsistent
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
    } finally {
      setIsCreating(false);
    }
  }

  function handleCreateNew() {
    openChat(
      "I want to create a custom data source. Read the file _skills/generate-custom-data-source/SKILL.md (relative to the tv-knowledge root directory) and follow its workflow step by step. Ask me what data I need.",
      "New Custom Data Source",
    );
  }

  function handleEditSource(src: typeof allSources[0]) {
    openChat(
      `I want to modify an existing data source. Read the file _skills/generate-custom-data-source/SKILL.md (relative to the tv-knowledge root directory) and follow its workflow.\n\nCurrent source:\n- Name: ${src.name}\n- Description: ${src.description}\n- SQL: ${src.sql_query}\n\nAsk me what I want to change.`,
      `Edit: ${src.name}`,
      src.id,
    );
  }

  function startRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
  }

  async function saveRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    const current = allSources.find((s) => s.id === renamingId);
    if (trimmed && current && trimmed !== current.name) {
      try {
        await updateCustomSource.mutateAsync({ id: renamingId, name: trimmed });
      } catch (e) {
        console.error("Failed to rename source:", e);
      }
    }
    setRenamingId(null);
    setRenameValue("");
  }

  async function handlePreview(src: typeof allSources[0]) {
    setPreviewingId(src.id);
    setIsLoadingPreview(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      const { data, error } = await supabase.rpc("execute_custom_query", { query_text: src.sql_query });
      if (error) {
        setPreviewError(error.message);
      } else {
        setPreviewData({ name: src.name, sql: src.sql_query, rows: (data as Record<string, unknown>[]) ?? [] });
      }
    } catch (e: any) {
      setPreviewError(e?.message || "Failed to execute query");
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function handleDeleteSource(id: string) {
    try {
      await deleteCustomSource.mutateAsync(id);
      const next = (config.custom_source_ids ?? []).filter((x) => x !== id);
      onChange({ ...config, custom_source_ids: next });
    } catch (e) {
      console.error("Failed to delete source:", e);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Data Sources</h3>

        {/* All sources in one list */}
        <div className="space-y-1">
          {allSources.map((src) => (
            <label key={src.id} className="flex items-start gap-3 py-1.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedCustomIds.has(src.id)}
                onChange={() => toggleSource(src.id)}
                className="mt-0.5 rounded border-zinc-200 dark:border-zinc-800 text-teal-600 focus:ring-teal-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {src.is_system
                    ? <Shield size={10} className="text-blue-500 dark:text-blue-400 shrink-0" />
                    : <Database size={10} className="text-amber-500 dark:text-amber-400 shrink-0" />}
                  {renamingId === src.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={saveRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename();
                        if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                      }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      className="text-sm bg-transparent border-b border-teal-500 outline-none text-zinc-900 dark:text-zinc-100 px-0 py-0 w-full"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); startRename(src.id, src.name); }}
                      title="Click to rename"
                      className="text-sm text-zinc-800 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 transition-colors text-left"
                    >
                      {src.name}
                    </button>
                  )}
                </div>
                {src.description && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{src.description}</div>
                )}
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={(e) => { e.preventDefault(); handlePreview(src); }}
                  title="Preview data"
                  className="p-1 text-zinc-400 hover:text-teal-500 transition-colors"
                >
                  <Eye size={12} />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); handleEditSource(src); }}
                  title="Edit with bot-mel"
                  className="p-1 text-zinc-400 hover:text-purple-500 transition-colors"
                >
                  <Sparkles size={12} />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); handleDeleteSource(src.id); }}
                  title="Delete source"
                  className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </label>
          ))}
        </div>

        {/* Create button */}
        {chatEntityId ? (
          <button
            onClick={() => setChatOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-teal-500/30 dark:border-teal-700/30 bg-teal-50/50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors text-xs"
          >
            <MessageCircle size={14} />
            Resume chat with bot-mel
          </button>
        ) : (
          <button
            onClick={handleCreateNew}
            disabled={isCreating}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 disabled:opacity-50 transition-colors text-xs"
          >
            {isCreating ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
            {isCreating ? "Opening..." : "Create with bot-mel"}
          </button>
        )}
      </div>

      {/* Data preview overlay */}
      <AnimatePresence>
        {previewingId && (
          <div className="absolute bottom-4 right-4 w-[700px] h-[500px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Table2 size={14} className="text-amber-500 shrink-0" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {previewData?.name ?? "Loading..."}
                </span>
                {previewData && (
                  <span className="text-[10px] text-zinc-400 shrink-0">{previewData.rows.length} rows</span>
                )}
              </div>
              <button
                onClick={() => { setPreviewingId(null); setPreviewData(null); setPreviewError(null); }}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {previewData?.sql && (
              <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shrink-0">
                <pre className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap max-h-20">
                  {previewData.sql}
                </pre>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              {isLoadingPreview && (
                <div className="flex items-center justify-center h-full text-xs text-zinc-400">
                  <Loader2 size={14} className="animate-spin mr-2" /> Running query...
                </div>
              )}
              {previewError && (
                <div className="p-4 text-xs text-red-500 font-mono whitespace-pre-wrap">
                  {previewError}
                </div>
              )}
              {previewData && previewData.rows.length > 0 && (
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
              )}
              {previewData && previewData.rows.length === 0 && !isLoadingPreview && (
                <div className="flex items-center justify-center h-full text-xs text-zinc-400">
                  Query returned no rows
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chatOpen && chatEntityId && (
          <DataSourceChatPopup
            entityId={chatEntityId}
            editingSourceId={editingSourceId}
            onClose={() => setChatOpen(false)}
            onDone={() => {
              setChatOpen(false);
              setChatEntityId(null);
              setEditingSourceId(null);
              localStorage.removeItem("tv-datasource-chat-entity");
              localStorage.removeItem("tv-datasource-chat-editing");
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
