// React Query hooks for analytics data from Supabase

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { AnalyticsSource, PageAnalytics, PageViewRow, HealthStatus, AnalyticsSummary } from "./analyticsTypes";

// ============================================================================
// Health scoring (matches reviewLoader.ts logic)
// ============================================================================

function computeHealthScore(views7d: number, views30d: number, views90d: number, users30d: number, lastViewed: string | null): { score: number; status: HealthStatus } {
  // Recency (0-40)
  let recency = 0;
  if (lastViewed) {
    const daysSince = Math.floor((Date.now() - new Date(lastViewed).getTime()) / 86400000);
    if (daysSince <= 7) recency = 40;
    else if (daysSince <= 14) recency = 30;
    else if (daysSince <= 30) recency = 20;
    else if (daysSince <= 60) recency = 10;
  }

  // Frequency (0-30)
  let frequency = 5;
  if (views7d >= 10) frequency = 30;
  else if (views30d >= 20) frequency = 25;
  else if (views30d >= 5) frequency = 15;
  else if (views90d >= 5) frequency = 10;

  // Breadth (0-30) — unique users
  let breadth = 0;
  if (users30d >= 10) breadth = 30;
  else if (users30d >= 5) breadth = 20;
  else if (users30d >= 2) breadth = 15;
  else if (users30d >= 1) breadth = 10;

  const score = recency + frequency + breadth;

  let status: HealthStatus;
  if (score >= 80) status = "active";
  else if (score >= 50) status = "declining";
  else if (score >= 20) status = "stale";
  else if (score >= 1) status = "dead";
  else status = "unused";

  return { score, status };
}

function computeTrend(views7d: number, views30d: number): number {
  const weeklyAvg = views30d / 4.3;
  if (weeklyAvg === 0) return views7d > 0 ? 100 : 0;
  return Math.round(((views7d - weeklyAvg) / weeklyAvg) * 100);
}

// ============================================================================
// Data aggregation
// ============================================================================

function aggregatePageViews(rows: PageViewRow[], source: AnalyticsSource): PageAnalytics[] {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  // Group by page_path
  const grouped = new Map<string, { domain: string | null; views7d: number; views30d: number; views90d: number; users30d: Set<string>; lastViewed: string | null }>();

  for (const row of rows) {
    let entry = grouped.get(row.page_path);
    if (!entry) {
      entry = { domain: null, views7d: 0, views30d: 0, views90d: 0, users30d: new Set(), lastViewed: null };
      grouped.set(row.page_path, entry);
    }

    entry.views90d += row.views;
    if (row.view_date >= d30) {
      entry.views30d += row.views;
      if (row.user_id && row.user_id !== "") entry.users30d.add(row.user_id);
    }
    if (row.view_date >= d7) entry.views7d += row.views;

    if (row.domain && row.domain !== "") entry.domain = row.domain;
    if (!entry.lastViewed || row.view_date > entry.lastViewed) entry.lastViewed = row.view_date;
  }

  const results: PageAnalytics[] = [];
  for (const [pagePath, entry] of grouped) {
    const trend = computeTrend(entry.views7d, entry.views30d);
    const { score, status } = computeHealthScore(entry.views7d, entry.views30d, entry.views90d, entry.users30d.size, entry.lastViewed);

    results.push({
      pagePath,
      source,
      domain: entry.domain,
      views7d: entry.views7d,
      views30d: entry.views30d,
      views90d: entry.views90d,
      users30d: entry.users30d.size,
      lastViewed: entry.lastViewed,
      trend,
      healthScore: score,
      healthStatus: status,
    });
  }

  return results;
}

// ============================================================================
// Hooks
// ============================================================================

async function fetchPageViews(source: AnalyticsSource): Promise<PageAnalytics[]> {
  const { data, error } = await supabase
    .from("analytics_page_views")
    .select("source, page_path, domain, user_id, view_date, views, is_internal")
    .eq("source", source)
    .eq("is_internal", false);

  if (error) throw new Error(error.message);
  return aggregatePageViews((data ?? []) as PageViewRow[], source);
}

export function usePlatformAnalytics() {
  return useQuery({
    queryKey: ["analytics", "platform"],
    queryFn: () => fetchPageViews("ga4"),
    staleTime: 1000 * 60 * 10, // 10 min
  });
}

export function useWebsiteAnalytics() {
  return useQuery({
    queryKey: ["analytics", "website"],
    queryFn: () => fetchPageViews("ga4-website"),
    staleTime: 1000 * 60 * 10,
  });
}

export function useAnalyticsSummary(pages: PageAnalytics[] | undefined): AnalyticsSummary {
  if (!pages) return { totalPages: 0, activePages: 0, decliningPages: 0, stalePages: 0, deadPages: 0, unusedPages: 0, lastSyncAt: null };

  const summary: AnalyticsSummary = {
    totalPages: pages.length,
    activePages: 0,
    decliningPages: 0,
    stalePages: 0,
    deadPages: 0,
    unusedPages: 0,
    lastSyncAt: null,
  };

  for (const p of pages) {
    switch (p.healthStatus) {
      case "active": summary.activePages++; break;
      case "declining": summary.decliningPages++; break;
      case "stale": summary.stalePages++; break;
      case "dead": summary.deadPages++; break;
      case "unused": summary.unusedPages++; break;
    }
    if (p.lastViewed && (!summary.lastSyncAt || p.lastViewed > summary.lastSyncAt)) {
      summary.lastSyncAt = p.lastViewed;
    }
  }

  return summary;
}
