// Tables drift detection has two halves on different timescales:
//
//   useTableDriftRefresh   — milliseconds. Runs only the
//     compute_artifact_drift_tables RPC, which compares val_table_definitions
//     master vs target hashes already in Supabase. This is the action wired
//     to the "Refresh Drift" toolbar button.
//
//   useSyncTablesFromVal   — seconds-to-minutes. Calls the val-sync-tables
//     edge function, which fetches per-domain table definitions from VAL,
//     canonicalizes them, and upserts into val_table_definitions. Use only
//     when the Supabase data is stale (out of date or missing). Should also
//     run on a daily cron so manual invocation is rarely needed.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../lib/supabase";

/** Distinct target_domain values from artifact_deployments for the given
 *  resource type. Used by the Sync/Index dropdowns to let the user pick a
 *  specific client domain to sync alongside the master. */
export function useTableDeploymentTargets(
  masterDomain: string | null | undefined,
  resourceType: string = "table",
) {
  return useQuery({
    queryKey: ["deployment-targets", resourceType, masterDomain],
    queryFn: async (): Promise<string[]> => {
      if (!masterDomain) return [];
      const { data, error } = await supabase
        .from("artifact_deployments")
        .select("target_domain")
        .eq("resource_type", resourceType)
        .eq("master_domain", masterDomain);
      if (error) throw new Error(error.message);
      const set = new Set((data ?? []).map((d) => d.target_domain).filter(Boolean));
      return Array.from(set).sort();
    },
    enabled: !!masterDomain,
    staleTime: 60_000,
  });
}

export interface DriftSummary {
  in_sync_count: number;
  drifted_count: number;
  missing_count: number;
  unknown_count: number;
}

/** Fast: recompute drift_status on artifact_deployments from existing
 *  val_table_definitions data. No VAL API calls. Typically <1s. */
export function useTableDriftRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { masterDomain?: string }): Promise<DriftSummary> => {
      const masterDomain = opts?.masterDomain ?? "lab";
      const { data, error } = await supabase
        .rpc("compute_artifact_drift_tables", { p_master_domain: masterDomain })
        .single();
      if (error) throw new Error(`compute_artifact_drift_tables: ${error.message}`);

      queryClient.invalidateQueries({ queryKey: ["artifact-deployments"] });
      queryClient.invalidateQueries({ queryKey: ["review-rows"] });

      const r = data as DriftSummary;
      return {
        in_sync_count: r.in_sync_count ?? 0,
        drifted_count: r.drifted_count ?? 0,
        missing_count: r.missing_count ?? 0,
        unknown_count: r.unknown_count ?? 0,
      };
    },
  });
}

export interface SyncSummary {
  /** val_sync_runs row ID — frontend can poll details.current for live progress. */
  run_id?: string;
  domains_synced: number;
  domains_failed: number;
  total_tables: number;
  /** Tables skipped because their VAL `updated_date` matched what was
   *  already in val_table_definitions. Reduces VAL load on repeat runs. */
  total_skipped?: number;
  results?: Record<string, { count: number; skipped?: number; error: string | null }>;
}

/** Heavy: refresh val_table_definitions from VAL via the edge function.
 *  Slow (per-domain VAL fetches, 503-prone). Pass an explicit domain list
 *  to scope the work; omit for full deployment-graph sync. */
export function useSyncTablesFromVal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { domain?: string; domains?: string[] }): Promise<SyncSummary> => {
      const body: Record<string, unknown> = {};
      if (opts?.domain) body.domain = opts.domain;
      if (opts?.domains?.length) body.domains = opts.domains;

      const { data, error } = await supabase.functions.invoke("val-sync-tables", { body });
      if (error) throw new Error(`val-sync-tables failed: ${error.message}`);

      const d = data as {
        run_id?: string;
        domains_synced?: number;
        domains_failed?: number;
        total_tables?: number;
        total_skipped?: number;
        results?: Record<string, { count: number; skipped?: number; error: string | null }>;
      };

      // Definitions changed → drift compute may now produce different results.
      queryClient.invalidateQueries({ queryKey: ["val-table-definitions"] });

      return {
        run_id: d.run_id,
        domains_synced: d.domains_synced ?? 0,
        domains_failed: d.domains_failed ?? 0,
        total_tables: d.total_tables ?? 0,
        total_skipped: d.total_skipped ?? 0,
        results: d.results,
      };
    },
  });
}

