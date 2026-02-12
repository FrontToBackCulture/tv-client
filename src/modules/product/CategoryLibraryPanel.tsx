// src/modules/product/CategoryLibraryPanel.tsx
// Editable panel for managing classification values used across data models.
// Values persist to localStorage via the classification store.
// Usage counts computed by scanning overview.md / definition_analysis.json per domain.

import { useState, useRef, useMemo } from "react";
import { Database, Tag, Folder, Activity, CheckCircle, Server, X, Plus, RotateCcw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import {
  useClassificationStore,
  type ClassificationField,
} from "../../stores/classificationStore";
import { useValDomains } from "../../hooks/useValSync";

// ---------------------------------------------------------------------------
// Classification counts — scan overview.md / definition_analysis.json per domain
// ---------------------------------------------------------------------------

type CountsMap = Record<ClassificationField, Map<string, number>>;

const EMPTY_COUNTS: CountsMap = {
  dataCategory: new Map(),
  dataSubCategory: new Map(),
  dataType: new Map(),
  usageStatus: new Map(),
  action: new Map(),
  dataSource: new Map(),
  sourceSystem: new Map(),
  tags: new Map(),
  solution: new Map(),
  sitemapGroup1: new Map(),
  sitemapGroup2: new Map(),
};

/** Parse a markdown table row like | **Data Category** | Mapping | */
function parseOverviewClassifications(content: string, inc: (field: ClassificationField, value: string) => void) {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const parts = trimmed.split("|");
    if (parts.length < 3) continue;
    const key = parts[1].trim().replace(/\*\*/g, "").toLowerCase();
    const value = parts[2].trim();
    if (!value || value === "Value" || value.startsWith("-")) continue;

    switch (key) {
      case "data category": inc("dataCategory", value); break;
      case "data sub category": inc("dataSubCategory", value); break;
      case "table type": case "data type": inc("dataType", value); break;
      case "usage status": inc("usageStatus", value); break;
      case "action": inc("action", value); break;
      case "data source": inc("dataSource", value); break;
      case "source system": inc("sourceSystem", value); break;
      case "tags":
        for (const t of value.split(",")) {
          const tag = t.trim();
          if (tag) inc("tags", tag);
        }
        break;
    }
  }
}

function parseAnalysisClassifications(
  analysis: Record<string, unknown>,
  inc: (field: ClassificationField, value: string) => void,
) {
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  if (str(analysis.dataCategory)) inc("dataCategory", analysis.dataCategory as string);
  if (str(analysis.dataSubCategory)) inc("dataSubCategory", analysis.dataSubCategory as string);
  if (str(analysis.usageStatus)) inc("usageStatus", analysis.usageStatus as string);
  if (str(analysis.action)) inc("action", analysis.action as string);
  if (str(analysis.dataSource)) inc("dataSource", analysis.dataSource as string);
  if (str(analysis.sourceSystem)) inc("sourceSystem", analysis.sourceSystem as string);
  // dataType lives under classification.dataType
  const cls = analysis.classification as Record<string, unknown> | undefined;
  if (cls && str(cls.dataType)) inc("dataType", cls.dataType as string);
  // tags — comma-separated
  if (str(analysis.tags)) {
    for (const t of (analysis.tags as string).split(",")) {
      const tag = t.trim();
      if (tag) inc("tags", tag);
    }
  }
}

interface CountsResult {
  counts: CountsMap;
  totalTables: number;
  domainCount: number;
}

