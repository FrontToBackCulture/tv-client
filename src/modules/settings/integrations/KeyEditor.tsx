// src/modules/settings/integrations/KeyEditor.tsx
//
// KeyEditor — inline editor for a single API key stored in the settings
// vault. Extracted from the old ApiKeysView so it can be reused by every
// connector detail panel.
//
// ApiKeyDetail — generic detail panel for integrations that are configured
// purely by stuffing one or more keys into the vault (Gamma, Gemini, Apollo,
// etc.). Given a list of ApiKeyName values, it renders a KeyEditor for each
// one and exposes a slot for extra content (test buttons, docs links,
// credential sub-sections).

import { useState, type ReactNode } from "react";
import { Key, Eye, EyeOff, Check, X } from "lucide-react";
import { Button, IconButton, SectionLoading, ErrorBanner } from "../../../components/ui";
import { useSettings, type ApiKeyInfo, type ApiKeyName } from "../../../hooks/useSettings";

interface KeyEditorProps {
  keyInfo: ApiKeyInfo;
  onSave: (value: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function KeyEditor({ keyInfo, onSave, onDelete }: KeyEditorProps) {
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
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
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
          {description && (
            <p className="text-sm text-zinc-500 mt-1">{description}</p>
          )}
          {keyInfo.is_set && keyInfo.masked_value && !isEditing && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 font-mono">
              {keyInfo.masked_value}
            </p>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
              {keyInfo.is_set ? "Update" : "Set"}
            </Button>
            {keyInfo.is_set && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={saving}
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Delete
              </Button>
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
              placeholder="Enter value..."
              className="w-full px-3 py-2 pr-10 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
              autoFocus
            />
            <IconButton
              icon={showValue ? EyeOff : Eye}
              label={showValue ? "Hide value" : "Show value"}
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-2">
            <Button icon={Check} onClick={handleSave} disabled={saving} loading={saving}>
              Save
            </Button>
            <Button variant="ghost" icon={X} onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApiKeyDetail — the generic connector detail panel for any integration
// whose only configuration is a set of keys.
// ---------------------------------------------------------------------------

interface ApiKeyDetailProps {
  /** Section heading shown at the top (e.g. "Gamma"). */
  title: string;
  /** Optional description. */
  description?: string;
  /** Key names to render editors for — must be present in useSettings().keys. */
  keyNames: ApiKeyName[];
  /** Optional extras rendered below the key list (test buttons, docs links). */
  children?: ReactNode;
}

export function ApiKeyDetail({ title, description, keyNames, children }: ApiKeyDetailProps) {
  const { keys, loading, error, setKey, deleteKey } = useSettings();

  if (loading) return <SectionLoading className="flex-1" />;

  const relevantKeys = keyNames
    .map((name) => keys.find((k) => k.name === name))
    .filter((k): k is ApiKeyInfo => k !== undefined);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        {description && <p className="text-sm text-zinc-500 mt-1">{description}</p>}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="space-y-3">
        {relevantKeys.map((keyInfo) => (
          <KeyEditor
            key={keyInfo.name}
            keyInfo={keyInfo}
            onSave={(value) => setKey(keyInfo.name as ApiKeyName, value)}
            onDelete={() => deleteKey(keyInfo.name as ApiKeyName)}
          />
        ))}
      </div>

      {children}
    </div>
  );
}
