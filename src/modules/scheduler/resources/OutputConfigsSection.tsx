// Output configs — saved output configurations

import { useState } from "react";
import { Plus, Pencil, Trash2, MessageSquare, MessagesSquare } from "lucide-react";
import { useOutputConfigs, useCreateOutputConfig, useUpdateOutputConfig, useDeleteOutputConfig } from "@/hooks/scheduler";
import { useBots } from "@/hooks/useBotSkills";
import { cn } from "@/lib/cn";

interface EditState {
  id?: string;
  name: string;
  description: string;
  post_mode: "new_thread" | "same_thread";
  bot_author: string;
  thread_title: string;
}

export function OutputConfigsSection() {
  const { data: configs = [] } = useOutputConfigs();
  const { data: bots } = useBots();
  const createConfig = useCreateOutputConfig();
  const updateConfig = useUpdateOutputConfig();
  const deleteConfig = useDeleteOutputConfig();
  const [editing, setEditing] = useState<EditState | null>(null);

  function handleSave() {
    if (!editing || !editing.name.trim()) return;
    if (editing.id) {
      updateConfig.mutate({ id: editing.id, name: editing.name, description: editing.description || undefined, post_mode: editing.post_mode, bot_author: editing.bot_author, thread_title: editing.thread_title || undefined });
    } else {
      createConfig.mutate({ name: editing.name, description: editing.description || undefined, post_mode: editing.post_mode, bot_author: editing.bot_author, thread_title: editing.thread_title || undefined });
    }
    setEditing(null);
  }

  return (
    <div className="space-y-3">
      {/* Config cards */}
      {configs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {configs.map((c) => (
            <div key={c.id} className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.name}</span>
                  </div>
                  {c.description && <div className="text-[10px] text-zinc-500 mb-1">{c.description}</div>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      c.post_mode === "new_thread"
                        ? "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                        : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    )}>
                      {c.post_mode === "new_thread" ? "New thread" : "Same thread"}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                      {c.bot_author}
                    </span>
                  </div>
                  {c.thread_title && <div className="text-[10px] text-zinc-400 mt-1 truncate">{c.thread_title}</div>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => setEditing({ id: c.id, name: c.name, description: c.description || "", post_mode: c.post_mode, bot_author: c.bot_author, thread_title: c.thread_title || "" })} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><Pencil size={12} /></button>
                  <button onClick={() => { if (confirm(`Delete "${c.name}"?`)) deleteConfig.mutate(c.id); }} className="p-1 text-zinc-400 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {configs.length === 0 && !editing && (
        <div className="text-xs text-zinc-400 py-2">No output configs saved yet. Create one to reuse across automations.</div>
      )}

      {/* Create / Edit form */}
      {editing ? (
        <div className="rounded-lg border border-teal-500/50 bg-teal-50/30 dark:bg-teal-950/10 p-4 space-y-3">
          <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{editing.id ? "Edit Output Config" : "New Output Config"}</div>
          <input
            type="text"
            placeholder="Config name"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
            autoFocus
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
          />

          {/* Bot author */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Post as</label>
            <select
              value={editing.bot_author}
              onChange={(e) => setEditing({ ...editing, bot_author: e.target.value })}
              className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
            >
              {bots?.map((b) => {
                const botName = b.path.split("/").filter(Boolean).pop() || `bot-${b.name}`;
                return <option key={botName} value={botName}>{botName}</option>;
              }) ?? <option value={editing.bot_author}>{editing.bot_author}</option>}
            </select>
          </div>

          {/* Threading mode */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Threading mode</label>
            <div className="flex gap-2">
              {([
                { value: "new_thread" as const, label: "New thread", icon: MessageSquare },
                { value: "same_thread" as const, label: "Same thread", icon: MessagesSquare },
              ]).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setEditing({ ...editing, post_mode: value })}
                  className={cn(
                    "flex-1 flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                    editing.post_mode === value
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600",
                  )}
                >
                  <Icon size={14} className={editing.post_mode === value ? "text-teal-500" : "text-zinc-400"} />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Thread title */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Thread title</label>
            <input
              type="text"
              placeholder={editing.post_mode === "same_thread" ? "Ongoing: {date}" : "{date} — Run"}
              value={editing.thread_title}
              onChange={(e) => setEditing({ ...editing, thread_title: e.target.value })}
              className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
            />
            <p className="text-[10px] text-zinc-500">
              Variables: <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{date}"}</code>{" "}
              <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{time}"}</code>{" "}
              <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{day}"}</code>
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!editing.name.trim()} className="text-xs px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {editing.id ? "Update" : "Create"}
            </button>
            <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing({ name: "", description: "", post_mode: "new_thread", bot_author: "bot-mel", thread_title: "" })}
          className="flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
        >
          <Plus size={12} /> New output config
        </button>
      )}
    </div>
  );
}
