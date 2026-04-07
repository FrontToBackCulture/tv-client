// Supabase Edge Function: Register a shared mailbox
// Exchanges an OAuth authorization code for tokens and stores credentials.
//
// POST /shared-inbox-register
// Body: { code, label, email_address, tenant_id, client_id, client_secret, redirect_uri }
//
// Called by the admin after completing the Microsoft OAuth flow.
// Stores the refresh token in shared_mailbox_credentials (service-role only).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RegisterBody {
  code: string;
  label: string;
  email_address: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RegisterBody = await req.json();
    const { code, label, email_address, tenant_id, client_id, client_secret, redirect_uri } = body;

    if (!code || !label || !email_address || !tenant_id || !client_id || !client_secret || !redirect_uri) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    // Exchange auth code for tokens
    const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id,
        client_secret,
        grant_type: "authorization_code",
        code,
        redirect_uri,
        scope: "offline_access Mail.Read",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[shared-inbox-register] token exchange failed:", err);
      return jsonResponse({ error: "Token exchange failed", detail: err }, 502);
    }

    const tokens = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokens;

    if (!refresh_token) {
      return jsonResponse(
        { error: "No refresh_token returned. Ensure offline_access scope is granted." },
        502,
      );
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Upsert mailbox row
    const { data: mailbox, error: mbErr } = await supabase
      .from("shared_mailboxes")
      .upsert(
        { label, email_address, active: true, last_sync_error: null },
        { onConflict: "email_address" },
      )
      .select("id")
      .single();

    if (mbErr) {
      console.error("[shared-inbox-register] mailbox upsert error:", mbErr);
      return jsonResponse({ error: "Failed to create mailbox", detail: mbErr.message }, 500);
    }

    // Store credentials (service-role only table)
    const { error: credErr } = await supabase
      .from("shared_mailbox_credentials")
      .upsert({
        mailbox_id: mailbox.id,
        refresh_token,
        access_token,
        access_token_expires_at: expiresAt,
        tenant_id,
        client_id,
        client_secret,
        updated_at: new Date().toISOString(),
      });

    if (credErr) {
      console.error("[shared-inbox-register] credentials upsert error:", credErr);
      return jsonResponse({ error: "Failed to store credentials", detail: credErr.message }, 500);
    }

    return jsonResponse({
      status: "ok",
      mailbox_id: mailbox.id,
      email_address,
      label,
    });
  } catch (err) {
    console.error("[shared-inbox-register] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