/** Poll val_sync_runs.details.current for the most recent running tables sync.
 *  Used while a sync is in flight to stream sub-step messages into the job log
 *  (admin tree fetch, per-batch progress, etc.). The edge function writes a
 *  flat object like `{ stage, domain, tables_total, tables_to_fetch,
 *  tables_skipped, tables_done, ts }`. */
export interface SyncProgress {
  run_id: string;
  domain?: string;
  stage?: string;
  tables_total?: number;
  tables_to_fetch?: number;
  tables_skipped?: number;
  tables_done?: number;
  ts?: string;
}

export async function fetchLatestRunningTablesSync(): Promise<SyncProgress | null> {
  const { data } = await supabase
    .from("val_sync_runs")
    .select("id, details")
    .eq("sync_type", "tables")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const current = (data.details as { current?: Record<string, unknown> } | null)?.current;
  if (!current) return { run_id: data.id };
  return { run_id: data.id, ...current } as SyncProgress;
}

export async function fetchRunProgress(runId: string): Promise<SyncProgress | null> {
  const { data } = await supabase
    .from("val_sync_runs")
    .select("id, details")
    .eq("id", runId)
    .maybeSingle();
  if (!data) return null;
  const current = (data.details as { current?: Record<string, unknown> } | null)?.current;
  if (!current) return { run_id: data.id };
  return { run_id: data.id, ...current } as SyncProgress;
}

// ─── File-based indexer (no VAL API calls, no edge function timeout) ─────────
//
// The file-based VAL sync (Tauri commands `val_sync_tables` + `val_extract_tables`)
// already pulls every table's loadRepoTableRaw payload to disk under
// `{globalPath}/data_models/table_*/definition.json`. Once the files are
// there, we don't need the edge function at all — just walk the directory,
// canonicalize + hash each file, and upsert into val_table_definitions.
// This sidesteps the 150s edge timeout entirely and lets bootstrap finish
// in ~30s for 1,300 tables.
//
// Hash compatibility: `definition.json` IS the loadRepoTableRaw response
// (see src-tauri/.../val_sync/api.rs:111 + extract.rs:301). So the same
// canonicalization (sort keys, strip volatile fields) produces the same
// hash whether tables are synced via edge function or files. Drift
// detection works identically across both pipelines.

// Fields that legitimately differ between domains but don't represent
// semantic schema differences. The remaining payload is what gets hashed
// for drift compare. Keep in sync with supabase/functions/val-sync-tables/index.ts.
//
// `dft_nodefields_id` is a per-domain surrogate key on each column row —
// the same column gets a different numeric ID in each domain (251 in lab,
// 125 in lag). Without stripping it every column row hashes differently
// across domains and every deployed table looks "drifted" even when
// schemas match.
const VOLATILE_KEYS = new Set([
  "id", "_id", "uuid",
  "created_date", "updated_date", "created_at", "updated_at",
  "created_by", "updated_by",
  "zone_id", "phase_id", "space_id",
  "synced_at",
  "dft_nodefields_id",
  // Workflow runtime — each domain runs on its own schedule, so these
  // values will never match between master and target. Stripping them
  // keeps drift focused on the workflow's design (name, plugins, schedule).
  "latest_run_status", "last_run_status",
  "run_started_at", "run_completed_at",
  "last_five_executions",
  // Workflow `queue` is auto-derived from the domain name (e.g.
  // "lab.jobs.default" vs "ssg.jobs.default") so it always differs but
  // is never a real drift signal.
  "queue",
]);

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    if (VOLATILE_KEYS.has(k)) continue;
    out[k] = canonicalize(obj[k]);
  }
  return out;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function countFields(definition: unknown): { fields: number; calc: number } {
  if (!definition || typeof definition !== "object") return { fields: 0, calc: 0 };
  // definition.json from loadRepoTableRaw is a flat array of column descriptors
  // (one row per column). Count non-system rows; calc detection by `is_calculated`
  // / `calculated` / `is_calc_field` / `formula` markers.
  if (Array.isArray(definition)) {
    let fields = 0;
    let calc = 0;
    for (const f of definition) {
      if (f && typeof f === "object") {
        fields++;
        const fObj = f as Record<string, unknown>;
        if (fObj.is_calculated || fObj.calculated || fObj.is_calc_field || fObj.formula) calc++;
      }
    }
    return { fields, calc };
  }
  const obj = definition as Record<string, unknown>;
  for (const key of ["fields", "columns", "data_fields"]) {
    if (Array.isArray(obj[key])) {
      const arr = obj[key] as unknown[];
      let calc = 0;
      for (const f of arr) {
        if (f && typeof f === "object") {
          const fObj = f as Record<string, unknown>;
          if (fObj.is_calculated || fObj.calculated || fObj.is_calc_field || fObj.formula) calc++;
        }
      }
      return { fields: arr.length, calc };
    }
  }
  return { fields: 0, calc: 0 };
}

