// src/modules/settings/SettingsModule.tsx

import { useState, useCallback } from "react";
import { useSettings, API_KEYS, ApiKeyInfo } from "../../hooks/useSettings";
import { useTerminalSettingsStore } from "../../stores/terminalSettingsStore";
import { useBotSettingsStore } from "../../stores/botSettingsStore";
import { ModuleId } from "../../stores/appStore";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Settings,
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  RefreshCw,
  Terminal,
  FolderOpen,
  Trash2,
  Library,
  CheckSquare,
  Building2,
  Mail,
  Bot,
  Clock,
  LucideIcon,
} from "lucide-react";
import { useRepository } from "../../stores/repositoryStore";
import { cn } from "../../lib/cn";

type SettingsView = "keys" | "terminal" | "bots";

// Module info for terminal path config
interface ModuleInfo {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
}

const terminalModules: ModuleInfo[] = [
  { id: "work", label: "Work", icon: CheckSquare },
  { id: "crm", label: "CRM", icon: Building2 },
  { id: "inbox", label: "Inbox", icon: Mail },
  { id: "bot", label: "Bots", icon: Bot },
];

// ── KeyEditor ──────────────────────────────────────────────

interface KeyEditorProps {
  keyInfo: ApiKeyInfo;
  onSave: (value: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function KeyEditor({ keyInfo, onSave, onDelete }: KeyEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!value.trim()) {
      setError("Value is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(value);
      setIsEditing(false);
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this key?")) return;

    try {
      setSaving(true);
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setValue("");
    setError(null);
  };

  const displayName = keyInfo.description.split(" - ")[0];
  const description = keyInfo.description.split(" - ")[1] || "";

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-zinc-400 flex-shrink-0" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {displayName}
            </span>
            {keyInfo.is_set && (
              <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                Set
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">{description}</p>
          {keyInfo.is_set && keyInfo.masked_value && !isEditing && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 font-mono">
              {keyInfo.masked_value}
            </p>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
            >
              {keyInfo.is_set ? "Update" : "Set"}
            </button>
            {keyInfo.is_set && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {isEditing && (
        <div className="mt-4 space-y-3">
          <div className="relative">
            <input
              type={showValue ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter API key..."
              className="w-full px-3 py-2 pr-10 border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
            >
              {showValue ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Save
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── API Keys View ──────────────────────────────────────────

function ApiKeysView() {
  const { keys, loading, error, refresh, setKey, deleteKey } = useSettings();

  const toolKeys = keys.filter(
    (k) => k.name === API_KEYS.GAMMA || k.name === API_KEYS.GEMINI
  );
  const authKeys = keys.filter(
    (k) =>
      k.name === API_KEYS.GITHUB_CLIENT_ID ||
      k.name === API_KEYS.GITHUB_CLIENT_SECRET
  );
  const dbKeys = keys.filter(
    (k) =>
      k.name === API_KEYS.SUPABASE_URL || k.name === API_KEYS.SUPABASE_ANON_KEY
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            API Keys
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Manage API keys and credentials
          </p>
        </div>
        <button
          onClick={refresh}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          <strong>Secure Storage:</strong> All credentials are stored in your
          operating system's secure keychain (Keychain on macOS, Credential
          Manager on Windows).
        </p>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
          Generation Tools
        </h3>
        <div className="space-y-3">
          {toolKeys.map((keyInfo) => (
            <KeyEditor
              key={keyInfo.name}
              keyInfo={keyInfo}
              onSave={(value) => setKey(keyInfo.name as any, value)}
              onDelete={() => deleteKey(keyInfo.name as any)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
          Authentication
        </h3>
        <div className="space-y-3">
          {authKeys.map((keyInfo) => (
            <KeyEditor
              key={keyInfo.name}
              keyInfo={keyInfo}
              onSave={(value) => setKey(keyInfo.name as any, value)}
              onDelete={() => deleteKey(keyInfo.name as any)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
          Database
        </h3>
        <div className="space-y-3">
          {dbKeys.map((keyInfo) => (
            <KeyEditor
              key={keyInfo.name}
              keyInfo={keyInfo}
              onSave={(value) => setKey(keyInfo.name as any, value)}
              onDelete={() => deleteKey(keyInfo.name as any)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Terminal Paths View ────────────────────────────────────

function TerminalPathsView() {
  const paths = useTerminalSettingsStore((s) => s.paths);
  const setPath = useTerminalSettingsStore((s) => s.setPath);
  const removePath = useTerminalSettingsStore((s) => s.removePath);
  const { activeRepository } = useRepository();

  const handleBrowse = useCallback(
    async (moduleId: ModuleId) => {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: `Select default terminal directory`,
          defaultPath: paths[moduleId] || undefined,
        });
        if (selected && typeof selected === "string") {
          setPath(moduleId, selected);
        }
      } catch (e) {
        console.error("Folder picker error:", e);
      }
    },
    [paths, setPath]
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Terminal
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Set the default working directory when opening the terminal in each module
        </p>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          The floating terminal is available on every module. If no path is set, the
          terminal opens in your home directory.
        </p>
      </div>

      <div className="space-y-3">
        {/* Library — path follows active repository */}
        <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Library size={16} className="text-teal-500 flex-shrink-0" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              Library
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-lg bg-slate-100 dark:bg-zinc-800 font-mono text-sm text-zinc-500 dark:text-zinc-400">
              {activeRepository?.path || "No repository selected"}
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            Follows the active repository. Change it from the Library sidebar.
          </p>
        </div>

        {terminalModules.map((mod) => {
          const Icon = mod.icon;
          const currentPath = paths[mod.id];

          return (
            <div
              key={mod.id}
              className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon size={16} className="text-teal-500 flex-shrink-0" />
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {mod.label}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentPath || ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      setPath(mod.id, e.target.value);
                    } else {
                      removePath(mod.id);
                    }
                  }}
                  placeholder="~/  (home directory)"
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-sm placeholder:text-zinc-400"
                />
                <button
                  onClick={() => handleBrowse(mod.id)}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
                  title="Browse..."
                >
                  <FolderOpen size={16} />
                </button>
                {currentPath && (
                  <button
                    onClick={() => removePath(mod.id)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-colors"
                    title="Clear path"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bots Path View ───────────────────────────────────────

function BotsPathView() {
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
      <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
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
            className="flex-1 px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-sm placeholder:text-zinc-400"
          />
          <button
            onClick={handleBrowseBots}
            className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
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
      <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
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
            className="flex-1 px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-sm placeholder:text-zinc-400"
          />
          <button
            onClick={handleBrowseSessions}
            className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
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

// ── Main Settings Module ───────────────────────────────────

interface SidebarItem {
  id: SettingsView;
  label: string;
  icon: LucideIcon;
}

const sidebarItems: SidebarItem[] = [
  { id: "keys", label: "API Keys", icon: Key },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "bots", label: "Bots", icon: Bot },
];

export function SettingsModule() {
  const [activeView, setActiveView] = useState<SettingsView>("keys");

  return (
    <div className="h-full flex bg-slate-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0 border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-3">
        <div className="flex items-center gap-2 px-2 py-3 mb-2">
          <Settings size={18} className="text-zinc-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Settings
          </span>
        </div>

        <nav className="space-y-0.5">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors",
                  isActive
                    ? "bg-slate-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
                )}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6">
          {activeView === "keys" && <ApiKeysView />}
          {activeView === "terminal" && <TerminalPathsView />}
          {activeView === "bots" && <BotsPathView />}
        </div>
      </div>
    </div>
  );
}
