// ---------------------------------------------------------------------------
// QBO Callback — handles Intuit OAuth redirect.
//
// GET /qbo-callback?code=...&realmId=...&state=...
//   → exchanges code for tokens
//   → upserts qbo_connections row
//   → redirects to return_to (from state) or renders a simple success page
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  QBO_ENVIRONMENT,
  exchangeCodeForTokens,
  supabaseAdmin,
} from "../_shared/qbo.ts";

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return htmlResponse(
      `<h1>QBO connection cancelled</h1><p>${error}</p>`,
      400,
    );
  }

  if (!code || !realmId) {
    return htmlResponse(
      "<h1>Missing code or realmId</h1>",
      400,
    );
  }

  let returnTo: string | null = null;
  try {
    const state = stateRaw ? JSON.parse(atob(stateRaw)) : {};
    returnTo = state.return_to || null;
  } catch {
    // malformed state — proceed without redirect
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = supabaseAdmin();

    // Fetch company name so the UI has something nice to display.
    let companyName: string | null = null;
    try {
      const baseUrl = QBO_ENVIRONMENT === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com";
      const res = await fetch(
        `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=73`,
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: "application/json",
          },
        },
      );
      if (res.ok) {
        const data = await res.json();
        companyName = data?.CompanyInfo?.CompanyName ?? null;
      }
    } catch {
      // non-fatal
    }

    const { error: upErr } = await supabase
      .from("qbo_connections")
      .upsert(
        {
          realm_id: realmId,
          company_name: companyName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          environment: QBO_ENVIRONMENT,
          status: "active",
          last_error: null,
        },
        { onConflict: "realm_id" },
      );

    if (upErr) {
      throw new Error(`Failed to persist connection: ${upErr.message}`);
    }

    if (returnTo) {
      return Response.redirect(returnTo, 302);
    }

    return htmlResponse(
      `<!doctype html>
       <html><body style="font-family:system-ui;padding:2rem;max-width:500px;margin:auto;">
         <h1>✅ QuickBooks connected</h1>
         <p>Company: <strong>${companyName ?? realmId}</strong></p>
         <p>Environment: <strong>${QBO_ENVIRONMENT}</strong></p>
         <p>You can close this window.</p>
       </body></html>`,
    );
  } catch (err) {
    console.error("[qbo-callback] error:", err);
    return htmlResponse(
      `<h1>Connection failed</h1><pre>${err instanceof Error ? err.message : String(err)}</pre>`,
      500,
    );
  }
});
