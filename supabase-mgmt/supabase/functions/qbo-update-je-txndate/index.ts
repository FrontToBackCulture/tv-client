// ---------------------------------------------------------------------------
// QBO Update JE TxnDate — rewrite the TxnDate on an existing JournalEntry.
//
// Used by the Invoice Recognition view when a recognition JE lands in the
// wrong calendar month and the user wants to shift it without delete+recreate.
//
// POST /qbo-update-je-txndate
// Body: { qbo_id: string; txn_date: string }   // YYYY-MM-DD
// Returns: { success: boolean; qbo_id?: string; sync_token?: string; txn_date?: string; error?: string }
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

  let body: { qbo_id?: string; txn_date?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const qboId = body.qbo_id?.trim();
  const newDate = body.txn_date?.trim();
  if (!qboId) return jsonResponse({ error: "qbo_id is required" }, 400);
  if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return jsonResponse({ error: "txn_date must be YYYY-MM-DD" }, 400);
  }

  const supabase = supabaseAdmin();

  try {
    const conn = await getActiveConnection(supabase);

    const fetchResp = await qboFetch(conn, `journalentry/${qboId}`);
    const current = fetchResp?.JournalEntry;
    if (!current?.Id) {
      return jsonResponse({ success: false, error: `JE ${qboId} not found in QBO` }, 404);
    }

    const updatePayload = {
      ...current,
      TxnDate: newDate,
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
        txn_date: updated.TxnDate,
        error: `updated in QBO but local mirror failed: ${insertErr.message}`,
      });
    }

    return jsonResponse({
      success: true,
      qbo_id: updated.Id,
      sync_token: updated.SyncToken,
      txn_date: updated.TxnDate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
