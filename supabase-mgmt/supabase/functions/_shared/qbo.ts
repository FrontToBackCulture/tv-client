// ---------------------------------------------------------------------------
// Shared QBO helpers — OAuth URLs, token refresh, authenticated API client.
// ---------------------------------------------------------------------------

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

export const QBO_CLIENT_ID = Deno.env.get("QBO_CLIENT_ID")!;
export const QBO_CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET")!;
export const QBO_REDIRECT_URI = Deno.env.get("QBO_REDIRECT_URI")!;
export const QBO_ENVIRONMENT = (Deno.env.get("QBO_ENVIRONMENT") ?? "sandbox") as
  | "sandbox"
  | "production";

export const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
export const QBO_API_BASE =
  QBO_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export interface QboConnection {
  id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  environment: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Token exchange + refresh
// ---------------------------------------------------------------------------

function basicAuthHeader(): string {
  return "Basic " + btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`);
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: QBO_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    throw new Error(`QBO token exchange failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;              // seconds
    x_refresh_token_expires_in: number;
    token_type: string;
  };
}

export async function refreshTokens(refreshToken: string) {
  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`QBO token refresh failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };
}

/**
 * Load the active connection, refreshing the access token if it's within
 * 5 minutes of expiry. Writes updated tokens back to `qbo_connections`.
 */
export async function getActiveConnection(
  supabase: SupabaseClient,
): Promise<QboConnection> {
  const { data, error } = await supabase
    .from("qbo_connections")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("No active QBO connection — run /qbo-connect first.");
  }

  const conn = data as QboConnection;
  const expiresAt = new Date(conn.expires_at).getTime();
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000;

  if (!needsRefresh) return conn;

  const fresh = await refreshTokens(conn.refresh_token);
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString();

  const { data: updated, error: updErr } = await supabase
    .from("qbo_connections")
    .update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq("id", conn.id)
    .select("*")
    .single();

  if (updErr || !updated) {
    throw new Error(`Failed to persist refreshed tokens: ${updErr?.message ?? "unknown"}`);
  }

  return updated as QboConnection;
}

// ---------------------------------------------------------------------------
// Authenticated QBO API calls
// ---------------------------------------------------------------------------

export interface QboApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string>;
}

export async function qboFetch(
  conn: QboConnection,
  path: string,                     // e.g. "query?query=select * from Invoice MAXRESULTS 100"
  options: QboApiOptions = {},
): Promise<any> {
  const url = new URL(`${QBO_API_BASE}/v3/company/${conn.realm_id}/${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      url.searchParams.set(k, v);
    }
  }
  // QBO requires `minorversion` for stable shape
  if (!url.searchParams.has("minorversion")) {
    url.searchParams.set("minorversion", "73");
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`QBO API ${res.status}: ${await res.text()}`);
  }

  return await res.json();
}

/**
 * Call QBO's Change Data Capture endpoint. Returns a map of entity-name →
 * array of rows. Deleted rows carry `status: "Deleted"` with only the `Id`
 * populated.
 *
 * Constraints (per QBO):
 *   - `changedSince` must be within the last 30 days
 *   - up to 10 entities per call
 */
export async function qboCdc(
  conn: QboConnection,
  entities: string[],
  changedSince: string,             // ISO8601
): Promise<Record<string, any[]>> {
  const res = await qboFetch(conn, "cdc", {
    query: { entities: entities.join(","), changedSince },
  });
  const out: Record<string, any[]> = {};
  const qrArr = res?.CDCResponse?.[0]?.QueryResponse ?? [];
  for (const qr of qrArr) {
    for (const k of Object.keys(qr)) {
      if (Array.isArray(qr[k])) out[k] = qr[k];
    }
  }
  return out;
}

/** Execute a QBO SQL-like query via the /query endpoint. Handles pagination. */
export async function qboQuery(
  conn: QboConnection,
  select: string,                   // e.g. "SELECT * FROM Invoice WHERE ..."
  pageSize = 200,
): Promise<any[]> {
  const results: any[] = [];
  let startPosition = 1;

  while (true) {
    const paged = `${select} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
    const data = await qboFetch(conn, "query", { query: { query: paged } });
    const entity = Object.keys(data.QueryResponse ?? {}).find((k) => Array.isArray(data.QueryResponse[k]));
    const batch = entity ? data.QueryResponse[entity] : [];
    results.push(...batch);
    if (batch.length < pageSize) break;
    startPosition += pageSize;
  }

  return results;
}
