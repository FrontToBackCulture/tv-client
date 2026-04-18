// ---------------------------------------------------------------------------
// FY Build Recognition — rebuild per-orderform × month × leg schedule
//
// POST /fy-build-recognition
// Body: { fy_code?: "FY2024", orderform_code?: "1049" }
//   - both optional; with neither, processes all JEs
//
// Logic:
//   1. Read qbo_journal_entries where doc_number matches `^\d+-(SUB|SVC)-\d+$`.
//      These are the recognition JEs posted by the bookkeeper.
//   2. Group by (orderform, leg) → derive term (max period_index), monthly
//      amount (median), start_date (period_index=1 txn_date), customer.
//   3. Upsert into `orderforms` (one row per orderform; merges SUB + SVC).
//   4. For each (orderform × leg × period_index in 1..term): upsert a
//      `recognition_schedule` row. If a matching JE exists → 'posted' (or
//      'mismatched' if amount differs > $1). Otherwise 'missing' if the
//      period is in the past, else 'expected'.
//
// User-set `notes` on schedule rows are preserved across rebuilds.
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  jsonResponse,
  supabaseAdmin,
} from "../_shared/qbo.ts";

const FY_START_MONTH = 8;
const TOLERANCE = 1.0;

interface Body {
  fy_code?: string;
  orderform_code?: string;
}

interface JeRow {
  qbo_id: string;
  doc_number: string;
  txn_date: string;
  lines: Array<Record<string, unknown>>;
}

interface ParsedJe {
  orderform: string;
  leg: "SUB" | "SVC";
  periodIndex: number;
  amount: number;
  customerQboId: string | null;
  customerName: string;
  txnDate: string;
  jeId: string;
}

const DOC_RE = /^(\d+)-(SUB|SVC)-(\d+)$/;

