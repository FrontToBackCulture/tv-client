// ---------------------------------------------------------------------------
// QBO Sync Single Invoice — targeted refresh for one invoice + its JEs.
//
// Used by the Invoice Recognition view when the user has edited a JE in QBO
// directly (or deleted one) and wants the row to update without running the
// full qbo-sync job. Much faster than syncing every invoice/JE in the book.
//
// POST /qbo-sync-invoice
// Body: { doc_number: string }   // e.g. "1113-1"
// Returns: { success, invoice_synced, je_synced, je_deleted, error? }
//
// Scope of a single "invoice" here = the invoice with that DocNumber, plus
// every JournalEntry whose DocNumber starts with that prefix ("1113-1-SUB-1",
// "1113-1-SVC-2", etc.). JEs that exist locally but no longer in QBO are
// removed from the mirror so soft-deletes done in QBO propagate.
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  getActiveConnection,
  jsonResponse,
  qboQuery,
  supabaseAdmin,
} from "../_shared/qbo.ts";

function mapInvoice(r: any): Record<string, unknown> {
  return {
    qbo_id: r.Id,
    doc_number: r.DocNumber,
    customer_qbo_id: r.CustomerRef?.value ?? null,
    txn_date: r.TxnDate,
    due_date: r.DueDate,
    total_amount: r.TotalAmt,
    balance: r.Balance,
    status: r.TxnStatus ?? (r.Balance > 0 ? "Open" : "Paid"),
    email_status: r.EmailStatus,
    currency: r.CurrencyRef?.value ?? null,
    private_note: r.PrivateNote,
    customer_memo: r.CustomerMemo?.value ?? null,
    line_items: r.Line ?? null,
    raw: r,
    synced_at: new Date().toISOString(),
  };
}

function mapJe(r: any): Record<string, unknown> {
  return {
    qbo_id: r.Id,
    doc_number: r.DocNumber,
    txn_date: r.TxnDate,
    total_amount: r.TotalAmt,
    currency: r.CurrencyRef?.value ?? null,
    private_note: r.PrivateNote,
    lines: r.Line ?? null,
    raw: r,
    synced_at: new Date().toISOString(),
  };
}

// Escape single quotes for QBO's SQL-like query language.
function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { doc_number?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const docNumber = body.doc_number?.trim();
  if (!docNumber) return jsonResponse({ error: "doc_number is required" }, 400);
  const esc = sqlEscape(docNumber);

  const supabase = supabaseAdmin();

  try {
    const conn = await getActiveConnection(supabase);

    // 1. The invoice itself.
    const invoices = await qboQuery(
      conn,
      `SELECT * FROM Invoice WHERE DocNumber = '${esc}'`,
    );
    if (invoices.length > 0) {
      const { error: upErr } = await supabase
        .from("qbo_invoices")
        .upsert(invoices.map(mapInvoice), { onConflict: "qbo_id" });
      if (upErr) throw new Error(`invoice upsert failed: ${upErr.message}`);
    }

    // 2. Every JE whose DocNumber starts with the invoice's DocNumber. QBO's
    //    query language supports LIKE with %.
    const jes = await qboQuery(
      conn,
      `SELECT * FROM JournalEntry WHERE DocNumber LIKE '${esc}-%'`,
    );
    if (jes.length > 0) {
      const { error: upErr } = await supabase
        .from("qbo_journal_entries")
        .upsert(jes.map(mapJe), { onConflict: "qbo_id" });
      if (upErr) throw new Error(`je upsert failed: ${upErr.message}`);
    }

    // 3. Prune local JEs that no longer exist in QBO (deleted upstream). The
    //    .like pattern mirrors the QBO query above so we only touch this
    //    invoice's slice of the mirror table.
    const liveIds = new Set(jes.map((r) => String(r.Id)));
    const { data: existingRows, error: selErr } = await supabase
      .from("qbo_journal_entries")
      .select("qbo_id")
      .like("doc_number", `${docNumber}-%`);
    if (selErr) throw new Error(`je select for prune failed: ${selErr.message}`);

    const toDelete = (existingRows ?? [])
      .map((r) => r.qbo_id as string)
      .filter((id) => !liveIds.has(id));

    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("qbo_journal_entries")
        .delete()
        .in("qbo_id", toDelete);
      if (delErr) throw new Error(`je prune failed: ${delErr.message}`);
    }

    return jsonResponse({
      success: true,
      invoice_synced: invoices.length,
      je_synced: jes.length,
      je_deleted: toDelete.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
