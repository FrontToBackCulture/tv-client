// Unified column definitions for all review resource types

import React from "react";
import { ColDef, ValueFormatterParams } from "ag-grid-community";
import type { ReviewResourceType, ReviewRow } from "./reviewTypes";
import {
  NameCellRenderer,
  StatusCellRenderer,
  ActionCellRenderer,
  DaysCellRenderer,
  TagsCellRenderer,
} from "./reviewGridRenderers";
import type { ClassificationValues } from "../../stores/classificationStore";

/** Date-time value formatter for timestamp columns */
function dateTimeFormatter(params: ValueFormatterParams): string {
  if (!params.value) return "-";
  try {
    const date = new Date(params.value);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return params.value;
  }
}

/** Build AG Grid column definitions based on resource type */
export function buildReviewColumnDefs(
  resourceType: ReviewResourceType,
  opts: {
    wrapSummary?: boolean;
    reviewMode?: boolean;
    classificationValues?: ClassificationValues;
  } = {},
): ColDef<ReviewRow>[] {
  const {
    wrapSummary = false,
    reviewMode = true,
    classificationValues,
  } = opts;

  // For artifact types, use the simpler column builder from the old artifact code
  if (resourceType !== "table") {
    return buildArtifactColumns(resourceType, classificationValues);
  }

  // Table columns — full DataModels grid
  return buildTableColumns({ wrapSummary, reviewMode, classificationValues });
}

// ─── Table columns ───────────────────────────────────────────────────────────

