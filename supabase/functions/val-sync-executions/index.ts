// Supabase Edge Function: Sync VAL workflow executions and notifications
// Designed to run on a schedule (every 30 min or hourly).
//
// POST /val-sync-executions
// Body: { domain?: string, hours?: number }
//   - domain: sync one domain, or all production if omitted
//   - hours: lookback window (default 24)
//
// For each production domain:
//   1. Authenticate via val_domain_credentials
//   2. Fetch workflow executions → upsert into val_workflow_executions
//   3. Fetch notification stream → upsert into val_notifications
//   4. Log the run in val_sync_runs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── VAL Auth (shared with val-sync-workflows) ─

interface DomainCreds {
  domain: string;
  api_domain: string | null;
  email: string;
  encrypted_password: string;
  token_cache: string | null;
  token_expires_at: string | null;
}

function getBaseUrl(creds: DomainCreds): string {
  const apiDomain = creds.api_domain || creds.domain;
  return `https://${apiDomain}.thinkval.io`;
}

async function loginToVal(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
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
  const token = data.user || data.data?.user;
  if (!token) throw new Error("No token in VAL login response");

  return token;
}

async function ensureToken(creds: DomainCreds): Promise<string> {
  if (creds.token_cache && creds.token_expires_at) {
    const expiresAt = new Date(creds.token_expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return creds.token_cache;
    }
  }

  const token = await loginToVal(getBaseUrl(creds), creds.email, creds.encrypted_password);
  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

  supabase
    .from("val_domain_credentials")
    .update({ token_cache: token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("domain", creds.domain)
    .then(() => {});

  return token;
}

// ─── Fetch Workflow Executions ────────────────

interface ValExecution {
  id: string;
  job_id: number;
  status: string;
  error: string | null;
  result: unknown;
  user_id: number | null;
  started_at: string;
  completed_at: string | null;
}

async function fetchExecutions(
  baseUrl: string,
  token: string,
  from: string,
  to: string,
): Promise<ValExecution[]> {
  const all: ValExecution[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const url = `${baseUrl}/api/v1/workflow/executions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&page=${page}&limit=${limit}&uuid=1&token=${token}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fetch executions failed (${res.status}): ${text}`);
    }

    const body = await res.json();
    const items: ValExecution[] = body.data || body;
    if (!Array.isArray(items) || items.length === 0) break;

    all.push(...items);
    if (items.length < limit) break;
    page++;
    if (page > 20) break; // Safety cap
  }

  return all;
}

// ─── Fetch Notifications ──────────────────────

interface ValNotification {
  uuid: string;
  message: string;
  created: string;
  updated: number | string;
  user: string | number;
  userName?: string;
  status?: string;
  action?: string;
  table?: string;
  tableName?: string;
  origin?: string;
  identifier?: string;
  progress?: number;
  topic?: string;
  fail?: boolean;
  errorMessage?: string;
}