interface AdminMeta {
  display_name: string | null;
  zone_id: number | null;
  space_id: number | null;
}

function walkAdminTree(node: unknown, out: Map<string, AdminMeta>): void {
  if (!node) return;
  if (Array.isArray(node)) { for (const c of node) walkAdminTree(c, out); return; }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const tableName = (obj.table_name as string) || (obj.tablename as string);
  if (tableName && !out.has(tableName)) {
    out.set(tableName, {
      display_name: (obj.name as string) || (obj.display_name as string) || (obj.title as string) || null,
      zone_id: (obj.zone as number) ?? (obj.zone_id as number) ?? (obj.phase_id as number) ?? null,
      space_id: (obj.space as number) ?? (obj.space_id as number) ?? null,
    });
  }
  for (const key of ["children", "phases", "zones", "spaces", "tables", "data"]) {
    if (obj[key]) walkAdminTree(obj[key], out);
  }
}

interface DomainConfigEntry {
  domain: string;
  globalPath: string;
}

async function getDomainGlobalPath(domain: string): Promise<string> {
  const config = await invoke<{ domains: DomainConfigEntry[] }>("val_sync_load_config");
  const entry = config.domains.find((d) => d.domain === domain);
  if (!entry?.globalPath) {
    throw new Error(`No globalPath configured for domain '${domain}'. Run the file-based sync first.`);
  }
  return entry.globalPath;
}

interface FileEntryT { name: string; path: string; is_directory: boolean }

export interface IndexTablesResult {
  domain: string;
  count: number;
  errors: number;
  duration_ms: number;
}

/** Index already-on-disk table definitions into val_table_definitions.
 *  Reads `{globalPath}/data_models/table_<id>/definition.json` and upserts.
 *  No VAL API calls, no edge function — runs entirely client-side over
 *  Tauri fs IPC + supabase-js. Suitable for bootstrap of large domains
 *  (1000+ tables) that can't fit in one edge function call. */
