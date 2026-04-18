// ---------------------------------------------------------------------------
// FY Capture Snapshot — per-month P&L + BS snapshots into fy_snapshots
//
// POST /fy-capture-snapshot
// Body: { fy_code: "FY2024", period_start?: "2024-07-01" }
//   - period_start omitted → capture all 12 months of the FY
//
// For each month: fetch P&L (start_date..end_date) and BS (as-of end_date),
// parse the report rows into account-level amounts, and insert:
//   * one fy_snapshots row (granularity='month', source='qbo', append-only)
//   * one fy_snapshot_lines row per leaf account
//
// BS as-of date REQUIRES both start_date and end_date on the QBO request —
// without start_date QBO silently returns "this fiscal year-to-date".
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  QboConnection,
  getActiveConnection,
  jsonResponse,
  qboFetch,
  supabaseAdmin,
} from "../_shared/qbo.ts";

const FY_START_MONTH = 8; // ThinkVAL FY = Aug → Jul

interface Body {
  fy_code?: string;
  period_start?: string;
}

interface Month {
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  period_label: string; // 'Aug-2023'
}

function parseFyCode(code: string): number {
  const m = code.match(/^FY(\d{4})$/);
  if (!m) throw new Error(`invalid fy_code: ${code}`);
  return parseInt(m[1], 10);
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
    .replace(" ", "-");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fyMonths(fyCode: string): Month[] {
  const fyEndYear = parseFyCode(fyCode);
  const months: Month[] = [];
  for (let i = 0; i < 12; i++) {
    const monthIdx = (FY_START_MONTH - 1 + i) % 12; // 0-indexed
    const yearOffset = (FY_START_MONTH - 1 + i) >= 12 ? 0 : -1;
    const year = fyEndYear + yearOffset;
    const start = new Date(Date.UTC(year, monthIdx, 1));
    const end = new Date(Date.UTC(year, monthIdx + 1, 0));
    months.push({
      period_start: isoDate(start),
      period_end: isoDate(end),
      period_label: monthLabel(start),
    });
  }
  return months;
}

// Walk a QBO report tree and collect leaf-level account rows.
// Returns array of { accountQboId, accountName, amount }.
interface LeafRow {
  accountQboId: string | null;
  accountName: string;
  amount: number;
}

function walkReportRows(node: unknown, collected: LeafRow[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;

  // Leaf data row
  if (n.type === "Data" && Array.isArray(n.ColData)) {
    const cols = n.ColData as Array<Record<string, unknown>>;
    const first = cols[0] ?? {};
    const last = cols[cols.length - 1] ?? {};
    const rawAmount = (last.value as string | undefined) ?? "";
    const amount = parseFloat(rawAmount);
    if (!Number.isNaN(amount)) {
      collected.push({
        accountQboId: (first.id as string | undefined) ?? null,
        accountName: (first.value as string | undefined) ?? "",
        amount,
      });
    }
    return;
  }

  // Section or container with nested Rows.Row[]
  const rows = (n.Rows as { Row?: unknown[] } | undefined)?.Row;
  if (Array.isArray(rows)) {
    for (const child of rows) walkReportRows(child, collected);
  }

  // Top-level: data has { Rows: { Row: [...] } }
  if (Array.isArray(n.Row)) {
    for (const child of n.Row) walkReportRows(child, collected);
  }
}

async function fetchPnl(conn: QboConnection, m: Month): Promise<unknown> {
  return await qboFetch(conn, "reports/ProfitAndLoss", {
    query: {
      accounting_method: "Accrual",
      start_date: m.period_start,
      end_date: m.period_end,
    },
  });
}

async function fetchBs(conn: QboConnection, m: Month): Promise<unknown> {
  return await qboFetch(conn, "reports/BalanceSheet", {
    query: {
      accounting_method: "Accrual",
      start_date: "2020-01-01", // required to prevent fallback to "this FYTD"
      end_date: m.period_end,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body: Body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};
    if (!body.fy_code) {
      return jsonResponse({ error: "fy_code required" }, 400);
    }

    const allMonths = fyMonths(body.fy_code);
    const months = body.period_start
      ? allMonths.filter((m) => m.period_start === body.period_start)
      : allMonths;
    if (months.length === 0) {
      return jsonResponse({ error: "no months in scope" }, 400);
    }

    const supabase = supabaseAdmin();
    const conn = await getActiveConnection(supabase);

    // Preload the fs_mapping once.
    const { data: mappingRows, error: mapErr } = await supabase
      .from("fy_fs_mapping")
      .select("account_qbo_id, fs_line");
    if (mapErr) throw mapErr;
    const fsLineByAccount = new Map<string, string>();
    for (const r of mappingRows ?? []) {
      fsLineByAccount.set(r.account_qbo_id, r.fs_line);
    }

    const summary = {
      fy_code: body.fy_code,
      months_captured: 0,
      lines_inserted: 0,
      unmapped_accounts: new Set<string>(),
      errors: [] as string[],
    };

    for (const m of months) {
      try {
        const [pnl, bs] = await Promise.all([
          fetchPnl(conn, m),
          fetchBs(conn, m),
        ]);

        const pnlLeaves: LeafRow[] = [];
        walkReportRows((pnl as Record<string, unknown>).Rows, pnlLeaves);
        const bsLeaves: LeafRow[] = [];
        walkReportRows((bs as Record<string, unknown>).Rows, bsLeaves);

        const { data: snapshotRow, error: snapErr } = await supabase
          .from("fy_snapshots")
          .insert({
            fy_code: body.fy_code,
            period_start: m.period_start,
            period_end: m.period_end,
            period_label: m.period_label,
            granularity: "month",
            source: "qbo",
            is_baseline: false,
            captured_by: "fy-capture-snapshot",
          })
          .select("id")
          .single();
        if (snapErr) throw snapErr;

        const lines: Record<string, unknown>[] = [];

        for (const l of pnlLeaves) {
          const fsLine = l.accountQboId ? fsLineByAccount.get(l.accountQboId) : null;
          if (l.accountQboId && !fsLine) summary.unmapped_accounts.add(l.accountQboId);
          lines.push({
            snapshot_id: snapshotRow.id,
            account_qbo_id: l.accountQboId,
            account_name: l.accountName,
            account_type: "pnl",
            fs_line: fsLine ?? null,
            movement: l.amount,
            balance: null,
          });
        }

        for (const l of bsLeaves) {
          const fsLine = l.accountQboId ? fsLineByAccount.get(l.accountQboId) : null;
          if (l.accountQboId && !fsLine) summary.unmapped_accounts.add(l.accountQboId);
          lines.push({
            snapshot_id: snapshotRow.id,
            account_qbo_id: l.accountQboId,
            account_name: l.accountName,
            account_type: "bs",
            fs_line: fsLine ?? null,
            movement: null,
            balance: l.amount,
          });
        }

        // Insert in chunks to avoid oversized payloads
        const CHUNK = 200;
        for (let i = 0; i < lines.length; i += CHUNK) {
          const { error } = await supabase
            .from("fy_snapshot_lines")
            .insert(lines.slice(i, i + CHUNK));
          if (error) throw error;
        }

        summary.months_captured += 1;
        summary.lines_inserted += lines.length;
      } catch (err) {
        summary.errors.push(
          `${m.period_label}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return jsonResponse({
      ok: summary.errors.length === 0,
      ...summary,
      unmapped_accounts: Array.from(summary.unmapped_accounts),
    });
  } catch (err) {
    console.error("[fy-capture-snapshot] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