function buildTableColumns(opts: {
  wrapSummary: boolean;
  reviewMode: boolean;
  classificationValues?: ClassificationValues;
}): ColDef<ReviewRow>[] {
  const { wrapSummary, reviewMode, classificationValues } = opts;
  const cv = classificationValues;

  return [
    {
      field: "displayName",
      headerName: "Name",
      cellRenderer: NameCellRenderer,
      minWidth: 220,
      flex: 2,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
    },
    {
      field: "isStale",
      headerName: "Stale",
      width: 80,
      filter: "agSetColumnFilter",
      hide: true,
    },
    {
      field: "name",
      headerName: "Table ID",
      minWidth: 150,
      width: 150,
      cellClass: "text-xs font-mono text-zinc-500",
      filter: "agTextColumnFilter",
      hide: true,
      enableRowGroup: false,
    },
    {
      field: "suggestedName",
      headerName: "Suggested Name",
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
      hide: true,
    },
    {
      field: "dataSource",
      headerName: "Data Source",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.dataSource] } : undefined,
    },
    {
      field: "summaryShort",
      headerName: "Short Summary",
      minWidth: 200,
      flex: 1,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-400",
      enableRowGroup: false,
      wrapText: wrapSummary,
      autoHeight: wrapSummary,
      editable: reviewMode,
      cellEditor: "agLargeTextCellEditor",
      cellEditorParams: { maxLength: 500, rows: 3, cols: 50 },
      cellEditorPopup: true,
    },
    {
      field: "summaryFull",
      headerName: "Full Summary",
      minWidth: 300,
      flex: 2,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-400",
      enableRowGroup: false,
      wrapText: wrapSummary,
      autoHeight: wrapSummary,
      editable: reviewMode,
      cellEditor: "agLargeTextCellEditor",
      cellEditorParams: { maxLength: 2000, rows: 6, cols: 60 },
      cellEditorPopup: true,
    },
    {
      headerName: "Tags",
      minWidth: 240,
      flex: 2,
      cellRenderer: TagsCellRenderer,
      filter: "agTextColumnFilter",
      enableRowGroup: false,
      autoHeight: true,
      valueGetter: (params) => {
        const data = params.data as ReviewRow | undefined;
        if (!data) return "";
        const tags: string[] = [];
        if (data.dataCategory) tags.push(data.dataCategory);
        if (data.dataSubCategory) tags.push(data.dataSubCategory);
        if (data.dataSource) tags.push(data.dataSource);
        if (data.usageStatus && data.usageStatus !== "I Dunno") tags.push(data.usageStatus);
        if (data.action && data.action !== "None") tags.push(data.action);
        if (data.tags) tags.push(data.tags);
        return tags.join(", ");
      },
      hide: reviewMode,
    },
    {
      field: "rowCount",
      headerName: "Rows",
      width: 90,
      type: "numericColumn",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? params.value.toLocaleString() : "-",
      filter: "agNumberColumnFilter",
      enableRowGroup: false,
    },
    {
      field: "daysSinceCreated",
      headerName: "Created",
      width: 80,
      cellRenderer: DaysCellRenderer,
      filter: "agNumberColumnFilter",
      headerTooltip: "Days since last record created",
      enableRowGroup: false,
    },
    {
      field: "daysSinceUpdate",
      headerName: "Updated",
      width: 80,
      cellRenderer: DaysCellRenderer,
      filter: "agNumberColumnFilter",
      headerTooltip: "Days since last business date update",
      enableRowGroup: false,
    },
    {
      field: "dataCategory",
      headerName: "Category",
      width: 140,
      rowGroup: !reviewMode,
      hide: false,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.dataCategory] } : undefined,
    },
    {
      field: "dataSubCategory",
      headerName: "Sub Category",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.dataSubCategory] } : undefined,
    },
    {
      field: "usageStatus",
      headerName: "Status",
      width: 100,
      cellRenderer: reviewMode ? undefined : StatusCellRenderer,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.usageStatus] } : undefined,
    },
    {
      field: "action",
      headerName: "Action",
      width: 100,
      cellRenderer: reviewMode ? undefined : ActionCellRenderer,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.action] } : undefined,
    },
    {
      field: "dataType",
      headerName: "Table Type",
      width: 110,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.dataType] } : undefined,
      valueFormatter: (params: ValueFormatterParams) => {
        const val = params.value as string | null;
        if (!val) return "-";
        return val;
      },
    },
    {
      field: "sourceSystem",
      headerName: "Source System",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: cv ? { values: ["", ...cv.sourceSystem] } : undefined,
    },
    {
      field: "includeSitemap",
      headerName: "Sitemap",
      width: 85,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellRenderer: (params: { value: boolean }) => params.value ? "Yes" : "",
      cellEditor: "agCheckboxCellEditor",
      headerTooltip: "Include this table on the client portal sitemap",
    },
    {
      field: "sitemapGroup1",
      headerName: "Sitemap Grp 1",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Primary grouping on the portal sitemap",
    },
    {
      field: "sitemapGroup2",
      headerName: "Sitemap Grp 2",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Secondary grouping on the portal sitemap",
    },
    {
      field: "solution",
      headerName: "Solution",
      width: 140,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Which VAL solution this resource belongs to",
    },
    {
      field: "resourceUrl",
      headerName: "URL",
      width: 250,
      filter: "agTextColumnFilter",
      editable: reviewMode,
      headerTooltip: "URL to access this resource in VAL",
    },
    {
      field: "workflowCount",
      headerName: "Workflows",
      width: 90,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Total number of workflows using this table",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "scheduledWorkflowCount",
      headerName: "Sched WFs",
      width: 90,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of scheduled workflows using this table",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "queryCount",
      headerName: "Queries",
      width: 80,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of queries using this table",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "dashboardCount",
      headerName: "Dashboards",
      width: 95,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of dashboards using this table",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "columnCount",
      headerName: "Columns",
      width: 85,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Total number of columns",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "calculatedColumnCount",
      headerName: "Calc Cols",
      width: 85,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of calculated columns",
      valueFormatter: (params: ValueFormatterParams) => params.value != null ? String(params.value) : "-",
    },
    {
      field: "lastSampleAt",
      headerName: "Last Sample",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time sample data was fetched",
      valueFormatter: dateTimeFormatter,
    },
    {
      field: "lastDetailsAt",
      headerName: "Last Details",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time details were fetched",
      valueFormatter: dateTimeFormatter,
    },
    {
      field: "lastAnalyzeAt",
      headerName: "Last Analyze",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time AI analysis was run",
      valueFormatter: dateTimeFormatter,
    },
    {
      field: "lastOverviewAt",
      headerName: "Last Overview",
      width: 140,
      filter: "agDateColumnFilter",
      headerTooltip: "Last time overview.md was generated",
      valueFormatter: dateTimeFormatter,
    },
    {
      field: "space",
      headerName: "Space",
      width: 100,
      filter: "agSetColumnFilter",
      hide: true,
    },
  ];
}

