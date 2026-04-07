// Supabase Edge Function: Sync GA4 analytics data server-side
// Replaces local Tauri background sync.
//
// POST /ga4-sync
// Body: { config_name?: string }
//   - config_name: which ga4_sync_config to use (default: "default")
//
// Flow:
//   1. Load OAuth credentials from ga4_sync_config
//   2. Refresh access token if expired
//   3. Fetch platform analytics (with dimension fallbacks)
//   4. Fetch website analytics
//   5. Deduplicate + upsert to analytics_page_views
//   6. Log run to val_sync_runs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GA4_API = "https://analyticsdata.googleapis.com/v1beta/properties";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BATCH_SIZE = 500;

// ─── Types ───────────────────────────────────

interface Ga4Config {
  id: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token: string | null;
  token_expires_at: string | null;
  platform_property_id: string | null;
  website_property_id: string | null;
}

interface PageView {
  source: string;
  domain: string | null;
  page_path: string;
  user_id: string;
  view_date: string;
  views: number;
  is_internal: boolean;
}

// ─── OAuth Token Refresh ─────────────────────

async function ensureAccessToken(config: Ga4Config): Promise<string> {
  // Check if current token is still valid (5 min buffer)
  if (config.access_token && config.token_expires_at) {
    const expiresAt = new Date(config.token_expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return config.access_token;
    }
  }

  console.log("[ga4-sync] Refreshing access token...");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      grant_type: "refresh_token",
      refresh_token: config.refresh_token,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const accessToken = data.access_token;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Cache the new token
  await supabase
    .from("ga4_sync_config")
    .update({
      access_token: accessToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", config.id);

  return accessToken;
}

// ─── GA4 API Queries ─────────────────────────

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateYYYYMMDD(s: string): string {
  // "20260405" → "2026-04-05"
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function runReport(
  token: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<{ rows: unknown[]; dimensionHeaders: string[] }> {
  const url = `${GA4_API}/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const dimensionHeaders = (data.dimensionHeaders || []).map(
    (h: { name: string }) => h.name,
  );
  return { rows: data.rows || [], dimensionHeaders };
}

async function fetchPlatformViews(
  token: string,
  propertyId: string,
): Promise<PageView[]> {
  const startDate = dateStr(new Date(Date.now() - 90 * 24 * 3600 * 1000));
  const endDate = dateStr(new Date());
  const dateRange = { startDate, endDate };
  const filter = {
    filter: {
      fieldName: "pagePath",
      stringFilter: { matchType: "BEGINS_WITH", value: "/dashboard/" },
    },
  };

  // Strategy 1: Full (domain + userId)
  const queries = [
    {
      label: "full",
      dimensions: [
        { name: "pagePath" },
        { name: "date" },
        { name: "customEvent:ua_dimension_1" },
        { name: "customEvent:ua_dimension_2" },
      ],
      metrics: [{ name: "screenPageViews" }],
    },
    {
      label: "no-domain",
      dimensions: [
        { name: "pagePath" },
        { name: "date" },
        { name: "customEvent:ua_dimension_2" },
      ],
      metrics: [{ name: "screenPageViews" }],
    },
    {
      label: "basic",
      dimensions: [{ name: "pagePath" }, { name: "date" }],
      metrics: [{ name: "screenPageViews" }],
    },
  ];

  for (const q of queries) {
    try {
      const { rows, dimensionHeaders } = await runReport(token, propertyId, {
        dateRanges: [dateRange],
        dimensions: q.dimensions,
        metrics: q.metrics,
        dimensionFilter: filter,
        limit: "10000",
      });

      console.log(
        `[ga4-sync] Platform query '${q.label}': ${rows.length} rows`,
      );
      return parseRows(rows, dimensionHeaders, "ga4");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not a valid dimension")) {
        console.log(
          `[ga4-sync] Platform '${q.label}' failed (invalid dimension), trying fallback...`,
        );
        continue;
      }
      throw err;
    }
  }

  return [];
}

async function fetchWebsiteViews(
  token: string,
  propertyId: string,
): Promise<PageView[]> {
  const startDate = dateStr(new Date(Date.now() - 90 * 24 * 3600 * 1000));
  const endDate = dateStr(new Date());

  const { rows, dimensionHeaders } = await runReport(token, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }, { name: "date" }],
    metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
    limit: "10000",
  });

  console.log(`[ga4-sync] Website: ${rows.length} rows`);
  return parseRows(rows, dimensionHeaders, "ga4-website");
}

function parseRows(
  rows: unknown[],
  dimensionHeaders: string[],
  source: string,
): PageView[] {
  const results: PageView[] = [];

  for (const row of rows as Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>) {
    const dims = row.dimensionValues || [];
    const metrics = row.metricValues || [];

    const pagePath = dims[0]?.value || "";
    const dateRaw = dims[1]?.value || "";
    const views = parseInt(metrics[0]?.value || "0", 10);

    if (!pagePath || !dateRaw || views === 0) continue;

    let domain: string | null = null;
    let userId = "";

    // Map dimensions based on headers
    for (let i = 2; i < dimensionHeaders.length; i++) {
      const val = dims[i]?.value || "";
      if (val === "(not set)" || val === "") continue;

      if (dimensionHeaders[i] === "customEvent:ua_dimension_1") {
        domain = val;
      } else if (dimensionHeaders[i] === "customEvent:ua_dimension_2") {
        userId = val;
      }
    }

    const isInternal = userId.toLowerCase().includes("@thinkval.com");

    results.push({
      source,
      domain,
      page_path: pagePath,
      user_id: userId,
      view_date: parseDateYYYYMMDD(dateRaw),
      views,
      is_internal: isInternal,
    });
  }

  return results;
}

// ─── Deduplication ───────────────────────────

function deduplicateRows(rows: PageView[]): PageView[] {
  const map = new Map<string, PageView>();

  for (const row of rows) {
    const key = `${row.source}|${row.page_path}|${row.user_id}|${row.view_date}`;
    const existing = map.get(key);

    if (existing) {
      existing.views += row.views;
      if (!existing.domain && row.domain) existing.domain = row.domain;
      if (row.is_internal) existing.is_internal = true;
    } else {
      map.set(key, { ...row });
    }
  }

  return Array.from(map.values());
}

// ─── Upsert to Supabase ─────────────────────

async function upsertPageViews(rows: PageView[]): Promise<number> {
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    source: r.source,
    domain: r.domain,
    page_path: r.page_path,
    user_id: r.user_id || "",
    view_date: r.view_date,
    views: r.views,
    is_internal: r.is_internal,
    created_at: now,
  }));

  let upserted = 0;
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("analytics_page_views")
      .upsert(batch, { onConflict: "source,page_path,user_id,view_date" });

    if (error) {
      console.error(`[ga4-sync] Upsert batch error:`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  return upserted;
}

// ─── Handler ─────────────────────────────────

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
    const configName: string = body.config_name || "default";

    // Load config
    const { data: config, error: configErr } = await supabase
      .from("ga4_sync_config")
      .select("*")
      .eq("name", configName)
      .eq("enabled", true)
      .single();

    if (configErr || !config) {
      return Response.json(
        { status: "error", message: `No enabled config '${configName}' found` },
        { status: 400 },
      );
    }

    // Create sync run
    const { data: run } = await supabase
      .from("val_sync_runs")
      .insert({ sync_type: "ga4", status: "running" })
      .select("id")
      .single();
    const runId = run?.id;

    // Get valid access token
    const accessToken = await ensureAccessToken(config as Ga4Config);

    let platformRows = 0;
    let websiteRows = 0;
    const errors: string[] = [];

    // Sync platform
    if (config.platform_property_id) {
      try {
        const views = await fetchPlatformViews(
          accessToken,
          config.platform_property_id,
        );
        const deduped = deduplicateRows(views);
        platformRows = await upsertPageViews(deduped);
        console.log(`[ga4-sync] Platform: ${platformRows} rows upserted`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ga4-sync] Platform error:`, msg);
        errors.push(`platform: ${msg}`);
      }
    }

    // Sync website
    if (config.website_property_id) {
      try {
        const views = await fetchWebsiteViews(
          accessToken,
          config.website_property_id,
        );
        const deduped = deduplicateRows(views);
        websiteRows = await upsertPageViews(deduped);
        console.log(`[ga4-sync] Website: ${websiteRows} rows upserted`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ga4-sync] Website error:`, msg);
        errors.push(`website: ${msg}`);
      }
    }

    const totalRows = platformRows + websiteRows;
    const status =
      errors.length === 0
        ? "completed"
        : totalRows > 0
          ? "completed"
          : "failed";

    // Update config last_synced_at
    await supabase
      .from("ga4_sync_config")
      .update({
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);

    // Update sync run
    if (runId) {
      await supabase
        .from("val_sync_runs")
        .update({
          completed_at: new Date().toISOString(),
          status,
          total_records: totalRows,
          error: errors.length > 0 ? errors.join("; ") : null,
          details: {
            platform_rows: platformRows,
            website_rows: websiteRows,
            config_name: configName,
          },
        })
        .eq("id", runId);
    }

    return Response.json({
      status: errors.length === 0 ? "ok" : "partial",
      platform_rows: platformRows,
      website_rows: websiteRows,
      total_rows: totalRows,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ga4-sync] Fatal:", message);
    return Response.json({ status: "error", message }, { status: 500 });
  }
});
