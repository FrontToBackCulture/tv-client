// Supabase Edge Function: Sync SOD table status + Drive files check
// Designed to run on a schedule (daily for SOD, every 30 min for Drive).
//
// POST /val-sync-sod-drive
// Body: { sync_type?: "sod" | "drive" | "all", domain?: string }
//
// SOD: Fetches /api/v1/sync/sod/tables/status/{date} for eligible domains
// Drive: Lists VAL Drive folders and flags unprocessed/stale files

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// SOD-eligible domains
const SOD_DOMAINS = ["dapaolo", "saladstop", "spaespritgroup", "grain"];

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

async function loginToVal(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, rememberMe: false, loginID: email }),
  });
  if (!res.ok) throw new Error(`VAL login failed (${res.status})`);
  const data = await res.json();
  const token = data.user || data.data?.user;
  if (!token) throw new Error("No token in login response");
  return token;
}

async function ensureToken(creds: DomainCreds): Promise<string> {
  if (creds.token_cache && creds.token_expires_at) {
    if (Date.now() < new Date(creds.token_expires_at).getTime() - 5 * 60 * 1000) {
      return creds.token_cache;
    }
  }
  const token = await loginToVal(getBaseUrl(creds), creds.email, creds.encrypted_password);
  supabase.from("val_domain_credentials")
    .update({ token_cache: token, token_expires_at: new Date(Date.now() + 23 * 3600000).toISOString(), updated_at: new Date().toISOString() })
    .eq("domain", creds.domain).then(() => {});
  return token;
}

// ─── SOD Tables ───────────────────────────────

interface SodTableEntry {
  table_name: string;
  table_id: string;
  status: string;
  queued: string | null;
  started: string | null;
  completed: string | null;
  errored: string | null;
  error_message: string | null;
}

