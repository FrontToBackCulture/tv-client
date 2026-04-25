// ---------------------------------------------------------------------------
// QBO Post Accrual — creates a matched accrual+reversal JE pair in QBO.
//
// Use case: a cell in Expense Review is mis-dated (e.g. Jul 2024 holds both
// Jun + Jul CPF because payments shifted). One click moves the excess
// back into the previous month by posting:
//
//   JE-A (accrual, dated last day of prior month):
//     Dr <expense_account>  <amount>
//     Cr <liability_account> <amount>
//
//   JE-R (reversal, dated first day of clicked month):
//     Dr <liability_account> <amount>
//     Cr <expense_account>   <amount>
//
// Net effect: expense shifts one month earlier, liability nets to zero.
//
// POST /qbo-post-accrual
// Body: {
//   description: string;                    // e.g. "CPF Employee · Darren · Jun 24 accrual"
//   amount: number;
//   currency?: string;
//   expense_account_qbo_id: string;
//   liability_account_qbo_id: string;
//   entity_qbo_id?: string;                  // optional payee link for audit
//   entity_type?: "Vendor" | "Customer" | "Employee";
//   accrual_date: string;                    // ISO — last day of prior month
//   reversal_date: string;                   // ISO — first day of clicked month
//   doc_prefix: string;                      // up to ~10 chars — base for DocNumber
//   triggered_by?: string;
// }
//
// Returns: {
//   accrual:  { success, qbo_id?, doc_number, error? };
//   reversal: { success, qbo_id?, doc_number, error? };
// }
//
// If the accrual post fails, the reversal is NOT attempted. If the accrual
// succeeds but the reversal fails, the caller must either retry or manually
// delete the orphan accrual in QBO.
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  QboConnection,
  getActiveConnection,
  jsonResponse,
  qboFetch,
  supabaseAdmin,
} from "../_shared/qbo.ts";

interface PostAccrualBody {
  description: string;
  amount: number;
  currency?: string;
  expense_account_qbo_id: string;
  liability_account_qbo_id: string;
  entity_qbo_id?: string;
  entity_type?: "Vendor" | "Customer" | "Employee";
  accrual_date: string;
  reversal_date: string;
  doc_prefix: string;
  triggered_by?: string;
}

interface LegResult {
  success: boolean;
  qbo_id?: string;
  doc_number: string;
  error?: string;
}

function shortId(): string {
  // 6 chars of base36 — collision-resistant enough for DocNumber uniqueness
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function validate(b: PostAccrualBody): string | null {
  if (!b.description) return "missing description";
  if (!Number.isFinite(b.amount) || b.amount <= 0) return "invalid amount";
  if (!b.expense_account_qbo_id) return "missing expense_account_qbo_id";
  if (!b.liability_account_qbo_id) return "missing liability_account_qbo_id";
  if (!b.accrual_date) return "missing accrual_date";
  if (!b.reversal_date) return "missing reversal_date";
  if (!b.doc_prefix) return "missing doc_prefix";
  return null;
}

function buildLine(
  posting: "Debit" | "Credit",
  accountQboId: string,
  description: string,
  amount: number,
  entity: { type: string; qboId: string } | null,
) {
  return {
    Description: description,
    Amount: amount,
    DetailType: "JournalEntryLineDetail",
    JournalEntryLineDetail: {
      PostingType: posting,
      AccountRef: { value: accountQboId },
      ...(entity ? { Entity: { Type: entity.type, EntityRef: { value: entity.qboId } } } : {}),
    },
  };
}

async function postLeg(
  conn: QboConnection,
  supabase: ReturnType<typeof supabaseAdmin>,
  args: {
    docNumber: string;
    txnDate: string;
    description: string;
    amount: number;
    currency?: string;
    drAccountQboId: string;
    crAccountQboId: string;
    entity: { type: string; qboId: string } | null;
  },
): Promise<LegResult> {
  const payload = {
    DocNumber: args.docNumber,
    TxnDate: args.txnDate,
    PrivateNote: args.description,
    ...(args.currency ? { CurrencyRef: { value: args.currency } } : {}),
    Line: [
      buildLine("Credit", args.crAccountQboId, args.description, args.amount, args.entity),
      buildLine("Debit", args.drAccountQboId, args.description, args.amount, args.entity),
    ],
  };

  try {
    const res = await qboFetch(conn, "journalentry", { method: "POST", body: payload });
    const created = res?.JournalEntry;
    if (!created?.Id) {
      return {
        success: false,
        doc_number: args.docNumber,
        error: `QBO returned no JournalEntry.Id — ${JSON.stringify(res).slice(0, 200)}`,
      };
    }

    // Mirror locally so the grid can pick it up immediately.
    await supabase.from("qbo_journal_entries").upsert(
      {
        qbo_id: created.Id,
        doc_number: created.DocNumber,
        txn_date: created.TxnDate,
        total_amount: created.TotalAmt,
        currency: created.CurrencyRef?.value ?? null,
        private_note: created.PrivateNote,
        lines: created.Line ?? null,
        raw: created,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "qbo_id" },
    );

    return { success: true, qbo_id: created.Id, doc_number: created.DocNumber };
  } catch (err) {
    return {
      success: false,
      doc_number: args.docNumber,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: PostAccrualBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const validationError = validate(body);
  if (validationError) return jsonResponse({ error: validationError }, 400);

  const supabase = supabaseAdmin();
  let conn: QboConnection;
  try {
    conn = await getActiveConnection(supabase);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const entity =
    body.entity_qbo_id && body.entity_type
      ? { type: body.entity_type, qboId: body.entity_qbo_id }
      : null;

  const suffix = shortId();
  const accrualDoc = `${body.doc_prefix}-A-${suffix}`.slice(0, 21);
  const reversalDoc = `${body.doc_prefix}-R-${suffix}`.slice(0, 21);

  // Leg 1: accrual — pulls expense into prior month.
  const accrual = await postLeg(conn, supabase, {
    docNumber: accrualDoc,
    txnDate: body.accrual_date,
    description: `${body.description} · accrual`,
    amount: body.amount,
    currency: body.currency,
    drAccountQboId: body.expense_account_qbo_id,
    crAccountQboId: body.liability_account_qbo_id,
    entity,
  });

  if (!accrual.success) {
    return jsonResponse(
      {
        accrual,
        reversal: {
          success: false,
          doc_number: reversalDoc,
          error: "skipped — accrual leg failed",
        },
      },
      502,
    );
  }

  // Leg 2: reversal — clears the liability against the actual payment month.
  const reversal = await postLeg(conn, supabase, {
    docNumber: reversalDoc,
    txnDate: body.reversal_date,
    description: `${body.description} · reversal (reverses ${accrual.qbo_id})`,
    amount: body.amount,
    currency: body.currency,
    drAccountQboId: body.liability_account_qbo_id,
    crAccountQboId: body.expense_account_qbo_id,
    entity,
  });

  return jsonResponse({ accrual, reversal }, reversal.success ? 200 : 502);
});
