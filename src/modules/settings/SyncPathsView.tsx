// Settings: Sync Paths View + DomainSyncPathRow

import { useState, useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Loader2,
  RefreshCw,
  FolderOpen,
  FileText,
  Database,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useRepository } from "../../stores/repositoryStore";
import {
  useDiscoverDomains,
  useValSyncConfig,
  useUpdateDomainPath,
  type DiscoveredDomain,
} from "../../hooks/val-sync";
import { cn } from "../../lib/cn";

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
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Database size={16} className="text-teal-500 flex-shrink-0" />
          <div className="text-left">
            <span className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">
              {domain.domain}
            </span>
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
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
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-zinc-50 dark:bg-zinc-900/30">
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
                    className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-mono text-xs"
                    autoFocus
                  />
                  <button
                    onClick={handleBrowse}
                    className="p-2 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
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
                <div className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate hover:border-teal-400 dark:hover:border-teal-600 transition-colors">
                  {currentPath}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowse();
                  }}
                  className="p-2 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 transition-colors"
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
              <div className="space-y-0.5 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700">
                {category.outputs.map((output) => (
                  <div
                    key={output.label}
                    className="flex items-center justify-between py-1.5 px-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 first:rounded-t last:rounded-b"
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

export function SyncPathsView() {
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
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
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
