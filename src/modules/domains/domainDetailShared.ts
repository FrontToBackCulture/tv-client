// DomainDetailPanel: Shared constants, types, helpers

import type { DiscoveredDomain } from "../../hooks/val-sync";

export interface DomainDetailPanelProps {
  id: string; // domain name
  onClose: () => void;
  onReviewDataModels?: () => void;
  onReviewQueries?: () => void;
  onReviewWorkflows?: () => void;
  onReviewDashboards?: () => void;
  discoveredDomain?: DiscoveredDomain;
}

export const ARTIFACT_LABELS: Record<string, string> = {
  fields: "Fields",
  "all-queries": "Queries",
  "all-workflows": "Workflows",
  "all-dashboards": "Dashboards",
  "all-tables": "Tables",
  "calc-fields": "Calc Fields",
};

export const EXTRACT_LABELS: Record<string, string> = {
  queries: "Queries",
  workflows: "Workflows",
  dashboards: "Dashboards",
  tables: "Tables",
  sql: "SQL",
  "calc-fields": "Calc Fields",
};

/** Artifact metadata — description, group, and sort order keyed by display label */
export const ARTIFACT_META: Record<string, { description: string; group: string; order: number }> = {
  // Schema — core data definitions
  "Tables":       { description: "Table schemas and structure",                    group: "Schema",     order: 1 },
  "Fields":       { description: "Column definitions across all tables",           group: "Schema",     order: 2 },
  "Calc Fields":  { description: "Computed columns (formulas, rollups, vlookups)", group: "Schema",     order: 3 },
  // Definitions — business logic built on top of schema
  "Queries":      { description: "Saved queries and their SQL",                    group: "Definitions", order: 10 },
  "SQL":          { description: "Extracted raw SQL from queries",                 group: "Definitions", order: 11 },
  "Workflows":    { description: "Automation rules and triggers",                  group: "Definitions", order: 12 },
  "Dashboards":   { description: "Dashboard layouts and widget configs",           group: "Definitions", order: 13 },
  // Monitoring — operational health
  "monitoring:sod-tables":           { description: "Start-of-day table freshness checks",  group: "Monitoring", order: 20 },
  "monitoring:workflow-executions":  { description: "Recent workflow run results",           group: "Monitoring", order: 21 },
  "errors:integration":              { description: "API integration errors",                group: "Monitoring", order: 22 },
  "errors:importer":                 { description: "Data importer errors",                  group: "Monitoring", order: 23 },
};

/** Descriptions for output files — keyed by file name */
export const OUTPUT_FILE_DESCRIPTIONS: Record<string, string> = {};

export type Tab = "overview" | "data-models" | "queries" | "workflows" | "dashboards" | "reports" | "ai" | "discussion";

// Type colors for profile header
export const TYPE_COLORS: Record<string, { bar: string; badge: string; badgeText: string; avatar: string }> = {
  production: { bar: "from-green-400 to-green-600", badge: "bg-green-50 dark:bg-green-900/30", badgeText: "text-green-700 dark:text-green-300", avatar: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300" },
  demo: { bar: "from-blue-400 to-blue-600", badge: "bg-blue-50 dark:bg-blue-900/30", badgeText: "text-blue-700 dark:text-blue-300", avatar: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" },
  template: { bar: "from-purple-400 to-purple-600", badge: "bg-purple-50 dark:bg-purple-900/30", badgeText: "text-purple-700 dark:text-purple-300", avatar: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300" },
};

/** Build merged artifact+extraction rows keyed by display name, sorted by group */
export interface MergedArtifactRow {
  label: string;
  group: string;
  sync?: { count: number; status: string; last_sync: string };
  extract?: { count: number; status: string; last_sync: string };
}

export function buildMergedRows(
  artifacts: Record<string, { count: number; status: string; last_sync: string }>,
  extractions: Record<string, { count: number; status: string; last_sync: string }>
): MergedArtifactRow[] {
  const byLabel = new Map<string, MergedArtifactRow>();

  for (const [key, status] of Object.entries(artifacts)) {
    const label = ARTIFACT_LABELS[key] ?? key;
    const meta = ARTIFACT_META[label];
    const existing = byLabel.get(label) ?? { label, group: meta?.group ?? "Other" };
    existing.sync = status;
    byLabel.set(label, existing);
  }

  for (const [key, status] of Object.entries(extractions)) {
    const label = EXTRACT_LABELS[key] ?? key;
    const meta = ARTIFACT_META[label];
    const existing = byLabel.get(label) ?? { label, group: meta?.group ?? "Other" };
    existing.extract = status;
    byLabel.set(label, existing);
  }

  return Array.from(byLabel.values()).sort((a, b) => {
    const orderA = ARTIFACT_META[a.label]?.order ?? 99;
    const orderB = ARTIFACT_META[b.label]?.order ?? 99;
    return orderA - orderB;
  });
}

export function formatRelativeShort(isoString: string | null): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
