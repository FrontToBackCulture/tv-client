// Output node config panel

import { useState } from "react";
import { useBots } from "@/hooks/useBotSkills";
import { DEFAULT_THREAD_TITLE_NEW, DEFAULT_THREAD_TITLE_SAME } from "@/hooks/chat/useTaskAdvisor";
import { cn } from "@/lib/cn";
import type { OutputConfig } from "../types";

interface Props {
  config: OutputConfig;
  onChange: (config: OutputConfig) => void;
}

export function OutputConfigPanel({ config, onChange }: Props) {
  const { data: bots } = useBots();
  const [threadTitle, setThreadTitle] = useState(config.thread_title ?? "");
  const [threadId, setThreadId] = useState(config.thread_id ?? "");

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Output Settings</h3>

      {/* Bot author */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Post as</label>
        <select
          value={config.bot_author}
          onChange={(e) => onChange({ ...config, bot_author: e.target.value })}
          className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5"
        >
          {bots?.map((b) => {
            const botName = b.path.split("/").filter(Boolean).pop() || `bot-${b.name}`;
            return <option key={botName} value={botName}>{botName}</option>;
          }) ?? <option value={config.bot_author}>{config.bot_author}</option>}
        </select>
      </div>

      {/* Threading mode */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Threading mode</label>
        <div className="flex gap-2">
          {([
            { value: "new_thread" as const, label: "New thread", desc: "Each run opens its own thread" },
            { value: "same_thread" as const, label: "Same thread", desc: "All runs reply to one ongoing thread" },
          ]).map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => onChange({ ...config, post_mode: value })}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-left transition-colors",
                config.post_mode === value
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30"
                  : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600",
              )}
            >
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread title */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Thread title</label>
        <input
          type="text"
          value={threadTitle}
          onChange={(e) => setThreadTitle(e.target.value)}
          onBlur={() => onChange({ ...config, thread_title: threadTitle || null })}
          placeholder={config.post_mode === "same_thread" ? DEFAULT_THREAD_TITLE_SAME : DEFAULT_THREAD_TITLE_NEW}
          className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
        />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Variables: <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{date}"}</code>{" "}
          <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{time}"}</code>{" "}
          <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{"{day}"}</code>
        </p>
      </div>

      {/* Thread ID (same_thread only) */}
      {config.post_mode === "same_thread" && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Thread ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              onBlur={() => onChange({ ...config, thread_id: threadId || null })}
              className="flex-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-zinc-900 dark:text-zinc-100 font-mono"
            />
            <button
              onClick={() => {
                const newId = `auto:${Date.now()}`;
                setThreadId(newId);
                onChange({ ...config, thread_id: newId });
              }}
              className="text-xs px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
