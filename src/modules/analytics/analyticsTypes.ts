// Types for the Analytics module

export type AnalyticsSource = "ga4" | "ga4-website";
export type HealthStatus = "active" | "declining" | "stale" | "dead" | "unused";

export interface PageViewRow {
  source: string;
  page_path: string;
  domain: string | null;
  user_id: string | null;
  view_date: string;
  views: number;
  is_internal: boolean;
}

/** Aggregated page analytics — one row per unique page path */
export interface PageAnalytics {
  pagePath: string;
  source: AnalyticsSource;
  domain: string | null;
  views7d: number;
  views30d: number;
  views90d: number;
  users30d: number;
  lastViewed: string | null;
  trend: number; // percentage change: (7d rate) vs (30d avg rate). Positive = growing
  healthScore: number; // 0-100
  healthStatus: HealthStatus;
}

/** Summary stats for the overview cards */
export interface AnalyticsSummary {
  totalPages: number;
  activePages: number;
  decliningPages: number;
  stalePages: number;
  deadPages: number;
  unusedPages: number;
  lastSyncAt: string | null;
}