function useClassificationCounts() {
  const { data: domains = [] } = useValDomains();

  return useQuery<CountsResult>({
    queryKey: ["classification-counts", domains.map((d) => d.domain).join(",")],
    queryFn: async () => {
      const counts: CountsMap = {
        dataCategory: new Map(),
        dataSubCategory: new Map(),
        dataType: new Map(),
        usageStatus: new Map(),
        action: new Map(),
        dataSource: new Map(),
        sourceSystem: new Map(),
        tags: new Map(),
        solution: new Map(),
        sitemapGroup1: new Map(),
        sitemapGroup2: new Map(),
      };
      let totalTables = 0;

      const inc = (field: ClassificationField, value: string) => {
        const map = counts[field];
        map.set(value, (map.get(value) ?? 0) + 1);
      };

      for (const domain of domains) {
        const dmPath = `${domain.global_path}/data_models`;

        // List table directories
        let entries: { name: string; path: string; is_directory: boolean }[];
        try {
          entries = await invoke<typeof entries>("list_directory", { path: dmPath });
        } catch {
          continue; // domain has no data_models folder
        }

        for (const entry of entries) {
          if (!entry.is_directory) continue;

          // Try overview.md first
          try {
            const content = await invoke<string>("read_file", {
              path: `${entry.path}/overview.md`,
            });
            totalTables++;
            parseOverviewClassifications(content, inc);
            continue;
          } catch {
            // no overview.md, fall through
          }

          // Fallback: definition_analysis.json
          try {
            const content = await invoke<string>("read_file", {
              path: `${entry.path}/definition_analysis.json`,
            });
            const analysis = JSON.parse(content);
            totalTables++;
            parseAnalysisClassifications(analysis, inc);
          } catch {
            // no analysis either, skip
          }
        }
      }

      return { counts, totalTables, domainCount: domains.length };
    },
    enabled: domains.length > 0,
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TAB_CONFIG: {
  id: string;
  field: ClassificationField;
  label: string;
  icon: typeof Tag;
}[] = [
  { id: "category", field: "dataCategory", label: "Category", icon: Folder },
  { id: "sub-category", field: "dataSubCategory", label: "Sub Category", icon: Tag },
  { id: "tags", field: "tags", label: "Tags", icon: Tag },
  { id: "source", field: "dataSource", label: "Data Source", icon: Activity },
  { id: "source-system", field: "sourceSystem", label: "Source System", icon: Server },
  { id: "data-type", field: "dataType", label: "Data Type", icon: Database },
  { id: "status", field: "usageStatus", label: "Usage Status", icon: CheckCircle },
  { id: "action", field: "action", label: "Action", icon: CheckCircle },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CategoryLibraryPanel() {
  const [activeTabId, setActiveTabId] = useState("category");
  const [newValue, setNewValue] = useState("");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "count">("name");
  const inputRef = useRef<HTMLInputElement>(null);

  const { values, addValue, removeValue, resetField } = useClassificationStore();
  const { data: countsData, isLoading: countsLoading } = useClassificationCounts();

  const activeTab = TAB_CONFIG.find((t) => t.id === activeTabId) ?? TAB_CONFIG[0];
  const activeValues = values[activeTab.field];

  const countMap = countsData?.counts[activeTab.field] ?? EMPTY_COUNTS[activeTab.field];

  // Filtered + sorted display list
  const displayValues = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    let items = activeValues
      .filter((v) => v.toLowerCase().includes(lowerFilter))
      .map((v) => ({ value: v, count: countMap.get(v) ?? 0 }));

    if (sortBy === "count") {
      items.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    } else {
      items.sort((a, b) => a.value.localeCompare(b.value));
    }

    return items;
  }, [activeValues, filter, sortBy, countMap]);

  // Total assignments for active field
  const totalAssignments = useMemo(() => {
    let total = 0;
    for (const c of countMap.values()) total += c;
    return total;
  }, [countMap]);

  const handleAdd = () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    addValue(activeTab.field, trimmed);
    setNewValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Category Library
          </h2>
          <p className="text-sm text-zinc-500">
            Edit classification values used in data model dropdowns
          </p>
        </div>
        <button
          onClick={() => resetField(activeTab.field)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          title={`Reset ${activeTab.label} to defaults`}
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800 flex gap-1 overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTabId === tab.id;
          const count = values[tab.field].length;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTabId(tab.id); setNewValue(""); setFilter(""); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
                isActive
                  ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
              )}
            >
              <Icon size={12} />
              {tab.label}
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] rounded-full",
                isActive
                  ? "bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200"
                  : "bg-slate-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Add new value */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Add new ${activeTab.label.toLowerCase()}...`}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newValue.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Filter + Sort bar */}
      <div className="px-4 py-1.5 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2">
        <Search size={12} className="text-zinc-400 shrink-0" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter values..."
          className="flex-1 min-w-0 bg-transparent text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none"
        />
        <div className="flex gap-1 ml-auto shrink-0 text-[10px] font-medium">
          <button
            onClick={() => setSortBy("name")}
            className={cn(
              "px-1 transition-colors",
              sortBy === "name" ? "text-teal-600 dark:text-teal-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            Name
          </button>
          <span className="text-zinc-300 dark:text-zinc-600">|</span>
          <button
            onClick={() => setSortBy("count")}
            className={cn(
              "px-1 transition-colors",
              sortBy === "count" ? "text-teal-600 dark:text-teal-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            )}
          >
            Count
          </button>
        </div>
      </div>

      {/* Content — multi-column grid */}
      <div className="flex-1 overflow-auto px-4 py-2">
        {displayValues.length > 0 ? (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-0.5">
            {displayValues.map(({ value, count }) => (
              <div
                key={value}
                className={cn(
                  "group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors min-w-0",
                  !countsLoading && count === 0 && "opacity-50"
                )}
              >
                <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate flex-1 min-w-0">
                  {value}
                </span>
                <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                  {countsLoading ? "\u2014" : count}
                </span>
                <button
                  onClick={() => removeValue(activeTab.field, value)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all shrink-0"
                  title={`Remove "${value}"`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : activeValues.length > 0 ? (
          <p className="text-sm text-zinc-400 italic">No values matching &ldquo;{filter}&rdquo;</p>
        ) : (
          <p className="text-sm text-zinc-400 italic">No values. Add one above or reset to defaults.</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-zinc-800 text-xs text-zinc-500">
        {activeValues.length} values
        {!countsLoading && countsData && (
          <> &middot; {totalAssignments} assignments across {countsData.domainCount} domains</>
        )}
      </div>
    </div>
  );
}
