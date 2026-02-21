// Unified review types for all resource types (tables, queries, dashboards, workflows)

import type { ClassificationField } from "../../stores/classificationStore";

export type ReviewResourceType = "table" | "query" | "dashboard" | "workflow";

/** Subset for artifact types (non-table) — used by ArtifactDetailPreview */
export type ArtifactType = "query" | "dashboard" | "workflow";

/** Superset row type for AG Grid — shared classification fields + type-specific read-only fields */
export interface ReviewRow {
  // Identity
  id: string;
  name: string;
  displayName: string | null;
  folderName: string;
  folderPath: string;
  isStale: boolean;

  // Classification (shared — all editable)
  dataType: string | null;
  dataCategory: string | null;
  dataSubCategory: string | null;
  usageStatus: string | null;
  action: string | null;
  dataSource: string | null;
  sourceSystem: string | null;
  tags: string | null;
  suggestedName: string | null;
  summaryShort: string | null;
  summaryFull: string | null;

  // Portal / sitemap fields
  includeSitemap: boolean;
  sitemapGroup1: string | null;
  sitemapGroup2: string | null;
  solution: string | null;
  resourceUrl: string | null;

  // Dates
  createdDate: string | null;
  updatedDate: string | null;

  // Table-specific (null for non-tables)
  hasOverview: boolean | null;
  columnCount: number | null;
  calculatedColumnCount: number | null;
  rowCount: number | null;
  tableType: string | null;
  daysSinceCreated: number | null;
  daysSinceUpdate: number | null;
  workflowCount: number | null;
  scheduledWorkflowCount: number | null;
  queryCount: number | null;
  dashboardCount: number | null;
  lastSampleAt: string | null;
  lastDetailsAt: string | null;
  lastAnalyzeAt: string | null;
  lastOverviewAt: string | null;
  space: string | null;

  // Query-specific (null for non-queries)
  category: string | null;
  tableName: string | null;
  fieldCount: number | null;

  // Dashboard-specific (null for non-dashboards)
  widgetCount: number | null;
  creatorName: string | null;

  // Workflow-specific (null for non-workflows)
  isScheduled: boolean | null;
  cronExpression: string | null;
  pluginCount: number | null;
  description: string | null;

  // GA4 Analytics (dashboard-only, populated from Supabase)
  gaViews7d: number | null;
  gaViews30d: number | null;
  gaViews90d: number | null;
  gaUsers30d: number | null;
  gaLastViewed: string | null;
  gaHealthScore: number | null;
  gaHealthStatus: string | null;
}

// Classification fields that are editable
export const EDITABLE_FIELDS = new Set([
  "dataType", "dataCategory", "dataSubCategory", "usageStatus",
  "action", "dataSource", "sourceSystem", "tags",
  "suggestedName", "summaryShort", "summaryFull",
  "includeSitemap", "sitemapGroup1", "sitemapGroup2", "solution", "resourceUrl",
]);

// Map grid field names to classification store fields
export const FIELD_TO_STORE: Record<string, ClassificationField> = {
  dataCategory: "dataCategory",
  dataSubCategory: "dataSubCategory",
  usageStatus: "usageStatus",
  action: "action",
  dataSource: "dataSource",
  sourceSystem: "sourceSystem",
  tags: "tags",
  sitemapGroup1: "sitemapGroup1",
  sitemapGroup2: "sitemapGroup2",
  solution: "solution",
};

// Folder prefix for each resource type
export const FOLDER_PREFIX: Record<ReviewResourceType, string> = {
  table: "table_",
  query: "query_",
  dashboard: "dashboard_",
  workflow: "workflow_",
};

// Label for each resource type
export const RESOURCE_LABEL: Record<ReviewResourceType, string> = {
  table: "Data Models",
  query: "Queries",
  dashboard: "Dashboards",
  workflow: "Workflows",
};
