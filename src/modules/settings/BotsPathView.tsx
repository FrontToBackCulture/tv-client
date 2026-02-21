// Settings: Bots Path Configuration

import { useCallback } from "react";
import { useBotSettingsStore } from "../../stores/botSettingsStore";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Trash2, Bot, Clock } from "lucide-react";

export function BotsPathView() {
  const botsPath = useBotSettingsStore((s) => s.botsPath);
  const setBotsPath = useBotSettingsStore((s) => s.setBotsPath);
  const sessionsPath = useBotSettingsStore((s) => s.sessionsPath);
  const setSessionsPath = useBotSettingsStore((s) => s.setSessionsPath);

  const handleBrowseBots = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select bots directory (_team folder)",
        defaultPath: botsPath || undefined,
      });
      if (selected && typeof selected === "string") {
        setBotsPath(selected);
      }
    } catch (e) {
      console.error("Folder picker error:", e);
    }
  }, [botsPath, setBotsPath]);

  const handleBrowseSessions = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select sessions directory",
        defaultPath: sessionsPath || undefined,
      });
      if (selected && typeof selected === "string") {
        setSessionsPath(selected);
      }
    } catch (e) {
      console.error("Folder picker error:", e);
    }
  }, [sessionsPath, setSessionsPath]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Bots
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Configure paths for the Bot module
        </p>
      </div>

      {/* Bots directory */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot size={16} className="text-teal-500 flex-shrink-0" />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Bots Directory
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={botsPath}
            onChange={(e) => setBotsPath(e.target.value)}
            placeholder="/path/to/tv-knowledge/_team"
            className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-sm placeholder:text-zinc-400"
          />
          <button
            onClick={handleBrowseBots}
            className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
            title="Browse..."
          >
            <FolderOpen size={16} />
          </button>
          {botsPath && (
            <button
              onClick={() => setBotsPath("")}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-colors"
              title="Clear path"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <p className="text-xs text-zinc-400 mt-2">
          The Bot module will scan this directory for bot-* folders and display
          their CLAUDE.md files. Your personal bot folder is also detected
          automatically based on your login.
        </p>
      </div>

      {/* Sessions directory */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-teal-500 flex-shrink-0" />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Sessions Directory
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={sessionsPath}
            onChange={(e) => setSessionsPath(e.target.value)}
            placeholder="/path/to/tv-knowledge/_team/melvin/sessions"
            className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-sm placeholder:text-zinc-400"
          />
          <button
            onClick={handleBrowseSessions}
            className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
            title="Browse..."
          >
            <FolderOpen size={16} />
          </button>
          {sessionsPath && (
            <button
              onClick={() => setSessionsPath("")}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-colors"
              title="Clear path"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <p className="text-xs text-zinc-400 mt-2">
          Path to your sessions folder containing dated session notes. If not
          set, the module will auto-detect based on your login name within the
          bots directory.
        </p>
      </div>
    </div>
  );
}
