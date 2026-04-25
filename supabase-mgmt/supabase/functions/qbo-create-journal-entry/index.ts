// ---------------------------------------------------------------------------
// QBO Create Journal Entry — pushes recognition JEs from tv-client into QBO.
//
// POST /qbo-create-journal-entry
// Body: {
//   entries: Array<{
//     doc_number: string;        // e.g. "1082-1-SUB-3" — also the QBO DocNumber
//     txn_date: string;          // ISO date — last day of the recognition period
//     description: string;       // "INV 1082-1 · Software:VAL · Aug 2024 · period 3 of 3"
//     amount: number;            // monthly recognition amount
//     dr_account_qbo_id: string; // deferred account
//     cr_account_qbo_id: string; // revenue account
//     customer_qbo_id: string;   // customer entity ref
//     currency?: string;         // optional, defaults to home currency
//   }>;
//   triggered_by?: string;
// }
//
// Returns: {
//   results: Array<{
//     doc_number: string;
//     success: boolean;
//     qbo_id?: string;           // populated on success — the created JE's ID
//     sync_token?: string;       // QBO version stamp
//     error?: string;            // populated on failure
//   }>;
//   created: number;
//   failed: number;
// }
//
// Per-entry failures don't abort the batch. Created JEs are mirrored into
// the local `qbo_journal_entries` table immediately so the UI sees them on
// the next refetch — no need to wait for a full QBO sync.
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  QboConnection,
  getActiveConnection,
  jsonResponse,
  qboFetch,
  supabaseAdmin,
} from "../_shared/qbo.ts";

interface ProposedEntry {
  doc_number: string;
  txn_date: string;
  description: string;
  amount: number;
  dr_account_qbo_id: string;
  cr_account_qbo_id: string;
  customer_qbo_id: string;
  currency?: string;
}

interface EntryResult {
  doc_number: string;
  success: boolean;
  qbo_id?: string;
  sync_token?: string;
  error?: string;
}

function buildJournalEntryPayload(entry: ProposedEntry) {
  // Two balancing lines: one DR (deferred), one CR (revenue). Both share the
  // same description and customer reference so audit trails stay linked.
  const linkedEntity = {
    Type: "Customer" as const,
    EntityRef: { value: entry.customer_qbo_id },
  };
  const baseLine = {
    Description: entry.description,
    Amount: entry.amount,
    DetailType: "JournalEntryLineDetail" as const,
  };
  return {
    DocNumber: entry.doc_number,
    TxnDate: entry.txn_date,
    PrivateNote: entry.description,
    ...(entry.currency ? { CurrencyRef: { value: entry.currency } } : {}),
    // House style: Sales (CR) line first, Deferred (DR) line second.
    Line: [
      {
        ...baseLine,
        JournalEntryLineDetail: {
          PostingType: "Credit",
          AccountRef: { value: entry.cr_account_qbo_id },
          Entity: linkedEntity,
        },
      },
      {
        ...baseLine,
        JournalEntryLineDetail: {
          PostingType: "Debit",
          AccountRef: { value: entry.dr_account_qbo_id },
          Entity: linkedEntity,
        },
      },
    ],
  };
}

function validateEntry(entry: ProposedEntry): string | null {
  if (!entry.doc_number) return "missing doc_number";
  if (!entry.txn_date) return "missing txn_date";
  if (!Number.isFinite(entry.amount) || entry.amount <= 0) return "invalid amount";
  if (!entry.dr_account_qbo_id) return "missing dr_account_qbo_id (deferred account not configured)";
  if (!entry.cr_account_qbo_id) return "missing cr_account_qbo_id (revenue account not configured)";
  if (!entry.customer_qbo_id) return "missing customer_qbo_id (invoice has no customer)";
  return null;
}

async function createOne(
  conn: QboConnection,
  entry: ProposedEntry,
  supabase: ReturnType<typeof supabaseAdmin>,
): Promise<EntryResult> {
  const validationError = validateEntry(entry);
  if (validationError) {
    return { doc_number: entry.doc_number, success: false, error: validationError };
  }

  try {
    const payload = buildJournalEntryPayload(entry);
    const response = await qboFetch(conn, "journalentry", { method: "POST", body: payload });
    const created = response?.JournalEntry;
    if (!created?.Id) {
      return {
        doc_number: entry.doc_number,
        success: false,
        error: `QBO returned no JournalEntry.Id — full response: ${JSON.stringify(response).slice(0, 200)}`,
      };
    }

    // Mirror the created JE into our local table so the UI sees it without
    // waiting for a full sync. Same shape the qbo-sync mapper uses.
    const { error: insertErr } = await supabase
      .from("qbo_journal_entries")
      .upsert({
        qbo_id: created.Id,
        doc_number: created.DocNumber,
        txn_date: created.TxnDate,
        total_amount: created.TotalAmt,
        currency: created.CurrencyRef?.value ?? null,
        private_note: created.PrivateNote,
        lines: created.Line ?? null,
        raw: created,
        synced_at: new Date().toISOString(),
      }, { onConflict: "qbo_id" });

    if (insertErr) {
      // The JE was created in QBO but the local mirror failed — surface as
      // a partial success so the user knows the GL was updated.
      return {
        doc_number: entry.doc_number,
        success: true,
        qbo_id: created.Id,
        sync_token: created.SyncToken,
        error: `created in QBO but local mirror failed: ${insertErr.message}`,
      };
    }

    return {
      doc_number: entry.doc_number,
      success: true,
      qbo_id: created.Id,
      sync_token: created.SyncToken,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { doc_number: entry.doc_number, success: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { entries?: ProposedEntry[]; triggered_by?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const entries = body.entries ?? [];
  if (entries.length === 0) {
    return jsonResponse({ error: "No entries provided" }, 400);
  }
  if (entries.length > 50) {
    return jsonResponse({ error: "Max 50 entries per request" }, 400);
  }

  const supabase = supabaseAdmin();
  let conn: QboConnection;
  try {
    conn = await getActiveConnection(supabase);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  // Sequential, not parallel — QBO doesn't love concurrent writes from a
  // single tenant and we want predictable ordering for audit logs.
  const results: EntryResult[] = [];
  for (const entry of entries) {
    results.push(await createOne(conn, entry, supabase));
  }

  const created = results.filter((r) => r.success).length;
  const failed = results.length - created;
  return jsonResponse({ results, created, failed });
});
