// Settings: VAL Credentials View + DomainCredentialRow

import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Eye,
  EyeOff,
  Check,
  Loader2,
  Upload,
  Database,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useRepository } from "../../stores/repositoryStore";
import {
  useDiscoverDomains,
  useValCredentials,
  useSetValCredentials,
  useValImportCredentials,
  type DiscoveredDomain,
} from "../../hooks/val-sync";

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
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">
            {domain.domain}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
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
            className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 font-mono"
            autoFocus
          />
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-3 py-1.5 pr-8 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 font-mono"
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

export function ValCredentialsView() {
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
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