export async function indexTablesFromFiles(
  domain: string,
  onProgress?: (msg: string) => void,
): Promise<IndexTablesResult> {
  const t0 = Date.now();
  const globalPath = await getDomainGlobalPath(domain);
  const dataModelsDir = `${globalPath}/data_models`;

  // Admin tree → display_name/zone/space lookup. Best-effort; if missing,
  // we still write rows but with null metadata.
  const meta = new Map<string, AdminMeta>();
  try {
    const adminText = await invoke<string>("read_file", { path: `${globalPath}/schema/all_tables.json` });
    walkAdminTree(JSON.parse(adminText), meta);
  } catch {
    onProgress?.(`${domain} · all_tables.json missing — table metadata will be partial`);
  }

  onProgress?.(`${domain} · listing data_models/`);
  const entries = await invoke<FileEntryT[]>("list_directory", { path: dataModelsDir });
  const tableDirs = entries.filter((e) => e.is_directory && e.name.startsWith("table_"));
  if (tableDirs.length === 0) {
    throw new Error(`No table_* dirs in ${dataModelsDir}. Run val_sync_tables + val_extract_tables first.`);
  }
  onProgress?.(`${domain} · ${tableDirs.length} table dir(s) on disk`);

  const syncedAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let errors = 0;

  for (let i = 0; i < tableDirs.length; i++) {
    const dir = tableDirs[i];
    const tableId = dir.name.replace(/^table_/, "");
    try {
      const text = await invoke<string>("read_file", { path: `${dataModelsDir}/${dir.name}/definition.json` });
      const definition = JSON.parse(text);
      const canonical = canonicalize(definition);
      const hash = await sha256Hex(JSON.stringify(canonical));
      const { fields, calc } = countFields(definition);
      const m = meta.get(tableId) ?? { display_name: null, zone_id: null, space_id: null };
      rows.push({
        domain,
        table_id: tableId,
        display_name: m.display_name,
        zone_id: m.zone_id,
        space_id: m.space_id,
        definition,
        definition_hash: hash,
        field_count: fields,
        calculated_field_count: calc,
        deleted: false,
        synced_at: syncedAt,
      });
    } catch (e) {
      errors++;
      console.warn(`indexTablesFromFiles ${domain}/${tableId}: ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 100 === 0 || i === tableDirs.length - 1) {
      onProgress?.(`${domain} · ${i + 1}/${tableDirs.length} files read`);
    }
  }

  // Upsert in small batches — some lab tables have hundreds of columns, so
  // a definition jsonb can run 50KB+. With a 25-row batch worst-case we're
  // POSTing ~1MB, which Supabase REST + the Tauri webview both handle
  // comfortably. Larger batches were producing AbortError mid-sync.
  const BATCH = 25;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    // Retry up to 3 times on transient failures (AbortError, 5xx, network).
    // Permanent failures (constraint violations) hit the throw on attempt 1.
    let lastErr: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await supabase
        .from("val_table_definitions")
        .upsert(slice, { onConflict: "domain,table_id" });
      if (!error) {
        lastErr = null;
        break;
      }
      lastErr = error.message;
      const transient = /abort|timeout|network|fetch|503|504|5\d\d/i.test(lastErr);
      if (!transient || attempt === 3) break;
      onProgress?.(`${domain} · upsert batch ${i / BATCH + 1} failed (${lastErr.slice(0, 60)}…), retry ${attempt}/3`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    if (lastErr) throw new Error(`Upsert failed at row ${i}: ${lastErr}`);
    onProgress?.(`${domain} · upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  // Soft-delete tables that no longer exist on disk. Mirrors the edge
  // function's behavior so drift detection sees consistent state regardless
  // of which path produced the rows.
  const currentIds = rows.map((r) => r.table_id as string);
  if (currentIds.length > 0) {
    const inList = currentIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",");
    await supabase
      .from("val_table_definitions")
      .update({ deleted: true, synced_at: syncedAt })
      .eq("domain", domain)
      .not("table_id", "in", `(${inList})`);
  }

  return { domain, count: rows.length, errors, duration_ms: Date.now() - t0 };
}

/** Mutation wrapper around indexTablesFromFiles for use from React components. */
export function useIndexTablesFromFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { domain: string; onProgress?: (msg: string) => void }) => {
      return indexTablesFromFiles(opts.domain, opts.onProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["val-table-definitions"] });
    },
  });
}

// ─── Generic indexer for queries / workflows / dashboards ────────────────────
//
// Tables have a richer schema (admin tree metadata, field/calc counts) so
// they keep their own indexer above. The other three artifact types are
// structurally simpler — one definition.json per item, no per-element
// metadata — and share this single function via a config map.
//
// On disk the layout is identical: `{globalPath}/<folder>/<prefix>_<id>/definition.json`
// where folder/prefix come from the existing val_extract_<type> Tauri
// commands.

export type DriftArtifactType = "query" | "workflow" | "dashboard";

interface ArtifactConfig {
  /** Subdirectory under globalPath where val_extract_<type> writes files. */
  folder: string;
  /** Prefix of each per-item subdir (e.g. "query_3001/definition.json"). */
  filePrefix: string;
  /** Supabase target table for upserts. */
  table: string;
  /** Primary key column for the artifact id (text). */
  idColumn: string;
  /** Conflict target for upsert. */
  onConflict: string;
}

