// Settings: MCP Endpoints View + DomainMcpRow

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  Loader2,
  RefreshCw,
  Globe,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useRepository } from "../../stores/repositoryStore";
import {
  useDiscoverDomains,
  type DiscoveredDomain,
} from "../../hooks/val-sync";

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
            className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 font-mono"
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

export function McpEndpointsView() {
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
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
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
