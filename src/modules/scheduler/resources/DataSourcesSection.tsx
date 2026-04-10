// Data sources — built-in + custom SQL sources

import { useState } from "react";
import { Database, Pencil, Trash2, Eye, Brain } from "lucide-react";
import { useCustomDataSources, useDeleteCustomDataSource } from "@/hooks/scheduler";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { handleBotMention } from "@/hooks/chat/botMentionHandler";
import { useCurrentUserId, useCurrentUserName } from "@/hooks/work/useUsers";
import { DataSourceChatPopup } from "../canvas/panels/DataSourceChatPopup";
// import { cn } from "@/lib/cn";

export function DataSourcesSection() {
  const { data: customSources = [] } = useCustomDataSources();
  const deleteSource = useDeleteCustomDataSource();
  const userId = useCurrentUserId();
  const userName = useCurrentUserName();
  const queryClient = useQueryClient();
  const [chatEntityId, setChatEntityId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ name: string; rows: Record<string, unknown>[] } | null>(null);

  async function handleCreateNew() {
    if (!userName) return;
    const entityId = `datasource-gen:${crypto.randomUUID()}`;
    const body = "@bot-mel I want to create a custom data source. Read the file _skills/generate-custom-data-source/SKILL.md (relative to the tv-knowledge root directory) and follow its workflow step by step. Ask me what data I need.";
    const { data: inserted, error } = await supabase
      .from("discussions")
      .insert({ entity_type: "general", entity_id: entityId, author: userName, body, title: "New Custom Data Source" })
      .select()
      .single();
    if (error || !inserted) return;
    setChatEntityId(entityId);
    setEditingSourceId(null);
    if (userId) {
      handleBotMention(
        { id: inserted.id, entity_type: inserted.entity_type, entity_id: inserted.entity_id, body: inserted.body, author: inserted.author, parent_id: inserted.parent_id, attachments: [] },
        userId, queryClient, "bot-mel",
      ).catch(console.error);
    }
  }

  async function handleEdit(src: typeof customSources[0]) {
    if (!userName) return;
    const entityId = `datasource-gen:${crypto.randomUUID()}`;
    const body = `@bot-mel I want to modify an existing data source. Read the file _skills/generate-custom-data-source/SKILL.md (relative to the tv-knowledge root directory) and follow its workflow.\n\nCurrent source:\n- Name: ${src.name}\n- Description: ${src.description}\n- SQL: ${src.sql_query}\n\nAsk me what I want to change.`;
    const { data: inserted, error } = await supabase
      .from("discussions")
      .insert({ entity_type: "general", entity_id: entityId, author: userName, body, title: `Edit: ${src.name}` })
      .select()
      .single();
    if (error || !inserted) return;
    setChatEntityId(entityId);
    setEditingSourceId(src.id);
    if (userId) {
      handleBotMention(
        { id: inserted.id, entity_type: inserted.entity_type, entity_id: inserted.entity_id, body: inserted.body, author: inserted.author, parent_id: inserted.parent_id, attachments: [] },
        userId, queryClient, "bot-mel",
      ).catch(console.error);
    }
  }

  async function handlePreview(src: typeof customSources[0]) {
    try {
      const { data, error } = await supabase.rpc("execute_custom_query", { query_text: src.sql_query });
      if (error) { console.error("Preview error:", error); return; }
      setPreviewData({ name: src.name, rows: (data as Record<string, unknown>[]) ?? [] });
    } catch (e) { console.error("Preview failed:", e); }
  }

  return (
    <div className="space-y-3 relative">
      {/* Custom sources */}
      {customSources.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Custom</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {customSources.map((s) => (
              <div key={s.id} className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Database size={10} className="text-blue-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{s.name}</span>
                    </div>
                    {s.description && <div className="text-[10px] text-zinc-500 line-clamp-2">{s.description}</div>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => handlePreview(s)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" title="Preview"><Eye size={12} /></button>
                    <button onClick={() => handleEdit(s)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" title="Edit"><Pencil size={12} /></button>
                    <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteSource.mutate(s.id); }} className="p-1 text-zinc-400 hover:text-red-500" title="Delete"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create button */}
      <button
        onClick={handleCreateNew}
        className="flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
      >
        <Brain size={12} /> Create with bot-mel
      </button>

      {/* Preview overlay */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-8" onClick={() => setPreviewData(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-blue-500" />
                <span className="text-sm font-medium">{previewData.name}</span>
                <span className="text-[10px] text-zinc-400">{previewData.rows.length} rows</span>
              </div>
              <button onClick={() => setPreviewData(null)} className="text-xs text-zinc-400 hover:text-zinc-600">Close</button>
            </div>
            <div className="flex-1 overflow-auto">
              {previewData.rows.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                    <tr>
                      {Object.keys(previewData.rows[0]).map((col) => (
                        <th key={col} className="px-3 py-1.5 text-left font-medium text-zinc-600 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, i) => (
                      <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-[200px] truncate">{val == null ? "—" : String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-32 text-xs text-zinc-400">No data returned</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat popup */}
      {chatEntityId && (
        <DataSourceChatPopup
          entityId={chatEntityId}
          editingSourceId={editingSourceId}
          onClose={() => setChatEntityId(null)}
          onDone={() => setChatEntityId(null)}
        />
      )}
    </div>
  );
}