const ARTIFACT_CONFIG: Record<DriftArtifactType, ArtifactConfig> = {
  query: {
    folder: "queries",
    filePrefix: "query_",
    table: "val_query_definitions",
    idColumn: "query_id",
    onConflict: "domain,query_id",
  },
  workflow: {
    folder: "workflows",
    filePrefix: "workflow_",
    table: "val_workflow_definitions",
    // val_workflow_definitions uses bigint `id` directly. Upsert payload
    // sends the numeric id (parsed from filename) so it matches.
    idColumn: "id",
    onConflict: "domain,id",
  },
  dashboard: {
    folder: "dashboards",
    filePrefix: "dashboard_",
    table: "val_dashboard_definitions",
    idColumn: "id",
    onConflict: "domain,id",
  },
};

export interface IndexArtifactResult {
  domain: string;
  resourceType: DriftArtifactType;
  count: number;
  errors: number;
  duration_ms: number;
}

/** Index already-on-disk query/workflow/dashboard definitions into the
 *  matching val_<type>_definitions table. Same shape as indexTablesFromFiles
 *  but generalised over the three simpler artifact types.
 *
 *  Caller must have already run val_sync_<type> + val_extract_<type> so that
 *  files exist on disk. Errors loudly if the folder is missing. */
export async function indexArtifactsFromFiles(
  resourceType: DriftArtifactType,
  domain: string,
  onProgress?: (msg: string) => void,
): Promise<IndexArtifactResult> {
  const t0 = Date.now();
  const cfg = ARTIFACT_CONFIG[resourceType];
  const globalPath = await getDomainGlobalPath(domain);
  const dir = `${globalPath}/${cfg.folder}`;

  onProgress?.(`${domain} · listing ${cfg.folder}/`);
  let entries: FileEntryT[];
  try {
    entries = await invoke<FileEntryT[]>("list_directory", { path: dir });
  } catch (e) {
    throw new Error(
      `Cannot read ${dir}. Run sync-${resourceType}s + extract-${resourceType}s first. (${e instanceof Error ? e.message : e})`,
    );
  }
  const itemDirs = entries.filter((e) => e.is_directory && e.name.startsWith(cfg.filePrefix));
  if (itemDirs.length === 0) {
    throw new Error(`No ${cfg.filePrefix}* dirs in ${dir}.`);
  }
  onProgress?.(`${domain} · ${itemDirs.length} ${resourceType}(s) on disk`);

  const syncedAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let errors = 0;

  for (let i = 0; i < itemDirs.length; i++) {
    const d = itemDirs[i];
    const rawId = d.name.slice(cfg.filePrefix.length);
    // Workflow + dashboard ids are bigints in their tables; queries use
    // text. Workflows/dashboards: parse to number; on parse failure skip
    // (defends against stray dirs).
    let idValue: string | number = rawId;
    if (resourceType !== "query") {
      const n = Number(rawId);
      if (!Number.isFinite(n)) {
        errors++;
        continue;
      }
      idValue = n;
    }
    try {
      const text = await invoke<string>("read_file", { path: `${dir}/${d.name}/definition.json` });
      const definition = JSON.parse(text);
      const canonical = canonicalize(definition);
      const hash = await sha256Hex(JSON.stringify(canonical));
      // Pull a friendly name from the definition payload for display_name
      // — VAL's definitions consistently put the user-facing name at one
      // of these paths.
      const obj = (definition && typeof definition === "object" ? (definition as Record<string, unknown>) : {});
      const data = (obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {});
      const displayName = (obj.name as string) || (data.name as string) || (obj.title as string) || (data.title as string) || null;

      const row: Record<string, unknown> = {
        domain,
        [cfg.idColumn]: idValue,
        definition,
        definition_hash: hash,
        deleted: false,
        synced_at: syncedAt,
      };
      // Each table uses a different column for the user-visible label:
      //   queries:    display_name (added by our migration)
      //   workflows:  name (NOT NULL — must always populate)
      //   dashboards: name (nullable but useful)
      // Pull from the same definition payload so all three stay in sync.
      if (resourceType === "query") {
        row.display_name = displayName;
      } else {
        // Fallback: VAL workflow ids exist with empty/missing names; fill
        // with the id so the NOT NULL constraint holds.
        row.name = displayName ?? `${cfg.filePrefix}${rawId}`;
      }
      rows.push(row);
    } catch (e) {
      errors++;
      console.warn(`indexArtifactsFromFiles ${resourceType} ${domain}/${rawId}: ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 100 === 0 || i === itemDirs.length - 1) {
      onProgress?.(`${domain} · ${i + 1}/${itemDirs.length} files read`);
    }
  }

  // Batch upsert (queries/workflows/dashboards have smaller definitions
  // than tables, but keep the same retry on transient errors).
  const BATCH = 25;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    let lastErr: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await supabase
        .from(cfg.table)
        .upsert(slice, { onConflict: cfg.onConflict });
      if (!error) { lastErr = null; break; }
      lastErr = error.message;
      const transient = /abort|timeout|network|fetch|503|504|5\d\d/i.test(lastErr);
      if (!transient || attempt === 3) break;
      onProgress?.(`${domain} · upsert batch ${i / BATCH + 1} failed (${lastErr.slice(0, 60)}…), retry ${attempt}/3`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    if (lastErr) throw new Error(`Upsert failed at row ${i}: ${lastErr}`);
    onProgress?.(`${domain} · upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  // Soft-delete items no longer on disk. The id column type differs by
  // resource — Supabase's `.in()` handles both number[] and string[].
  const currentIds = rows.map((r) => r[cfg.idColumn] as string | number);
  if (currentIds.length > 0) {
    await supabase
      .from(cfg.table)
      .update({ deleted: true, synced_at: syncedAt })
      .eq("domain", domain)
      .not(cfg.idColumn, "in", `(${currentIds.map((id) => typeof id === "number" ? id : `"${String(id).replace(/"/g, '\\"')}"`).join(",")})`);
  }

  return { domain, resourceType, count: rows.length, errors, duration_ms: Date.now() - t0 };
}

/** Tiny helper hook so React components can mutate without inlining the
 *  invalidation logic. Invalidates the resource-specific query key. */
export function useIndexArtifactsFromFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { resourceType: DriftArtifactType; domain: string; onProgress?: (msg: string) => void }) => {
      return indexArtifactsFromFiles(opts.resourceType, opts.domain, opts.onProgress);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [`val-${vars.resourceType}-definitions`] });
    },
  });
}

