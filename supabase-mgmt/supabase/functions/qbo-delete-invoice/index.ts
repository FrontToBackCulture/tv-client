// ---------------------------------------------------------------------------
// QBO Delete Invoice — soft-delete an Invoice in QBO.
//
// Used by the Invoice Recognition view when an invoice is wrong/duplicate and
// should be removed entirely. Recognition JEs attached to the invoice are NOT
// touched — handle those separately (the JE delete button on each row).
//
// POST /qbo-delete-invoice
// Body: { qbo_id: string }
// Returns: { success, qbo_id?, error? }
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  getActiveConnection,
  jsonResponse,
  qboFetch,
  supabaseAdmin,
} from "../_shared/qbo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { qbo_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const qboId = body.qbo_id?.trim();
  if (!qboId) return jsonResponse({ error: "qbo_id is required" }, 400);

  const supabase = supabaseAdmin();

  try {
    const conn = await getActiveConnection(supabase);

    const fetchResp = await qboFetch(conn, `invoice/${qboId}`);
    const current = fetchResp?.Invoice;
    if (!current?.Id) {
      // Already gone in QBO — prune local mirror and return success.
      await supabase.from("qbo_invoices").delete().eq("qbo_id", qboId);
      return jsonResponse({ success: true, qbo_id: qboId });
    }

    const delResp = await qboFetch(conn, "invoice", {
      method: "POST",
      body: { Id: current.Id, SyncToken: current.SyncToken },
      query: { operation: "delete" },
    });
    const deleted = delResp?.Invoice;
    if (deleted?.status !== "Deleted") {
      return jsonResponse({
        success: false,
        error: `QBO did not confirm deletion — response: ${JSON.stringify(delResp).slice(0, 200)}`,
      }, 500);
    }

    const { error: delErr } = await supabase
      .from("qbo_invoices")
      .delete()
      .eq("qbo_id", qboId);

    if (delErr) {
      return jsonResponse({
        success: true,
        qbo_id: qboId,
        error: `deleted in QBO but local mirror delete failed: ${delErr.message}`,
      });
    }

    return jsonResponse({ success: true, qbo_id: qboId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
