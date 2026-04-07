// Supabase Edge Function: Sync VAL workflow definitions from all production domains
// Designed to run on a daily cron schedule.
//
// POST /val-sync-workflows
// Body: { domain?: string }  — sync one domain, or all production domains if omitted
//
// For each production domain:
//   1. Read credentials from val_domain_credentials
//   2. Authenticate (or use cached token) against VAL API
//   3. Fetch all workflow definitions via /api/v1/workflow/
//   4. Upsert into val_workflow_definitions
//   5. Log the run in val_sync_runs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── VAL Auth ─────────────────────────────────

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

async function loginToVal(
  baseUrl: string,
  email: string,
  password: string,
): Promise<{ token: string; expiresAt: string }> {
  const res = await fetch(`${baseUrl}/api/v1/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, rememberMe: false, loginID: email }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VAL login failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  // Token is at response.user or response.data.user (JWT string)
  const token = data.user || data.data?.user;
  if (!token) {
    throw new Error(`No token in VAL login response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  // VAL tokens typically expire in 24h — cache for 23h to be safe
  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

  return { token, expiresAt };
}

async function ensureToken(creds: DomainCreds): Promise<string> {
  // Check cached token (with 5 min buffer)
  if (creds.token_cache && creds.token_expires_at) {
    const expiresAt = new Date(creds.token_expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return creds.token_cache;
    }
  }

  // Login fresh
  const baseUrl = getBaseUrl(creds);
  const { token, expiresAt } = await loginToVal(
    baseUrl,
    creds.email,
    creds.encrypted_password,
  );

  // Cache the token (fire-and-forget)
  supabase
    .from("val_domain_credentials")
    .update({
      token_cache: token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("domain", creds.domain)
    .then(() => {});

  return token;
}

// ─── VAL API Fetch ────────────────────────────

interface ValWorkflow {
  id: number;
  name: string;
  data?: {
    description?: string;
    workflow?: { plugins?: unknown[] };
    tags?: string[];
  };
  cron_expression: string | null;
  priority: number | null;
  status: string | null;
  deleted: boolean;
  tags: string[] | null;
  latest_run_status: string | null;
  run_started_at: string | null;
  run_completed_at: string | null;
  last_five_executions: unknown[] | null;
  created_by: number | null;
  created_date: string | null;
  updated_date: string | null;
  updated_by: number | null;
}

async function fetchWorkflows(
  baseUrl: string,
  token: string,
): Promise<ValWorkflow[]> {
  const url = `${baseUrl}/api/v1/workflow/?uuid=1&token=${token}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch workflows failed (${res.status}): ${text}`);
  }

  const body = await res.json();

  // Response shape: { data: [...], pagination: {...} }
  const workflows = body.data || body;
  if (!Array.isArray(workflows)) {
    throw new Error(`Unexpected response shape: ${JSON.stringify(body).slice(0, 200)}`);
  }

  return workflows;
}

// ─── Sync Logic ───────────────────────────────

async function syncDomain(
  creds: DomainCreds,
): Promise<{ domain: string; count: number; error?: string }> {
  const domain = creds.domain;

  try {
    const token = await ensureToken(creds);
    const baseUrl = getBaseUrl(creds);
    const workflows = await fetchWorkflows(baseUrl, token);

    // Map to DB rows
    const rows = workflows.map((wf) => ({
      id: wf.id,
      domain,
      name: wf.name,
      description: wf.data?.description || null,
      cron_expression: wf.cron_expression || null,
      priority: wf.priority,
      status: wf.status,
      deleted: wf.deleted ?? false,
      tags: wf.tags || wf.data?.tags || null,
      plugins: wf.data?.workflow?.plugins || null,
      latest_run_status: wf.latest_run_status,
      run_started_at: wf.run_started_at,
      run_completed_at: wf.run_completed_at,
      last_five_executions: wf.last_five_executions,
      created_by: wf.created_by,
      created_date: wf.created_date,
      updated_date: wf.updated_date,
      updated_by: wf.updated_by,
      synced_at: new Date().toISOString(),
    }));

    // Upsert in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("val_workflow_definitions")
        .upsert(batch, { onConflict: "domain,id" });

      if (error) {
        throw new Error(`Upsert failed: ${error.message}`);
      }
    }

    // Clean up deleted workflows not in current response
    const currentIds = workflows.map((wf) => wf.id);
    if (currentIds.length > 0) {
      await supabase
        .from("val_workflow_definitions")
        .update({ deleted: true, synced_at: new Date().toISOString() })
        .eq("domain", domain)
        .not("id", "in", `(${currentIds.join(",")})`);
    }

    return { domain, count: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[val-sync-workflows] ${domain}: ${message}`);
    return { domain, count: 0, error: message };
  }
}

// ─── Handler ──────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetDomain: string | null = body.domain || null;

    // Create sync run record
    const { data: run, error: runErr } = await supabase
      .from("val_sync_runs")
      .insert({
        sync_type: "workflows",
        status: "running",
      })
      .select("id")
      .single();

    if (runErr) {
      console.error("[val-sync-workflows] Failed to create sync run:", runErr);
    }
    const runId = run?.id;

    // Get credentials for target domains
    let query = supabase
      .from("val_domain_credentials")
      .select("domain, api_domain, email, encrypted_password, token_cache, token_expires_at");

    if (targetDomain) {
      query = query.eq("domain", targetDomain);
    } else {
      // Only production domains
      const { data: prodDomains } = await supabase
        .from("domain_metadata")
        .select("domain")
        .eq("domain_type", "production");

      if (!prodDomains || prodDomains.length === 0) {
        return Response.json({ status: "ok", message: "No production domains found" });
      }

      const domainNames = prodDomains.map((d) => d.domain);
      query = query.in("domain", domainNames);
    }

    const { data: credsList, error: credsErr } = await query;
    if (credsErr) throw credsErr;
    if (!credsList || credsList.length === 0) {
      const msg = targetDomain
        ? `No credentials found for domain: ${targetDomain}`
        : "No credentials configured in val_domain_credentials";
      return Response.json({ status: "error", message: msg }, { status: 400 });
    }

    // Sync all domains concurrently (max 5 at a time)
    const CONCURRENCY = 5;
    const results: Array<{ domain: string; count: number; error?: string }> = [];

    for (let i = 0; i < credsList.length; i += CONCURRENCY) {
      const batch = credsList.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((creds) => syncDomain(creds as DomainCreds)),
      );
      results.push(...batchResults);
    }

    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    const totalRecords = results.reduce((sum, r) => sum + r.count, 0);

    // Update sync run record
    if (runId) {
      await supabase
        .from("val_sync_runs")
        .update({
          completed_at: new Date().toISOString(),
          domains_attempted: results.length,
          domains_succeeded: succeeded.length,
          domains_failed: failed.length,
          total_records: totalRecords,
          status: failed.length === 0 ? "completed" : (succeeded.length === 0 ? "failed" : "completed"),
          error: failed.length > 0
            ? failed.map((f) => `${f.domain}: ${f.error}`).join("; ")
            : null,
          details: Object.fromEntries(
            results.map((r) => [r.domain, { count: r.count, error: r.error || null }]),
          ),
        })
        .eq("id", runId);
    }

    return Response.json({
      status: failed.length === 0 ? "ok" : "partial",
      domains_synced: succeeded.length,
      domains_failed: failed.length,
      total_workflows: totalRecords,
      results: Object.fromEntries(
        results.map((r) => [r.domain, { count: r.count, error: r.error || null }]),
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[val-sync-workflows] Fatal error:", message);
    return Response.json({ status: "error", message }, { status: 500 });
  }
});