async function fetchNotifications(
  baseUrl: string,
  apiDomain: string,
  token: string,
  max: number,
): Promise<ValNotification[]> {
  const url = `${baseUrl}/api/v1/workspace/notifications/notifications?max=${max}&uuid=1&token=${token}`;
  const res = await fetch(url, {
    headers: { sub_domain: apiDomain },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch notifications failed (${res.status}): ${text}`);
  }

  const body = await res.json();
  const items = body.data || body;
  return Array.isArray(items) ? items : [];
}

// ─── Sync Logic ───────────────────────────────

interface DomainResult {
  domain: string;
  executions: number;
  notifications: number;
  error?: string;
}

async function syncDomain(
  creds: DomainCreds,
  from: string,
  to: string,
): Promise<DomainResult> {
  const domain = creds.domain;
  let executionCount = 0;
  let notificationCount = 0;

  try {
    const token = await ensureToken(creds);
    const baseUrl = getBaseUrl(creds);
    const apiDomain = creds.api_domain || creds.domain;

    // 1. Sync executions
    try {
      const executions = await fetchExecutions(baseUrl, token, from, to);
      if (executions.length > 0) {
        const rows = executions.map((e) => ({
          execution_id: e.id,
          domain,
          job_id: e.job_id,
          status: e.status,
          error: e.error,
          result: e.result,
          user_id: e.user_id,
          started_at: e.started_at,
          completed_at: e.completed_at,
          synced_at: new Date().toISOString(),
        }));

        // Batch upsert
        const BATCH = 200;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const { error } = await supabase
            .from("val_workflow_executions")
            .upsert(batch, { onConflict: "domain,execution_id" });
          if (error) console.error(`[val-sync-executions] ${domain} exec upsert:`, error.message);
        }
        executionCount = rows.length;
      }
    } catch (err) {
      console.error(`[val-sync-executions] ${domain} executions:`, err instanceof Error ? err.message : err);
    }

    // 2. Sync notifications
    try {
      const notifications = await fetchNotifications(baseUrl, apiDomain, token, 2000);
      if (notifications.length > 0) {
        const rows = notifications.map((n) => ({
          uuid: n.uuid,
          domain,
          message: n.message || null,
          created: n.created || null,
          updated: typeof n.updated === "number" ? new Date(n.updated).toISOString() : n.updated || null,
          user_ref: String(n.user || ""),
          user_name: n.userName || null,
          status: n.status || null,
          action: n.action || null,
          table: n.table || null,
          table_name: n.tableName || null,
          origin: n.origin || null,
          identifier: n.identifier || null,
          progress: n.progress ?? null,
          topic: n.topic || null,
          fail: n.fail ?? false,
          error_message: n.errorMessage || null,
          synced_at: new Date().toISOString(),
        }));

        const BATCH = 200;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const { error } = await supabase
            .from("val_notifications")
            .upsert(batch, { onConflict: "domain,uuid" });
          if (error) console.error(`[val-sync-executions] ${domain} notif upsert:`, error.message);
        }
        notificationCount = rows.length;
      }
    } catch (err) {
      console.error(`[val-sync-executions] ${domain} notifications:`, err instanceof Error ? err.message : err);
    }

    return { domain, executions: executionCount, notifications: notificationCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[val-sync-executions] ${domain}:`, message);
    return { domain, executions: 0, notifications: 0, error: message };
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
    const hours: number = body.hours || 24;

    // Time window
    const to = new Date().toISOString();
    const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Create sync run
    const { data: run } = await supabase
      .from("val_sync_runs")
      .insert({ sync_type: "executions", status: "running" })
      .select("id")
      .single();
    const runId = run?.id;

    // Get credentials
    let query = supabase
      .from("val_domain_credentials")
      .select("domain, api_domain, email, encrypted_password, token_cache, token_expires_at");

    if (targetDomain) {
      query = query.eq("domain", targetDomain);
    } else {
      const { data: prodDomains } = await supabase
        .from("domain_metadata")
        .select("domain")
        .eq("domain_type", "production");
      if (!prodDomains || prodDomains.length === 0) {
        return Response.json({ status: "ok", message: "No production domains" });
      }
      query = query.in("domain", prodDomains.map((d) => d.domain));
    }

    const { data: credsList, error: credsErr } = await query;
    if (credsErr) throw credsErr;
    if (!credsList || credsList.length === 0) {
      return Response.json({ status: "error", message: "No credentials found" }, { status: 400 });
    }

    // Sync domains (5 concurrent)
    const CONCURRENCY = 5;
    const results: DomainResult[] = [];

    for (let i = 0; i < credsList.length; i += CONCURRENCY) {
      const batch = credsList.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((c) => syncDomain(c as DomainCreds, from, to)),
      );
      results.push(...batchResults);
    }

    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    const totalExec = results.reduce((s, r) => s + r.executions, 0);
    const totalNotif = results.reduce((s, r) => s + r.notifications, 0);

    // Update sync run
    if (runId) {
      await supabase
        .from("val_sync_runs")
        .update({
          completed_at: new Date().toISOString(),
          domains_attempted: results.length,
          domains_succeeded: succeeded.length,
          domains_failed: failed.length,
          total_records: totalExec + totalNotif,
          status: failed.length === 0 ? "completed" : "completed",
          error: failed.length > 0 ? failed.map((f) => `${f.domain}: ${f.error}`).join("; ") : null,
          details: Object.fromEntries(
            results.map((r) => [r.domain, { executions: r.executions, notifications: r.notifications, error: r.error || null }]),
          ),
        })
        .eq("id", runId);
    }

    return Response.json({
      status: failed.length === 0 ? "ok" : "partial",
      window: { from, to, hours },
      domains_synced: succeeded.length,
      domains_failed: failed.length,
      total_executions: totalExec,
      total_notifications: totalNotif,
      results: Object.fromEntries(
        results.map((r) => [r.domain, { executions: r.executions, notifications: r.notifications, error: r.error || null }]),
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[val-sync-executions] Fatal:", message);
    return Response.json({ status: "error", message }, { status: 500 });
  }
});
