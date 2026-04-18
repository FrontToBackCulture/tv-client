// ---------------------------------------------------------------------------
// QBO Connect — initiate the Intuit OAuth flow.
//
// GET /qbo-connect?return_to=<url>
//   → 302 redirect to Intuit authorization URL
//
// After user grants access, Intuit redirects to QBO_REDIRECT_URI (the
// qbo-callback function) with ?code & ?realmId & ?state.
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  QBO_AUTH_URL,
  QBO_CLIENT_ID,
  QBO_REDIRECT_URI,
  QBO_SCOPE,
} from "../_shared/qbo.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const reqUrl = new URL(req.url);
  const returnTo = reqUrl.searchParams.get("return_to") ?? "";

  // `state` carries a return URL through the OAuth roundtrip. Intuit echoes
  // it verbatim to qbo-callback. Base64 to survive URL encoding.
  const state = btoa(JSON.stringify({ return_to: returnTo, ts: Date.now() }));

  const authUrl = new URL(QBO_AUTH_URL);
  authUrl.searchParams.set("client_id", QBO_CLIENT_ID);
  authUrl.searchParams.set("scope", QBO_SCOPE);
  authUrl.searchParams.set("redirect_uri", QBO_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString(), 302);
});
