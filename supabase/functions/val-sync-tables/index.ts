// Supabase Edge Function: Sync VAL table definitions per domain.
//
// POST /val-sync-tables
// Body: { domain?: string }  — sync one domain, or all production + lab if omitted
//
// For each domain:
//   1. Read credentials from val_domain_credentials, ensure auth token
//   2. Fetch table list via /db/admin-management/getFullAdminTree
//   3. For each table, fetch full schema via /api/v1/load/loadRepoTableRaw
//   4. Canonicalize the definition + compute SHA-256 hash for drift detection
//   5. Upsert into val_table_definitions on (domain, table_id)
//   6. Mark tables not in current response as deleted=true
//   7. Log run in val_sync_runs
//
// Drift detection downstream compares val_table_definitions.definition_hash
// between master (lab) and target rows joined via artifact_deployments.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── VAL Auth (mirrors val-sync-workflows) ────────────────────────────────────

interface DomainCreds {
  domain: string;
  api_domain: string | null;
  email: string;
  encrypted_password: string;
  token_cache: string | null;
  token_expires_at: string | null;
}

function getApiDomain(creds: DomainCreds): string {
  return creds.api_domain || creds.domain;
}
function getBaseUrl(creds: DomainCreds): string {
  return `https://${getApiDomain(creds)}.thinkval.io`;
}

/** Edge function hard timeout is 150s. Stop kicking off new work after
 *  this — return what we have. Leaves headroom for in-flight requests
 *  to drain, supabase upserts, and the response itself.
 *
 *  Reset per-request inside Deno.serve so each invocation starts with a
 *  full budget — module-level state would survive cold-start and break
 *  a few requests later. */
const SOFT_TIMEOUT_MS = 110_000;
let requestStartedAt = 0;
const isOverBudget = () => requestStartedAt > 0 && Date.now() - requestStartedAt > SOFT_TIMEOUT_MS;

/** Fetch with exponential-backoff retry on 5xx. Aggressive but bounded:
 *  2 attempts max (so max delay = 1s), abort if soft timeout hit. */
async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  label: string,
  maxAttempts = 2,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && res.status < 600 && attempt < maxAttempts && !isOverBudget()) {
        const wait = 1000;
        console.warn(`[val-sync-tables] ${label} attempt ${attempt} got ${res.status}, retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts && !isOverBudget()) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed after ${maxAttempts} attempts`);
}

