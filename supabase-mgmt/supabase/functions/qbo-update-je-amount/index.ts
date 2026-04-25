// ---------------------------------------------------------------------------
// QBO Update JE Amount — rewrite the line amounts on an existing JournalEntry.
//
// Used by the Invoice Recognition view: posted JE amounts sometimes drift a
// few cents from the invoice line they're recognising (e.g. JE was $646.85
// but the line was $646.83 → recurring 2-cent variance). Editing the JE
// amount in tv-client calls this to fix QBO directly.
//
// POST /qbo-update-je-amount
// Body: { qbo_id: string; amount: number }       // amount in dollars (≤ 2dp)
// Returns: { success, qbo_id?, sync_token?, amount?, error? }
//
// Both posting lines (DR + CR) are rewritten to the same new amount so the
// JE stays balanced. Everything else (DocNumber, TxnDate, AccountRefs,
// Entity, Description, etc.) is preserved verbatim.
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  getActiveConnection,
  jsonResponse,
  qboFetch,
  supabaseAdmin,
} from "../_shared/qbo.ts";

interface QboLine {
  Amount?: number;
  DetailType?: string;
  JournalEntryLineDetail?: {
    PostingType?: string;
    AccountRef?: { value?: string };
    Entity?: { Type?: string; EntityRef?: { value?: string } };
  };
  [k: string]: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { qbo_id?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const qboId = body.qbo_id?.trim();
  const newAmount = body.amount;
  if (!qboId) return jsonResponse({ error: "qbo_id is required" }, 400);
  if (newAmount == null || !Number.isFinite(newAmount)) {
    return jsonResponse({ error: "amount is required and must be a finite number" }, 400);
  }
  if (newAmount <= 0) return jsonResponse({ error: "amount must be > 0" }, 400);
  // QBO truncates beyond 2dp anyway; round defensively.
  const cents = Math.round(newAmount * 100);
  const cleanAmount = cents / 100;

  const supabase = supabaseAdmin();

  try {
    const conn = await getActiveConnection(supabase);

    // 1. Fetch current JE for SyncToken + full Line[] (full replace).
    const fetchResp = await qboFetch(conn, `journalentry/${qboId}`);
    const current = fetchResp?.JournalEntry;
    if (!current?.Id) {
      return jsonResponse({ success: false, error: `JE ${qboId} not found in QBO` }, 404);
    }

    // 2. Walk every JournalEntryLineDetail line and rewrite Amount. JEs are
    //    expected to be 2-line CR/DR pairs; if there are more (multi-leg JE),
    //    refuse to edit since "the amount" is ambiguous.
    const lines = (current.Line ?? []) as QboLine[];
    const postingLines = lines.filter(
      (l) => l.DetailType === "JournalEntryLineDetail" && l.JournalEntryLineDetail?.PostingType,
    );
    if (postingLines.length !== 2) {
      return jsonResponse({
        success: false,
        error: `JE ${qboId} has ${postingLines.length} posting lines — inline amount edit only supports balanced 2-line JEs. Edit it directly in QBO.`,
      }, 400);
    }

    const updatedLines = lines.map((l) => {
      if (l.DetailType !== "JournalEntryLineDetail") return l;
      if (!l.JournalEntryLineDetail?.PostingType) return l;
      return { ...l, Amount: cleanAmount };
    });

    const updatePayload = {
      ...current,
      Line: updatedLines,
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

    // 3. Mirror locally so the UI updates without a full sync.
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
        amount: cleanAmount,
        error: `updated in QBO but local mirror failed: ${insertErr.message}`,
      });
    }

    return jsonResponse({
      success: true,
      qbo_id: updated.Id,
      sync_token: updated.SyncToken,
      amount: cleanAmount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
