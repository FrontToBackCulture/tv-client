// src/modules/library/TableDetailPreview.tsx
// Right panel preview component for table details in review mode

import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  X,
  ExternalLink,
  FolderOpen,
  FileText,
  Table,
  Database,
  Loader2,
  AlertTriangle,
  Activity,
  Hash,
  Calendar,
  Sparkles,
  FileOutput,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Info,
  Workflow,
  Search,
  LayoutDashboard,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Upload,
  Tag,
} from "lucide-react";
import { MarkdownViewer } from "./MarkdownViewer";
import { cn } from "../../lib/cn";
import {
  usePrepareTableOverview,
  useSampleTableData,
  useFetchCategoricalValues,
  useAnalyzeTableData,
  useGenerateTableOverviewMd,
} from "../../hooks/useValSync";

// Row data from grid (health/freshness info plus classification)
interface GridRowData {
  daysSinceCreated: number | null;
  daysSinceUpdate: number | null;
  rowCount: number | null;
  dataSource: string | null;
  dataCategory: string | null;
  dataSubCategory: string | null;
  usageStatus: string | null;
  action: string | null;
  space: string | null;
  // Additional fields from grid
  dataType: string | null;
  suggestedName: string | null;
  summaryShort: string | null;
  summaryFull: string | null;
  tags: string | null;
  sourceSystem: string | null;
}

interface TableDetailPreviewProps {
  tablePath: string;
  tableName: string;
  rowData?: GridRowData | null;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  onFieldChange?: (field: string, value: string | number | null) => void;
  onSaveBeforeGenerate?: () => Promise<void>;
  onSyncToGrid?: () => void;
}

// Dropdown options for classification fields - synced with CategoryLibraryPanel
const CATEGORY_OPTIONS = [
  "Mapping", "Master List", "Transaction", "Report", "Staging", "Archive", "System",
  "GL", "AP", "AR", "Receipt", "Payment", "Fee", "Tax", "Product", "Stock",
  "Order", "Delivery", "Customer", "Employee", "Other"
];
const SUB_CATEGORY_OPTIONS = [
  "Outlet", "Brand", "Platform", "Fulfilment Type", "Other"
];
const TAG_OPTIONS = [
  "Mapping", "Outlet", "Brand", "Platform", "Manual Upload", "Outlet Mapping",
  "GL Entry", "Journal", "In Use", "Receipt", "Transaction", "POS", "Delivery",
  "Payment", "Refund", "Settlement", "Commission", "Fee", "Tax", "Master Data",
  "Configuration", "Historical", "Archive", "Sales", "Daily", "Monthly"
];
const STATUS_OPTIONS = ["In Use", "Not Used", "Historically Used", "I Dunno"];
const ACTION_OPTIONS = ["None", "To Review", "To Delete", "Approved"];
const DATA_SOURCE_OPTIONS = [
  "POS", "ERP", "Bank", "Manual Upload", "API", "File Import",
  "System Generated", "Integration", "Unknown"
];
const TABLE_TYPE_OPTIONS = [
  "Transactional", "Master Data", "Mapping", "Configuration",
  "Report", "Staging", "Archive", "System"
];
const SOURCE_SYSTEM_OPTIONS = [
  "Dine Connect", "Square", "Revel", "Toast", "Lightspeed",
  "Oracle", "SAP", "NetSuite", "QuickBooks", "Xero",
  "Shopify", "WooCommerce", "Magento", "Custom", "Other"
];

