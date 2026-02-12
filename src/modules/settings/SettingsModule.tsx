// src/modules/settings/SettingsModule.tsx

import { useState, useCallback, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  FileText,
  Trash2,
  Library,
  CheckSquare,
  Building2,
  Mail,
  Bot,
  Clock,
  Database,
  CheckCircle2,
  XCircle,
  Upload,
  LucideIcon,
  Globe,
  Download,
  Cpu,
} from "lucide-react";
import { useRepository } from "../../stores/repositoryStore";
import {
  useDiscoverDomains,
  useValCredentials,
  useSetValCredentials,
  useValImportCredentials,
  useValSyncConfig,
  useUpdateDomainPath,
  type DiscoveredDomain,
} from "../../hooks/useValSync";
import { cn } from "../../lib/cn";

type SettingsView = "keys" | "val" | "sync" | "mcp" | "claude" | "terminal" | "bots";

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
  const integrationKeys = keys.filter(
    (k) => k.name === API_KEYS.INTERCOM
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

      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
          Integrations
        </h3>
        <div className="space-y-3">
          {integrationKeys.map((keyInfo) => (
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

// ── Domain Credential Row ────────────────────────────────

function DomainCredentialRow({ domain }: { domain: DiscoveredDomain }) {
  const [isEditing, setIsEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const credQuery = useValCredentials(domain.domain);
  const setCred = useSetValCredentials();
  const creds = credQuery.data;

  const handleSave = () => {
    if (!email.trim() || !password.trim()) return;
    setCred.mutate(
      { domain: domain.domain, email: email.trim(), password: password.trim() },
      {
        onSuccess: () => {
          setIsEditing(false);
          setEmail("");
          setPassword("");
          setShowPw(false);
        },
      }
    );
  };

  const handleEdit = () => {
    setEmail(creds?.email ?? "");
    setPassword("");
    setIsEditing(true);
  };

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">
            {domain.domain}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500">
            {domain.domain_type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {creds?.has_credentials ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 size={12} />
              Configured
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <XCircle size={12} />
              Not set
            </span>
          )}
        </div>
      </div>

      {!isEditing && creds?.has_credentials && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-zinc-500">{creds.email}</span>
          <button
            onClick={handleEdit}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Edit
          </button>
        </div>
      )}

      {!isEditing && !creds?.has_credentials && !credQuery.isLoading && (
        <div className="mt-2">
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-teal-600 hover:text-teal-500 font-medium transition-colors"
          >
            Set credentials
          </button>
        </div>
      )}

      {isEditing && (
        <div className="mt-3 space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 font-mono"
            autoFocus
          />
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-3 py-1.5 pr-8 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {setCred.isError && (
            <p className="text-xs text-red-500">
              {(setCred.error as Error).message}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={setCred.isPending || !email.trim() || !password.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded transition-colors"
            >
              {setCred.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
            <button
              onClick={() => { setIsEditing(false); setEmail(""); setPassword(""); setShowPw(false); }}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── VAL Credentials View ────────────────────────────────

function ValCredentialsView() {
  const { activeRepository } = useRepository();
  const domainsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/domains`
    : null;
  const domainsQuery = useDiscoverDomains(domainsPath);
  const importCreds = useValImportCredentials();

  const domains = domainsQuery.data ?? [];

  const handleImportEnv = useCallback(async () => {
    try {
      const selected = await open({
        title: "Import VAL credentials from .env",
        filters: [{ name: "Environment", extensions: ["env"] }, { name: "All Files", extensions: ["*"] }],
        multiple: false,
      });
      if (selected) {
        importCreds.mutate(selected as string);
      }
    } catch (e) {
      console.error("File picker error:", e);
    }
  }, [importCreds]);

  if (domainsQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  // Group by type
  const production = domains.filter((d) => d.domain_type === "production");
  const demo = domains.filter((d) => d.domain_type === "demo");
  const templates = domains.filter((d) => d.domain_type === "template");
  const groups = [
    { label: "Production", items: production },
    { label: "Demo", items: demo },
    { label: "Templates", items: templates },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            VAL Credentials
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Manage login credentials for each VAL domain
          </p>
        </div>
        <button
          onClick={handleImportEnv}
          disabled={importCreds.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
          title="Import from .env file"
        >
          {importCreds.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          Import .env
        </button>
      </div>

      {importCreds.isSuccess && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
          Imported credentials for {importCreds.data.length} domain{importCreds.data.length !== 1 ? "s" : ""}:{" "}
          {importCreds.data.join(", ")}
        </div>
      )}
      {importCreds.isError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {(importCreds.error as Error).message}
        </div>
      )}

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Credentials are stored locally in <code className="text-xs">~/.tv-desktop/settings.json</code>.
          You can also set credentials per domain in Product &gt; Domains.
        </p>
      </div>

      {domains.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          <Database size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No domains discovered</p>
          <p className="text-xs text-zinc-400 mt-1">
            {domainsPath
              ? `No domain folders found at ${domainsPath}`
              : "No repository selected"}
          </p>
        </div>
      )}

      {groups.map(({ label, items }) => (
        <section key={label}>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
            {label} ({items.length})
          </h3>
          <div className="space-y-2">
            {items.map((d) => (
              <DomainCredentialRow key={d.domain} domain={d} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Sync Paths View ────────────────────────────────────────

interface SyncOutputInfo {
  label: string;
  path: string;
  description: string;
  isFolder: boolean;
}

interface OutputCategory {
  name: string;
  description: string;
  outputs: SyncOutputInfo[];
}

function getOutputCategories(globalPath: string): OutputCategory[] {
  return [
    {
      name: "Schema Sync",
      description: "VAL platform definitions synced via API",
      outputs: [
        { label: "Fields", path: `${globalPath}/fields/`, description: "Field definitions", isFolder: true },
        { label: "Queries", path: `${globalPath}/queries/`, description: "Query definitions", isFolder: true },
        { label: "Workflows", path: `${globalPath}/workflows/`, description: "Workflow definitions", isFolder: true },
        { label: "Dashboards", path: `${globalPath}/dashboards/`, description: "Dashboard definitions", isFolder: true },
        { label: "Tables", path: `${globalPath}/tables/`, description: "Table definitions", isFolder: true },
        { label: "Data Models", path: `${globalPath}/data_models/`, description: "Table schemas with columns", isFolder: true },
        { label: "Calc Fields", path: `${globalPath}/calc_fields/`, description: "Calculated field definitions", isFolder: true },
      ],
    },
    {
      name: "Monitoring",
      description: "Workflow executions and error tracking",
      outputs: [
        { label: "Executions", path: `${globalPath}/monitoring/`, description: "Workflow executions & SOD status", isFolder: true },
        { label: "Importer Errors", path: `${globalPath}/analytics/importer_errors_*.json`, description: "Importer error logs", isFolder: false },
        { label: "Integration Errors", path: `${globalPath}/analytics/integration_errors_*.json`, description: "Integration error logs", isFolder: false },
      ],
    },
    {
      name: "Health Checks",
      description: "Data model and workflow health analysis",
      outputs: [
        { label: "Health Config", path: `${globalPath}/health-config.json`, description: "Table freshness configuration", isFolder: false },
        { label: "Data Model Health", path: `${globalPath}/data-model-health.json`, description: "Table health scores", isFolder: false },
        { label: "Workflow Health", path: `${globalPath}/workflow-health.json`, description: "Workflow health scores", isFolder: false },
      ],
    },
  ];
}

function DomainSyncPathRow({
  domain,
  currentPath,
  onPathChange,
}: {
  domain: DiscoveredDomain;
  currentPath: string;
  onPathChange: (newPath: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(currentPath);
  const categories = getOutputCategories(currentPath);
  const updatePath = useUpdateDomainPath();

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: `Select sync folder for ${domain.domain}`,
        defaultPath: currentPath || undefined,
      });
      if (selected && typeof selected === "string") {
        setEditValue(selected);
        updatePath.mutate(
          { domain: domain.domain, globalPath: selected },
          { onSuccess: () => onPathChange(selected) }
        );
      }
    } catch (e) {
      console.error("Folder picker error:", e);
    }
  }, [currentPath, domain.domain, onPathChange, updatePath]);

  const handleSave = () => {
    if (editValue.trim() && editValue !== currentPath) {
      updatePath.mutate(
        { domain: domain.domain, globalPath: editValue.trim() },
        {
          onSuccess: () => {
            onPathChange(editValue.trim());
            setIsEditing(false);
          },
        }
      );
    } else {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditValue(currentPath);
    setIsEditing(false);
  };

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Database size={16} className="text-teal-500 flex-shrink-0" />
          <div className="text-left">
            <span className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">
              {domain.domain}
            </span>
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500">
              {domain.domain_type}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {domain.has_metadata ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 size={12} />
              Synced
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <XCircle size={12} />
              Not synced
            </span>
          )}
          <RefreshCw
            size={14}
            className={cn(
              "text-zinc-400 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-zinc-800 px-4 py-3 bg-slate-50 dark:bg-zinc-900/30">
          {/* Global path */}
          <div className="mb-3">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Root Path
            </label>
            {isEditing ? (
              <div className="mt-1 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-xs"
                    autoFocus
                  />
                  <button
                    onClick={handleBrowse}
                    className="p-2 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
                    title="Browse..."
                  >
                    <FolderOpen size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={updatePath.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {updatePath.isPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="mt-1 flex items-center gap-2 group cursor-pointer"
                onClick={() => {
                  setEditValue(currentPath);
                  setIsEditing(true);
                }}
                title={currentPath}
              >
                <div className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate hover:border-teal-400 dark:hover:border-teal-600 transition-colors">
                  {currentPath}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowse();
                  }}
                  className="p-2 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
                  title="Browse..."
                >
                  <FolderOpen size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Output categories */}
          {categories.map((category) => (
            <div key={category.name} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  {category.name}
                </label>
                <span className="text-[10px] text-zinc-400">
                  — {category.description}
                </span>
              </div>
              <div className="space-y-0.5 bg-white dark:bg-zinc-900 rounded border border-slate-200 dark:border-zinc-700">
                {category.outputs.map((output) => (
                  <div
                    key={output.label}
                    className="flex items-center justify-between py-1.5 px-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 first:rounded-t last:rounded-b"
                    title={output.path}
                  >
                    <div className="flex items-center gap-2">
                      {output.isFolder ? (
                        <FolderOpen size={12} className="text-amber-500" />
                      ) : (
                        <FileText size={12} className="text-blue-500" />
                      )}
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {output.label}
                      </span>
                    </div>
                    <span
                      className="text-[10px] font-mono text-zinc-400 truncate max-w-[220px]"
                      title={output.path}
                    >
                      {output.path.replace(currentPath, ".")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SyncPathsView() {
  const { activeRepository } = useRepository();
  const domainsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/domains`
    : null;
  const domainsQuery = useDiscoverDomains(domainsPath);
  const configQuery = useValSyncConfig();

  // Build a map of domain -> globalPath from config
  const pathMap = useMemo(() => {
    const map = new Map<string, string>();
    if (configQuery.data) {
      for (const d of configQuery.data.domains) {
        map.set(d.domain, d.globalPath);
      }
    }
    return map;
  }, [configQuery.data]);

  // Local state for optimistic updates
  const [localPaths, setLocalPaths] = useState<Map<string, string>>(new Map());

  const getPath = useCallback(
    (domain: string, fallback: string) => {
      return localPaths.get(domain) ?? pathMap.get(domain) ?? fallback;
    },
    [localPaths, pathMap]
  );

  const handlePathChange = useCallback((domain: string, newPath: string) => {
    setLocalPaths((prev) => new Map(prev).set(domain, newPath));
  }, []);

  const domains = domainsQuery.data ?? [];

  if (domainsQuery.isLoading || configQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  // Group by type
  const production = domains.filter((d) => d.domain_type === "production");
  const demo = domains.filter((d) => d.domain_type === "demo");
  const templates = domains.filter((d) => d.domain_type === "template");
  const groups = [
    { label: "Production", items: production },
    { label: "Demo", items: demo },
    { label: "Templates", items: templates },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Sync Paths
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Configure where VAL sync operations write their output files
          </p>
        </div>
        <button
          onClick={() => {
            domainsQuery.refetch();
            configQuery.refetch();
          }}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Each domain has a <strong>root path</strong> where all sync data is stored.
          Click on a path to edit it, or use the folder button to browse.
          Hover over paths to see the full location.
        </p>
      </div>

      {domains.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          <Database size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No domains discovered</p>
          <p className="text-xs text-zinc-400 mt-1">
            {domainsPath
              ? `No domain folders found at ${domainsPath}`
              : "No repository selected"}
          </p>
        </div>
      )}

      {groups.map(({ label, items }) => (
        <section key={label}>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
            {label} ({items.length})
          </h3>
          <div className="space-y-2">
            {items.map((d) => (
              <DomainSyncPathRow
                key={d.domain}
                domain={d}
                currentPath={getPath(d.domain, d.global_path)}
                onPathChange={(newPath) => handlePathChange(d.domain, newPath)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── MCP Endpoints View ──────────────────────────────────────

function DomainMcpRow({ domain }: { domain: DiscoveredDomain }) {
  const keyName = `mcp_url_${domain.domain}`;
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load current value
  useEffect(() => {
    invoke<string | null>("settings_get_key", { keyName })
      .then((val) => {
        setSavedUrl(val);
        if (val) setUrl(val);
      })
      .catch(() => setSavedUrl(null))
      .finally(() => setLoading(false));
  }, [keyName]);

  const handleSave = async () => {
    if (!url.trim()) return;
    try {
      setSaving(true);
      await invoke("settings_set_key", { keyName, value: url.trim() });
      setSavedUrl(url.trim());
      setIsEditing(false);
    } catch (e) {
      console.error("Failed to save MCP URL:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setSaving(true);
      await invoke("settings_delete_key", { keyName });
      setSavedUrl(null);
      setUrl("");
      setIsEditing(false);
    } catch (e) {
      console.error("Failed to delete MCP URL:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setUrl(savedUrl ?? "");
    setIsEditing(true);
  };

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">
            {domain.domain}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500">
            {domain.domain_type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <Loader2 size={12} className="animate-spin text-zinc-400" />
          ) : savedUrl ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 size={12} />
              Configured
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <XCircle size={12} />
              Not set
            </span>
          )}
        </div>
      </div>

      {!isEditing && savedUrl && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-500 font-mono truncate" title={savedUrl}>
            {savedUrl}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleEdit}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="text-xs text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {!isEditing && !savedUrl && !loading && (
        <div className="mt-2">
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-teal-600 hover:text-teal-500 font-medium transition-colors"
          >
            Set MCP URL
          </button>
        </div>
      )}

      {isEditing && (
        <div className="mt-3 space-y-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-domain.val.run/mcp/sql"
            className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 font-mono"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") { setIsEditing(false); setUrl(savedUrl ?? ""); }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !url.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
            <button
              onClick={() => { setIsEditing(false); setUrl(savedUrl ?? ""); }}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function McpEndpointsView() {
  const { activeRepository } = useRepository();
  const domainsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/domains`
    : null;
  const domainsQuery = useDiscoverDomains(domainsPath);
  const domains = domainsQuery.data ?? [];

  if (domainsQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  // Group by type
  const production = domains.filter((d) => d.domain_type === "production");
  const demo = domains.filter((d) => d.domain_type === "demo");
  const templates = domains.filter((d) => d.domain_type === "template");
  const groups = [
    { label: "Production", items: production },
    { label: "Demo", items: demo },
    { label: "Templates", items: templates },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            MCP Endpoints
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Configure MCP SQL endpoint URLs for each VAL domain
          </p>
        </div>
        <button
          onClick={() => domainsQuery.refetch()}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Each domain's MCP endpoint is used by the Console to execute SQL queries.
          The URL should point to the MCP server that accepts SQL for that domain.
        </p>
      </div>

      {domains.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          <Globe size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No domains discovered</p>
          <p className="text-xs text-zinc-400 mt-1">
            {domainsPath
              ? `No domain folders found at ${domainsPath}`
              : "No repository selected"}
          </p>
        </div>
      )}

      {groups.map(({ label, items }) => (
        <section key={label}>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
            {label} ({items.length})
          </h3>
          <div className="space-y-2">
            {items.map((d) => (
              <DomainMcpRow key={d.domain} domain={d} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Claude Code Setup View ──────────────────────────────────

interface ClaudeMcpStatus {
  binary_installed: boolean;
  binary_path: string;
  config_exists: boolean;
  config_has_tv_mcp: boolean;
  platform: string;
}

function ClaudeCodeSetupView() {
  const [status, setStatus] = useState<ClaudeMcpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const s = await invoke<ClaudeMcpStatus>("claude_mcp_status");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleInstall = async () => {
    try {
      setInstalling(true);
      setError(null);
      const s = await invoke<ClaudeMcpStatus>("claude_mcp_install");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!confirm("Remove tv-mcp binary and Claude Code config entry?")) return;
    try {
      setUninstalling(true);
      setError(null);
      const s = await invoke<ClaudeMcpStatus>("claude_mcp_uninstall");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUninstalling(false);
    }
  };

  const isFullyInstalled = status?.binary_installed && status?.config_has_tv_mcp;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Claude Code
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Set up the tv-mcp server for Claude Code integration
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Claude Code uses the <strong>tv-mcp</strong> server to access Work, CRM,
          and Generation tools. Click Install to download the binary and configure
          Claude Code automatically.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-zinc-400" />
        </div>
      ) : status ? (
        <>
          {/* Status cards */}
          <div className="space-y-3">
            <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Platform
                  </span>
                </div>
                <span className="text-sm font-mono text-zinc-500">
                  {status.platform}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Binary
                  </span>
                </div>
                {status.binary_installed ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 size={12} />
                    Installed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <XCircle size={12} />
                    Not installed
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-2 font-mono truncate" title={status.binary_path}>
                {status.binary_path}
              </p>
            </div>

            <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Claude Code Config
                  </span>
                </div>
                {status.config_has_tv_mcp ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 size={12} />
                    Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <XCircle size={12} />
                    Not configured
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-2 font-mono">
                ~/.claude.json
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {!isFullyInstalled ? (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {installing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {installing ? "Installing..." : "Install"}
              </button>
            ) : (
              <>
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  {installing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {installing ? "Reinstalling..." : "Reinstall / Update"}
                </button>
                <button
                  onClick={handleUninstall}
                  disabled={uninstalling}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  {uninstalling ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  {uninstalling ? "Removing..." : "Uninstall"}
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
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
  { id: "val", label: "VAL Credentials", icon: Database },
  { id: "sync", label: "Sync Paths", icon: RefreshCw },
  { id: "mcp", label: "MCP Endpoints", icon: Globe },
  { id: "claude", label: "Claude Code", icon: Cpu },
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
          {activeView === "val" && <ValCredentialsView />}
          {activeView === "sync" && <SyncPathsView />}
          {activeView === "mcp" && <McpEndpointsView />}
          {activeView === "claude" && <ClaudeCodeSetupView />}
          {activeView === "terminal" && <TerminalPathsView />}
          {activeView === "bots" && <BotsPathView />}
        </div>
      </div>
    </div>
  );
}
