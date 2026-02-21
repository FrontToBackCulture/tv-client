// DataModelsAgGrid: Column definitions

import { ColDef, ValueFormatterParams } from "ag-grid-community";
import type { TableInfo } from "./dataModelsGridTypes";
import {
  NameCellRenderer,
  StatusCellRenderer,
  ActionCellRenderer,
  DaysCellRenderer,
  TagsCellRenderer,
} from "./dataModelsGridRenderers";
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

/** Build AG Grid column definitions for the data models grid */
export function buildColumnDefs(opts: {
  wrapSummary: boolean;
  reviewMode: boolean;
  classificationValues: ClassificationValues;
}): ColDef<TableInfo>[] {
  const { wrapSummary, reviewMode, classificationValues } = opts;

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
      cellEditorParams: {
        values: ["", ...classificationValues.dataSource],
      },
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
      cellEditorParams: {
        maxLength: 500,
        rows: 3,
        cols: 50,
      },
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
      cellEditorParams: {
        maxLength: 2000,
        rows: 6,
        cols: 60,
      },
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
        const data = params.data as TableInfo | undefined;
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
      cellEditorParams: {
        values: ["", ...classificationValues.dataCategory],
      },
    },
    {
      field: "dataSubCategory",
      headerName: "Sub Category",
      width: 120,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.dataSubCategory],
      },
    },
    {
      field: "usageStatus",
      headerName: "Status",
      width: 100,
      cellRenderer: reviewMode ? undefined : StatusCellRenderer,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.usageStatus],
      },
    },
    {
      field: "action",
      headerName: "Action",
      width: 100,
      cellRenderer: reviewMode ? undefined : ActionCellRenderer,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.action],
      },
    },
    {
      field: "dataType",
      headerName: "Table Type",
      width: 110,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellEditor: "agTextCellEditor",
      cellEditorParams: {
        values: ["", ...classificationValues.dataType],
      },
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
      cellEditorParams: {
        values: ["", ...classificationValues.sourceSystem],
      },
    },
    {
      field: "includeSitemap",
      headerName: "Sitemap",
      width: 85,
      filter: "agSetColumnFilter",
      editable: reviewMode,
      cellRenderer: (params: { value: boolean }) =>
        params.value ? "Yes" : "",
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
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "scheduledWorkflowCount",
      headerName: "Sched WFs",
      width: 90,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of scheduled workflows using this table",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "queryCount",
      headerName: "Queries",
      width: 80,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of queries using this table",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "dashboardCount",
      headerName: "Dashboards",
      width: 95,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of dashboards using this table",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "columnCount",
      headerName: "Columns",
      width: 85,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Total number of columns",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
    },
    {
      field: "calculatedColumnCount",
      headerName: "Calc Cols",
      width: 85,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      headerTooltip: "Number of calculated columns",
      valueFormatter: (params: ValueFormatterParams) =>
        params.value != null ? String(params.value) : "-",
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
