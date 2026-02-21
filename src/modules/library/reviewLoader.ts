// Unified data loader for all review resource types

import { invoke } from "@tauri-apps/api/core";
import { buildDomainUrl } from "../../lib/domainUrl";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import type { ReviewResourceType, ReviewRow } from "./reviewTypes";
import { FOLDER_PREFIX } from "./reviewTypes";

/** Load review rows from filesystem folders for any resource type */
export async function loadReviewData(
  folderPath: string,
  resourceType: ReviewResourceType,
  domainSlug?: string | null,
): Promise<ReviewRow[]> {
  if (resourceType === "table") {
    return loadTablesAsReviewRows(folderPath);
  }
  const rows = await loadArtifactsAsReviewRows(folderPath, resourceType);

  // Enrich dashboards with GA4 analytics from Supabase
  if (resourceType === "dashboard" && domainSlug && isSupabaseConfigured) {
    return enrichDashboardsWithAnalytics(rows, domainSlug);
  }

  return rows;
}

// ─── Table loading ───────────────────────────────────────────────────────────

/** Load tables from data-models-index.json, falling back to directory scan */
async function loadTablesAsReviewRows(dataModelsPath: string): Promise<ReviewRow[]> {
  const indexPath = `${dataModelsPath}/data-models-index.json`;

  try {
    const content = await invoke<string>("read_file", { path: indexPath });
    const indexData = JSON.parse(content);

    if (indexData.tables && Array.isArray(indexData.tables) && indexData.tables.length > 0) {
      const rows: ReviewRow[] = indexData.tables.map((t: Record<string, unknown>) => {
        const tableName = t.name as string;
        return makeTableRow(tableName, `${dataModelsPath}/table_${tableName}`, t);
      });
      return await supplementTableTimestamps(rows);
    }
  } catch {
    // Index file not found or invalid, fall back to scanning
  }

  return await scanTableDirectories(dataModelsPath);
}

function makeTableRow(
  tableName: string,
  path: string,
  data: Record<string, unknown>,
): ReviewRow {
  return {
    id: tableName,
    name: tableName,
    displayName: (data.displayName as string | null) || (data.suggestedName as string | null) || tableName,
    folderName: tableName,
    folderPath: path,
    isStale: false,
    // Classification
    dataType: (data.dataType as string | null) || null,
    dataCategory: (data.dataCategory as string | null) || null,
    dataSubCategory: (data.dataSubCategory as string | null) || null,
    usageStatus: (data.usageStatus as string | null) || null,
    action: (data.action as string | null) || null,
    dataSource: (data.dataSource as string | null) || null,
    sourceSystem: (data.sourceSystem as string | null) || null,
    tags: (data.tags as string | null) || null,
    suggestedName: (data.suggestedName as string | null) || null,
    summaryShort: (data.summaryShort as string | null) || null,
    summaryFull: (data.summaryFull as string | null) || null,
    // Portal
    includeSitemap: data.includeSitemap === true,
    sitemapGroup1: (data.sitemapGroup1 as string | null) || null,
    sitemapGroup2: (data.sitemapGroup2 as string | null) || null,
    solution: (data.solution as string | null) || null,
    resourceUrl: (data.resourceUrl as string | null) || null,
    // Dates (tables use daysSince, not raw dates)
    createdDate: null,
    updatedDate: null,
    // Table-specific
    hasOverview: (data.hasOverview as boolean) || false,
    columnCount: (data.columnCount as number | null) ?? null,
    calculatedColumnCount: (data.calculatedColumnCount as number | null) ?? null,
    rowCount: (data.rowCount as number | null) ?? null,
    tableType: (data.tableType as string | null) || null,
    daysSinceCreated: (data.daysSinceCreated as number | null) ?? null,
    daysSinceUpdate: (data.daysSinceUpdate as number | null) ?? null,
    workflowCount: (data.workflowCount as number | null) ?? null,
    scheduledWorkflowCount: (data.scheduledWorkflowCount as number | null) ?? null,
    queryCount: (data.queryCount as number | null) ?? null,
    dashboardCount: (data.dashboardCount as number | null) ?? null,
    lastSampleAt: (data.lastSampleAt as string | null) || null,
    lastDetailsAt: (data.lastDetailsAt as string | null) || null,
    lastAnalyzeAt: (data.lastAnalyzeAt as string | null) || null,
    lastOverviewAt: (data.lastOverviewAt as string | null) || null,
    space: (data.space as string | null) || null,
    // Non-table fields
    category: null,
    tableName: null,
    fieldCount: null,
    widgetCount: null,
    creatorName: null,
    isScheduled: null,
    cronExpression: null,
    pluginCount: null,
    description: null,
    // GA4 Analytics
    gaViews7d: null, gaViews30d: null, gaViews90d: null,
    gaUsers30d: null, gaLastViewed: null, gaHealthScore: null, gaHealthStatus: null,
  };
}