// TagsInput component - displays tags as pills with add/remove
function TagsInput({
  value,
  onChange,
  suggestions
}: {
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
}) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const tags = useMemo(() =>
    value ? value.split(",").map(t => t.trim()).filter(Boolean) : [],
    [value]
  );

  const filteredSuggestions = useMemo(() =>
    suggestions.filter(s =>
      !tags.includes(s) &&
      s.toLowerCase().includes(inputValue.toLowerCase())
    ).slice(0, 8),
    [suggestions, tags, inputValue]
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const newTags = [...tags, trimmed].join(", ");
      onChange(newTags);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = tags.filter(t => t !== tagToRemove).join(", ");
    onChange(newTags);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1 p-1.5 min-h-[32px] rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-teal-900 dark:hover:text-teal-100"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          className="flex-1 min-w-[60px] text-xs bg-transparent outline-none text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-auto">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(suggestion)}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ComboBox component - dropdown with custom value entry
function ComboBox({
  value,
  onChange,
  options,
  placeholder = "Select...",
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filteredOptions = useMemo(() =>
    options.filter(opt =>
      opt.toLowerCase().includes(inputValue.toLowerCase())
    ),
    [options, inputValue]
  );

  const handleSelect = (opt: string) => {
    onChange(opt);
    setInputValue(opt);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setInputValue("");
    // Keep dropdown open so user can immediately select a new value
    setIsOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false);
      // Save the input value (allow empty to clear)
      if (inputValue !== value) {
        onChange(inputValue.trim());
      }
    }, 150);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full text-xs px-2 py-1.5 pr-6 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
      />
      <ChevronDown
        size={12}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
      />
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-auto">
          {/* Clear option */}
          {value && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-zinc-700 text-zinc-500 italic border-b border-slate-100 dark:border-zinc-700"
            >
              Clear selection
            </button>
          )}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <button
                key={opt}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(opt)}
                className={cn(
                  "w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-zinc-700",
                  opt === value
                    ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                    : "text-zinc-800 dark:text-zinc-200"
                )}
              >
                {opt}
              </button>
            ))
          ) : inputValue.trim() ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(inputValue.trim())}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-zinc-700 text-teal-600 dark:text-teal-400"
            >
              Add "{inputValue.trim()}"
            </button>
          ) : !value ? (
            <div className="px-3 py-1.5 text-xs text-zinc-400">Type to search or add new</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Basic info structure from definition_details.json
interface TableDetails {
  meta?: {
    tableName: string;
    displayName?: string;
    space?: string;
    zone?: string;
    tableType?: string;
    dataSource?: string;
    generatedAt?: string;
  };
  health?: {
    score?: number;
    status?: string;
    rowCount?: string | number;
    daysSinceCreated?: number | null;
    daysSinceUpdate?: number | null;
    freshnessColumn?: string | null;
    freshnessColumnName?: string | null;
  };
  coverage?: {
    earliest?: string | null;
    latest?: string | null;
    firstCreated?: string | null;
    lastCreated?: string | null;
    totalRecords?: number | null;
  };
  columns?: {
    system?: Array<{ name: string; column: string; type: string }>;
    data?: Array<{ name: string; column: string; type: string }>;
    custom?: Array<{ name: string; column: string; type: string }>;
    calculated?: Array<{
      name: string;
      column: string;
      type: string;
      ruleType?: string;
      lookupTable?: { tableName: string; displayName: string } | null;
      rules?: Record<string, unknown> | null;
    }>;
  };
  relationships?: {
    sourceWorkflow?: {
      id: string;
      name: string;
      description?: string;
    } | null;
    downstreamWorkflows?: Array<{
      id: string;
      name: string;
      targetTable?: { tableName: string; displayName: string } | null;
    }>;
    relatedTables?: Array<{
      tableName: string;
      displayName: string;
      relationshipType: string;
      fieldCount: number;
      fields?: Array<{
        fieldName: string;
        ruleType: string;
        lookupColumn?: string | null;
        refColumn?: string | null;
        returnColumn?: string | null;
      }>;
    }>;
    dependencies?: Array<{
      type: string;
      id: string;
      name: string;
    }>;
    // New dependency arrays
    workflows?: Array<{
      id: number;
      name: string;
      relationship: string; // "source" or "target"
      scheduled: boolean;
      cronExpression?: string | null;
      effectiveCronExpression?: string | null;
      isChildWorkflow?: boolean;
      parentWorkflowId?: number | null;
      parentWorkflowName?: string | null;
      lastRunStatus?: string | null;
      lastRunAt?: string | null;
      updatedDate?: string | null;
    }>;
    queries?: Array<{
      id: number;
      dsid?: number | string | null; // Can be number or empty string ""
      name: string;
      updatedDate?: string | null;
    }>;
    dashboards?: Array<{
      id: number;
      name: string;
      updatedDate?: string | null;
      queryIds?: number[];
    }>;
  };
}

// Sample data structure
interface TableSample {
  rows?: Array<Record<string, unknown>>;
  meta?: {
    tableName?: string;
    sampledAt?: string;
    rowCount?: number;
    totalRowCount?: number;
    requestedRows?: number;
    orderBy?: string;
    orderDirection?: string;
    orderSource?: string;
    queryError?: string | null;
  };
  columns?: Array<{ name: string; column: string; type: string }>;
  columnStats?: Record<string, {
    type?: string;
    displayName?: string;
    distinctCount?: number;
    isCategorical?: boolean;
    distinctValues?: string[];
  }>;
}

// AI Analysis structure
interface TableAnalysis {
  meta?: {
    tableName?: string;
    displayName?: string;
    analyzedAt?: string;
    model?: string;
  };
  classification?: {
    dataType?: string;
    confidence?: string;
    reasoning?: string;
  };
  dataCategory?: string;
  dataSubCategory?: string;
  dataSource?: string;
  sourceSystem?: string;
  usageStatus?: string;
  action?: string;
  tags?: string;
  suggestedName?: string;
  summary?: {
    short?: string;
    full?: string;
  };
  useCases?: {
    operational?: string[];
    strategic?: string[];
  };
  columnDescriptions?: Record<string, string>;
}

type TabType = "overview" | "details" | "sample";

// Extract domain name from path for VAL URL
function extractDomainFromPath(path: string): string | null {
  const match = path.match(/\/domains\/(production|staging|demo|templates)\/([^/]+)/);
  return match ? match[2] : null;
}

// Build VAL URL for table
function getValUrl(path: string, tableId: string): string | null {
  const domain = extractDomainFromPath(path);
  if (!domain) return null;
  return `https://${domain}.thinkval.io/data-models/${tableId}`;
}

export function TableDetailPreview({
  tablePath,
  tableName,
  rowData,
  onClose,
  onNavigate,
  onFieldChange,
  onSaveBeforeGenerate,
  onSyncToGrid,
}: TableDetailPreviewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [overviewContent, setOverviewContent] = useState<string | null>(null);
  const [overviewModified, setOverviewModified] = useState<string | null>(null);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [sample, setSample] = useState<TableSample | null>(null);
  const [analysis, setAnalysis] = useState<TableAnalysis | null>(null);

  // Pipeline mutations
  const prepareOverviewMutation = usePrepareTableOverview();
  const sampleDataMutation = useSampleTableData();
  const fetchCategoricalMutation = useFetchCategoricalValues();
  const analyzeDataMutation = useAnalyzeTableData();
  const generateOverviewMdMutation = useGenerateTableOverviewMd();

  // Extract domain from path
  const domain = extractDomainFromPath(tablePath);

  // Reload analysis from file and push to grid
  const reloadAnalysisFromFile = useCallback(async (pushToGrid: boolean = false) => {
    try {
      const content = await invoke<string>("read_file", {
        path: `${tablePath}/definition_analysis.json`,
      });
      const analysisData = JSON.parse(content);
      setAnalysis(analysisData);

      if (pushToGrid && onFieldChange) {
        // Push all classification values to grid
        if (analysisData.suggestedName) onFieldChange("suggestedName", analysisData.suggestedName);
        if (analysisData.summary?.short) onFieldChange("summaryShort", analysisData.summary.short);
        if (analysisData.summary?.full) onFieldChange("summaryFull", analysisData.summary.full);
        if (analysisData.dataCategory) onFieldChange("dataCategory", analysisData.dataCategory);
        if (analysisData.dataSubCategory) onFieldChange("dataSubCategory", analysisData.dataSubCategory);
        if (analysisData.dataSource) onFieldChange("dataSource", analysisData.dataSource);
        if (analysisData.sourceSystem) onFieldChange("sourceSystem", analysisData.sourceSystem);
        if (analysisData.usageStatus) onFieldChange("usageStatus", analysisData.usageStatus);
        if (analysisData.tags) onFieldChange("tags", analysisData.tags);
        if (analysisData.classification?.dataType) onFieldChange("dataType", analysisData.classification.dataType);
        if (analysisData.action) onFieldChange("action", analysisData.action);
      }
    } catch {
      // File doesn't exist or couldn't be read
    }
  }, [tablePath, onFieldChange]);

  // Load data
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Load overview.md
        try {
          const content = await invoke<string>("read_file", {
            path: `${tablePath}/overview.md`,
          });
          if (!cancelled) setOverviewContent(content);
          // Get file modified time
          try {
            const fileInfo = await invoke<{ modified?: string }>("get_file_info", {
              path: `${tablePath}/overview.md`,
            });
            if (!cancelled) setOverviewModified(fileInfo.modified || null);
          } catch {
            if (!cancelled) setOverviewModified(null);
          }
        } catch {
          if (!cancelled) {
            setOverviewContent(null);
            setOverviewModified(null);
          }
        }

        // Load definition_details.json
        try {
          const content = await invoke<string>("read_file", {
            path: `${tablePath}/definition_details.json`,
          });
          if (!cancelled) setDetails(JSON.parse(content));
        } catch {
          // Try definition.json as fallback
          try {
            const content = await invoke<string>("read_file", {
              path: `${tablePath}/definition.json`,
            });
            if (!cancelled) setDetails(JSON.parse(content));
          } catch {
            if (!cancelled) setDetails(null);
          }
        }

        // Load definition_sample.json
        let sampleData: TableSample | null = null;
        try {
          const content = await invoke<string>("read_file", {
            path: `${tablePath}/definition_sample.json`,
          });
          sampleData = JSON.parse(content);
        } catch {
          // No sample file
        }

        // Load definition_categorical.json and merge into sample
        try {
          const content = await invoke<string>("read_file", {
            path: `${tablePath}/definition_categorical.json`,
          });
          const categoricalData = JSON.parse(content);
          if (sampleData) {
            // Merge categorical columns into sample
            sampleData = {
              ...sampleData,
              columnStats: {
                ...sampleData.columnStats,
                ...categoricalData.columns,
              },
            };
          } else {
            // Create minimal sample structure with categorical data
            sampleData = {
              meta: {
                tableName: tableName,
                sampledAt: categoricalData.meta?.fetchedAt,
                totalRowCount: categoricalData.meta?.totalRowCount,
              },
              columnStats: categoricalData.columns || {},
              rows: [],
            } as TableSample;
          }
        } catch {
          // No categorical file
        }

        if (!cancelled) setSample(sampleData);

        // Load definition_analysis.json
        try {
          const content = await invoke<string>("read_file", {
            path: `${tablePath}/definition_analysis.json`,
          });
          if (!cancelled) setAnalysis(JSON.parse(content));
        } catch {
          if (!cancelled) setAnalysis(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [tablePath]);

  // Handle pipeline step execution
  const handlePipelineStep = useCallback(
    async (step: "prepare" | "sample" | "categorical" | "analyze" | "overview", freshnessColumn?: string) => {
      if (!domain) return;

      const callbacks = {
        onSuccess: async () => {
          // Reload relevant data based on step
          if (step === "overview") {
            try {
              const content = await invoke<string>("read_file", {
                path: `${tablePath}/overview.md`,
              });
              setOverviewContent(content);
              // Get updated file modified time
              try {
                const fileInfo = await invoke<{ modified?: string }>("get_file_info", {
                  path: `${tablePath}/overview.md`,
                });
                setOverviewModified(fileInfo.modified || null);
              } catch {
                // ignore
              }
            } catch {
              // ignore
            }
          } else if (step === "prepare") {
            try {
              const content = await invoke<string>("read_file", {
                path: `${tablePath}/definition_details.json`,
              });
              const detailsData = JSON.parse(content);
              setDetails(detailsData);
              // Push details values to grid
              if (onFieldChange) {
                // Table type from meta
                if (detailsData.meta?.tableType) {
                  onFieldChange("tableType", detailsData.meta.tableType);
                }
                // Row count from health
                if (detailsData.health?.rowCount !== undefined) {
                  onFieldChange("rowCount", detailsData.health.rowCount);
                }
                // Days since update from health
                if (detailsData.health?.daysSinceUpdate !== undefined) {
                  onFieldChange("daysSinceUpdate", detailsData.health.daysSinceUpdate);
                }
                // Column count
                if (detailsData.columns) {
                  const colCount = Array.isArray(detailsData.columns)
                    ? detailsData.columns.length
                    : (detailsData.columns.system?.length || 0) + (detailsData.columns.custom?.length || 0);
                  onFieldChange("columnCount", colCount);
                }
                // Scheduled workflow count from relationships
                if (detailsData.relationships?.workflows && Array.isArray(detailsData.relationships.workflows)) {
                  const scheduledCount = detailsData.relationships.workflows.filter(
                    (wf: { scheduled?: boolean }) => wf.scheduled === true
                  ).length;
                  onFieldChange("scheduledWorkflowCount", scheduledCount);
                }
              }
            } catch {
              // ignore
            }
          } else if (step === "sample") {
            try {
              const content = await invoke<string>("read_file", {
                path: `${tablePath}/definition_sample.json`,
              });
              const sampleData = JSON.parse(content);
              setSample(sampleData);
              // Update grid with total row count if available
              if (onFieldChange && sampleData?.meta?.totalRowCount !== undefined) {
                onFieldChange("rowCount", sampleData.meta.totalRowCount);
              }
            } catch {
              // ignore
            }
          } else if (step === "categorical") {
            // Categorical data is stored separately, but we merge it into sample for display
            try {
              const content = await invoke<string>("read_file", {
                path: `${tablePath}/definition_categorical.json`,
              });
              const categoricalData = JSON.parse(content);
              // Merge categorical columns into sample state for display
              setSample((prev) => {
                if (!prev) {
                  // Create a minimal sample structure with just categorical data
                  return {
                    meta: {
                      tableName: tableName,
                      sampledAt: categoricalData.meta?.fetchedAt,
                      totalRowCount: categoricalData.meta?.totalRowCount,
                    },
                    columnStats: categoricalData.columns || {},
                    rows: [],
                  } as TableSample;
                }
                // Merge categorical columns into existing sample
                return {
                  ...prev,
                  columnStats: {
                    ...prev.columnStats,
                    ...categoricalData.columns,
                  },
                };
              });
            } catch {
              // ignore
            }
          } else if (step === "analyze") {
            try {
              const content = await invoke<string>("read_file", {
                path: `${tablePath}/definition_analysis.json`,
              });
              const analysisData = JSON.parse(content);
              setAnalysis(analysisData);
              // Push AI values to grid so they appear in the table
              if (onFieldChange) {
                if (analysisData.suggestedName) onFieldChange("suggestedName", analysisData.suggestedName);
                if (analysisData.summary?.short) onFieldChange("summaryShort", analysisData.summary.short);
                if (analysisData.summary?.full) onFieldChange("summaryFull", analysisData.summary.full);
                if (analysisData.dataCategory) onFieldChange("dataCategory", analysisData.dataCategory);
                if (analysisData.dataSubCategory) onFieldChange("dataSubCategory", analysisData.dataSubCategory);
                if (analysisData.usageStatus) onFieldChange("usageStatus", analysisData.usageStatus);
                if (analysisData.tags) onFieldChange("tags", analysisData.tags);
                if (analysisData.classification?.dataType) onFieldChange("dataType", analysisData.classification.dataType);
              }
            } catch {
              // ignore
            }
          }
        },
      };

      switch (step) {
        case "prepare":
          prepareOverviewMutation.mutate(
            { domain, tableName, overwrite: true, skipSql: false, freshnessColumn },
            callbacks
          );
          break;
        case "sample":
          sampleDataMutation.mutate({ domain, tableName, overwrite: true }, callbacks);
          break;
        case "categorical":
          fetchCategoricalMutation.mutate({ domain, tableName, overwrite: true }, callbacks);
          break;
        case "analyze":
          analyzeDataMutation.mutate({ domain, tableName, overwrite: true }, callbacks);
          break;
        case "overview":
          // Save any pending changes before generating overview
          if (onSaveBeforeGenerate) {
            await onSaveBeforeGenerate();
          }
          generateOverviewMdMutation.mutate({ domain, tableName, overwrite: true }, callbacks);
          break;
      }
    },
    [
      domain,
      tableName,
      tablePath,
      prepareOverviewMutation,
      sampleDataMutation,
      fetchCategoricalMutation,
      analyzeDataMutation,
      generateOverviewMdMutation,
      onFieldChange,
      onSaveBeforeGenerate,
    ]
  );

  // Get display name
  const displayName = details?.meta?.displayName || tableName;

  // Get column count
  const columnCount =
    (details?.columns?.system?.length || 0) +
    (details?.columns?.data?.length || 0) +
    (details?.columns?.custom?.length || 0);

  // Get row count
  const rowCount = details?.health?.rowCount;
  const rowCountNum =
    typeof rowCount === "number"
      ? rowCount
      : typeof rowCount === "string"
        ? parseInt(rowCount, 10) || null
        : null;

  // VAL URL
  const valUrl = getValUrl(tablePath, tableName);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {displayName}
            </h3>
            <p className="text-xs text-zinc-500 font-mono truncate mt-0.5">
              {tableName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex-shrink-0"
            title="Close preview"
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-3 mt-3 text-xs text-zinc-500">
          {rowCountNum !== null && (
            <span className="flex items-center gap-1" title="Row count">
              <Hash size={12} />
              {rowCountNum.toLocaleString()} rows
            </span>
          )}
          {columnCount > 0 && (
            <span className="flex items-center gap-1" title="Column count">
              <Table size={12} />
              {columnCount} cols
            </span>
          )}
          {details?.health?.score !== undefined && (
            <span
              className={cn(
                "flex items-center gap-1",
                details.health.score >= 80
                  ? "text-green-500"
                  : details.health.score >= 50
                    ? "text-amber-500"
                    : "text-red-500"
              )}
              title="Health score"
            >
              <Activity size={12} />
              {details.health.score}%
            </span>
          )}
          {details?.health?.daysSinceUpdate !== null &&
            details?.health?.daysSinceUpdate !== undefined && (
              <span className="flex items-center gap-1" title="Days since update">
                <Calendar size={12} />
                {details.health.daysSinceUpdate}d ago
              </span>
            )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          {valUrl && (
            <a
              href={valUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-teal-600 hover:bg-teal-500 text-white transition-colors"
            >
              <ExternalLink size={12} />
              Open in VAL
            </a>
          )}
          {onNavigate && (
            <button
              onClick={() => onNavigate(tablePath)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <FolderOpen size={12} />
              View Files
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <TabButton
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
            disabled={!overviewContent}
          >
            <FileText size={12} />
            Overview
          </TabButton>
          <TabButton
            active={activeTab === "details"}
            onClick={() => setActiveTab("details")}
            disabled={!details}
          >
            <Database size={12} />
            Details
          </TabButton>
          <TabButton
            active={activeTab === "sample"}
            onClick={() => setActiveTab("sample")}
          >
            <Table size={12} />
            Sample
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="text-zinc-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <AlertTriangle size={24} className="mx-auto mb-2 text-red-500" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        ) : activeTab === "overview" ? (
          <OverviewTab
            content={overviewContent}
            lastGenerated={overviewModified}
            onGenerate={() => handlePipelineStep("overview")}
            isGenerating={generateOverviewMdMutation.isPending}
          />
        ) : activeTab === "details" ? (
          <DetailsTab
            details={details}
            analysis={analysis}
            rowData={rowData}
            onRefresh={() => handlePipelineStep("prepare")}
            onRefreshWithColumn={(col) => handlePipelineStep("prepare", col)}
            isRefreshing={prepareOverviewMutation.isPending}
            onAnalyze={() => handlePipelineStep("analyze")}
            isAnalyzing={analyzeDataMutation.isPending}
            onFieldChange={onFieldChange}
            onReloadFromFile={() => reloadAnalysisFromFile(true)}
            onSyncToGrid={onSyncToGrid}
          />
        ) : activeTab === "sample" ? (
          <SampleTab
            sample={sample}
            onGenerate={() => handlePipelineStep("sample")}
            isGenerating={sampleDataMutation.isPending}
            onFetchCategorical={() => handlePipelineStep("categorical")}
            isFetchingCategorical={fetchCategoricalMutation.isPending}
          />
        ) : null}
      </div>
    </div>
  );
}

// Tab button component
function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
        disabled
          ? "text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
          : active
            ? "bg-slate-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
      )}
    >
      {children}
    </button>
  );
}

// Format relative time helper
function formatRelativeTimeShort(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

// Overview tab - renders markdown with generate button
function OverviewTab({
  content,
  lastGenerated,
  onGenerate,
  isGenerating,
}: {
  content: string | null;
  lastGenerated?: string | null;
  onGenerate?: () => void;
  isGenerating?: boolean;
}) {
  const formattedTime = formatRelativeTimeShort(lastGenerated);

  return (
    <div className="p-4">
      {/* Generate button header */}
      {onGenerate && (
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">
            {content ? "Regenerate overview.md from JSON files" : "Generate overview.md from JSON files"}
            {formattedTime && (
              <span className="ml-2 text-zinc-400">
                • Generated {formattedTime}
              </span>
            )}
          </div>
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
              isGenerating
                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                : "bg-purple-600 hover:bg-purple-500 text-white"
            )}
          >
            {isGenerating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <FileOutput size={12} />
            )}
            {isGenerating ? "Generating..." : "Generate"}
          </button>
        </div>
      )}

      {/* Content */}
      {content ? (
        <MarkdownViewer content={content} />
      ) : (
        <div className="text-center text-zinc-500 py-8">
          <FileText size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No overview documentation available.</p>
          <p className="text-xs mt-1">Click Generate to create from JSON files.</p>
        </div>
      )}
    </div>
  );
}