function parseJe(je: JeRow): ParsedJe | null {
  const m = je.doc_number?.match(DOC_RE);
  if (!m) return null;

  // Use first line's Amount as the recognised value and its Entity as the customer
  const first = je.lines?.[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  const amount = parseFloat((first.Amount as number | string | undefined)?.toString() ?? "0");
  const detail = first.JournalEntryLineDetail as
    | { Entity?: { EntityRef?: { value?: string; name?: string } } }
    | undefined;
  const customerQboId = detail?.Entity?.EntityRef?.value ?? null;
  const customerName = detail?.Entity?.EntityRef?.name ?? "";

  return {
    orderform: m[1],
    leg: m[2] as "SUB" | "SVC",
    periodIndex: parseInt(m[3], 10),
    amount,
    customerQboId,
    customerName,
    txnDate: je.txn_date,
    jeId: je.qbo_id,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function addMonths(iso: string, n: number): { start: string; end: string } {
  const d = new Date(iso + "T00:00:00Z");
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function fyCodeFor(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const fyYear = month >= FY_START_MONTH ? year + 1 : year;
  return `FY${fyYear}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body: Body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};

    const supabase = supabaseAdmin();

    // Pull all recognition JEs (doc_number matching regex)
    let query = supabase
      .from("qbo_journal_entries")
      .select("qbo_id, doc_number, txn_date, lines")
      .not("doc_number", "is", null);
    if (body.orderform_code) {
      query = query.like("doc_number", `${body.orderform_code}-%`);
    }
    const { data: jeRows, error: jeErr } = await query;
    if (jeErr) throw jeErr;

    const parsed: ParsedJe[] = [];
    for (const je of (jeRows ?? []) as JeRow[]) {
      const p = parseJe(je);
      if (p) parsed.push(p);
    }

    // Group by (orderform, leg)
    type Group = {
      customerQboId: string | null;
      customerName: string;
      legs: {
        SUB: { amounts: number[]; maxPeriod: number; startDate: string | null; jeByPeriod: Map<number, ParsedJe> };
        SVC: { amounts: number[]; maxPeriod: number; startDate: string | null; jeByPeriod: Map<number, ParsedJe> };
      };
    };
    const groups = new Map<string, Group>();
    for (const p of parsed) {
      let g = groups.get(p.orderform);
      if (!g) {
        g = {
          customerQboId: p.customerQboId,
          customerName: p.customerName,
          legs: {
            SUB: { amounts: [], maxPeriod: 0, startDate: null, jeByPeriod: new Map() },
            SVC: { amounts: [], maxPeriod: 0, startDate: null, jeByPeriod: new Map() },
          },
        };
        groups.set(p.orderform, g);
      }
      const leg = g.legs[p.leg];
      leg.amounts.push(p.amount);
      if (p.periodIndex > leg.maxPeriod) leg.maxPeriod = p.periodIndex;
      if (p.periodIndex === 1) leg.startDate = p.txnDate;
      leg.jeByPeriod.set(p.periodIndex, p);
      // prefer first non-null customer
      if (!g.customerQboId && p.customerQboId) {
        g.customerQboId = p.customerQboId;
        g.customerName = p.customerName;
      }
    }

    // Upsert orderforms
    const today = new Date().toISOString().slice(0, 10);
    const orderformRows: Record<string, unknown>[] = [];
    const scheduleRows: Record<string, unknown>[] = [];

    for (const [orderformCode, g] of groups) {
      // Derive combined start_date (earliest across legs)
      const subStart = g.legs.SUB.startDate;
      const svcStart = g.legs.SVC.startDate;
      const startDate = [subStart, svcStart].filter(Boolean).sort()[0];
      if (!startDate) continue;

      const termMonths = Math.max(g.legs.SUB.maxPeriod, g.legs.SVC.maxPeriod);
      const subMonthly = g.legs.SUB.amounts.length > 0 ? median(g.legs.SUB.amounts) : 0;
      const svcMonthly = g.legs.SVC.amounts.length > 0 ? median(g.legs.SVC.amounts) : 0;

      orderformRows.push({
        orderform_code: orderformCode,
        customer_qbo_id: g.customerQboId,
        customer_name: g.customerName,
        start_date: startDate,
        term_months: termMonths,
        sub_monthly: subMonthly,
        svc_monthly: svcMonthly,
        sub_total: subMonthly * g.legs.SUB.maxPeriod,
        svc_total: svcMonthly * g.legs.SVC.maxPeriod,
        status: "active",
      });

      // Build schedule rows for each leg × period
      for (const leg of ["SUB", "SVC"] as const) {
        const legData = g.legs[leg];
        if (legData.maxPeriod === 0) continue;
        const monthly = leg === "SUB" ? subMonthly : svcMonthly;
        const legStart = legData.startDate ?? startDate;

        for (let idx = 1; idx <= legData.maxPeriod; idx++) {
          const { start: periodStart, end: periodEnd } = addMonths(legStart, idx - 1);
          const posted = legData.jeByPeriod.get(idx);

          let status: string;
          let postedAmount: number | null = null;
          let postedJeId: string | null = null;
          let postedTxnDate: string | null = null;

          if (posted) {
            postedAmount = posted.amount;
            postedJeId = posted.jeId;
            postedTxnDate = posted.txnDate;
            status = Math.abs(posted.amount - monthly) <= TOLERANCE
              ? "posted"
              : "mismatched";
          } else {
            status = periodEnd < today ? "missing" : "expected";
          }

          // Filter by fy_code if requested
          const rowFyCode = fyCodeFor(periodStart);
          if (body.fy_code && rowFyCode !== body.fy_code) continue;

          scheduleRows.push({
            fy_code: rowFyCode,
            orderform_code: orderformCode,
            customer_qbo_id: g.customerQboId,
            customer_name: g.customerName,
            leg,
            period_start: periodStart,
            period_end: periodEnd,
            period_index: idx,
            expected_amount: monthly,
            posted_amount: postedAmount,
            posted_je_id: postedJeId,
            posted_je_txn_date: postedTxnDate,
            status,
            last_checked_at: new Date().toISOString(),
          });
        }
      }
    }

    // Upsert orderforms
    if (orderformRows.length > 0) {
      const { error } = await supabase
        .from("orderforms")
        .upsert(orderformRows, { onConflict: "orderform_code" });
      if (error) throw error;
    }

    // Upsert schedule rows in chunks (preserving user notes by omitting them)
    const CHUNK = 200;
    for (let i = 0; i < scheduleRows.length; i += CHUNK) {
      const chunk = scheduleRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("recognition_schedule")
        .upsert(chunk, { onConflict: "orderform_code,leg,period_index" });
      if (error) throw error;
    }

    // Tally by status
    const byStatus: Record<string, number> = {};
    for (const r of scheduleRows) {
      byStatus[r.status as string] = (byStatus[r.status as string] ?? 0) + 1;
    }

    return jsonResponse({
      ok: true,
      fy_code: body.fy_code ?? "all",
      orderforms_processed: orderformRows.length,
      schedule_rows: scheduleRows.length,
      by_status: byStatus,
      je_rows_matched: parsed.length,
    });
  } catch (err) {
    console.error("[fy-build-recognition] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
