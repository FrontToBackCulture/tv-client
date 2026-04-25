// ---------------------------------------------------------------------------
// QBO Update JE DocNumber — rewrite the DocNumber on an existing JournalEntry.
//
// Used by the Invoice Recognition view: customer GLs sometimes have legacy
// JE doc#s like "1082-1-SUB-3" that don't match the user's intended
// "1082-SUB-3" convention. Editing the cell in tv-client calls this.
//
// POST /qbo-update-je-docnumber
// Body: { qbo_id: string; doc_number: string }
// Returns: { success: boolean; qbo_id?: string; sync_token?: string; doc_number?: string; error?: string }
//
// Flow: GET the current JE (need full Line[] + SyncToken for replace) → POST
// the same JE back with the new DocNumber → mirror to local qbo_journal_entries.
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

  let body: { qbo_id?: string; doc_number?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const qboId = body.qbo_id?.trim();
  const newDoc = body.doc_number?.trim();
  if (!qboId) return jsonResponse({ error: "qbo_id is required" }, 400);
  if (!newDoc) return jsonResponse({ error: "doc_number is required" }, 400);
  if (newDoc.length > 21) return jsonResponse({ error: "doc_number max 21 chars (QBO limit)" }, 400);

  const supabase = supabaseAdmin();

  try {
    const conn = await getActiveConnection(supabase);

    // 1. Fetch the current JE so we have SyncToken + full Line[] for replace.
    const fetchResp = await qboFetch(conn, `journalentry/${qboId}`);
    const current = fetchResp?.JournalEntry;
    if (!current?.Id) {
      return jsonResponse({ success: false, error: `JE ${qboId} not found in QBO` }, 404);
    }

    // 2. POST the JE back with only DocNumber changed. Full replace is more
    //    reliable than sparse updates for JEs (sparse mode treats Line as
    //    additive, which would duplicate postings).
    const updatePayload = {
      ...current,
      DocNumber: newDoc,
      SyncToken: current.SyncToken,
    };
    const updateResp = await qboFetch(conn, "journalentry", { method: "POST", body: updatePayload });
    const updated = updateResp?.JournalEntry;
    if (!updated?.Id) {
      return jsonResponse({
        success: false,
        error: `QBO returned no JournalEntry — full response: ${JSON.stringify(updateResp).slice(0, 200)}`,
      }, 500);
    }

    // 3. Mirror locally so the UI sees the new doc# without a full sync.
    const { error: insertErr } = await supabase
      .from("qbo_journal_entries")
      .upsert({
        qbo_id: updated.Id,
        doc_number: updated.DocNumber,
        txn_date: updated.TxnDate,
        total_amount: updated.TotalAmt,
        currency: updated.CurrencyRef?.value ?? null,
        private_note: updated.PrivateNote,
        lines: updated.Line ?? null,
        raw: updated,
        synced_at: new Date().toISOString(),
      }, { onConflict: "qbo_id" });

    if (insertErr) {
      return jsonResponse({
        success: true,
        qbo_id: updated.Id,
        sync_token: updated.SyncToken,
        doc_number: updated.DocNumber,
        error: `updated in QBO but local mirror failed: ${insertErr.message}`,
      });
    }

    return jsonResponse({
      success: true,
      qbo_id: updated.Id,
      sync_token: updated.SyncToken,
      doc_number: updated.DocNumber,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
