// Settings: API Keys View + KeyEditor

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useSettings, API_KEYS, ApiKeyInfo } from "../../hooks/useSettings";
import {
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  RefreshCw,
  Download,
  Upload,
  Send,
  Zap,
} from "lucide-react";
import { Button, IconButton, SectionLoading, ErrorBanner } from "../../components/ui";
import { formatError } from "../../lib/formatError";

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
          <p className="text-sm text-zinc-500 mt-1">{description}</p>
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
              <Button variant="ghost" onClick={handleDelete} disabled={saving} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
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
              placeholder="Enter API key..."
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

interface SesTestResult {
  success: boolean;
  verified_email: string | null;
  send_result: string | null;
  error: string | null;
}

function SesConnectionTest() {
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [result, setResult] = useState<SesTestResult | null>(null);

  const handleTest = async (withEmail: boolean) => {
    try {
      if (withEmail) {
        setSending(true);
      } else {
        setTesting(true);
      }
      setResult(null);
      const res = await invoke<SesTestResult>("email_test_ses_connection", {
        testEmail: withEmail && testEmail.trim() ? testEmail.trim() : null,
      });
      setResult(res);
    } catch (e: any) {
      setResult({
        success: false,
        verified_email: null,
        send_result: null,
        error: formatError(e),
      });
    } finally {
      setTesting(false);
      setSending(false);
    }
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-amber-500" />
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          Test SES Connection
        </span>
      </div>
      <p className="text-sm text-zinc-500">
        Verify your AWS credentials can reach SES and optionally send a test
        email.
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          icon={Zap}
          onClick={() => handleTest(false)}
          disabled={testing || sending}
          loading={testing}
        >
          Verify Credentials
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="recipient@example.com"
          className="flex-1 px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm"
        />
        <Button
          icon={Send}
          onClick={() => handleTest(true)}
          disabled={testing || sending || !testEmail.trim()}
          loading={sending}
        >
          Send Test
        </Button>
      </div>

      {result && (
        <div
          className={`p-3 rounded-lg text-sm border space-y-1 ${
            result.success
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          }`}
        >
          <p className="font-medium">
            {result.success ? "Connection OK" : "Connection Failed"}
          </p>
          {result.verified_email && (
            <p>Verified sender: {result.verified_email}</p>
          )}
          {result.send_result && <p>{result.send_result}</p>}
          {result.error && <p>{result.error}</p>}
        </div>
      )}
    </div>
  );
}

export function ApiKeysView() {
  const { keys, loading, error, refresh, setKey, deleteKey } = useSettings();
  const [importExportMsg, setImportExportMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = useCallback(async () => {
    try {
      const filePath = await save({
        title: "Export settings",
        defaultPath: "tv-desktop-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      setBusy(true);
      setImportExportMsg(null);
      const count = await invoke<number>("settings_export_to_file", {
        filePath,
      });
      setImportExportMsg({
        type: "success",
        text: `Exported ${count} key${count !== 1 ? "s" : ""} to ${filePath}`,
      });
    } catch (e) {
      setImportExportMsg({
        type: "error",
        text: formatError(e),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    try {
      const filePath = await open({
        title: "Import settings",
        filters: [
          { name: "Settings", extensions: ["json", "env"] },
          { name: "All Files", extensions: ["*"] },
        ],
        multiple: false,
      });
      if (!filePath) return;
      setBusy(true);
      setImportExportMsg(null);
      const imported = await invoke<string[]>("settings_import_from_file", {
        filePath: filePath as string,
      });
      await refresh();
      setImportExportMsg({
        type: "success",
        text: `Imported ${imported.length} key${imported.length !== 1 ? "s" : ""}`,
      });
    } catch (e) {
      setImportExportMsg({
        type: "error",
        text: formatError(e),
      });
    } finally {
      setBusy(false);
    }
  }, [refresh]);

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
    (k) => k.name === API_KEYS.INTERCOM || k.name === API_KEYS.NOTION || k.name === API_KEYS.APOLLO
  );
  const linkedinKeys = keys.filter(
    (k) => k.name === API_KEYS.LINKEDIN_CLIENT_ID || k.name === API_KEYS.LINKEDIN_CLIENT_SECRET
  );
  const awsKeys = keys.filter(
    (k) =>
      k.name === API_KEYS.AWS_ACCESS_KEY_ID ||
      k.name === API_KEYS.AWS_SECRET_ACCESS_KEY
  );
  const analyticsKeys = keys.filter(
    (k) =>
      k.name === API_KEYS.GA4_SERVICE_ACCOUNT_PATH ||
      k.name === API_KEYS.GA4_PROPERTY_ID
  );
  const emailSettingsKeys = keys.filter(
    (k) => k.name === API_KEYS.EMAIL_API_BASE_URL
  );

  if (loading) {
    return <SectionLoading className="flex-1" />;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            API Keys
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Manage API keys and credentials
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={Upload} onClick={handleImport} disabled={busy} loading={busy} title="Import from JSON or .env file">
            Import
          </Button>
          <Button variant="secondary" icon={Download} onClick={handleExport} disabled={busy} loading={busy} title="Export all settings to JSON">
            Export
          </Button>
          <IconButton icon={RefreshCw} size={18} label="Refresh" onClick={refresh} />
        </div>
      </div>

      {importExportMsg && (
        <div
          className={`p-3 rounded-lg text-sm border ${
            importExportMsg.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          }`}
        >
          {importExportMsg.text}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          <strong>Storage:</strong> All settings stored in{" "}
          <code className="text-xs">~/.tv-desktop/settings.json</code>.
          Export to back up, import to restore on another machine.
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

      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
          AWS / Cloud Storage
        </h3>
        <div className="space-y-3">
          {awsKeys.map((keyInfo) => (
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
          Email
        </h3>
        <div className="space-y-3">
          {emailSettingsKeys.map((keyInfo) => (
            <KeyEditor
              key={keyInfo.name}
              keyInfo={keyInfo}
              onSave={(value) => setKey(keyInfo.name as any, value)}
              onDelete={() => deleteKey(keyInfo.name as any)}
            />
          ))}
          <SesConnectionTest />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
          Google Analytics
        </h3>
        <div className="space-y-3">
          {analyticsKeys.map((keyInfo) => (
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
          LinkedIn
        </h3>
        <div className="space-y-3">
          {linkedinKeys.map((keyInfo) => (
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
