// Notion Sync Configurations — list/manage sync configs

import { useState } from "react";
import {
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Cloud,
  RefreshCw,
} from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import {
  useNotionSyncConfigs,
  useUpdateSyncConfig,
  useDeleteSyncConfig,
  useNotionSyncStart,
} from "../../hooks/useNotion";
import { useNotionSync } from "../../hooks/useNotionSync";
import { useProjects } from "../../hooks/work";
import { NotionSyncSetup } from "./NotionSyncSetup";

export function NotionSyncConfigs() {
  const [showSetup, setShowSetup] = useState(false);
  const { data: configs = [], isLoading } = useNotionSyncConfigs();
  const { data: projects = [] } = useProjects();
  const updateConfig = useUpdateSyncConfig();
  const deleteConfig = useDeleteSyncConfig();
  const syncStart = useNotionSyncStart();
  const { isSyncing } = useNotionSync();

  const getProjectName = (id?: string) =>
    projects.find((p) => p.id === id)?.name ?? "Unknown";

  const formatTime = (ts?: string) => {
    if (!ts) return "Never";
    const d = new Date(ts);
    return d.toLocaleString();
  };

  const handleToggle = (configId: string, enabled: boolean) => {
    updateConfig.mutate({ configId, data: { enabled: !enabled } });
  };

  const handleDelete = (configId: string, name: string) => {
    if (!confirm(`Delete sync config "${name}"?`)) return;
    deleteConfig.mutate(configId);
  };

  if (showSetup) {
    return (
      <NotionSyncSetup
        onClose={() => setShowSetup(false)}
        onSaved={() => setShowSetup(false)}
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud size={20} className="text-zinc-500" />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Notion Sync
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => syncStart.mutate()}
            disabled={isSyncing || configs.length === 0}
            loading={isSyncing}
            size="sm"
          >
            Sync Now
          </Button>
          <Button icon={Plus} onClick={() => setShowSetup(true)} size="sm">
            Add Sync
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          Loading...
        </div>
      )}

      {!isLoading && configs.length === 0 && (
        <div className="text-center py-12 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
          <Cloud size={32} className="mx-auto text-zinc-400 mb-3" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
            No Notion syncs configured
          </p>
          <p className="text-xs text-zinc-500 mb-4">
            Connect a Notion database to sync cards as tasks
          </p>
          <Button icon={Plus} onClick={() => setShowSetup(true)} size="sm">
            Add Sync
          </Button>
        </div>
      )}

      {configs.length > 0 && (
        <div className="space-y-2">
          {configs.map((config) => {
            const enabled = config.enabled !== false;
            return (
              <div
                key={config.id}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                  enabled
                    ? "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                    : "border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 opacity-60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {config.name}
                    </span>
                    {enabled && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                    <span>→ {getProjectName(config.target_project_id)}</span>
                    <span>
                      Last sync: {formatTime(config.last_synced_at)}
                    </span>
                    <span>
                      {Object.keys(config.field_mapping || {}).length} fields
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-3">
                  <IconButton
                    icon={enabled ? ToggleRight : ToggleLeft}
                    size={18}
                    label={enabled ? "Disable" : "Enable"}
                    onClick={() => handleToggle(config.id, enabled)}
                    className={
                      enabled ? "text-green-500" : "text-zinc-400"
                    }
                  />
                  <IconButton
                    icon={Trash2}
                    size={16}
                    label="Delete"
                    onClick={() => handleDelete(config.id, config.name)}
                    className="text-zinc-400 hover:text-red-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