async function loginToVal(baseUrl: string, email: string, password: string) {
  const res = await fetchWithRetry(
    `${baseUrl}/api/v1/users/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: false, loginID: email }),
    },
    `login(${baseUrl})`,
  );
  if (!res.ok) throw new Error(`VAL login failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const token = data.user || data.data?.user;
  if (!token) throw new Error(`No token in VAL login response`);
  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  return { token, expiresAt };
}

async function ensureToken(creds: DomainCreds): Promise<string> {
  if (creds.token_cache && creds.token_expires_at) {
    const exp = new Date(creds.token_expires_at).getTime();
    if (Date.now() < exp - 5 * 60 * 1000) return creds.token_cache;
  }
  const { token, expiresAt } = await loginToVal(getBaseUrl(creds), creds.email, creds.encrypted_password);
  // Fire-and-forget cache write
  supabase
    .from("val_domain_credentials")
    .update({ token_cache: token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("domain", creds.domain)
    .then(() => {});
  return token;
}

// ─── VAL API ─────────────────────────────────────────────────────────────────

interface TableNode {
  table_name?: string;
  tablename?: string;
  display_name?: string | null;
  zone_id?: number | null;
  space_id?: number | null;
  created_date?: string | null;
  updated_date?: string | null;
}

/** Recursively walk the admin tree and collect every table node found.
 *
 *  IMPORTANT: a node can be a table AND have child tables under it (VAL
 *  has nested repo tables, phase_repo_tbl sub-tables, etc.). Push when we
 *  see a `table_name`, but ALWAYS continue walking children — matches the
 *  Rust extractor in tv-mcp/val_sync/extract.rs. Missing this `continue`
 *  drops most tables (lab dropped from 1k+ down to 82). */
function flattenTables(node: unknown, out: TableNode[]): void {
  if (!node) return;
  if (Array.isArray(node)) { for (const c of node) flattenTables(c, out); return; }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const tableName = (obj.table_name || obj.tablename) as string | undefined;
  if (tableName) {
    out.push({
      table_name: tableName,
      tablename: tableName,
      display_name: (obj.display_name as string) || (obj.title as string) || null,
      zone_id: (obj.zone_id as number) ?? (obj.phase_id as number) ?? null,
      space_id: (obj.space_id as number) ?? null,
      created_date: (obj.created_date as string) || null,
      updated_date: (obj.updated_date as string) || null,
    });
    // Fall through — node may still have nested tables in `children`/etc.
  }
  // Walk every known container field. `data` is the top-level wrapper VAL
  // uses; `children` is the recursive structure under each space/zone/table.
  for (const key of ["children", "phases", "zones", "spaces", "tables", "data"]) {
    if (obj[key]) flattenTables(obj[key], out);
  }
}

async function fetchAdminTree(baseUrl: string, token: string): Promise<TableNode[]> {
  const url = `${baseUrl}/db/admin-management/getFullAdminTree?uuid=1&token=${encodeURIComponent(token)}`;
  const res = await fetchWithRetry(url, undefined, `getFullAdminTree(${baseUrl})`);
  if (!res.ok) throw new Error(`getFullAdminTree (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const out: TableNode[] = [];
  flattenTables(body.data ?? body, out);
  // Dedupe by table_name (a table can surface under multiple zones)
  const seen = new Set<string>();
  return out.filter((t) => {
    const k = t.table_name || "";
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function fetchTableDefinition(baseUrl: string, token: string, tableName: string): Promise<unknown> {
  const url = `${baseUrl}/api/v1/load/loadRepoTableRaw?table=${encodeURIComponent(tableName)}&uuid=1&token=${encodeURIComponent(token)}`;
  const res = await fetchWithRetry(url, undefined, `loadRepoTableRaw(${tableName})`);
  if (!res.ok) throw new Error(`loadRepoTableRaw '${tableName}' (${res.status})`);
  const body = await res.json();
  return body.data ?? body;
}

// ─── Definition canonicalization + hash ──────────────────────────────────────

/** Strip ID/timestamp/audit fields that legitimately differ between domains
 *  but don't represent semantic schema differences. The remaining payload is
 *  what gets hashed for drift compare. Keep in sync with
 *  src/hooks/useTableDriftRefresh.ts.
 *
 *  `dft_nodefields_id` is a per-domain surrogate key on each column row;
 *  without stripping it every deployed table looks "drifted" even when
 *  schemas match. */
const VOLATILE_KEYS = new Set([
  "id", "_id", "uuid",
  "created_date", "updated_date", "created_at", "updated_at",
  "created_by", "updated_by",
  "zone_id", "phase_id", "space_id",
  "synced_at",
  "dft_nodefields_id",
]);

function canonicalize(value: unknown): unknown {
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

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function countFields(definition: unknown): { fields: number; calc: number } {
  if (!definition || typeof definition !== "object") return { fields: 0, calc: 0 };
  const obj = definition as Record<string, unknown>;
  // Common field arrays found in VAL definitions
  const fieldArrays = ["fields", "columns", "data_fields"];
  let fields = 0;
  let calc = 0;
  for (const key of fieldArrays) {
    if (Array.isArray(obj[key])) {
      const arr = obj[key] as unknown[];
      fields += arr.length;
      for (const f of arr) {
        if (f && typeof f === "object") {
          const fObj = f as Record<string, unknown>;
          if (fObj.is_calculated || fObj.calculated || fObj.is_calc_field || fObj.formula) calc++;
        }
      }
      break;
    }
  }
  if (Array.isArray(obj.calculated_fields)) calc += (obj.calculated_fields as unknown[]).length;
  return { fields, calc };
}

// ─── Sync per domain ─────────────────────────────────────────────────────────

async function syncDomainTables(
  creds: DomainCreds,
  progress?: { runId: string; markProgress: (delta: Record<string, unknown>) => Promise<void> },
): Promise<{ domain: string; count: number; error?: string; skipped?: number }> {
  const domain = creds.domain;
  try {
    const token = await ensureToken(creds);
    const baseUrl = getBaseUrl(creds);
    await progress?.markProgress({ stage: "fetching admin tree", domain });
    const tables = await fetchAdminTree(baseUrl, token);

    // Incremental skip — only fetch full definitions for tables whose
    // VAL `updated_date` is newer than the val_table_definitions row we
    // already have. Steady-state runs touch zero tables (admin tree call
    // only), avoiding the 1+N→503 load profile.
    const { data: existing } = await supabase
      .from("val_table_definitions")
      .select("table_id, updated_date, definition_hash")
      .eq("domain", domain);
    const existingMap = new Map<string, { updated_date: string | null; definition_hash: string | null }>();
    for (const row of existing ?? []) {
      existingMap.set(row.table_id, { updated_date: row.updated_date, definition_hash: row.definition_hash });
    }

    const tablesToFetch: TableNode[] = [];
    let skipped = 0;
    for (const t of tables) {
      const prev = existingMap.get(t.table_name!);
      // Skip iff Supabase already has this table AND VAL hasn't bumped
      // its updated_date since we last synced. We also require a hash on
      // the existing row — null hash means the row was bootstrapped
      // without canonical data, so it must be re-fetched.
      const tableUpdated = t.updated_date ?? null;
      const sameUpdated = !!tableUpdated && prev?.updated_date === tableUpdated;
      if (prev?.definition_hash && sameUpdated) {
        skipped++;
        continue;
      }
      tablesToFetch.push(t);
    }

    await progress?.markProgress({
      stage: "fetching tables",
      domain,
      tables_total: tables.length,
      tables_to_fetch: tablesToFetch.length,
      tables_skipped: skipped,
      tables_done: 0,
    });

    const rows: Array<Record<string, unknown>> = [];
    const syncedAt = new Date().toISOString();

    // Bounded concurrency for per-table fetches. Higher values speed up sync
    // but increase load on VAL — 8 is the sweet spot in testing.
    const CONCURRENCY = 8;
    for (let i = 0; i < tablesToFetch.length; i += CONCURRENCY) {
      // Stop fetching new tables if we've blown the soft budget. Already-fetched
      // rows still get upserted below.
      if (isOverBudget()) break;
      const batch = tablesToFetch.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (t) => {
        if (isOverBudget()) return null;
        const tableName = t.table_name!;
        try {
          const definition = await fetchTableDefinition(baseUrl, token, tableName);
          const canonical = canonicalize(definition);
          const hash = await sha256(JSON.stringify(canonical));
          const { fields, calc } = countFields(definition);
          return {
            domain,
            table_id: tableName,
            display_name: t.display_name,
            zone_id: t.zone_id,
            space_id: t.space_id,
            definition,
            definition_hash: hash,
            field_count: fields,
            calculated_field_count: calc,
            created_date: t.created_date,
            updated_date: t.updated_date,
            deleted: false,
            synced_at: syncedAt,
          };
        } catch (e) {
          console.error(`[val-sync-tables] ${domain}/${tableName}: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        }
      }));
      for (const r of results) if (r) rows.push(r);

      // Per-batch progress write — every ~16s in steady state.
      await progress?.markProgress({
        stage: "fetching tables",
        domain,
        tables_total: tables.length,
        tables_to_fetch: tablesToFetch.length,
        tables_skipped: skipped,
        tables_done: rows.length,
      });
    }

    // Upsert in batches of 50 (definition jsonb can be large)
    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const { error } = await supabase
        .from("val_table_definitions")
        .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: "domain,table_id" });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }

    // Soft-delete tables no longer in the admin tree. Critical: this must
    // reference the FULL admin tree (every table currently in VAL), not just
    // the rows we re-fetched this run. With incremental sync, `rows` is a
    // subset; using it here would mark every unchanged-but-still-existing
    // table as deleted.
    const currentIds = tables.map((t) => t.table_name!).filter(Boolean);
    if (currentIds.length > 0) {
      const inList = currentIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",");
      await supabase
        .from("val_table_definitions")
        .update({ deleted: true, synced_at: syncedAt })
        .eq("domain", domain)
        .not("table_id", "in", `(${inList})`);
    }

    return { domain, count: rows.length, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[val-sync-tables] ${domain}: ${message}`);
    return { domain, count: 0, error: message };
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS headers shared between preflight and the actual POST response —
  // the browser requires Access-Control-Allow-Origin on both.
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // supabase-js attaches apikey + x-client-info on top of Authorization,
    // so the preflight must explicitly allow them or the browser blocks
    // the POST without ever sending it (this was the silent failure mode).
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Reset the soft-timeout clock for this invocation.
  requestStartedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    // Accept either a single string `domain` or an array `domains` for chunked
    // invocations. Empty body = full sync of every domain in the deployment graph.
    const targetDomain: string | null = typeof body.domain === "string" ? body.domain : null;
    const targetDomains: string[] | null = Array.isArray(body.domains)
      ? body.domains.filter((d: unknown) => typeof d === "string" && d.length > 0)
      : null;

    const { data: run } = await supabase
      .from("val_sync_runs")
      .insert({ sync_type: "tables", status: "running" })
      .select("id").single();
    const runId = run?.id;

    let credsQuery = supabase
      .from("val_domain_credentials")
      .select("domain, api_domain, email, encrypted_password, token_cache, token_expires_at");

    if (targetDomain) {
      credsQuery = credsQuery.eq("domain", targetDomain);
    } else if (targetDomains && targetDomains.length > 0) {
      credsQuery = credsQuery.in("domain", targetDomains);
    } else {
      // Default scope: every domain that's either a production environment
      // OR appears anywhere in artifact_deployments as master/target. The
      // domain_metadata filter alone isn't enough because lab is registered
      // as domain_type='template' (not 'lab'), and any custom master would
      // also be missed. Union with deployments captures the real graph.
      const [{ data: prodDomains }, { data: deployments }] = await Promise.all([
        supabase
          .from("domain_metadata")
          .select("domain")
          .in("domain_type", ["production", "pilot", "lab", "template"]),
        supabase
          .from("artifact_deployments")
          .select("master_domain, target_domain")
          .eq("resource_type", "table"),
      ]);
      const names = new Set<string>();
      for (const d of prodDomains ?? []) names.add(d.domain);
      for (const d of deployments ?? []) {
        if (d.master_domain) names.add(d.master_domain);
        if (d.target_domain) names.add(d.target_domain);
      }
      if (names.size === 0) {
        return Response.json({ status: "ok", message: "No domains found" }, { headers: corsHeaders });
      }
      credsQuery = credsQuery.in("domain", Array.from(names));
    }

    const { data: credsList, error: credsErr } = await credsQuery;
    if (credsErr) throw credsErr;
    if (!credsList || credsList.length === 0) {
      return Response.json(
        { status: "error", message: "No credentials" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Progress writer — updates val_sync_runs.details.current so the
    // frontend can poll the running row and stream sub-step updates into
    // the job log. Fire-and-forget but awaitable for ordering.
    const markProgress = runId
      ? async (delta: Record<string, unknown>) => {
          try {
            await supabase
              .from("val_sync_runs")
              .update({
                details: { current: { ...delta, ts: new Date().toISOString() } },
              })
              .eq("id", runId);
          } catch (e) {
            console.warn(`[val-sync-tables] progress write failed: ${e instanceof Error ? e.message : e}`);
          }
        }
      : undefined;
    const progressCtx = runId && markProgress ? { runId, markProgress } : undefined;

    const CONCURRENCY = 2;
    const results: Array<{ domain: string; count: number; error?: string; skipped?: number }> = [];
    for (let i = 0; i < credsList.length; i += CONCURRENCY) {
      if (isOverBudget()) {
        for (const c of credsList.slice(i)) {
          results.push({ domain: (c as DomainCreds).domain, count: 0, error: "skipped — soft timeout reached, retry to continue" });
        }
        break;
      }
      const batch = credsList.slice(i, i + CONCURRENCY);
      const r = await Promise.all(batch.map((c) => syncDomainTables(c as DomainCreds, progressCtx)));
      results.push(...r);
    }

    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    const totalRecords = results.reduce((s, r) => s + r.count, 0);

    if (runId) {
      await supabase.from("val_sync_runs").update({
        completed_at: new Date().toISOString(),
        domains_attempted: results.length,
        domains_succeeded: succeeded.length,
        domains_failed: failed.length,
        total_records: totalRecords,
        status: failed.length === 0 ? "completed" : (succeeded.length === 0 ? "failed" : "completed"),
        error: failed.length > 0 ? failed.map((f) => `${f.domain}: ${f.error}`).join("; ") : null,
        details: Object.fromEntries(results.map((r) => [r.domain, { count: r.count, skipped: r.skipped ?? 0, error: r.error || null }])),
      }).eq("id", runId);
    }

    return Response.json({
      status: failed.length === 0 ? "ok" : "partial",
      run_id: runId,
      domains_synced: succeeded.length,
      domains_failed: failed.length,
      total_tables: totalRecords,
      total_skipped: results.reduce((s, r) => s + (r.skipped ?? 0), 0),
      results: Object.fromEntries(results.map((r) => [r.domain, { count: r.count, skipped: r.skipped ?? 0, error: r.error || null }])),
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[val-sync-tables] Fatal:", message);
    return Response.json({ status: "error", message }, { status: 500, headers: corsHeaders });
  }
});
