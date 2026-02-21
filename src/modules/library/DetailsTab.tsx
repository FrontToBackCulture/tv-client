// TableDetailPreview: DetailsTab (main detail panel for table inspection)

import { useState } from "react";
import {
  Database,
  Loader2,
  Sparkles,
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
  Table,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDateFull as formatDate } from "../../lib/date";
import { useClassificationStore } from "../../stores/classificationStore";
import type { TableDetails, TableAnalysis, GridRowData } from "./tableDetailTypes";
import { TagsInput, ComboBox } from "./detailsTabInputs";

// Details tab - shows columns and metadata with refresh/analyze buttons
export function DetailsTab({
  details,
  analysis,
  rowData,
  onRefresh,
  onRefreshWithColumn,
  isRefreshing,
  onDescribe,
  isDescribing,
  onClassify,
  isClassifying,
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
  onDescribe?: () => void;
  isDescribing?: boolean;
  onClassify?: () => void;
  isClassifying?: boolean;
  onFieldChange?: (field: string, value: string | number | null) => void;
  onReloadFromFile?: () => void;
  onSyncToGrid?: () => void;
}) {
  const classificationValues = useClassificationStore((s) => s.values);
  const CATEGORY_OPTIONS = classificationValues.dataCategory;
  const SUB_CATEGORY_OPTIONS = classificationValues.dataSubCategory;
  const TAG_OPTIONS = classificationValues.tags;
  const STATUS_OPTIONS = classificationValues.usageStatus;
  const ACTION_OPTIONS = classificationValues.action;
  const DATA_SOURCE_OPTIONS = classificationValues.dataSource;
  const TABLE_TYPE_OPTIONS = classificationValues.dataType;
  const SOURCE_SYSTEM_OPTIONS = classificationValues.sourceSystem;

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
    lookupTable?: { tableName: string; displayName: string; aggType?: string; relation?: string } | null;
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
      {(onRefresh || onDescribe || onClassify) && (
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
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
                disabled={isRefreshing || isDescribing || isClassifying}
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
            {onDescribe && (
              <button
                onClick={onDescribe}
                disabled={isRefreshing || isDescribing || isClassifying}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                  isDescribing
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                )}
                title="AI naming, summary, and column descriptions"
              >
                {isDescribing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {isDescribing ? "Describing..." : "AI Describe"}
              </button>
            )}
            {onClassify && (
              <button
                onClick={onClassify}
                disabled={isRefreshing || isDescribing || isClassifying}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                  isClassifying
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    : "border border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
                )}
                title="AI classification, tags, and usage status"
              >
                {isClassifying ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {isClassifying ? "Classifying..." : "AI Classify"}
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
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
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
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
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
                className="w-full text-xs px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-teal-500"
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
                className="w-full text-xs px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-teal-500"
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
                className="w-full text-xs px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-teal-500 resize-none"
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

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
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
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
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
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
          <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Data Freshness
          </h4>
          <div className="space-y-2 text-xs">
            {/* Last Record Created - from rowData or coverage */}
            <div className="flex items-center justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
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
            <div className="flex items-center justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
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
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 min-w-[180px] max-h-[200px] overflow-y-auto">
                    {dateColumns.map((col) => (
                      <button
                        key={col.column}
                        onClick={() => {
                          setShowFreshnessDropdown(false);
                          onRefreshWithColumn?.(col.column);
                        }}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center justify-between gap-2",
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
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
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
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setCollapsedWorkflows(!collapsedWorkflows)}
            className="w-full flex items-center justify-between gap-1.5 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-t-lg transition-colors text-left"
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
                <div key={i} className="py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
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
                          className="text-[9px] px-1 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 rounded"
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
                  className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-center py-1.5 flex items-center justify-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded transition-colors"
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
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setCollapsedQueries(!collapsedQueries)}
            className="w-full flex items-center justify-between gap-1.5 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-t-lg transition-colors text-left"
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
                  <div key={i} className="py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
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
                  className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-center py-1.5 flex items-center justify-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded transition-colors"
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
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setCollapsedDashboards(!collapsedDashboards)}
            className="w-full flex items-center justify-between gap-1.5 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-t-lg transition-colors text-left"
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
                <div key={i} className="py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
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
                  className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-center py-1.5 flex items-center justify-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded transition-colors"
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
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setCollapsedRelatedTables(!collapsedRelatedTables)}
            className="w-full flex items-center justify-between gap-1.5 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-t-lg transition-colors text-left"
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
                    <div key={i} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                      <button
                        onClick={toggleFields}
                        className="w-full flex items-center justify-between py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
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
                            <div key={fi} className="text-[10px] py-1 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
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
                  className="w-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-center py-1.5 flex items-center justify-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded transition-colors"
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
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-400 italic text-center py-2">
              No workflow, query, or dashboard dependencies found
            </div>
          </div>
        )}

      {/* Columns */}
      {allColumns.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <button
            onClick={() => setCollapsedColumns(!collapsedColumns)}
            className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
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
              <div className={cn("overflow-y-auto border-t border-zinc-200 dark:border-zinc-800", expandedColumns ? "max-h-[500px]" : "max-h-64")}>
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
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
                            "border-b border-zinc-100 dark:border-zinc-800/50 last:border-0",
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
                                <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                                  sys
                                </span>
                              )}
                            </div>
                            {isCalcExpanded && (
                              <div className="mt-2 ml-4 p-2 bg-white dark:bg-zinc-800 rounded border border-orange-200 dark:border-orange-900/50 text-[10px]">
                                {col.lookupTable && (
                                  <div className="text-zinc-500 mb-1">
                                    <span className="font-medium">{col.ruleType === 'rollup' || col.ruleType === 'rollupv2' ? 'Rollup From:' : 'Lookup Table:'}</span>{' '}
                                    <span className="text-orange-600 dark:text-orange-400">{col.lookupTable.displayName}</span>
                                    {col.lookupTable.aggType && (
                                      <span className="text-zinc-400 ml-1">({col.lookupTable.aggType})</span>
                                    )}
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
                  className="w-full px-3 py-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-center gap-1 transition-colors"
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
