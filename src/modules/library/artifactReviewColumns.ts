// ArtifactReviewView: Column definitions for AG Grid

import { ColDef } from "ag-grid-community";
import { useClassificationStore } from "../../stores/classificationStore";
import type { ArtifactType } from "./artifactReviewTypes";

/** Build AG Grid column definitions based on artifact type */
export function buildArtifactColumnDefs(artifactType: ArtifactType): ColDef[] {
  const classificationStore = useClassificationStore.getState();

  const baseCols: ColDef[] = [
    { field: "name", headerName: "Name", pinned: "left", width: 250, filter: "agTextColumnFilter" },
    { field: "id", headerName: "ID", width: 100, filter: "agTextColumnFilter" },
  ];

  // Type-specific columns
  const typeCols: ColDef[] = [];
  if (artifactType === "query") {
    typeCols.push(
      { field: "category", headerName: "Category", width: 110, filter: "agSetColumnFilter" },
      { field: "tableName", headerName: "Table", width: 180, filter: "agTextColumnFilter" },
      { field: "fieldCount", headerName: "Fields", width: 80, filter: "agNumberColumnFilter" },
    );
  } else if (artifactType === "dashboard") {
    typeCols.push(
      { field: "category", headerName: "Category", width: 110, filter: "agSetColumnFilter" },
      { field: "widgetCount", headerName: "Widgets", width: 90, filter: "agNumberColumnFilter" },
      { field: "creatorName", headerName: "Creator", width: 140, filter: "agTextColumnFilter" },
    );
  } else if (artifactType === "workflow") {
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
  const classifCols: ColDef[] = [
    {
      field: "dataType",
      headerName: "Data Type",
      width: 130,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: classificationStore.getDropdownValues("dataType") },
      filter: "agSetColumnFilter",
    },
    {
      field: "dataCategory",
      headerName: "Category",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: classificationStore.getDropdownValues("dataCategory") },
      filter: "agSetColumnFilter",
    },
    {
      field: "dataSubCategory",
      headerName: "Sub-Category",
      width: 150,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: classificationStore.getDropdownValues("dataSubCategory") },
      filter: "agSetColumnFilter",
    },
    {
      field: "usageStatus",
      headerName: "Usage",
      width: 120,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: classificationStore.getDropdownValues("usageStatus") },
      filter: "agSetColumnFilter",
    },
    {
      field: "action",
      headerName: "Action",
      width: 120,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: classificationStore.getDropdownValues("action") },
      filter: "agSetColumnFilter",
    },
    {
      field: "dataSource",
      headerName: "Data Source",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: classificationStore.getDropdownValues("dataSource") },
      filter: "agSetColumnFilter",
    },
    {
      field: "sourceSystem",
      headerName: "Source System",
      width: 140,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: classificationStore.getDropdownValues("sourceSystem") },
      filter: "agSetColumnFilter",
    },
    {
      field: "includeSitemap",
      headerName: "Sitemap",
      width: 85,
      filter: "agSetColumnFilter",
      editable: true,
      cellRenderer: (params: { value: boolean }) =>
        params.value ? "Yes" : "",
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
  const dateCols: ColDef[] = [
    { field: "createdDate", headerName: "Created", width: 120, filter: "agDateColumnFilter" },
    { field: "updatedDate", headerName: "Updated", width: 120, filter: "agDateColumnFilter" },
  ];

  return [...baseCols, ...typeCols, ...classifCols, ...dateCols];
}
