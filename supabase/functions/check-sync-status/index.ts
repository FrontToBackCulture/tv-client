// Check sync status for active jobs and update them in Supabase.
// Called by the client on an interval for any jobs in "syncing" state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface DomainCreds {
  domain: string;
  api_domain: string | null;
  email: string;
  encrypted_password: string;
  token_cache: string | null;
  token_expires_at: string | null;
}

async function ensureToken(creds: DomainCreds): Promise<string> {
  if (creds.token_cache && creds.token_expires_at) {
    const expiresAt = new Date(creds.token_expires_at).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return creds.token_cache;
    }
  }

  const apiDomain = creds.api_domain || creds.domain;
  const res = await fetch(`https://${apiDomain}.thinkval.io/api/v1/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.encrypted_password, rememberMe: false, loginID: creds.email }),
  });

  if (!res.ok) throw new Error(`VAL login failed (${res.status})`);
  const data = await res.json();
  const token = data.user || data.data?.user;
  if (!token) throw new Error("No token in login response");

  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  supabase.from("val_domain_credentials").update({ token_cache: token, token_expires_at: expiresAt, updated_at: new Date().toISOString() }).eq("domain", creds.domain).then(() => {});

  return token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { domain } = await req.json();
    if (!domain) {
      return Response.json({ error: "domain is required" }, { status: 400, headers: corsHeaders });
    }

    // Get all active sync jobs for this domain
    const { data: jobs, error: jobsError } = await supabase
      .from("solution_sync_jobs")
      .select("*")
      .eq("domain", domain)
      .eq("status", "syncing")
      .not("sync_uuid", "is", null);

    if (jobsError || !jobs?.length) {
      return Response.json({ updated: 0 }, { headers: corsHeaders });
    }

    // Get source domain credentials (all jobs share same source)
    const sourceDomain = jobs[0].source_domain;
    const { data: creds } = await supabase
      .from("val_domain_credentials")
      .select("*")
      .eq("domain", sourceDomain)
      .single();

    if (!creds) {
      return Response.json({ error: `No credentials for ${sourceDomain}` }, { status: 400, headers: corsHeaders });
    }

    const token = await ensureToken(creds as DomainCreds);
    const apiDomain = creds.api_domain || creds.domain;
    const baseUrl = `https://${apiDomain}.thinkval.io`;

    let updated = 0;

    for (const job of jobs) {
      try {
        const statusRes = await fetch(
          `${baseUrl}/api/v1/status?id=${job.sync_uuid}&token=${token}`,
          { headers: { sub_domain: sourceDomain } }
        );

        if (!statusRes.ok) {
          console.error(`[check-sync-status] Status check failed for ${job.id}: ${statusRes.status}`);
          continue;
        }

        const statusData = await statusRes.json();
        const results = statusData.results || statusData || [];

        if (!Array.isArray(results) || results.length === 0) continue;

        const allDone = results.every((r: any) => r.status === "success" || r.status === "fail");
        if (!allDone) continue;

        const anyFail = results.some((r: any) => r.status === "fail");
        const finalStatus = anyFail ? "error" : "done";
        const errors = anyFail
          ? results.filter((r: any) => r.status === "fail").map((r: any) => `${r.resource}: ${r.error || "unknown"}`).join("; ")
          : null;

        await supabase
          .from("solution_sync_jobs")
          .update({ status: finalStatus, error: errors, completed_at: new Date().toISOString() })
          .eq("id", job.id);

        console.log(`[check-sync-status] Job ${job.id} (${job.system_id}): ${finalStatus}`);
        updated++;
      } catch (e) {
        console.error(`[check-sync-status] Error checking job ${job.id}:`, e);
      }
    }

    return Response.json({ updated, checked: jobs.length }, { headers: corsHeaders });
  } catch (err) {
    console.error("[check-sync-status] error:", err);
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});
