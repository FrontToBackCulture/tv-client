// Notion Sync Configurations — list/manage sync configs

import { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Cloud,
  RefreshCw,
  Pencil,
  X,
  Check,
  Filter,
} from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import {
  useNotionSyncConfigs,
  useUpdateSyncConfig,
  useDeleteSyncConfig,
  useNotionSyncStart,
  useNotionPreview,
} from "../../hooks/useNotion";
import { useNotionSync } from "../../hooks/useNotionSync";
import { useProjects } from "../../hooks/work";
import { NotionSyncSetup } from "./NotionSyncSetup";
import type { SyncConfig } from "../../lib/notion/types";

export function NotionSyncConfigs() {
  const [showSetup, setShowSetup] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
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
            const isEditing = editingConfigId === config.id;
            return (
              <div key={config.id}>
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                    enabled
                      ? "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                      : "border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 opacity-60"
                  } ${isEditing ? "rounded-b-none" : ""}`}
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
                      {config.filter && (
                        <span className="flex items-center gap-0.5 text-teal-600 dark:text-teal-400">
                          <Filter size={10} />
                          Filtered
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-3">
                    <IconButton
                      icon={Pencil}
                      size={14}
                      label="Edit filter"
                      onClick={() => setEditingConfigId(isEditing ? null : config.id)}
                      className={isEditing ? "text-teal-500" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}
                    />
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
                {isEditing && (
                  <FilterEditor
                    config={config}
                    onSave={(filter) => {
                      updateConfig.mutate({ configId: config.id, data: { filter } });
                      setEditingConfigId(null);
                    }}
                    onCancel={() => setEditingConfigId(null)}
                    isSaving={updateConfig.isPending}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline filter editor panel
function FilterEditor({
  config,
  onSave,
  onCancel,
  isSaving,
}: {
  config: SyncConfig;
  onSave: (filter: Record<string, unknown> | undefined) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [filterJson, setFilterJson] = useState(
    config.filter ? JSON.stringify(config.filter, null, 2) : ""
  );

  const parsedFilter = useMemo(() => {
    if (!filterJson.trim()) return { valid: true, value: undefined };
    try {
      return { valid: true, value: JSON.parse(filterJson) };
    } catch {
      return { valid: false, value: undefined };
    }
  }, [filterJson]);

  // Preview with current filter
  const { data: preview = [], isFetching: previewLoading } = useNotionPreview(
    parsedFilter.valid ? config.notion_database_id : null,
    parsedFilter.value
  );

  const hasChanged = filterJson.trim() !== (config.filter ? JSON.stringify(config.filter, null, 2) : "");

  return (
    <div className="border border-t-0 border-zinc-200 dark:border-zinc-700 rounded-b-lg bg-zinc-50 dark:bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Notion API Filter
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            icon={Check}
            onClick={() => onSave(parsedFilter.value)}
            disabled={!parsedFilter.valid || !hasChanged}
            loading={isSaving}
          >
            Save Filter
          </Button>
        </div>
      </div>

      {/* Human-readable summary */}
      {parsedFilter.valid && parsedFilter.value && (
        <FilterSummary filter={parsedFilter.value} />
      )}

      <textarea
        value={filterJson}
        onChange={(e) => setFilterJson(e.target.value)}
        rows={12}
        spellCheck={false}
        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
        placeholder='{"property": "Status", "status": {"does_not_equal": "Done"}}'
      />

      {filterJson.trim() && !parsedFilter.valid && (
        <p className="text-xs text-red-500">Invalid JSON</p>
      )}

      {/* Preview */}
      {parsedFilter.valid && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">
              Preview: {previewLoading ? "loading..." : `${preview.length} most recent matching cards`}
            </span>
          </div>
          {!previewLoading && preview.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {preview.map((card) => (
                <div
                  key={card.notion_page_id}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-800 rounded border border-zinc-100 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 truncate"
                >
                  {card.title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Notion filter → human-readable summary (JSX)
// ============================================================================

const OP: Record<string, string> = {
  equals: "is", does_not_equal: "is not",
  contains: "contains", does_not_contain: "does not contain",
  starts_with: "starts with", ends_with: "ends with",
  greater_than: ">", greater_than_or_equal_to: ">=",
  less_than: "<", less_than_or_equal_to: "<=",
  before: "before", after: "after",
  on_or_before: "on or before", on_or_after: "on or after",
  past_week: "in the past week", past_month: "in the past month", past_year: "in the past year",
  next_week: "in the next week", next_month: "in the next month", next_year: "in the next year",
  is_empty: "is empty", is_not_empty: "is not empty",
};

/** Describe a single leaf filter node as a string */
function describeLeaf(node: Record<string, unknown>): string {
  // Timestamp filter: { timestamp: "last_edited_time", last_edited_time: { after: "..." } }
  if (node.timestamp && typeof node.timestamp === "string") {
    const name = (node.timestamp as string).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const cond = node[node.timestamp as string] as Record<string, unknown> | undefined;
    if (cond) return `${name} ${fmtCond(cond)}`;
    return name;
  }
  // Property filter: { property: "Status", status: { equals: "Done" } }
  if (node.property && typeof node.property === "string") {
    const prop = node.property as string;
    const typeKey = Object.keys(node).find(k => k !== "property");
    if (typeKey) {
      const cond = node[typeKey];
      if (cond && typeof cond === "object" && !Array.isArray(cond))
        return `${prop} ${fmtCond(cond as Record<string, unknown>)}`;
    }
    return prop;
  }
  return JSON.stringify(node).slice(0, 60);
}

function fmtCond(c: Record<string, unknown>): string {
  return Object.entries(c).map(([op, val]) => {
    const label = OP[op] || op;
    if (val === true) return label;
    if (typeof val === "string" || typeof val === "number") return `${label} "${val}"`;
    return label;
  }).join(" ");
}

/**
 * For the common pattern: OR of AND branches that share conditions,
 * factor out shared conditions and group the varying ones.
 *
 * e.g. 15 branches each with (Status=X AND Created>=date AND Edited>=date)
 * → "Status is one of: X, Y, Z... AND Created time >= date AND Edited time >= date"
 */
function FilterSummary({ filter }: { filter: Record<string, unknown> }) {
  try {
    const lines = buildLines(filter);
    return (
      <div className="px-3 py-2.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800/50 text-xs text-teal-800 dark:text-teal-300 space-y-1">
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    );
  } catch {
    return (
      <div className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-500">
        Custom filter
      </div>
    );
  }
}

function buildLines(node: Record<string, unknown>): string[] {
  // Simple leaf
  if (node.property || node.timestamp) {
    return [describeLeaf(node)];
  }

  // AND: each child is a line
  if (node.and && Array.isArray(node.and)) {
    const children = node.and as Record<string, unknown>[];
    const lines: string[] = [];
    for (const child of children) {
      lines.push(...buildLines(child));
    }
    return lines;
  }

  // OR: try to factor out shared conditions from AND branches
  if (node.or && Array.isArray(node.or)) {
    const branches = node.or as Record<string, unknown>[];

    // Case 1: OR of AND branches — factor out shared conditions
    const allAnd = branches.every(b => b.and && Array.isArray(b.and));
    if (allAnd && branches.length >= 2) {
      return describeOrOfAnd(branches);
    }

    // Case 2: OR of leaf nodes — group by property
    const allLeaf = branches.every(b => b.property || b.timestamp);
    if (allLeaf) {
      return describeOrOfLeaves(branches);
    }

    // Fallback: just list them
    return branches.map(b => describeLeaf(b));
  }

  return [JSON.stringify(node).slice(0, 80)];
}

/** OR of AND branches: find shared conditions, group varying ones */
function describeOrOfAnd(branches: Record<string, unknown>[]): string[] {
  // Parse each branch into leaf descriptions
  const branchLeaves = branches.map(b => {
    const children = b.and as Record<string, unknown>[];
    return children.map(c => describeLeaf(c));
  });

  // Find conditions that appear in ALL branches (shared)
  const firstSet = new Set(branchLeaves[0]);
  const shared: string[] = [];
  for (const cond of firstSet) {
    if (branchLeaves.every(leaves => leaves.includes(cond))) {
      shared.push(cond);
    }
  }

  // Varying conditions: what's unique per branch
  const sharedSet = new Set(shared);
  const varying: string[][] = branchLeaves.map(leaves =>
    leaves.filter(l => !sharedSet.has(l))
  );

  const lines: string[] = [];

  // Group varying conditions by property name
  if (varying.some(v => v.length > 0)) {
    // Collect all varying values grouped by property+operator
    const grouped = new Map<string, string[]>();
    const propOpPattern = /^(.+?) (is|is not|equals|does not equal|contains|does not contain|before|after|on or before|on or after|>=|<=|>|<) "(.+)"$/;

    for (const varySet of varying) {
      for (const desc of varySet) {
        const match = desc.match(propOpPattern);
        if (match) {
          const key = `${match[1]}||${match[2]}`;
          const arr = grouped.get(key) || [];
          if (!arr.includes(match[3])) arr.push(match[3]);
          grouped.set(key, arr);
        } else {
          // ungroupable
          const arr = grouped.get(desc) || [];
          grouped.set(desc, arr);
        }
      }
    }

    for (const [key, values] of grouped) {
      const sepIdx = key.indexOf("||");
      if (sepIdx >= 0 && values.length > 0) {
        const prop = key.slice(0, sepIdx);
        const op = key.slice(sepIdx + 2);
        if (values.length === 1) {
          lines.push(`${prop} ${op} "${values[0]}"`);
        } else {
          lines.push(`${prop} ${op} any of: ${values.join(", ")}`);
        }
      } else {
        lines.push(key);
      }
    }
  }

  // Add shared conditions
  for (const s of shared) {
    lines.push(s);
  }

  return lines;
}

/** OR of leaf nodes: group by property */
function describeOrOfLeaves(branches: Record<string, unknown>[]): string[] {
  const descs = branches.map(b => describeLeaf(b));
  const propOpPattern = /^(.+?) (is|is not) "(.+)"$/;
  const grouped = new Map<string, string[]>();
  const ungrouped: string[] = [];

  for (const desc of descs) {
    const match = desc.match(propOpPattern);
    if (match) {
      const key = `${match[1]}||${match[2]}`;
      const arr = grouped.get(key) || [];
      if (!arr.includes(match[3])) arr.push(match[3]);
      grouped.set(key, arr);
    } else {
      ungrouped.push(desc);
    }
  }

  const lines: string[] = [];
  for (const [key, values] of grouped) {
    const [prop, op] = key.split("||");
    if (values.length === 1) {
      lines.push(`${prop} ${op} "${values[0]}"`);
    } else {
      lines.push(`${prop} ${op} any of: ${values.join(", ")}`);
    }
  }
  lines.push(...ungrouped);
  return lines;
}
