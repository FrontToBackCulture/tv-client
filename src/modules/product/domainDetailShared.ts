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

export type Tab = "overview" | "review" | "files" | "sync" | "history" | "ai";

// Type colors for profile header
export const TYPE_COLORS: Record<string, { bar: string; badge: string; badgeText: string; avatar: string }> = {
  production: { bar: "from-green-400 to-green-600", badge: "bg-green-50 dark:bg-green-900/30", badgeText: "text-green-700 dark:text-green-300", avatar: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300" },
  demo: { bar: "from-blue-400 to-blue-600", badge: "bg-blue-50 dark:bg-blue-900/30", badgeText: "text-blue-700 dark:text-blue-300", avatar: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" },
  template: { bar: "from-purple-400 to-purple-600", badge: "bg-purple-50 dark:bg-purple-900/30", badgeText: "text-purple-700 dark:text-purple-300", avatar: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300" },
};

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
