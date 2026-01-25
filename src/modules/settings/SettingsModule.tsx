// src/modules/settings/SettingsModule.tsx

import { useState } from "react";
import { useSettings, API_KEYS, ApiKeyInfo } from "../../hooks/useSettings";
import { Settings, Key, Eye, EyeOff, Check, X, Loader2, RefreshCw } from "lucide-react";

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

  // Get display name from key name
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

export function SettingsModule() {
  const { keys, loading, error, refresh, setKey, deleteKey } = useSettings();

  // Group keys by category
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
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <Loader2 size={32} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
              <Settings size={20} className="text-zinc-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Settings
              </h1>
              <p className="text-sm text-zinc-500">
                Manage API keys and credentials
              </p>
            </div>
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

        {/* Info banner */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            <strong>Secure Storage:</strong> All credentials are stored in your
            operating system's secure keychain (Keychain on macOS, Credential
            Manager on Windows).
          </p>
        </div>

        {/* Generation Tools */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Generation Tools
          </h2>
          <div className="space-y-3">
            {toolKeys.map((keyInfo) => (
              <KeyEditor
                key={keyInfo.name}
                keyInfo={keyInfo}
                onSave={(value) => setKey(keyInfo.name as keyof typeof API_KEYS extends never ? string : any, value)}
                onDelete={() => deleteKey(keyInfo.name as any)}
              />
            ))}
          </div>
        </section>

        {/* Authentication */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Authentication
          </h2>
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

        {/* Database */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Database
          </h2>
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
    </div>
  );
}
