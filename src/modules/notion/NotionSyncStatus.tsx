// Notion Sync Status — badge/indicator for Work Module header

import { RefreshCw, AlertTriangle, Cloud } from "lucide-react";
import { IconButton } from "../../components/ui";
import { useNotionSync } from "../../hooks/useNotionSync";
import { useNotionSyncStart, useNotionSyncStatus } from "../../hooks/useNotion";

export function NotionSyncStatus() {
  const { isSyncing, progress, error, filterWarning, clearFilterWarning } = useNotionSync();
  const { data: status } = useNotionSyncStatus();
  const syncStart = useNotionSyncStart();

  // Don't show anything if no configs exist
  if (!status || status.configs_count === 0) return null;

  const handleSync = () => {
    if (!isSyncing) syncStart.mutate();
  };

  const formatTime = (ts?: string | null) => {
    if (!ts) return "Never";
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      {error ? (
        <AlertTriangle size={14} className="text-amber-500" />
      ) : filterWarning ? (
        <AlertTriangle size={14} className="text-amber-500" />
      ) : isSyncing ? (
        <RefreshCw size={14} className="animate-spin text-brand-primary" />
      ) : (
        <Cloud size={14} />
      )}

      {isSyncing && progress ? (
        <span className="text-brand-primary">{progress.message}</span>
      ) : error ? (
        <span className="text-amber-500 truncate max-w-[200px]" title={error}>
          Sync error
        </span>
      ) : filterWarning ? (
        <button
          onClick={clearFilterWarning}
          className="text-amber-500 truncate max-w-[250px] hover:underline text-left"
          title={`Filter issue in "${filterWarning.config}": ${filterWarning.warning}. Synced without filter. Click to dismiss.`}
        >
          Filter issue: {filterWarning.config}
        </button>
      ) : (
        <span title={`${status.enabled_count} sync(s) active`}>
          Notion: {formatTime(status.last_sync)}
        </span>
      )}

      <IconButton
        icon={RefreshCw}
        size={14}
        label="Sync Notion"
        onClick={handleSync}
        disabled={isSyncing}
        className={isSyncing ? "animate-spin" : ""}
      />
    </div>
  );
}