/** Supplement table data with timestamps from actual files */
async function supplementTableTimestamps(rows: ReviewRow[]): Promise<ReviewRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      let isStale = false;
      try {
        await invoke<string>("read_file", { path: `${row.folderPath}/.stale` });
        isStale = true;
      } catch { /* not stale */ }

      let lastSampleAt = row.lastSampleAt;
      let lastDetailsAt = row.lastDetailsAt;
      let lastAnalyzeAt = row.lastAnalyzeAt;
      let lastOverviewAt = row.lastOverviewAt;

      if (!lastSampleAt) {
        try {
          const sampleContent = await invoke<string>("read_file", { path: `${row.folderPath}/definition_sample.json` });
          const sample = JSON.parse(sampleContent);
          lastSampleAt = sample.meta?.sampledAt || null;
        } catch { /* No sample file */ }
      }

      if (!lastDetailsAt) {
        try {
          const detailsContent = await invoke<string>("read_file", { path: `${row.folderPath}/definition_details.json` });
          const details = JSON.parse(detailsContent);
          lastDetailsAt = details.meta?.generatedAt || null;
        } catch { /* No details file */ }
      }

      if (!lastAnalyzeAt) {
        try {
          const analysisContent = await invoke<string>("read_file", { path: `${row.folderPath}/definition_analysis.json` });
          const analysis = JSON.parse(analysisContent);
          lastAnalyzeAt = analysis.meta?.analyzedAt || null;
        } catch { /* No analysis file */ }
      }

      if (!lastOverviewAt && row.hasOverview) {
        try {
          const fileInfo = await invoke<{ modified?: string }>("get_file_info", { path: `${row.folderPath}/overview.md` });
          lastOverviewAt = fileInfo.modified || null;
        } catch { /* Ignore */ }
      }

      return { ...row, isStale, lastSampleAt, lastDetailsAt, lastAnalyzeAt, lastOverviewAt };
    })
  );
}