// Details tab - shows columns and metadata with refresh/analyze buttons
function DetailsTab({
  details,
  analysis,
  rowData,
  onRefresh,
  onRefreshWithColumn,
  isRefreshing,
  onAnalyze,
  isAnalyzing,
  onFieldChange,
  onReloadFromFile,
  onSyncToGrid,
}: {
  details: TableDetails | null;
  analysis: TableAnalysis | null;
  rowData?: GridRowData | null;
  onRefresh?: () => void;
  onRefreshWithColumn?: (column: string) => void;
  isRefreshing?: boolean;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
  onFieldChange?: (field: string, value: string | number | null) => void;
  onReloadFromFile?: () => void;
  onSyncToGrid?: () => void;
}) {
  const hasNoData = !details && !rowData;

  // State for column selection dropdowns
  const [showFreshnessDropdown, setShowFreshnessDropdown] = useState(false);

  // State for collapsing dependency cards (collapsed = header only)
  const [collapsedWorkflows, setCollapsedWorkflows] = useState(false);
  const [collapsedQueries, setCollapsedQueries] = useState(false);
  const [collapsedDashboards, setCollapsedDashboards] = useState(false);
  const [collapsedColumns, setCollapsedColumns] = useState(false);
  const [collapsedRelatedTables, setCollapsedRelatedTables] = useState(false);

  // State for expanding dependency lists (when not collapsed, show more items)
  const [expandedWorkflows, setExpandedWorkflows] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState(false);
  const [expandedDashboards, setExpandedDashboards] = useState(false);
  const [expandedColumns, setExpandedColumns] = useState(false);
  const [expandedRelatedTables, setExpandedRelatedTables] = useState(false);
  // Track which related tables are expanded to show their fields
  const [expandedRelatedTableFields, setExpandedRelatedTableFields] = useState<Set<string>>(new Set());

  // State for expanding AI field descriptions
  const [expandedFieldDescriptions, setExpandedFieldDescriptions] = useState(false);

  // Combine all columns with category markers
  const allColumns: Array<{
    name: string;
    column: string;
    type: string;
    category: 'data' | 'system' | 'calculated';
    ruleType?: string;
    lookupTable?: { tableName: string; displayName: string } | null;
    rules?: Record<string, unknown> | null;
  }> = details ? [
    ...(details.columns?.data || []).map(c => ({ ...c, category: 'data' as const })),
    ...(details.columns?.calculated || []).map(c => ({ ...c, category: 'calculated' as const })),
    ...(details.columns?.system || []).map(c => ({ ...c, category: 'system' as const })),
  ] : [];

  // Track expanded calculated columns to show logic
  const [expandedCalcColumns, setExpandedCalcColumns] = useState<Set<string>>(new Set());

  // Find date/timestamp columns for freshness selection
  const dateColumns = (details?.columns?.data || []).filter((col) => {
    const type = (col.type || "").toLowerCase();
    return type.includes("date") || type.includes("timestamp");
  });

  // Format date for display
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-SG", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Get freshness color based on days
  const getFreshnessColor = (days: number | null) => {
    if (days === null) return "text-zinc-400";
    if (days <= 7) return "text-green-500";
    if (days <= 30) return "text-amber-500";
    return "text-red-500";
  };

  // Format relative time for "last fetched"
  const formatRelativeTime = (dateStr: string | undefined) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return formatDate(dateStr);
    } catch {
      return null;
    }
  };

  const lastFetched = formatRelativeTime(details?.meta?.generatedAt);
  const lastAnalyzed = formatRelativeTime(analysis?.meta?.analyzedAt);

  return (
    <div className="p-4 space-y-4">
      {/* Action buttons */}
      {(onRefresh || onAnalyze) && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">
            {hasNoData ? (
              "Generate table details"
            ) : (
              <span>
                Fetched {lastFetched || "unknown"}
                {lastAnalyzed && (
                  <span className="text-zinc-400"> • AI Analyzed {lastAnalyzed}</span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing || isAnalyzing}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                  isRefreshing
                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                    : "bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                )}
                title="Fetch table metadata, columns, health from VAL"
              >
                {isRefreshing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Database size={12} />
                )}
                {isRefreshing ? "Fetching..." : "Fetch Details"}
              </button>
            )}
            {onAnalyze && (
              <button
                onClick={onAnalyze}
                disabled={isRefreshing || isAnalyzing}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                  isAnalyzing
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    : "border border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
                )}
                title="AI analysis to generate summary and classification"
              >
                {isAnalyzing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {isAnalyzing ? "Analyzing..." : "AI Analyze"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {hasNoData && (
        <div className="text-center text-zinc-500 py-8">
          <Database size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No details available.</p>
          <p className="text-xs mt-1">Click "Fetch Details" to load from VAL.</p>
        </div>
      )}

      {/* AI Analysis */}
      {analysis && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-amber-600 dark:text-amber-400" />
            <h4 className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              AI Analysis
            </h4>
            {analysis.classification?.confidence && (
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] rounded",
                analysis.classification.confidence === "high"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
              )}>
                {analysis.classification.confidence} confidence
              </span>
            )}
          </div>
          {analysis.classification?.dataType && (
            <div className="mb-2">
              <span className="text-xs text-amber-600 dark:text-amber-400">Type: </span>
              <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                {analysis.classification.dataType}
              </span>
            </div>
          )}
          {analysis.summary?.short && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
              {analysis.summary.short}
            </p>
          )}
          {analysis.useCases && (
            <div className="space-y-1">
              {analysis.useCases.operational && analysis.useCases.operational.length > 0 && (
                <div>
                  <span className="text-[10px] text-amber-500 dark:text-amber-400 uppercase">Operational:</span>
                  <ul className="text-[10px] text-amber-700 dark:text-amber-300 ml-3 list-disc">
                    {analysis.useCases.operational.slice(0, 2).map((uc, i) => (
                      <li key={i}>{uc}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {/* Column Descriptions from AI */}
          {analysis.columnDescriptions && Object.keys(analysis.columnDescriptions).length > 0 && (() => {
            const entries = Object.entries(analysis.columnDescriptions);
            const showCount = expandedFieldDescriptions ? entries.length : 7;
            const hasMore = entries.length > 7;
            return (
              <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800/50">
                <span className="text-[10px] text-amber-500 dark:text-amber-400 uppercase flex items-center gap-1">
                  <Sparkles size={10} />
                  Field Descriptions ({entries.length})
                </span>
                <div className="mt-1.5 space-y-1">
                  {entries.slice(0, showCount).map(([field, desc]) => (
                    <div key={field} className="text-[10px]">
                      <span className="font-medium text-amber-700 dark:text-amber-300">{field}:</span>{" "}
                      <span className="text-amber-600 dark:text-amber-400">{desc}</span>
                    </div>
                  ))}
                </div>
                {hasMore && (
                  <button
                    onClick={() => setExpandedFieldDescriptions(!expandedFieldDescriptions)}
                    className="mt-1.5 text-[10px] text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-0.5"
                  >
                    {expandedFieldDescriptions ? (
                      <>
                        <ChevronUp size={10} />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown size={10} />
                        Show all {entries.length} fields
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })()}
          {analysis.meta?.analyzedAt && (
            <p className="text-[10px] text-amber-400 dark:text-amber-500 mt-2">
              Analyzed: {new Date(analysis.meta.analyzedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Classification - From definition_analysis.json (source of truth) */}
      {onFieldChange && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Classification
              <span className="text-[9px] text-zinc-400 ml-2">(editable)</span>
            </h4>
            <div className="flex items-center gap-1">
              {/* Reload from file */}
              {onReloadFromFile && (
                <button
                  onClick={onReloadFromFile}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  title="Reload from file & push to grid"
                >
                  <RefreshCw size={10} />
                  Reload
                </button>
              )}
              {/* Push to grid */}
              {onSyncToGrid && (
                <button
                  onClick={onSyncToGrid}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  title="Save & sync to grid"
                >
                  <Upload size={10} />
                  Sync
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3">
            {/* Suggested Name - editable */}
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Suggested Name</label>
              <input
                type="text"
                value={rowData?.suggestedName ?? analysis?.suggestedName ?? ""}
                onChange={(e) => onFieldChange("suggestedName", e.target.value || null)}
                placeholder="Enter suggested name..."
                className="w-full text-xs px-2 py-1.5 rounded bg-slate-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Short Summary - for frontmatter */}
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Short Summary <span className="text-zinc-400">(one-liner)</span></label>
              <input
                type="text"
                value={rowData?.summaryShort ?? analysis?.summary?.short ?? ""}
                onChange={(e) => onFieldChange("summaryShort", e.target.value || null)}
                placeholder="One line description..."
                className="w-full text-xs px-2 py-1.5 rounded bg-slate-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Full Summary - for overview.md body */}
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Full Summary <span className="text-zinc-400">(shown in overview)</span></label>
              <textarea
                value={rowData?.summaryFull ?? analysis?.summary?.full ?? ""}
                onChange={(e) => onFieldChange("summaryFull", e.target.value || null)}
                placeholder="2-3 sentence detailed description..."
                rows={3}
                className="w-full text-xs px-2 py-1.5 rounded bg-slate-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />
            </div>

            {/* Tags - as pills */}
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Tags</label>
              <TagsInput
                value={rowData?.tags ?? analysis?.tags ?? ""}
                onChange={(newTags) => onFieldChange("tags", newTags || null)}
                suggestions={TAG_OPTIONS}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-zinc-700">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Category</label>
                <ComboBox
                  value={rowData?.dataCategory ?? analysis?.dataCategory ?? ""}
                  onChange={(val) => onFieldChange("dataCategory", val || null)}
                  options={CATEGORY_OPTIONS}
                  placeholder="Select or type..."
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Sub Category</label>
                <ComboBox
                  value={rowData?.dataSubCategory ?? analysis?.dataSubCategory ?? ""}
                  onChange={(val) => onFieldChange("dataSubCategory", val || null)}
                  options={SUB_CATEGORY_OPTIONS}
                  placeholder="Select or type..."
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Table Type</label>
                <ComboBox
                  value={rowData?.dataType ?? analysis?.classification?.dataType ?? ""}
                  onChange={(val) => onFieldChange("dataType", val || null)}
                  options={TABLE_TYPE_OPTIONS}
                  placeholder="Select..."
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Data Source</label>
                <ComboBox
                  value={rowData?.dataSource ?? analysis?.dataSource ?? ""}
                  onChange={(val) => onFieldChange("dataSource", val || null)}
                  options={DATA_SOURCE_OPTIONS}
                  placeholder="Select..."
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Source System</label>
                <ComboBox
                  value={rowData?.sourceSystem ?? analysis?.sourceSystem ?? ""}
                  onChange={(val) => onFieldChange("sourceSystem", val || null)}
                  options={SOURCE_SYSTEM_OPTIONS}
                  placeholder="Select or type..."
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Status</label>
                <ComboBox
                  value={rowData?.usageStatus ?? analysis?.usageStatus ?? ""}
                  onChange={(val) => onFieldChange("usageStatus", val || null)}
                  options={STATUS_OPTIONS}
                  placeholder="Select..."
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Action</label>
                <ComboBox
                  value={rowData?.action ?? analysis?.action ?? ""}
                  onChange={(val) => onFieldChange("action", val || null)}
                  options={ACTION_OPTIONS}
                  placeholder="Select..."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      {details?.meta && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800">
          <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Metadata
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {details.meta.space && (
              <div>
                <span className="text-zinc-500">Space:</span>{" "}
                <span className="text-zinc-800 dark:text-zinc-200">{details.meta.space}</span>
              </div>
            )}
            {details.meta.zone && (
              <div>
                <span className="text-zinc-500">Zone:</span>{" "}
                <span className="text-zinc-800 dark:text-zinc-200">{details.meta.zone}</span>
              </div>
            )}
            {details.meta.tableType && (
              <div>
                <span className="text-zinc-500">Type:</span>{" "}
                <span className="text-zinc-800 dark:text-zinc-200">{details.meta.tableType}</span>
              </div>
            )}
            {details.meta.dataSource && (
              <div>
                <span className="text-zinc-500">Source:</span>{" "}
                <span className="text-zinc-800 dark:text-zinc-200">{details.meta.dataSource}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Freshness - uses rowData (always available) + coverage data if available */}
      {(rowData || details?.coverage || details?.health?.freshnessColumn) && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800">
          <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Data Freshness
          </h4>
          <div className="space-y-2 text-xs">
            {/* Last Record Created - from rowData or coverage */}
            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex flex-col">
                <span className="text-zinc-500">Last Record Created</span>
                <span className="text-[10px] text-zinc-400">via created_date</span>
              </div>
              {details?.coverage?.lastCreated ? (
                <span className="text-zinc-800 dark:text-zinc-200 font-medium text-right">
                  {formatDate(details.coverage.lastCreated)}
                  {(details?.health?.daysSinceCreated ?? rowData?.daysSinceCreated) !== null && (
                    <span className={cn("ml-1", getFreshnessColor(details?.health?.daysSinceCreated ?? rowData?.daysSinceCreated ?? null))}>
                      {(details?.health?.daysSinceCreated ?? rowData?.daysSinceCreated) === 0
                        ? "(Today)"
                        : `(${details?.health?.daysSinceCreated ?? rowData?.daysSinceCreated}d ago)`}
                    </span>
                  )}
                </span>
              ) : rowData?.daysSinceCreated !== null && rowData?.daysSinceCreated !== undefined ? (
                <span className={cn("font-medium", getFreshnessColor(rowData.daysSinceCreated))}>
                  {rowData.daysSinceCreated === 0 ? "Today" : `${rowData.daysSinceCreated} days ago`}
                </span>
              ) : (
                <span className="text-zinc-400 italic">No data</span>
              )}
            </div>

            {/* Last Business Date - from rowData or coverage */}
            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex flex-col relative">
                <span className="text-zinc-500">Last Business Date</span>
                {dateColumns.length > 1 && onRefreshWithColumn ? (
                  <button
                    onClick={() => setShowFreshnessDropdown(!showFreshnessDropdown)}
                    disabled={isRefreshing}
                    className="flex items-center gap-0.5 text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-500 disabled:opacity-50"
                  >
                    via {details?.health?.freshnessColumnName || details?.health?.freshnessColumn || "auto"}
                    <ChevronDown size={10} />
                  </button>
                ) : details?.health?.freshnessColumn ? (
                  <span className="text-[10px] text-zinc-400">
                    via {details.health.freshnessColumnName || details.health.freshnessColumn}
                  </span>
                ) : null}
                {/* Dropdown */}
                {showFreshnessDropdown && dateColumns.length > 1 && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-slate-200 dark:border-zinc-700 py-1 min-w-[180px] max-h-[200px] overflow-y-auto">
                    {dateColumns.map((col) => (
                      <button
                        key={col.column}
                        onClick={() => {
                          setShowFreshnessDropdown(false);
                          onRefreshWithColumn?.(col.column);
                        }}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-zinc-700 flex items-center justify-between gap-2",
                          col.column === details?.health?.freshnessColumn
                            ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400"
                            : "text-zinc-700 dark:text-zinc-300"
                        )}
                      >
                        <span className="truncate">{col.name}</span>
                        {col.column === details?.health?.freshnessColumn && (
                          <span className="text-[10px] text-teal-500">current</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {details?.coverage?.latest ? (
                <span className="text-zinc-800 dark:text-zinc-200 font-medium text-right">
                  {formatDate(details.coverage.latest)}
                  {(details?.health?.daysSinceUpdate ?? rowData?.daysSinceUpdate) !== null && (
                    <span className={cn("ml-1", getFreshnessColor(details?.health?.daysSinceUpdate ?? rowData?.daysSinceUpdate ?? null))}>
                      {(details?.health?.daysSinceUpdate ?? rowData?.daysSinceUpdate) === 0
                        ? "(Today)"
                        : `(${details?.health?.daysSinceUpdate ?? rowData?.daysSinceUpdate}d ago)`}
                    </span>
                  )}
                </span>
              ) : rowData?.daysSinceUpdate !== null && rowData?.daysSinceUpdate !== undefined ? (
                <span className={cn("font-medium", getFreshnessColor(rowData.daysSinceUpdate))}>
                  {rowData.daysSinceUpdate === 0 ? "Today" : `${rowData.daysSinceUpdate} days ago`}
                </span>
              ) : (
                <span className="text-zinc-400 italic">No data</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Health */}
      {details?.health && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 mb-2">
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Health
            </h4>
            <div className="relative group">
              <Info size={12} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-zinc-800 dark:bg-zinc-700 text-white text-[11px] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="font-medium mb-1.5">Health Score (starts at 100)</div>
                <div className="space-y-1 text-zinc-300">
                  <div><span className="text-red-400">-50</span> Table is empty</div>
                  <div><span className="text-amber-400">-20</span> No new records in 30+ days</div>
                  <div><span className="text-amber-400">-15</span> Business date 7+ days stale</div>
                </div>
                <div className="mt-2 pt-2 border-t border-zinc-600 text-zinc-400">
                  <div><span className="text-green-400">80+</span> Healthy</div>
                  <div><span className="text-amber-400">50-79</span> Warning</div>
                  <div><span className="text-red-400">&lt;50</span> Critical</div>
                </div>
                <div className="absolute left-3 -bottom-1.5 w-3 h-3 bg-zinc-800 dark:bg-zinc-700 rotate-45" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {details.health.score !== undefined && details.health.score !== null && (
              <div>
                <span className="text-zinc-500">Score:</span>{" "}
                <span
                  className={cn(
                    "font-medium",
                    details.health.score >= 80
                      ? "text-green-500"
                      : details.health.score >= 50
                        ? "text-amber-500"
                        : "text-red-500"
                  )}
                >
                  {details.health.score}%
                </span>
              </div>
            )}
            {details.health.rowCount && (
              <div>
                <span className="text-zinc-500">Rows:</span>{" "}
                <span className="text-zinc-800 dark:text-zinc-200">
                  {typeof details.health.rowCount === "number"
                    ? details.health.rowCount.toLocaleString()
                    : details.health.rowCount}
                </span>
              </div>
            )}
            {details.coverage?.totalRecords && (
              <div>
                <span className="text-zinc-500">Total:</span>{" "}
                <span className="text-zinc-800 dark:text-zinc-200">
                  {details.coverage.totalRecords.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workflow Dependencies */}
      {details?.relationships?.workflows && details.relationships.workflows.length > 0 && (() => {
        const scheduledCount = details.relationships.workflows.filter(w => w.scheduled).length;
        const nonScheduledCount = details.relationships.workflows.length - scheduledCount;
        return (
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setCollapsedWorkflows(!collapsedWorkflows)}
            className="w-full flex items-center justify-between gap-1.5 p-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-t-lg transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Workflow size={12} className="text-purple-500" />
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Workflows ({details.relationships.workflows.length})
                </h4>
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5 ml-[18px]">
                <span className="text-amber-500">{scheduledCount} scheduled</span>
                {nonScheduledCount > 0 && (
                  <span> · {nonScheduledCount} on-demand</span>
                )}
              </div>
            </div>
            {collapsedWorkflows ? (
              <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
            ) : (
              <ChevronUp size={14} className="text-zinc-400 flex-shrink-0" />
            )}
          </button>
          {!collapsedWorkflows && (
            <div className="space-y-2 text-xs px-3 pb-3">
              {details.relationships.workflows
                .slice(0, expandedWorkflows ? undefined : 8)
                .map((wf, i) => (
                <div key={i} className="py-1.5 border-b border-slate-100 dark:border-zinc-800 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {wf.relationship === "target" ? (
                        <span title="Populates this table">
                          <ArrowRight size={10} className="text-green-500 flex-shrink-0" />
                        </span>
                      ) : (
                        <span title="Uses this table as source">
                          <ArrowLeft size={10} className="text-blue-500 flex-shrink-0" />
                        </span>
                      )}
                      <span className="text-zinc-800 dark:text-zinc-200 truncate">{wf.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {wf.isChildWorkflow && (
                        <span
                          className="text-[9px] px-1 py-0.5 bg-slate-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 rounded"
                          title={wf.parentWorkflowName ? `Child of: ${wf.parentWorkflowName}` : "Child workflow"}
                        >
                          Child
                        </span>
                      )}
                      {wf.scheduled && (
                        <span title={wf.isChildWorkflow ? `Scheduled via parent: ${wf.effectiveCronExpression || ""}` : "Scheduled"}>
                          <Timer size={10} className="text-amber-500" />
                        </span>
                      )}
                      {wf.lastRunStatus === "completed" ? (
                        <span title="Last run completed">
                          <CheckCircle size={10} className="text-green-500" />
                        </span>
                      ) : wf.lastRunStatus === "failed" ? (
                        <span title="Last run failed">
                          <XCircle size={10} className="text-red-500" />
                        </span>
                      ) : wf.lastRunStatus ? (
                        <span title={wf.lastRunStatus}>
                          <Clock size={10} className="text-zinc-400" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {wf.lastRunAt && (
                    <div className="text-[10px] text-zinc-400 mt-0.5 pl-4">
                      Last run: {formatDate(wf.lastRunAt)}
                    </div>
                  )}
                </div>
              ))}
              {details.relationships.workflows.length > 8 && (
                <button
                  onClick={() => setExpandedWorkflows(!expandedWorkflows)}
                  className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-center py-1.5 flex items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded transition-colors"
                >
                  {expandedWorkflows ? (
                    <>
                      <ChevronUp size={12} />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      Show {details.relationships.workflows.length - 8} more
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* Query Dependencies */}
      {details?.relationships?.queries && details.relationships.queries.length > 0 && (() => {
        // Build a map of dsid -> dashboard names for quick lookup
        const dsidToDashboards: Map<number, string[]> = new Map();
        if (details.relationships?.dashboards) {
          for (const dashboard of details.relationships.dashboards) {
            if (dashboard.queryIds) {
              for (const qid of dashboard.queryIds) {
                const existing = dsidToDashboards.get(qid) || [];
                existing.push(dashboard.name);
                dsidToDashboards.set(qid, existing);
              }
            }
          }
        }
        // Helper to check if dsid is a valid number
        const getNumericDsid = (dsid: number | string | null | undefined): number | null => {
          if (typeof dsid === 'number') return dsid;
          return null;
        };
        const queriesInDashboards = details.relationships.queries.filter(q => {
          const numDsid = getNumericDsid(q.dsid);
          return numDsid !== null && dsidToDashboards.has(numDsid);
        }).length;

        return (
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setCollapsedQueries(!collapsedQueries)}
            className="w-full flex items-center justify-between gap-1.5 p-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-t-lg transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Search size={12} className="text-blue-500" />
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Queries ({details.relationships.queries.length})
                </h4>
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5 ml-[18px]">
                <span className="text-teal-500">{queriesInDashboards} in dashboards</span>
                {details.relationships.queries.length - queriesInDashboards > 0 && (
                  <span> · {details.relationships.queries.length - queriesInDashboards} standalone</span>
                )}
              </div>
            </div>
            {collapsedQueries ? (
              <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
            ) : (
              <ChevronUp size={14} className="text-zinc-400 flex-shrink-0" />
            )}
          </button>
          {!collapsedQueries && (
            <div className="space-y-1 text-xs px-3 pb-3">
              {details.relationships.queries
                .slice(0, expandedQueries ? undefined : 8)
                .map((query, i) => {
                  const numDsid = getNumericDsid(query.dsid);
                  const dashboardNames = numDsid !== null ? dsidToDashboards.get(numDsid) : null;
                  return (
                  <div key={i} className="py-1.5 border-b border-slate-100 dark:border-zinc-800 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-zinc-800 dark:text-zinc-200 truncate flex-1">{query.name}</span>
                      {dashboardNames && dashboardNames.length > 0 && (
                        <span className="text-[10px] text-teal-500 flex-shrink-0 flex items-center gap-0.5">
                          <LayoutDashboard size={10} />
                          {dashboardNames.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                      {query.updatedDate && (
                        <span>Modified: {formatDate(query.updatedDate)}</span>
                      )}
                      {dashboardNames && dashboardNames.length > 0 && (
                        <span className="truncate" title={dashboardNames.join(", ")}>
                          → {dashboardNames.length === 1 ? dashboardNames[0] : `${dashboardNames.length} dashboards`}
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })}
              {details.relationships.queries.length > 8 && (
                <button
                  onClick={() => setExpandedQueries(!expandedQueries)}
                  className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-center py-1.5 flex items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded transition-colors"
                >
                  {expandedQueries ? (
                    <>
                      <ChevronUp size={12} />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      Show {details.relationships.queries.length - 8} more
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* Dashboard Dependencies */}
      {details?.relationships?.dashboards && details.relationships.dashboards.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setCollapsedDashboards(!collapsedDashboards)}
            className="w-full flex items-center justify-between gap-1.5 p-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-t-lg transition-colors text-left"
          >
            <div className="flex items-center gap-1.5">
              <LayoutDashboard size={12} className="text-teal-500" />
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Dashboards ({details.relationships.dashboards.length})
              </h4>
            </div>
            {collapsedDashboards ? (
              <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
            ) : (
              <ChevronUp size={14} className="text-zinc-400 flex-shrink-0" />
            )}
          </button>
          {!collapsedDashboards && (
            <div className="space-y-1 text-xs px-3 pb-3">
              {details.relationships.dashboards
                .slice(0, expandedDashboards ? undefined : 8)
                .map((dashboard, i) => (
                <div key={i} className="py-1.5 border-b border-slate-100 dark:border-zinc-800 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-zinc-800 dark:text-zinc-200 truncate flex-1">{dashboard.name}</span>
                    {dashboard.queryIds && dashboard.queryIds.length > 0 && (
                      <span className="text-[10px] text-blue-500 flex-shrink-0 flex items-center gap-0.5">
                        <Search size={10} />
                        {dashboard.queryIds.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                    {dashboard.updatedDate && (
                      <span>Modified: {formatDate(dashboard.updatedDate)}</span>
                    )}
                    {dashboard.queryIds && dashboard.queryIds.length > 0 && (
                      <span>{dashboard.queryIds.length} {dashboard.queryIds.length === 1 ? 'query' : 'queries'}</span>
                    )}
                  </div>
                </div>
              ))}
              {details.relationships.dashboards.length > 8 && (
                <button
                  onClick={() => setExpandedDashboards(!expandedDashboards)}
                  className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-center py-1.5 flex items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded transition-colors"
                >
                  {expandedDashboards ? (
                    <>
                      <ChevronUp size={12} />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      Show {details.relationships.dashboards.length - 8} more
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Related Tables (lookups) */}
      {details?.relationships?.relatedTables && details.relationships.relatedTables.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setCollapsedRelatedTables(!collapsedRelatedTables)}
            className="w-full flex items-center justify-between gap-1.5 p-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-t-lg transition-colors text-left"
          >
            <div className="flex items-center gap-1.5">
              <Table size={12} className="text-orange-500" />
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Related Tables ({details.relationships.relatedTables.length})
              </h4>
            </div>
            {collapsedRelatedTables ? (
              <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
            ) : (
              <ChevronUp size={14} className="text-zinc-400 flex-shrink-0" />
            )}
          </button>
          {!collapsedRelatedTables && (
            <div className="space-y-0 text-xs px-3 pb-3">
              {details.relationships.relatedTables
                .slice(0, expandedRelatedTables ? undefined : 5)
                .map((rt, i) => {
                  const isFieldsExpanded = expandedRelatedTableFields.has(rt.tableName);
                  const toggleFields = () => {
                    setExpandedRelatedTableFields(prev => {
                      const next = new Set(prev);
                      if (next.has(rt.tableName)) {
                        next.delete(rt.tableName);
                      } else {
                        next.add(rt.tableName);
                      }
                      return next;
                    });
                  };
                  return (
                    <div key={i} className="border-b border-slate-100 dark:border-zinc-800 last:border-0">
                      <button
                        onClick={toggleFields}
                        className="w-full flex items-center justify-between py-2 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          {isFieldsExpanded ? (
                            <ChevronDown size={10} className="text-zinc-400" />
                          ) : (
                            <ChevronRight size={10} className="text-zinc-400" />
                          )}
                          <span className="text-zinc-800 dark:text-zinc-200 truncate">{rt.displayName}</span>
                        </div>
                        <span className="text-zinc-400 text-[10px] flex-shrink-0 ml-2">{rt.fieldCount} fields</span>
                      </button>
                      {isFieldsExpanded && rt.fields && rt.fields.length > 0 && (
                        <div className="ml-5 mb-2 pl-2 border-l-2 border-orange-200 dark:border-orange-900/50 space-y-1.5">
                          {rt.fields.map((field, fi) => (
                            <div key={fi} className="text-[10px] py-1 border-b border-slate-100 dark:border-zinc-800/50 last:border-0">
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-700 dark:text-zinc-300 font-medium">{field.fieldName}</span>
                                <span className="text-orange-500 font-mono text-[9px]">{field.ruleType}</span>
                              </div>
                              {field.ruleType === "vlookup" && field.returnColumn && (
                                <div className="text-zinc-400 mt-0.5 font-mono">
                                  ← {field.returnColumn}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              {details.relationships.relatedTables.length > 5 && (
                <button
                  onClick={() => setExpandedRelatedTables(!expandedRelatedTables)}
                  className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-center py-1.5 flex items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded transition-colors"
                >
                  {expandedRelatedTables ? (
                    <>
                      <ChevronUp size={12} />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      Show {details.relationships.relatedTables.length - 5} more tables
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* No dependencies message */}
      {details?.relationships &&
        (!details.relationships.workflows || details.relationships.workflows.length === 0) &&
        (!details.relationships.queries || details.relationships.queries.length === 0) &&
        (!details.relationships.dashboards || details.relationships.dashboards.length === 0) &&
        (!details.relationships.relatedTables || details.relationships.relatedTables.length === 0) && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-400 italic text-center py-2">
              No workflow, query, or dashboard dependencies found
            </div>
          </div>
        )}

      {/* Columns */}
      {allColumns.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <button
            onClick={() => setCollapsedColumns(!collapsedColumns)}
            className="w-full flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
          >
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Columns ({allColumns.length})
            </h4>
            {collapsedColumns ? (
              <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
            ) : (
              <ChevronUp size={14} className="text-zinc-400 flex-shrink-0" />
            )}
          </button>
          {!collapsedColumns && (
            <>
              <div className={cn("overflow-y-auto border-t border-slate-200 dark:border-zinc-800", expandedColumns ? "max-h-[500px]" : "max-h-64")}>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-zinc-800/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">Name</th>
                      <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allColumns.slice(0, expandedColumns ? undefined : 50).map((col, i) => {
                      const isCalcExpanded = col.category === 'calculated' && expandedCalcColumns.has(col.column);
                      const toggleCalcExpand = () => {
                        if (col.category !== 'calculated') return;
                        setExpandedCalcColumns(prev => {
                          const next = new Set(prev);
                          if (next.has(col.column)) {
                            next.delete(col.column);
                          } else {
                            next.add(col.column);
                          }
                          return next;
                        });
                      };
                      return (
                        <tr
                          key={i}
                          className={cn(
                            "border-b border-slate-100 dark:border-zinc-800/50 last:border-0",
                            col.category === 'calculated' && "bg-orange-50/50 dark:bg-orange-900/10 cursor-pointer hover:bg-orange-100/50 dark:hover:bg-orange-900/20"
                          )}
                          onClick={col.category === 'calculated' ? toggleCalcExpand : undefined}
                        >
                          <td className="px-3 py-1.5" colSpan={isCalcExpanded ? 2 : 1}>
                            <div className="flex items-center gap-1.5">
                              {col.category === 'calculated' && (
                                isCalcExpanded ? (
                                  <ChevronDown size={10} className="text-orange-500 flex-shrink-0" />
                                ) : (
                                  <ChevronRight size={10} className="text-orange-400 flex-shrink-0" />
                                )
                              )}
                              <span className="text-zinc-800 dark:text-zinc-200">
                                {col.name || col.column}
                              </span>
                              {col.category === 'system' && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                                  sys
                                </span>
                              )}
                            </div>
                            {isCalcExpanded && (
                              <div className="mt-2 ml-4 p-2 bg-white dark:bg-zinc-800 rounded border border-orange-200 dark:border-orange-900/50 text-[10px]">
                                {col.lookupTable && (
                                  <div className="text-zinc-500 mb-1">
                                    <span className="font-medium">Lookup Table:</span>{' '}
                                    <span className="text-orange-600 dark:text-orange-400">{col.lookupTable.displayName}</span>
                                  </div>
                                )}
                                {col.rules ? (
                                  <div className="space-y-0.5">
                                    {Object.entries(col.rules)
                                      .filter(([key]) => !['existing', 'existingRule', 'saveAsDBColumn', 'db_column_name', 'field_type', 'category', 'pk', 'basetable'].includes(key))
                                      .map(([key, value]) => (
                                        <div key={key} className="flex">
                                          <span className="text-zinc-400 w-24 flex-shrink-0">{key}:</span>
                                          <span className="text-zinc-600 dark:text-zinc-300 font-mono break-all">
                                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                ) : (
                                  <div className="text-zinc-400 italic">Type: {col.ruleType}</div>
                                )}
                              </div>
                            )}
                          </td>
                          {!isCalcExpanded && (
                            <td className="px-3 py-1.5 text-right">
                              {col.category === 'calculated' ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">
                                  {col.ruleType || 'rule'}
                                </span>
                              ) : (
                                <span className="text-zinc-500 font-mono text-[10px]">{col.type}</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {allColumns.length > 50 && (
                <button
                  onClick={() => setExpandedColumns(!expandedColumns)}
                  className="w-full px-3 py-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-center gap-1 transition-colors"
                >
                  {expandedColumns ? (
                    <>
                      <ChevronUp size={12} />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      Show {allColumns.length - 50} more columns
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Sample data AG Grid component
function SampleDataGrid({ sample }: { sample: TableSample }) {

  const rowData = sample.rows || [];

  // Build column name lookup from sample.columns
  const columnNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (sample.columns) {
      for (const col of sample.columns) {
        // Use name if available, otherwise fall back to column
        map[col.column] = col.name || col.column;
      }
    }
    return map;
  }, [sample.columns]);

  // Generate column definitions from data
  const columnDefs = useMemo<ColDef[]>(() => {
    if (!rowData.length) return [];
    const columns = Object.keys(rowData[0]);
    return columns.map((col) => ({
      field: col,
      headerName: columnNameMap[col] || col,
      headerTooltip: col, // Show DB column name on hover
      minWidth: 100,
      flex: 1,
      resizable: true,
      sortable: true,
      filter: true,
      valueFormatter: (params: { value: unknown }) => {
        if (params.value === null || params.value === undefined) return "-";
        if (typeof params.value === "object") return JSON.stringify(params.value);
        return String(params.value);
      },
    }));
  }, [rowData, columnNameMap]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable: true,
  }), []);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden">
      <div className="p-3 border-b border-slate-200 dark:border-zinc-800">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Sample Data ({rowData.length} rows, {columnDefs.length} columns)
        </h4>
        {sample.meta?.orderBy && (
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Ordered by: <span className="font-mono">{sample.meta.orderBy}</span> DESC
          </p>
        )}
      </div>
      <div
        style={{ height: 400 }}
        className="w-full ag-theme-alpine dark:ag-theme-alpine-dark"
      >
        <AgGridReact
          theme="legacy"
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          suppressRowClickSelection={true}
          animateRows={false}
        />
      </div>
    </div>
  );
}

// Sample tab - shows sample data with generate button
function SampleTab({
  sample,
  onGenerate,
  isGenerating,
  onFetchCategorical,
  isFetchingCategorical,
}: {
  sample: TableSample | null;
  onGenerate?: () => void;
  isGenerating?: boolean;
  onFetchCategorical?: () => void;
  isFetchingCategorical?: boolean;
}) {
  const hasData = sample?.rows?.length;
  const lastSampled = formatRelativeTimeShort(sample?.meta?.sampledAt);

  return (
    <div className="p-4 space-y-4">
      {/* Generate button header */}
      {(onGenerate || onFetchCategorical) && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">
            {hasData ? "Refresh data from VAL" : "Fetch data from VAL"}
            {lastSampled && (
              <span className="ml-2 text-zinc-400">
                • Sample fetched {lastSampled}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onGenerate && (
              <button
                onClick={onGenerate}
                disabled={isGenerating || isFetchingCategorical}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                  isGenerating
                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                    : "bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                )}
              >
                {isGenerating ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Table size={12} />
                )}
                {isGenerating ? "Fetching..." : "Fetch Sample"}
              </button>
            )}
            {onFetchCategorical && (
              <button
                onClick={onFetchCategorical}
                disabled={isGenerating || isFetchingCategorical}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                  isFetchingCategorical
                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                    : "bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
                )}
                title="Fetch distinct categorical values from full table data"
              >
                {isFetchingCategorical ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Tag size={12} />
                )}
                {isFetchingCategorical ? "Fetching..." : "Fetch Categorical"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasData && (
        <div className="text-center text-zinc-500 py-8">
          <Table size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sample data available.</p>
          <p className="text-xs mt-1">Click "Fetch Sample" to load from VAL.</p>
        </div>
      )}

      {/* Query error */}
      {sample?.meta?.queryError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs text-red-600 dark:text-red-400">
          <span className="font-medium">Query Error:</span> {sample.meta.queryError}
        </div>
      )}

      {/* Total row count - shown when sample data exists */}
      {hasData && sample?.meta?.totalRowCount !== undefined && (
        <div className="bg-slate-50 dark:bg-zinc-900 rounded-lg p-3 border border-slate-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Total Rows in Table</span>
            <span className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              {sample.meta.totalRowCount.toLocaleString()}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            Showing {sample.meta.rowCount || 0} sample rows
          </div>
        </div>
      )}

      {/* Categorical columns */}
      {sample?.columnStats && (() => {
        const categorical = Object.entries(sample.columnStats)
          .filter(([, stats]) => stats.isCategorical && stats.distinctValues)
          .sort(([, a], [, b]) => (a.displayName || "").localeCompare(b.displayName || ""));

        if (categorical.length === 0) return null;

        return (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="p-3 border-b border-slate-200 dark:border-zinc-800">
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Categorical Columns ({categorical.length})
              </h4>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Columns with limited distinct values
              </p>
            </div>
            <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {categorical.map(([colName, stats]) => (
                <div key={colName} className="text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {stats.displayName || colName}
                  </span>
                  <span className="text-zinc-400 ml-1">({stats.distinctCount})</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.distinctValues?.slice(0, 10).map((val, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded text-[10px]"
                      >
                        {val || "(empty)"}
                      </span>
                    ))}
                    {(stats.distinctValues?.length || 0) > 10 && (
                      <span className="px-1.5 py-0.5 text-zinc-400 text-[10px]">
                        +{(stats.distinctValues?.length || 0) - 10} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Sample data AG Grid */}
      {hasData && <SampleDataGrid sample={sample} />}
    </div>
  );
}

