// src/lib/domainArtifacts.ts
// Shared service for domain_artifacts Supabase table.
// Provides: query (cross-domain read), upsert (write), rebuild (bulk re-index from filesystem).

import { supabase, isSupabaseConfigured } from "./supabase";
import type { ReviewResourceType, ReviewRow } from "../modules/domains/reviewTypes";

// ─── Supabase row shape ──────────────────────────────────────────────────────

interface DomainArtifactRow {
  domain: string;
  resource_type: string;
  resource_id: string;
  name: string | null;
  data_type: string | null;
  data_category: string | null;
  data_sub_category: string | null;
  usage_status: string | null;
  action: string | null;
  data_source: string | null;
  source_system: string | null;
  tags: string | null;
  suggested_name: string | null;
  summary_short: string | null;
  summary_full: string | null;
  include_sitemap: boolean;
  sitemap_group1: string | null;
  sitemap_group2: string | null;
  solution: string | null;
  resource_url: string | null;
  row_count: number | null;
  column_count: number | null;
  calculated_column_count: number | null;
  days_since_created: number | null;
  days_since_update: number | null;
  workflow_count: number | null;
  scheduled_workflow_count: number | null;
  query_count: number | null;
  dashboard_count: number | null;
  has_overview: boolean | null;
  space: string | null;
  category: string | null;
  table_name: string | null;
  field_count: number | null;
  widget_count: number | null;
  creator_name: string | null;
  is_scheduled: boolean | null;
  cron_expression: string | null;
  plugin_count: number | null;
  description: string | null;
  is_stale: boolean;
  created_date: string | null;
  updated_date: string | null;
  global_path: string | null;
  folder_path: string | null;
  synced_at: string;
}

// ─── Query: fetch all artifacts for a resource type (cross-domain) ───────────

export async function fetchCrossDomainArtifacts(
  resourceType: ReviewResourceType,
): Promise<ReviewRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from("domain_artifacts")
    .select("*")
    .eq("resource_type", resourceType)
    .order("domain")
    .order("name");

  if (error) throw new Error(`Failed to fetch artifacts: ${error.message}`);
  if (!data) return [];

  return (data as DomainArtifactRow[]).map((row) => supabaseRowToReviewRow(row));
}

/** Convert a Supabase row to a ReviewRow for the grid */
function supabaseRowToReviewRow(row: DomainArtifactRow): ReviewRow {
  return {
    // Identity
    id: row.resource_id,
    name: row.name || row.resource_id,
    displayName: row.name,
    folderName: row.resource_id,
    folderPath: row.folder_path || "",
    isStale: row.is_stale,
    domain: row.domain,

    // Classification
    dataType: row.data_type,
    dataCategory: row.data_category,
    dataSubCategory: row.data_sub_category,
    usageStatus: row.usage_status,
    action: row.action,
    dataSource: row.data_source,
    sourceSystem: row.source_system,
    tags: row.tags,
    suggestedName: row.suggested_name,
    summaryShort: row.summary_short,
    summaryFull: row.summary_full,

    // Portal
    includeSitemap: row.include_sitemap,
    sitemapGroup1: row.sitemap_group1,
    sitemapGroup2: row.sitemap_group2,
    solution: row.solution,
    resourceUrl: row.resource_url,

    // Dates
    createdDate: row.created_date,
    updatedDate: row.updated_date,

    // Table-specific
    hasOverview: row.has_overview,
    columnCount: row.column_count,
    calculatedColumnCount: row.calculated_column_count,
    rowCount: row.row_count,
    tableType: null,
    daysSinceCreated: row.days_since_created,
    daysSinceUpdate: row.days_since_update,
    workflowCount: row.workflow_count,
    scheduledWorkflowCount: row.scheduled_workflow_count,
    queryCount: row.query_count,
    dashboardCount: row.dashboard_count,
    lastSampleAt: null,
    lastDetailsAt: null,
    lastAnalyzeAt: null,
    lastOverviewAt: null,
    space: row.space,

    // Query-specific
    category: row.category,
    tableName: row.table_name,
    fieldCount: row.field_count,

    // Dashboard-specific
    widgetCount: row.widget_count,
    creatorName: row.creator_name,

    // Workflow-specific
    isScheduled: row.is_scheduled,
    cronExpression: row.cron_expression,
    pluginCount: row.plugin_count,
    description: row.description,

    // GA4 Analytics (not stored in domain_artifacts — enriched separately)
    gaViews7d: null,
    gaViews30d: null,
    gaViews90d: null,
    gaUsers30d: null,
    gaLastViewed: null,
    gaHealthScore: null,
    gaHealthStatus: null,
  };
}

// ─── Upsert: write ReviewRow(s) to Supabase ─────────────────────────────────

/** Upsert a single artifact to Supabase. Fire-and-forget safe. */
export async function upsertArtifact(
  domain: string,
  resourceType: ReviewResourceType,
  row: ReviewRow,
  globalPath?: string,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  await upsertArtifacts(domain, resourceType, [row], globalPath);
}