/** Fall back to scanning table_ directories */
async function scanTableDirectories(dataModelsPath: string): Promise<ReviewRow[]> {
  const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>(
    "list_directory",
    { path: dataModelsPath }
  );

  const tableDirs = entries.filter((e) => e.is_directory && e.name.startsWith("table_"));

  return Promise.all(
    tableDirs.map(async (dir) => {
      const tableName = dir.name.replace(/^table_/, "");
      const data: Record<string, unknown> = { name: tableName };

      // Check for .stale marker
      let isStale = false;
      try {
        await invoke<string>("read_file", { path: `${dir.path}/.stale` });
        isStale = true;
      } catch { /* not stale */ }

      // Read definition_details.json
      try {
        const detailsContent = await invoke<string>("read_file", { path: `${dir.path}/definition_details.json` });
        const details = JSON.parse(detailsContent);
        data.displayName = details.meta?.displayName || null;
        data.tableType = details.meta?.tableType || null;
        data.lastDetailsAt = details.meta?.generatedAt || null;
        if (details.health) {
          if (details.health.daysSinceCreated !== undefined) data.daysSinceCreated = details.health.daysSinceCreated;
          if (details.health.daysSinceUpdate !== undefined) data.daysSinceUpdate = details.health.daysSinceUpdate;
        }
        if (details.columns) {
          if (Array.isArray(details.columns)) {
            data.columnCount = details.columns.length;
            data.calculatedColumnCount = details.columns.filter(
              (col: { formula?: string; isCalculated?: boolean }) => col.formula || col.isCalculated
            ).length;
          } else {
            const systemCols = details.columns.system?.length || 0;
            const dataCols = details.columns.data?.length || details.columns.custom?.length || 0;
            const calcCols = details.columns.calculated?.length || 0;
            data.columnCount = systemCols + dataCols + calcCols;
            data.calculatedColumnCount = calcCols;
          }
        }
        if (details.relationships) {
          if (details.relationships.workflows && Array.isArray(details.relationships.workflows)) {
            data.workflowCount = details.relationships.workflows.length;
            data.scheduledWorkflowCount = details.relationships.workflows.filter(
              (wf: { scheduled?: boolean }) => wf.scheduled === true
            ).length;
          }
          if (details.relationships.queries && Array.isArray(details.relationships.queries)) {
            data.queryCount = details.relationships.queries.length;
          }
          if (details.relationships.dashboards && Array.isArray(details.relationships.dashboards)) {
            data.dashboardCount = details.relationships.dashboards.length;
          }
        }
      } catch { /* No details file */ }

      // Read definition_sample.json for timestamp + rowCount
      try {
        const sampleContent = await invoke<string>("read_file", { path: `${dir.path}/definition_sample.json` });
        const sample = JSON.parse(sampleContent);
        data.lastSampleAt = sample.meta?.sampledAt || null;
        if (sample.meta?.totalRowCount != null) data.rowCount = sample.meta.totalRowCount;
      } catch { /* No sample file */ }

      // Check if overview.md exists
      let hasOverview = false;
      try {
        await invoke<string>("read_file", { path: `${dir.path}/overview.md` });
        hasOverview = true;
      } catch { /* No overview file */ }
      data.hasOverview = hasOverview;

      // Read definition_analysis.json
      try {
        const analysisContent = await invoke<string>("read_file", { path: `${dir.path}/definition_analysis.json` });
        const analysis = JSON.parse(analysisContent);
        data.suggestedName = analysis.suggestedName || null;
        data.dataType = analysis.dataType || analysis.classification?.dataType || null;
        data.summaryShort = analysis.summary?.short || null;
        data.summaryFull = analysis.summary?.full || null;
        data.lastAnalyzeAt = analysis.meta?.analyzedAt || null;
        data.dataCategory = analysis.dataCategory || null;
        data.dataSubCategory = analysis.dataSubCategory || null;
        data.dataSource = analysis.dataSource || null;
        data.usageStatus = analysis.usageStatus || null;
        data.action = analysis.action || null;
        data.tags = analysis.tags || null;
        data.sourceSystem = analysis.sourceSystem || null;
        data.includeSitemap = analysis.includeSitemap === true;
        data.sitemapGroup1 = analysis.sitemapGroup1 || null;
        data.sitemapGroup2 = analysis.sitemapGroup2 || null;
        data.solution = analysis.solution || null;
        data.resourceUrl = analysis.resourceUrl || null;
      } catch { /* No analysis file */ }

      // Auto-populate resourceUrl from folder path if not set
      if (!data.resourceUrl) {
        data.resourceUrl = buildDomainUrl(dir.path) || null;
      }

      // Get overview.md file modified time
      if (hasOverview) {
        try {
          const fileInfo = await invoke<{ modified?: string }>("get_file_info", { path: `${dir.path}/overview.md` });
          data.lastOverviewAt = fileInfo.modified || null;
        } catch { /* Ignore */ }
      }

      const row = makeTableRow(tableName, dir.path, data);
      row.isStale = isStale;
      return row;
    })
  );
}

// ─── Artifact loading (queries, dashboards, workflows) ──────────────────────

