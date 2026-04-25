// ---------------------------------------------------------------------------
// QBO Delete Journal Entry — soft-delete a JournalEntry in QBO.
//
// Used by the Invoice Recognition view when a pushed JE is wrong (e.g. wrong
// amount, wrong account split, wrong period) and the easiest path is to
// delete it and regenerate via the Generate modal.
//
// POST /qbo-delete-journal-entry
// Body: { qbo_id: string }
// Returns: { success, qbo_id?, error? }
//
// QBO "delete" is really a soft-delete — the JE gets status=Deleted and is
// hidden from normal queries. We remove the row from our local mirror so the
// Invoice Recognition view stops seeing it immediately (no full sync needed).
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

    // 1. Fetch current JE for SyncToken (required by delete endpoint).
    const fetchResp = await qboFetch(conn, `journalentry/${qboId}`);
    const current = fetchResp?.JournalEntry;
    if (!current?.Id) {
      // Already gone in QBO — nuke local mirror and call it success.
      await supabase.from("qbo_journal_entries").delete().eq("qbo_id", qboId);
      return jsonResponse({ success: true, qbo_id: qboId });
    }

    // 2. POST with ?operation=delete — QBO's soft-delete endpoint.
    const delResp = await qboFetch(conn, "journalentry", {
      method: "POST",
      body: { Id: current.Id, SyncToken: current.SyncToken },
      query: { operation: "delete" },
    });
    const deleted = delResp?.JournalEntry;
    if (deleted?.status !== "Deleted") {
      return jsonResponse({
        success: false,
        error: `QBO did not confirm deletion — response: ${JSON.stringify(delResp).slice(0, 200)}`,
      }, 500);
    }

    // 3. Remove from local mirror so the UI drops the row right away.
    const { error: delErr } = await supabase
      .from("qbo_journal_entries")
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