/** Upsert multiple artifacts to Supabase in a single batch. */
export async function upsertArtifacts(
  domain: string,
  resourceType: ReviewResourceType,
  rows: ReviewRow[],
  globalPath?: string,
): Promise<void> {
  if (!isSupabaseConfigured || rows.length === 0) return;

  const isTable = resourceType === "table";
  const records = rows.map((row) => ({
    domain,
    resource_type: resourceType,
    resource_id: isTable ? row.name : row.folderName,
    name: row.displayName || row.name,
    data_type: row.dataType,
    data_category: row.dataCategory,
    data_sub_category: row.dataSubCategory,
    usage_status: row.usageStatus,
    action: row.action,
    data_source: row.dataSource,
    source_system: row.sourceSystem,
    tags: row.tags,
    suggested_name: row.suggestedName,
    summary_short: row.summaryShort,
    summary_full: row.summaryFull,
    include_sitemap: row.includeSitemap,
    sitemap_group1: row.sitemapGroup1,
    sitemap_group2: row.sitemapGroup2,
    solution: row.solution,
    resource_url: row.resourceUrl,
    row_count: row.rowCount,
    column_count: row.columnCount,
    calculated_column_count: row.calculatedColumnCount,
    days_since_created: row.daysSinceCreated,
    days_since_update: row.daysSinceUpdate,
    workflow_count: row.workflowCount,
    scheduled_workflow_count: row.scheduledWorkflowCount,
    query_count: row.queryCount,
    dashboard_count: row.dashboardCount,
    has_overview: row.hasOverview,
    space: row.space,
    category: row.category,
    table_name: row.tableName,
    field_count: row.fieldCount,
    widget_count: row.widgetCount,
    creator_name: row.creatorName,
    is_scheduled: row.isScheduled,
    cron_expression: row.cronExpression,
    plugin_count: row.pluginCount,
    description: row.description,
    is_stale: row.isStale,
    created_date: row.createdDate,
    updated_date: row.updatedDate,
    global_path: globalPath || null,
    folder_path: row.folderPath || null,
    synced_at: new Date().toISOString(),
  }));

  // Batch in chunks of 500 to stay within Supabase limits
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error } = await supabase
      .from("domain_artifacts")
      .upsert(chunk, { onConflict: "domain,resource_type,resource_id" });

    if (error) {
      console.error(`Failed to upsert domain_artifacts batch:`, error.message);
    }
  }
}

/** Upsert partial fields for a single artifact (e.g. after editing classification in review mode). */
export async function upsertArtifactFields(
  domain: string,
  resourceType: ReviewResourceType,
  resourceId: string,
  fields: Partial<ReviewRow>,
): Promise<void> {
  if (!isSupabaseConfigured) return;

  // Map ReviewRow field names to Supabase column names
  const fieldMap: Record<string, string> = {
    dataType: "data_type",
    dataCategory: "data_category",
    dataSubCategory: "data_sub_category",
    usageStatus: "usage_status",
    action: "action",
    dataSource: "data_source",
    sourceSystem: "source_system",
    tags: "tags",
    suggestedName: "suggested_name",
    summaryShort: "summary_short",
    summaryFull: "summary_full",
    includeSitemap: "include_sitemap",
    sitemapGroup1: "sitemap_group1",
    sitemapGroup2: "sitemap_group2",
    solution: "solution",
    resourceUrl: "resource_url",
    displayName: "name",
  };

  const update: Record<string, unknown> = { synced_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    const col = fieldMap[key];
    if (col) update[col] = value;
  }

  const { error } = await supabase
    .from("domain_artifacts")
    .update(update)
    .eq("domain", domain)
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId);

  if (error) {
    console.error(`Failed to update domain_artifact:`, error.message);
  }
}

// ─── Rebuild: re-index all artifacts from filesystem ─────────────────────────

/** Rebuild domain_artifacts for a single domain + resource type from ReviewRow data.
 *  Deletes artifacts no longer on disk, upserts current ones. */
export async function rebuildDomainArtifacts(
  domain: string,
  resourceType: ReviewResourceType,
  rows: ReviewRow[],
  globalPath?: string,
): Promise<{ upserted: number; deleted: number }> {
  if (!isSupabaseConfigured) return { upserted: 0, deleted: 0 };

  const isTable = resourceType === "table";

  // Get existing resource_ids in Supabase for this domain+type
  const { data: existing, error: fetchErr } = await supabase
    .from("domain_artifacts")
    .select("resource_id")
    .eq("domain", domain)
    .eq("resource_type", resourceType);

  if (fetchErr) throw new Error(`Rebuild fetch failed: ${fetchErr.message}`);

  // Determine what to delete (in Supabase but not on disk)
  const currentIds = new Set(rows.map((r) => isTable ? r.name : r.folderName));
  const toDelete = (existing || [])
    .map((e: { resource_id: string }) => e.resource_id)
    .filter((id: string) => !currentIds.has(id));

  // Delete stale records
  let deleted = 0;
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("domain_artifacts")
      .delete()
      .eq("domain", domain)
      .eq("resource_type", resourceType)
      .in("resource_id", toDelete);

    if (delErr) console.error(`Rebuild delete failed:`, delErr.message);
    else deleted = toDelete.length;
  }

  // Upsert current rows
  await upsertArtifacts(domain, resourceType, rows, globalPath);

  return { upserted: rows.length, deleted };
}