async function loadArtifactsAsReviewRows(
  folderPath: string,
  resourceType: ReviewResourceType,
): Promise<ReviewRow[]> {
  const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>(
    "list_directory",
    { path: folderPath }
  );

  const prefix = FOLDER_PREFIX[resourceType];
  const dirs = entries.filter((e) => e.is_directory && e.name.startsWith(prefix));

  const rows: ReviewRow[] = await Promise.all(
    dirs.map(async (dir) => {
      const row: ReviewRow = {
        id: dir.name,
        name: dir.name,
        displayName: null,
        folderName: dir.name,
        folderPath: dir.path,
        isStale: false,
        // Classification
        dataType: null, dataCategory: null, dataSubCategory: null,
        usageStatus: null, action: null, dataSource: null, sourceSystem: null,
        tags: null, suggestedName: null, summaryShort: null, summaryFull: null,
        // Portal
        includeSitemap: false, sitemapGroup1: null, sitemapGroup2: null,
        solution: null, resourceUrl: null,
        // Dates
        createdDate: null, updatedDate: null,
        // Table-specific (null)
        hasOverview: null, columnCount: null, calculatedColumnCount: null,
        rowCount: null, tableType: null, daysSinceCreated: null, daysSinceUpdate: null,
        workflowCount: null, scheduledWorkflowCount: null, queryCount: null, dashboardCount: null,
        lastSampleAt: null, lastDetailsAt: null, lastAnalyzeAt: null, lastOverviewAt: null, space: null,
        // Artifact-specific (null)
        category: null, tableName: null, fieldCount: null,
        widgetCount: null, creatorName: null,
        isScheduled: null, cronExpression: null, pluginCount: null, description: null,
        // GA4 Analytics
        gaViews7d: null, gaViews30d: null, gaViews90d: null,
        gaUsers30d: null, gaLastViewed: null, gaHealthScore: null, gaHealthStatus: null,
      };

      // Check for .stale marker
      try {
        await invoke<string>("read_file", { path: `${dir.path}/.stale` });
        row.isStale = true;
      } catch { /* not stale */ }

      // Read definition.json
      try {
        const defContent = await invoke<string>("read_file", { path: `${dir.path}/definition.json` });
        const def = JSON.parse(defContent);

        row.name = def.name || def.displayName || dir.name;
        row.displayName = def.name || def.displayName || dir.name;
        row.id = String(def.id ?? dir.name);
        row.createdDate = def.created_date || null;
        row.updatedDate = def.updated_date || null;

        // Type-specific fields
        if (resourceType === "query") {
          row.category = def.category || null;
          row.tableName = def.datasource?.queryInfo?.tableInfo?.name || null;
          row.fieldCount = def.datasource?.queryInfo?.tableInfo?.fields?.length ?? null;
        } else if (resourceType === "dashboard") {
          row.category = def.category || null;
          row.widgetCount = Array.isArray(def.widgets) ? def.widgets.length : null;
          row.creatorName = def.created_by || null;
        } else if (resourceType === "workflow") {
          row.isScheduled = !!def.cron_expression;
          row.cronExpression = def.cron_expression || null;
          row.pluginCount = def.data?.workflow?.plugins?.length ?? null;
          row.description = def.description || null;
        }
      } catch { /* No definition.json */ }

      // Read definition_analysis.json for classification
      try {
        const analysisContent = await invoke<string>("read_file", { path: `${dir.path}/definition_analysis.json` });
        const analysis = JSON.parse(analysisContent);

        row.dataType = analysis.classification?.dataType || analysis.dataType || null;
        row.dataCategory = analysis.dataCategory || null;
        row.dataSubCategory = analysis.dataSubCategory || null;
        row.usageStatus = analysis.usageStatus || null;
        row.action = analysis.action || null;
        row.dataSource = analysis.dataSource || null;
        row.sourceSystem = analysis.sourceSystem || null;
        row.tags = analysis.tags || null;
        row.suggestedName = analysis.suggestedName || null;
        row.summaryShort = analysis.summary?.short || null;
        row.summaryFull = analysis.summary?.full || null;
        row.includeSitemap = analysis.includeSitemap === true;
        row.sitemapGroup1 = analysis.sitemapGroup1 || null;
        row.sitemapGroup2 = analysis.sitemapGroup2 || null;
        row.solution = analysis.solution || null;
        row.resourceUrl = analysis.resourceUrl || null;
      } catch { /* No analysis file */ }

      // Auto-populate resourceUrl from folder path if not set
      if (!row.resourceUrl) {
        row.resourceUrl = buildDomainUrl(dir.path) || null;
      }

      return row;
    })
  );

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

// ─── Analytics enrichment (from analytics_page_views) ────────────────────────

/** Extract dashboard ID from page path like /dashboard/private/123/ */
function extractDashboardId(pagePath: string): string | null {
  const parts = pagePath.split("/").filter(Boolean);
  // ["dashboard", "private"|"public", "123", ...]
  if (parts.length >= 3 && parts[0] === "dashboard") {
    const id = parseInt(parts[2], 10);
    return isNaN(id) ? null : String(id);
  }
  return null;
}

/** Compute health score (0-100) and status from view counts */
function computeHealth(
  views7d: number,
  views30d: number,
  views90d: number,
  lastViewed: string | null,
): { score: number; status: string } {
  if (views90d === 0) return { score: 0, status: "unused" };

  const today = new Date();
  const daysSince = lastViewed
    ? Math.floor((today.getTime() - new Date(lastViewed).getTime()) / 86400000)
    : 999;

  // Recency (0-40)
  const recency = daysSince <= 7 ? 40 : daysSince <= 14 ? 30 : daysSince <= 30 ? 20 : daysSince <= 60 ? 10 : 0;

  // Frequency (0-30)
  const frequency = views7d >= 10 ? 30 : views30d >= 20 ? 25 : views30d >= 5 ? 15 : views90d >= 5 ? 10 : 5;

  // Trend (0-30)
  let trend = 10;
  if (views30d > 0 && views7d > 0) {
    trend = views7d >= (views30d / 4.3) * 0.8 ? 30 : 15;
  } else if (views90d > 0 && views30d === 0) {
    trend = 5;
  }

  const score = Math.min(recency + frequency + trend, 100);
  const status = score >= 80 ? "active" : score >= 50 ? "declining" : score >= 20 ? "stale" : score >= 1 ? "dead" : "unused";
  return { score, status };
}

async function enrichDashboardsWithAnalytics(
  rows: ReviewRow[],
  domainSlug: string,
): Promise<ReviewRow[]> {
  try {
    // Fetch external dashboard page views for this domain only
    const { data, error } = await supabase
      .from("analytics_page_views")
      .select("page_path, view_date, views, user_id")
      .like("page_path", "/dashboard/%")
      .eq("is_internal", false)
      .eq("domain", domainSlug);

    if (error || !data || data.length === 0) return rows;

    const today = new Date();
    const ms7d = 7 * 86400000;
    const ms30d = 30 * 86400000;

    // Aggregate by dashboard ID
    const agg = new Map<string, {
      views7d: number; views30d: number; views90d: number;
      users30d: Set<string>;
      lastViewed: string | null;
    }>();

    for (const pv of data) {
      const dashId = extractDashboardId(pv.page_path);
      if (!dashId) continue;

      if (!agg.has(dashId)) {
        agg.set(dashId, { views7d: 0, views30d: 0, views90d: 0, users30d: new Set(), lastViewed: null });
      }
      const entry = agg.get(dashId)!;
      const viewDate = new Date(pv.view_date);
      const age = today.getTime() - viewDate.getTime();

      if (age <= ms7d) entry.views7d += pv.views;
      if (age <= ms30d) {
        entry.views30d += pv.views;
        if (pv.user_id) entry.users30d.add(pv.user_id);
      }
      entry.views90d += pv.views;

      if (pv.views > 0 && (!entry.lastViewed || pv.view_date > entry.lastViewed)) {
        entry.lastViewed = pv.view_date;
      }
    }

    return rows.map((row) => {
      const stats = agg.get(row.id);
      if (!stats) return row;
      const health = computeHealth(stats.views7d, stats.views30d, stats.views90d, stats.lastViewed);
      return {
        ...row,
        gaViews7d: stats.views7d,
        gaViews30d: stats.views30d,
        gaViews90d: stats.views90d,
        gaUsers30d: stats.users30d.size > 0 ? stats.users30d.size : null,
        gaLastViewed: stats.lastViewed,
        gaHealthScore: health.score,
        gaHealthStatus: health.status,
      };
    });
  } catch {
    return rows;
  }
}
