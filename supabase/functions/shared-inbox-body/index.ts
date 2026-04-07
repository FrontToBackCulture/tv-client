// Supabase Edge Function: Fetch full email body on demand
// Returns cached body_html if available, otherwise fetches from Graph and caches.
//
// POST /shared-inbox-body
// Body: { email_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email_id } = await req.json();
    if (!email_id) {
      return jsonResponse({ error: "email_id is required" }, 400);
    }

    // Get email + mailbox info
    const { data: email, error: emailErr } = await supabase
      .from("shared_emails")
      .select("id, mailbox_id, graph_message_id, body_html")
      .eq("id", email_id)
      .single();

    if (emailErr || !email) {
      return jsonResponse({ error: "Email not found" }, 404);
    }

    // Return cached body if available
    if (email.body_html) {
      return jsonResponse({ body_html: email.body_html });
    }

    // Load credentials for the mailbox
    const { data: creds, error: credErr } = await supabase
      .from("shared_mailbox_credentials")
      .select("*")
      .eq("mailbox_id", email.mailbox_id)
      .single();

    if (credErr || !creds) {
      return jsonResponse({ error: "Mailbox credentials not found" }, 500);
    }

    // Refresh token if needed
    let accessToken = creds.access_token;
    if (!accessToken || (creds.access_token_expires_at && Date.now() >= new Date(creds.access_token_expires_at).getTime() - 120_000)) {
      const tokenUrl = `https://login.microsoftonline.com/${creds.tenant_id}/oauth2/v2.0/token`;
      const tokenRes = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          grant_type: "refresh_token",
          refresh_token: creds.refresh_token,
          scope: "offline_access Mail.Read",
        }),
      });

      if (!tokenRes.ok) {
        return jsonResponse({ error: "Failed to refresh access token" }, 502);
      }

      const tokens = await tokenRes.json();
      accessToken = tokens.access_token;

      await supabase
        .from("shared_mailbox_credentials")
        .update({
          access_token: tokens.access_token,
          access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("mailbox_id", email.mailbox_id);
    }

    // Fetch full message body from Graph
    const graphRes = await fetch(
      `${GRAPH_BASE}/me/messages/${email.graph_message_id}?$select=body`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!graphRes.ok) {
      const err = await graphRes.text();
      return jsonResponse({ error: `Graph API error: ${err}` }, 502);
    }

    const graphData = await graphRes.json();
    const bodyHtml = graphData.body?.content || "";

    // Cache in DB
    await supabase
      .from("shared_emails")
      .update({ body_html: bodyHtml })
      .eq("id", email_id);

    return jsonResponse({ body_html: bodyHtml });
  } catch (err) {
    console.error("[shared-inbox-body] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