async function syncSodDomain(creds: DomainCreds, date: string): Promise<{ domain: string; count: number; error?: string }> {
  const domain = creds.domain;
  try {
    const token = await ensureToken(creds);
    const baseUrl = getBaseUrl(creds);
    const apiDomain = getApiDomain(creds);

    const url = `${baseUrl}/api/v1/sync/sod/tables/status/${date}?token=${token}&regenerate=false`;
    const res = await fetch(url, { headers: { sub_domain: apiDomain } });
    if (!res.ok) throw new Error(`SOD fetch failed (${res.status})`);

    const body = await res.json();
    const entries: SodTableEntry[] = body.data || body;
    if (!Array.isArray(entries)) throw new Error("Unexpected SOD response shape");

    if (entries.length > 0) {
      // Delete old entries for this domain+date, then insert fresh
      await supabase.from("val_sod_status")
        .delete()
        .eq("domain", domain)
        .eq("check_date", date);

      const BATCH = 200;
      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH).map((e) => ({
          domain,
          table_id: e.table_id,
          table_name: e.table_name,
          status: e.status,
          queued: e.queued || null,
          started: e.started || null,
          completed: e.completed || null,
          errored: e.errored || null,
          error_message: e.error_message || null,
          check_date: date,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("val_sod_status").upsert(batch, { onConflict: "domain,table_id,check_date" });
        if (error) console.error(`[val-sync-sod] ${domain} upsert:`, error.message);
      }
    }

    return { domain, count: entries.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[val-sync-sod] ${domain}:`, msg);
    return { domain, count: 0, error: msg };
  }
}

// ─── Drive Files ──────────────────────────────

interface DriveEntry {
  id: string;
  name: string;
  size?: number;
  type?: string;
  last_modified?: string;
}

async function fetchDriveFolders(baseUrl: string, apiDomain: string, token: string, folderId: string): Promise<DriveEntry[]> {
  const url = `${baseUrl}/api/v1/val_drive/folders?folderId=${encodeURIComponent(folderId)}&token=${token}`;
  const res = await fetch(url, { headers: { sub_domain: apiDomain } });
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body) ? body : body.data || [];
}

async function fetchDriveFiles(baseUrl: string, apiDomain: string, token: string, folderId: string): Promise<DriveEntry[]> {
  const url = `${baseUrl}/api/v1/val_drive/folders/${encodeURIComponent(folderId)}/files?token=${token}&size=200`;
  const res = await fetch(url, { headers: { sub_domain: apiDomain } });
  if (!res.ok) return [];
  const body = await res.json();
  const result = body.files || body.data || body;
  return Array.isArray(result) ? result : [];
}

async function syncDriveDomain(creds: DomainCreds): Promise<{ domain: string; files: number; stale: number; error?: string }> {
  const domain = creds.domain;
  try {
    const token = await ensureToken(creds);
    const baseUrl = getBaseUrl(creds);
    const apiDomain = getApiDomain(creds);
    const now = Date.now();
    const STALE_MS = 24 * 60 * 60 * 1000;

    // List top-level folders
    const topFolders = await fetchDriveFolders(baseUrl, apiDomain, token, "val_drive");
    const allFiles: Array<{
      domain: string; folder_path: string; file_name: string;
      file_size: number | null; last_modified: string | null; is_stale: boolean;
    }> = [];

    for (const folder of topFolders) {
      // Skip entries without a name, hidden folders, test folders
      if (!folder.name || folder.name.startsWith(".") || folder.name === "Test" || folder.name === "processed") continue;

      // List sub-folders
      const subFolders = await fetchDriveFolders(baseUrl, apiDomain, token, folder.id);

      for (const sub of subFolders) {
        if (!sub.name) continue;
        const subLower = sub.name.toLowerCase();
        if (subLower === "processed" || subLower.includes("output")) continue;

        // List files in sub-folder
        const files = await fetchDriveFiles(baseUrl, apiDomain, token, sub.id);
        for (const f of files) {
          if (!f.name || f.name.endsWith("/") || !f.name.includes(".")) continue;
          const lastMod = f.last_modified ? new Date(f.last_modified).toISOString() : null;
          const isStale = f.last_modified ? (now - new Date(f.last_modified).getTime()) > STALE_MS : false;

          allFiles.push({
            domain,
            folder_path: `${folder.name}/${sub.name}`,
            file_name: f.name,
            file_size: f.size || null,
            last_modified: lastMod,
            is_stale: isStale,
          });
        }
      }
    }

    // Replace all entries for this domain (full refresh)
    await supabase.from("val_drive_files").delete().eq("domain", domain);

    if (allFiles.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < allFiles.length; i += BATCH) {
        const batch = allFiles.slice(i, i + BATCH).map((f) => ({
          ...f,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("val_drive_files")
          .upsert(batch, { onConflict: "domain,folder_path,file_name" });
        if (error) console.error(`[val-sync-drive] ${domain} upsert:`, error.message);
      }
    }

    const staleCount = allFiles.filter((f) => f.is_stale).length;
    return { domain, files: allFiles.length, stale: staleCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[val-sync-drive] ${domain}:`, msg);
    return { domain, files: 0, stale: 0, error: msg };
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
    const syncType: string = body.sync_type || "all";
    const targetDomain: string | null = body.domain || null;

    // Today's date in SGT for SOD
    const sgtDate = new Date(Date.now() + 8 * 3600000).toISOString().split("T")[0];

    // Create sync run
    const { data: run } = await supabase
      .from("val_sync_runs")
      .insert({ sync_type: `sod-drive:${syncType}`, status: "running" })
      .select("id").single();
    const runId = run?.id;

    // Load credentials
    const { data: allCreds } = await supabase
      .from("val_domain_credentials")
      .select("domain, api_domain, email, encrypted_password, token_cache, token_expires_at");

    const credsMap = new Map<string, DomainCreds>();
    for (const c of (allCreds || [])) {
      credsMap.set(c.domain, c as DomainCreds);
    }

    const results: Record<string, any> = {};

    // ─── SOD sync ─────────────────────
    if (syncType === "sod" || syncType === "all") {
      const sodDomains = targetDomain ? [targetDomain] : SOD_DOMAINS;
      for (const d of sodDomains) {
        const creds = credsMap.get(d);
        if (!creds) { results[`sod:${d}`] = { error: "no credentials" }; continue; }
        results[`sod:${d}`] = await syncSodDomain(creds, sgtDate);
      }
    }

    // ─── Drive sync ───────────────────
    if (syncType === "drive" || syncType === "all") {
      const { data: prodDomains } = await supabase
        .from("domain_metadata")
        .select("domain")
        .eq("domain_type", "production");

      const driveDomains = targetDomain
        ? [targetDomain]
        : (prodDomains || []).map((d) => d.domain);

      const CONCURRENCY = 3; // Drive is API-heavy, be conservative
      for (let i = 0; i < driveDomains.length; i += CONCURRENCY) {
        const batch = driveDomains.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map((d) => {
            const creds = credsMap.get(d);
            if (!creds) return Promise.resolve({ domain: d, files: 0, stale: 0, error: "no credentials" });
            return syncDriveDomain(creds);
          }),
        );
        for (const r of batchResults) {
          results[`drive:${r.domain}`] = r;
        }
      }
    }

    // Update sync run
    if (runId) {
      const failed = Object.values(results).filter((r: any) => r.error);
      await supabase.from("val_sync_runs").update({
        completed_at: new Date().toISOString(),
        domains_attempted: Object.keys(results).length,
        domains_succeeded: Object.keys(results).length - failed.length,
        domains_failed: failed.length,
        status: "completed",
        error: failed.length > 0 ? failed.map((f: any) => `${f.domain}: ${f.error}`).join("; ") : null,
        details: results,
      }).eq("id", runId);
    }

    return Response.json({ status: "ok", date: sgtDate, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[val-sync-sod-drive] Fatal:", message);
    return Response.json({ status: "error", message }, { status: 500 });
  }
});
