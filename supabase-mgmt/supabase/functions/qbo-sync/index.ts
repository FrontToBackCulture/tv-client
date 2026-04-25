// ---------------------------------------------------------------------------
// QBO Sync — pulls entities from QBO into mirror tables.
//
// POST /qbo-sync
// Body: { entity?: string | "all", since?: ISO8601, triggered_by?: string }
//
// Mode selection per entity:
//   - If `since` is passed, or the most recent successful run for that entity
//     was within 30 days, we use the QBO Change Data Capture (CDC) endpoint.
//     CDC returns both modified and deleted rows, so deletions are applied
//     against the mirror tables.
//   - Otherwise (no prior run, or last run too old for CDC's 30-day window)
//     we fall back to a full /query fetch. Full fetches cannot detect deletes
//     — deletions land on the next incremental CDC run.
//
// Writes an audit row to `qbo_sync_runs`.
// ---------------------------------------------------------------------------

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  CORS_HEADERS,
  QboConnection,
  getActiveConnection,
  jsonResponse,
  qboCdc,
  qboQuery,
  supabaseAdmin,
} from "../_shared/qbo.ts";

interface EntityHandler {
  qboEntity: string;                  // QBO SQL table name
  table: string;                      // Supabase mirror table
  map: (row: any) => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mappers — translate QBO payload → Supabase row shape.
// Keep these minimal; `raw` holds the full payload for everything else.
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, EntityHandler> = {
  accounts: {
    qboEntity: "Account",
    table: "qbo_accounts",
    map: (r) => ({
      qbo_id: r.Id,
      name: r.Name,
      account_type: r.AccountType,
      account_sub_type: r.AccountSubType,
      classification: r.Classification,
      current_balance: r.CurrentBalance,
      active: r.Active,
      parent_qbo_id: r.ParentRef?.value ?? null,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  customers: {
    qboEntity: "Customer",
    table: "qbo_customers",
    map: (r) => ({
      qbo_id: r.Id,
      display_name: r.DisplayName,
      company_name: r.CompanyName,
      email: r.PrimaryEmailAddr?.Address ?? null,
      phone: r.PrimaryPhone?.FreeFormNumber ?? null,
      billing_address: r.BillAddr ?? null,
      balance: r.Balance,
      active: r.Active,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  vendors: {
    qboEntity: "Vendor",
    table: "qbo_vendors",
    map: (r) => ({
      qbo_id: r.Id,
      display_name: r.DisplayName,
      company_name: r.CompanyName,
      email: r.PrimaryEmailAddr?.Address ?? null,
      phone: r.PrimaryPhone?.FreeFormNumber ?? null,
      billing_address: r.BillAddr ?? null,
      balance: r.Balance,
      active: r.Active,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  items: {
    qboEntity: "Item",
    table: "qbo_items",
    map: (r) => ({
      qbo_id: r.Id,
      name: r.Name,
      type: r.Type,
      unit_price: r.UnitPrice,
      income_account_qbo_id: r.IncomeAccountRef?.value ?? null,
      expense_account_qbo_id: r.ExpenseAccountRef?.value ?? null,
      active: r.Active,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  classes: {
    qboEntity: "Class",
    table: "qbo_classes",
    map: (r) => ({
      qbo_id: r.Id,
      name: r.Name,
      parent_qbo_id: r.ParentRef?.value ?? null,
      active: r.Active,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  estimates: {
    qboEntity: "Estimate",
    table: "qbo_estimates",
    map: (r) => ({
      qbo_id: r.Id,
      doc_number: r.DocNumber,
      customer_qbo_id: r.CustomerRef?.value ?? null,
      txn_date: r.TxnDate,
      expiration_date: r.ExpirationDate,
      total_amount: r.TotalAmt,
      status: r.TxnStatus,
      accepted_by: r.AcceptedBy,
      accepted_date: r.AcceptedDate,
      currency: r.CurrencyRef?.value ?? null,
      private_note: r.PrivateNote,
      customer_memo: r.CustomerMemo?.value ?? null,
      line_items: r.Line ?? null,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  invoices: {
    qboEntity: "Invoice",
    table: "qbo_invoices",
    map: (r) => ({
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
    }),
  },
  bills: {
    qboEntity: "Bill",
    table: "qbo_bills",
    map: (r) => ({
      qbo_id: r.Id,
      doc_number: r.DocNumber,
      vendor_qbo_id: r.VendorRef?.value ?? null,
      txn_date: r.TxnDate,
      due_date: r.DueDate,
      total_amount: r.TotalAmt,
      balance: r.Balance,
      currency: r.CurrencyRef?.value ?? null,
      private_note: r.PrivateNote,
      line_items: r.Line ?? null,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  payments: {
    qboEntity: "Payment",
    table: "qbo_payments",
    map: (r) => ({
      qbo_id: r.Id,
      customer_qbo_id: r.CustomerRef?.value ?? null,
      txn_date: r.TxnDate,
      total_amount: r.TotalAmt,
      currency: r.CurrencyRef?.value ?? null,
      deposit_to_account_qbo_id: r.DepositToAccountRef?.value ?? null,
      applied_to: r.Line ?? null,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  bill_payments: {
    qboEntity: "BillPayment",
    table: "qbo_bill_payments",
    map: (r) => ({
      qbo_id: r.Id,
      vendor_qbo_id: r.VendorRef?.value ?? null,
      txn_date: r.TxnDate,
      total_amount: r.TotalAmt,
      currency: r.CurrencyRef?.value ?? null,
      pay_type: r.PayType,
      applied_to: r.Line ?? null,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  expenses: {
    qboEntity: "Purchase",
    table: "qbo_expenses",
    map: (r) => ({
      qbo_id: r.Id,
      txn_date: r.TxnDate,
      total_amount: r.TotalAmt,
      account_qbo_id: r.AccountRef?.value ?? null,
      payee_qbo_id: r.EntityRef?.value ?? null,
      payee_type: r.EntityRef?.type ?? null,
      payment_type: r.PaymentType,
      currency: r.CurrencyRef?.value ?? null,
      private_note: r.PrivateNote,
      line_items: r.Line ?? null,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
  journal_entries: {
    qboEntity: "JournalEntry",
    table: "qbo_journal_entries",
    map: (r) => ({
      qbo_id: r.Id,
      doc_number: r.DocNumber,
      txn_date: r.TxnDate,
      total_amount: r.TotalAmt,
      currency: r.CurrencyRef?.value ?? null,
      private_note: r.PrivateNote,
      lines: r.Line ?? null,
      raw: r,
      synced_at: new Date().toISOString(),
    }),
  },
};

// Dependency-respecting sync order for `entity=all`.
const ALL_ORDER = [
  "accounts",
  "classes",
  "items",
  "customers",
  "vendors",
  "estimates",
  "invoices",
  "bills",
  "payments",
  "bill_payments",
  "expenses",
  "journal_entries",
];

// ---------------------------------------------------------------------------
// Sync one entity
// ---------------------------------------------------------------------------

// CDC requires changedSince to be within the last 30 days. We apply a small
// overlap buffer so updates landing between our query-start and completion
// aren't missed on the next run.
const CDC_MAX_LOOKBACK_MS = 29 * 24 * 60 * 60 * 1000;
const CDC_OVERLAP_MS = 60 * 1000;

async function lastCdcWatermark(
  supabase: SupabaseClient,
  entity: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("qbo_sync_runs")
    .select("started_at")
    .eq("entity_type", entity)
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.started_at) return null;
  const ts = new Date(data.started_at).getTime() - CDC_OVERLAP_MS;
  if (Date.now() - ts > CDC_MAX_LOOKBACK_MS) return null;   // too old → full sync
  return new Date(ts).toISOString();
}

async function syncEntity(
  supabase: SupabaseClient,
  conn: QboConnection,
  entity: string,
  since: string | null,
  triggeredBy: string,
): Promise<{ processed: number; deleted?: number; mode?: string; error?: string }> {
  const handler = HANDLERS[entity];
  if (!handler) {
    return { processed: 0, error: `Unknown entity: ${entity}` };
  }

  // Pick a watermark: explicit `since` from the caller wins, otherwise
  // derive from the most recent successful run. Null → full sync.
  const cdcSince = since ?? (await lastCdcWatermark(supabase, entity));
  const mode: "full" | "cdc" = cdcSince ? "cdc" : "full";

  const { data: runRow, error: runErr } = await supabase
    .from("qbo_sync_runs")
    .insert({
      entity_type: entity,
      status: "running",
      triggered_by: triggeredBy,
      cursor: cdcSince,
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return { processed: 0, error: `Failed to create sync run: ${runErr?.message}` };
  }

  try {
    let upserted = 0;
    let deleted = 0;

    if (mode === "cdc") {
      const byEntity = await qboCdc(conn, [handler.qboEntity], cdcSince!);
      const rows: any[] = byEntity[handler.qboEntity] ?? [];

      const deletedIds: string[] = [];
      const liveRows: any[] = [];
      for (const r of rows) {
        if (r.status === "Deleted") deletedIds.push(String(r.Id));
        else liveRows.push(r);
      }

      if (liveRows.length > 0) {
        const mapped = liveRows.map(handler.map);
        const { error: upErr } = await supabase
          .from(handler.table)
          .upsert(mapped, { onConflict: "qbo_id" });
        if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);
        upserted = liveRows.length;
      }

      if (deletedIds.length > 0) {
        const { error: delErr } = await supabase
          .from(handler.table)
          .delete()
          .in("qbo_id", deletedIds);
        if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
        deleted = deletedIds.length;
      }
    } else {
      // Full sync: QBO's standard /query never returns deleted rows, so a
      // full sync here can't detect deletions. CDC handles deletions on
      // subsequent incremental runs once we have a watermark.
      const select = `SELECT * FROM ${handler.qboEntity}`;
      const rows = await qboQuery(conn, select);
      if (rows.length > 0) {
        const mapped = rows.map(handler.map);
        const { error: upErr } = await supabase
          .from(handler.table)
          .upsert(mapped, { onConflict: "qbo_id" });
        if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);
        upserted = rows.length;
      }
    }

    await supabase
      .from("qbo_sync_runs")
      .update({
        status: "ok",
        records_processed: upserted + deleted,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);

    return { processed: upserted, deleted, mode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("qbo_sync_runs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);
    return { processed: 0, error: message, mode };
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const entity = (body.entity ?? "all") as string;
    const since = (body.since ?? null) as string | null;
    const triggeredBy = (body.triggered_by ?? "manual") as string;

    const supabase = supabaseAdmin();
    const conn = await getActiveConnection(supabase);

    const targets = entity === "all" ? ALL_ORDER : [entity];
    const results: Record<string, { processed: number; error?: string }> = {};

    for (const e of targets) {
      results[e] = await syncEntity(supabase, conn, e, since, triggeredBy);
    }

    const anyFailed = Object.values(results).some((r) => r.error);
    return jsonResponse(
      { ok: !anyFailed, results },
      anyFailed ? 207 : 200,
    );
  } catch (err) {
    console.error("[qbo-sync] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
