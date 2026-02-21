// ArtifactReviewView: Shared types and constants

import type { ClassificationField } from "../../stores/classificationStore";

export type ArtifactType = "query" | "dashboard" | "workflow";

/** Flat row for AG Grid — shared classification fields + type-specific read-only fields */
export interface ArtifactRow {
  // Identity
  id: string;
  name: string;
  folderName: string;
  folderPath: string;
  // Dates
  createdDate: string | null;
  updatedDate: string | null;
  // Classification (editable)
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
  // Type-specific read-only
  category: string | null;        // queries & dashboards
  tableName: string | null;       // queries
  fieldCount: number | null;      // queries
  widgetCount: number | null;     // dashboards
  creatorName: string | null;     // dashboards
  isScheduled: boolean | null;    // workflows
  cronExpression: string | null;  // workflows
  pluginCount: number | null;     // workflows
  description: string | null;     // workflows
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

// Folder prefix for each artifact type
export const FOLDER_PREFIX: Record<ArtifactType, string> = {
  query: "query_",
  dashboard: "dashboard_",
  workflow: "workflow_",
};

// Label for each artifact type
export const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  query: "Queries",
  dashboard: "Dashboards",
  workflow: "Workflows",
};
