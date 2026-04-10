// Supabase Edge Function: Trigger domain sync from lab via val-services
//
// POST /sync-domain
// Body: { source, target, resource_type, resource_ids, system_id?, system_type?, instance_id?, override_creator? }
//
// Flow:
//   1. Authenticate caller via Supabase JWT
//   2. Read lab credentials from val_domain_credentials
//   3. Ensure valid VAL token (cached or fresh login)
//   4. Create sync job record in solution_sync_jobs
//   5. Call val-services POST /api/v1/sync
//   6. Update job with sync UUID

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── VAL Auth (same pattern as val-sync-workflows) ───

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
  const token = data.user || data.data?.user;
  if (!token) {
    throw new Error(`No token in VAL login response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  return { token, expiresAt };
}

async function ensureToken(creds: DomainCreds): Promise<string> {
  if (creds.token_cache && creds.token_expires_at) {
    const expiresAt = new Date(creds.token_expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return creds.token_cache;
    }
  }

  const baseUrl = getBaseUrl(creds);
  const { token, expiresAt } = await loginToVal(baseUrl, creds.email, creds.encrypted_password);

  // Cache token (fire-and-forget)
  supabase
    .from("val_domain_credentials")
    .update({ token_cache: token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("domain", creds.domain)
    .then(() => {});

  return token;
}

// ─── Sync Request ───

interface SyncRequest {
  source: string;
  target: string;
  instance_id?: string;
  system_id?: string;
  system_type?: string;
  resource_type: "tables" | "workflows" | "dashboards";
  resource_ids: string[];
  space_ids?: number[];
  zone_ids?: number[];
  override_creator?: number;
  include_queries?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate caller — extract user from JWT if available
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const userToken = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(userToken);
      userId = user?.id || null;
    }

    // 2. Parse request
    const body: SyncRequest = await req.json();
    const { source, target, instance_id, system_id, system_type, resource_type, resource_ids, space_ids, zone_ids, override_creator, include_queries } = body;

    if (!source || !target || !resource_type || !resource_ids?.length) {
      return Response.json(
        { error: "source, target, resource_type, and resource_ids are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[sync-domain] ${source} → ${target} | ${resource_type} | ${resource_ids.length} resources | system: ${system_id || "base"} | user: ${userId || "anonymous"}`);

    // 3. Get source domain credentials and ensure valid token
    const { data: creds, error: credsError } = await supabase
      .from("val_domain_credentials")
      .select("*")
      .eq("domain", source)
      .single();

    if (credsError || !creds) {
      return Response.json(
        { error: `No credentials found for source domain "${source}". Add them to val_domain_credentials.` },
        { status: 400, headers: corsHeaders }
      );
    }

    const valToken = await ensureToken(creds as DomainCreds);
    const baseUrl = getBaseUrl(creds as DomainCreds);

    // 4. Create sync job record
    const { data: job, error: jobError } = await supabase
      .from("solution_sync_jobs")
      .insert({
        created_by: userId,
        instance_id: instance_id || null,
        domain: target,
        source_domain: source,
        system_id: system_id || null,
        system_type: system_type || null,
        resource_type,
        resource_ids,
        status: "queued",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      console.error("[sync-domain] Failed to create job:", jobError);
      return Response.json(
        { error: `Failed to create sync job: ${jobError.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    // 5. Build val-services SyncOpts payload
    const syncOpts: Record<string, unknown> = {
      source,
      target,
    };

    if (resource_type === "tables") {
      const creator = override_creator || 1;
      // Sync only the spaces and zones that contain these tables
      if (space_ids?.length) {
        syncOpts.spaces = { overrideCreator: creator, resources: space_ids.map(String) };
      }
      if (zone_ids?.length) {
        syncOpts.zones = { overrideCreator: creator, resources: zone_ids.map(String) };
      }
      syncOpts.tables = {
        overrideCreator: creator,
        resources: resource_ids,
        integrationRetain: "none",
        fieldsRetain: { values: false },
      };
      syncOpts.columns = { overrideCreator: creator, resources: resource_ids };
      syncOpts.linkages = { overrideCreator: creator, resources: resource_ids };
      syncOpts.tableforms = { overrideCreator: creator, resources: resource_ids };
      syncOpts.fieldcats = { overrideCreator: creator };
    } else if (resource_type === "workflows") {
      syncOpts.workflows = {
        overrideCreator: override_creator || 1,
        resources: resource_ids,
        config: { retainName: false, retainSchedule: false },
      };
    } else if (resource_type === "dashboards") {
      const creator = override_creator || 1;
      syncOpts.dashboards = {
        overrideCreator: creator,
        resources: resource_ids,
        config: {
          retainName: false,
          retainPermission: false,
          ...(include_queries ? { updateAllQueries: true } : {}),
        },
      };
      if (include_queries) {
        syncOpts.queries = {
          overrideCreator: creator,
          resources: [],
          config: { retainName: false, retainPermission: false, retainFilters: true },
        };
      }
    }

    // 6. Call val-services sync API
    const syncUrl = `${baseUrl}/api/v1/sync?token=${valToken}`;
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        sub_domain: source,
      },
      body: JSON.stringify(syncOpts),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[sync-domain] val-services error (${res.status}):`, errText);

      await supabase
        .from("solution_sync_jobs")
        .update({ status: "error", error: `val-services: ${errText}`, completed_at: new Date().toISOString() })
        .eq("id", job.id);

      return Response.json(
        { error: `val-services sync failed: ${errText}`, job_id: job.id },
        { status: 502, headers: corsHeaders }
      );
    }

    const syncResult = await res.json();
    const syncUuid = syncResult.id;
    console.log(`[sync-domain] Sync queued: ${syncUuid}`);

    // 7. Update job — mark as done (val-services accepted and queued the sync)
    await supabase
      .from("solution_sync_jobs")
      .update({ sync_uuid: syncUuid, status: "done", completed_at: new Date().toISOString() })
      .eq("id", job.id);

    return Response.json(
      { job_id: job.id, sync_uuid: syncUuid, status: "done" },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[sync-domain] error:", err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
});