// ─── Per-resource-type drift refresh ─────────────────────────────────────────
// Tables already had useTableDriftRefresh up top. Mirror it for the other
// three by calling the matching RPC.

const DRIFT_RPC: Record<DriftArtifactType | "table", string> = {
  table: "compute_artifact_drift_tables",
  query: "compute_artifact_drift_queries",
  workflow: "compute_artifact_drift_workflows",
  dashboard: "compute_artifact_drift_dashboards",
};

/** Call the right compute_artifact_drift_<type> RPC for any artifact type.
 *  Returns the same DriftSummary shape as useTableDriftRefresh. */
export function useArtifactDriftRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts: {
      resourceType: DriftArtifactType | "table";
      masterDomain?: string;
    }): Promise<DriftSummary> => {
      const masterDomain = opts.masterDomain ?? "lab";
      const fn = DRIFT_RPC[opts.resourceType];
      const { data, error } = await supabase
        .rpc(fn, { p_master_domain: masterDomain })
        .single();
      if (error) throw new Error(`${fn}: ${error.message}`);
      queryClient.invalidateQueries({ queryKey: ["artifact-deployments"] });
      queryClient.invalidateQueries({ queryKey: ["review-rows"] });
      const r = data as DriftSummary;
      return {
        in_sync_count: r.in_sync_count ?? 0,
        drifted_count: r.drifted_count ?? 0,
        missing_count: r.missing_count ?? 0,
        unknown_count: r.unknown_count ?? 0,
      };
    },
  });
}
