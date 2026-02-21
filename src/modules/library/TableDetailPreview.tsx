// src/modules/library/TableDetailPreview.tsx
// Right panel preview component for table details in review mode

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  FileOutput,
} from "lucide-react";
import { MarkdownViewer } from "./MarkdownViewer";
import { cn } from "../../lib/cn";
import {
  usePrepareTableOverview,
  useSampleTableData,
  useFetchCategoricalValues,
  useDescribeTableData,
  useClassifyTableData,
  useGenerateTableOverviewMd,
} from "../../hooks/val-sync";

import type {
  TableDetailPreviewProps,
  TableDetails,
  TableSample,
  TableAnalysis,
  TabType,
} from "./tableDetailTypes";
import { extractDomainFromPath, getValUrl, formatRelativeTimeShort } from "./tableDetailTypes";
import { DetailsTab } from "./DetailsTab";
import { SampleTab } from "./SampleTab";

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
  const describeDataMutation = useDescribeTableData();
  const classifyDataMutation = useClassifyTableData();
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

  // Reload analysis from file after describe or classify
  const reloadAnalysisAfterAI = useCallback(async () => {
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
  }, [tablePath, onFieldChange]);

  // Handle pipeline step execution
  const handlePipelineStep = useCallback(
    async (step: "prepare" | "sample" | "categorical" | "describe" | "classify" | "overview", freshnessColumn?: string) => {
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
              const newCategoricals = categoricalData.columns || {};
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
                    columnStats: newCategoricals,
                    rows: [],
                  } as TableSample;
                }
                // Remove old categorical entries from columnStats, then overlay new ones
                const prevStats = prev.columnStats ?? {};
                const cleaned: Record<string, (typeof prevStats)[string]> = {};
                for (const [key, val] of Object.entries(prevStats)) {
                  if (!val.isCategorical) {
                    cleaned[key] = val;
                  }
                }
                return {
                  ...prev,
                  columnStats: {
                    ...cleaned,
                    ...newCategoricals,
                  },
                };
              });
            } catch {
              // ignore
            }
          } else if (step === "describe" || step === "classify") {
            await reloadAnalysisAfterAI();
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
        case "describe":
          describeDataMutation.mutate({ domain, tableName, overwrite: true }, callbacks);
          break;
        case "classify":
          classifyDataMutation.mutate({ domain, tableName, overwrite: true }, callbacks);
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
      describeDataMutation,
      classifyDataMutation,
      generateOverviewMdMutation,
      onFieldChange,
      onSaveBeforeGenerate,
      reloadAnalysisAfterAI,
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
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
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
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex-shrink-0"
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
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
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
            <Loader2 size={24} className="text-zinc-400 animate-spin" />
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
            onDescribe={() => handlePipelineStep("describe")}
            isDescribing={describeDataMutation.isPending}
            onClassify={() => handlePipelineStep("classify")}
            isClassifying={classifyDataMutation.isPending}
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
            ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      )}
    >
      {children}
    </button>
  );
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
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
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