// ─── Artifact columns (queries, dashboards, workflows) ──────────────────────

function buildArtifactColumns(
  resourceType: ReviewResourceType,
  classificationValues?: ClassificationValues,
): ColDef<ReviewRow>[] {
  const cv = classificationValues;

  const baseCols: ColDef<ReviewRow>[] = [
    {
      field: "name",
      headerName: "Name",
      pinned: "left",
      width: 250,
      filter: "agTextColumnFilter",
      cellRenderer: (params: { value: string; data?: { isStale?: boolean } }) => {
        if (!params.data?.isStale) return params.value;
        return React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px" } },
          React.createElement("span", { style: { background: "#ef4444", color: "white", fontSize: "10px", padding: "1px 5px", borderRadius: "3px", fontWeight: 600, flexShrink: 0 } }, "Deleted"),
          params.value || "",
        );
      },
    },
    { field: "isStale", headerName: "Stale", width: 80, filter: "agSetColumnFilter", hide: true },
    { field: "id", headerName: "ID", width: 100, filter: "agTextColumnFilter" },
  ];

  // Type-specific columns
  const typeCols: ColDef<ReviewRow>[] = [];
  if (resourceType === "query") {
    typeCols.push(
      { field: "category", headerName: "Category", width: 110, filter: "agSetColumnFilter" },
      { field: "tableName", headerName: "Table", width: 180, filter: "agTextColumnFilter" },
      { field: "fieldCount", headerName: "Fields", width: 80, filter: "agNumberColumnFilter" },
    );
  } else if (resourceType === "dashboard") {
    typeCols.push(
      { field: "category", headerName: "Category", width: 110, filter: "agSetColumnFilter" },
      { field: "widgetCount", headerName: "Widgets", width: 90, filter: "agNumberColumnFilter" },
      { field: "creatorName", headerName: "Creator", width: 140, filter: "agTextColumnFilter" },
      { field: "gaViews7d", headerName: "Views 7d", width: 80, type: "numericColumn", filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => p.value != null ? String(p.value) : "-" },
      { field: "gaViews30d", headerName: "Views 30d", width: 85, type: "numericColumn", filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => p.value != null ? String(p.value) : "-" },
      { field: "gaViews90d", headerName: "Views 90d", width: 85, type: "numericColumn", filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => p.value != null ? String(p.value) : "-" },
      { field: "gaUsers30d", headerName: "Users 30d", width: 85, type: "numericColumn", filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => p.value != null ? String(p.value) : "-" },
      { field: "gaLastViewed", headerName: "Last Viewed", width: 105, filter: "agDateColumnFilter" },
      {
        field: "gaHealthScore",
        headerName: "Health",
        width: 75,
        type: "numericColumn",
        filter: "agNumberColumnFilter",
        cellRenderer: (params: { value: number | null }) => {
          if (params.value == null) return "-";
          const v = params.value;
          const color = v >= 80 ? "#22c55e" : v >= 50 ? "#eab308" : v >= 20 ? "#f97316" : "#ef4444";
          return React.createElement("span", { style: { color, fontWeight: 600, fontSize: "12px" } }, String(v));
        },
      },
      {
        field: "gaHealthStatus",
        headerName: "Status",
        width: 90,
        filter: "agSetColumnFilter",
        cellRenderer: (params: { value: string | null }) => {
          if (!params.value) return "-";
          const colors: Record<string, string> = {
            active: "#22c55e",
            declining: "#eab308",
            stale: "#f97316",
            dead: "#ef4444",
            unused: "#a1a1aa",
          };
          const color = colors[params.value] || "#a1a1aa";
          return React.createElement("span", { style: { color, fontWeight: 500, fontSize: "12px", textTransform: "capitalize" } }, params.value);
        },
      },
    );
  } else if (resourceType === "workflow") {
    typeCols.push(
      {
        field: "isScheduled",
        headerName: "Scheduled",
        width: 100,
        filter: "agSetColumnFilter",
        valueFormatter: (p) => p.value === true ? "Yes" : p.value === false ? "No" : "",
      },
      { field: "cronExpression", headerName: "Cron", width: 130, filter: "agTextColumnFilter" },
      { field: "pluginCount", headerName: "Plugins", width: 90, filter: "agNumberColumnFilter" },
      { field: "description", headerName: "Description", width: 200, filter: "agTextColumnFilter" },
    );
  }

  // Classification columns (editable)
  const classifCols: ColDef<ReviewRow>[] = [
    {
      field: "dataType",
      headerName: "Data Type",
      width: 130,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.dataType ? ["", ...cv.dataType] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "dataCategory",
      headerName: "Category",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.dataCategory ? ["", ...cv.dataCategory] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "dataSubCategory",
      headerName: "Sub-Category",
      width: 150,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.dataSubCategory ? ["", ...cv.dataSubCategory] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "usageStatus",
      headerName: "Usage",
      width: 120,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.usageStatus ? ["", ...cv.usageStatus] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "action",
      headerName: "Action",
      width: 120,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.action ? ["", ...cv.action] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "dataSource",
      headerName: "Data Source",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.dataSource ? ["", ...cv.dataSource] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "sourceSystem",
      headerName: "Source System",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: cv ? { values: cv.sourceSystem ? ["", ...cv.sourceSystem] : [] } : undefined,
      filter: "agSetColumnFilter",
    },
    {
      field: "includeSitemap",
      headerName: "Sitemap",
      width: 85,
      filter: "agSetColumnFilter",
      editable: true,
      cellRenderer: (params: { value: boolean }) => params.value ? "Yes" : "",
      cellEditor: "agCheckboxCellEditor",
      headerTooltip: "Include on the client portal sitemap",
    },
    {
      field: "sitemapGroup1",
      headerName: "Sitemap Grp 1",
      width: 120,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Primary grouping on the portal sitemap",
    },
    {
      field: "sitemapGroup2",
      headerName: "Sitemap Grp 2",
      width: 120,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Secondary grouping on the portal sitemap",
    },
    {
      field: "solution",
      headerName: "Solution",
      width: 140,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agTextCellEditor",
      headerTooltip: "Which VAL solution this resource belongs to",
    },
    {
      field: "resourceUrl",
      headerName: "URL",
      width: 250,
      editable: true,
      filter: "agTextColumnFilter",
      headerTooltip: "URL to access this resource in VAL",
    },
    {
      field: "tags",
      headerName: "Tags",
      width: 200,
      editable: true,
      filter: "agTextColumnFilter",
    },
    {
      field: "suggestedName",
      headerName: "Suggested Name",
      width: 180,
      editable: true,
      filter: "agTextColumnFilter",
    },
    {
      field: "summaryShort",
      headerName: "Summary",
      width: 250,
      editable: true,
      filter: "agTextColumnFilter",
    },
  ];

  // Date columns
  const dateCols: ColDef<ReviewRow>[] = [
    { field: "createdDate", headerName: "Created", width: 120, filter: "agDateColumnFilter" },
    { field: "updatedDate", headerName: "Updated", width: 120, filter: "agDateColumnFilter" },
  ];

  return [...baseCols, ...typeCols, ...classifCols, ...dateCols];
}
