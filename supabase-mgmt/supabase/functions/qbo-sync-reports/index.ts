// ---------------------------------------------------------------------------
// QBO Sync Reports — caches P&L, Balance Sheet, Cash Flow snapshots.
//
// POST /qbo-sync-reports
// Body: { reports?: string[], periods?: string[] }
//
// Default: fetches all common reports across standard periods (this month,
// YTD, last month, last quarter, prior year). Upserts into qbo_reports_cache.
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  QboConnection,
  getActiveConnection,
  jsonResponse,
  qboFetch,
  supabaseAdmin,
} from "../_shared/qbo.ts";

type ReportType =
  | "ProfitAndLoss"
  | "BalanceSheet"
  | "CashFlow"
  | "AgedReceivables"
  | "AgedPayables";

const DEFAULT_REPORTS: ReportType[] = [
  "ProfitAndLoss",
  "BalanceSheet",
  "CashFlow",
  "AgedReceivables",
  "AgedPayables",
];

interface Period {
  label: string;
  start?: string;                     // YYYY-MM-DD; omitted for point-in-time reports
  end: string;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Fiscal year configuration. ThinkVAL's FY runs August → July. If this
// changes, update FY_START_MONTH here and in tv-client's ReportsView.tsx.
const FY_START_MONTH = 8; // 1-indexed; August = 8

/** Start date (Aug 1) of the fiscal year containing `date`. */
function fiscalYearStart(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 1-indexed
  const fyYear = m >= FY_START_MONTH ? y : y - 1;
  return new Date(Date.UTC(fyYear, FY_START_MONTH - 1, 1));
}

/** Start date of the fiscal quarter containing `date` (FY-aware quarters). */
function fiscalQuarterStart(date: Date): Date {
  const fyStart = fiscalYearStart(date);
  const monthsSinceFyStart =
    (date.getUTCFullYear() - fyStart.getUTCFullYear()) * 12 +
    (date.getUTCMonth() - fyStart.getUTCMonth());
  const quarterIndex = Math.floor(monthsSinceFyStart / 3);
  return new Date(Date.UTC(fyStart.getUTCFullYear(), fyStart.getUTCMonth() + quarterIndex * 3, 1));
}

function defaultPeriods(): Period[] {
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  const startOfMonth = new Date(Date.UTC(y, m, 1));
  const startOfLastMonth = new Date(Date.UTC(y, m - 1, 1));
  const endOfLastMonth = new Date(Date.UTC(y, m, 0));

  // FY-aware periods
  const fyStart = fiscalYearStart(today);
  const priorFyStart = new Date(Date.UTC(fyStart.getUTCFullYear() - 1, FY_START_MONTH - 1, 1));
  const priorFyEnd = new Date(Date.UTC(fyStart.getUTCFullYear(), FY_START_MONTH - 1, 0));

  const currentQuarterStart = fiscalQuarterStart(today);
  const priorQuarterStart = new Date(Date.UTC(
    currentQuarterStart.getUTCFullYear(),
    currentQuarterStart.getUTCMonth() - 3,
    1,
  ));
  const priorQuarterEnd = new Date(Date.UTC(
    currentQuarterStart.getUTCFullYear(),
    currentQuarterStart.getUTCMonth(),
    0,
  ));

  return [
    { label: "mtd", start: toISODate(startOfMonth), end: toISODate(today) },
    { label: "ytd", start: toISODate(fyStart), end: toISODate(today) },
    { label: "last_month", start: toISODate(startOfLastMonth), end: toISODate(endOfLastMonth) },
    { label: "last_quarter", start: toISODate(priorQuarterStart), end: toISODate(priorQuarterEnd) },
    { label: "prior_year", start: toISODate(priorFyStart), end: toISODate(priorFyEnd) },
  ];
}

// Balance sheet and Aged reports are point-in-time — ignore `start`.
function isPointInTime(reportType: ReportType): boolean {
  return (
    reportType === "BalanceSheet" ||
    reportType === "AgedReceivables" ||
    reportType === "AgedPayables"
  );
}

async function fetchReport(
  conn: QboConnection,
  reportType: ReportType,
  period: Period,
): Promise<any> {
  const query: Record<string, string> = {
    accounting_method: "Accrual",
  };
  if (reportType === "BalanceSheet") {
    // QBO falls back to "this fiscal year-to-date" unless BOTH start_date
    // and end_date are set. start_date is effectively ignored for BS
    // (point-in-time), but is required to force the custom range.
    query.start_date = period.start ?? "2020-01-01";
    query.end_date = period.end;
  } else if (isPointInTime(reportType)) {
    // AgedReceivables / AgedPayables use `report_date`.
    query.report_date = period.end;
  } else if (period.start) {
    query.start_date = period.start;
    query.end_date = period.end;
  }
  return await qboFetch(conn, `reports/${reportType}`, { query });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const reports: ReportType[] = body.reports ?? DEFAULT_REPORTS;
    const usingDefaults = !body.periods;
    const periods: Period[] = body.periods ?? defaultPeriods();

    const supabase = supabaseAdmin();
    const conn = await getActiveConnection(supabase);

    const summary: Record<string, any> = {};

    for (const reportType of reports) {
      summary[reportType] = {};
      for (const period of periods) {
        // Only apply point-in-time dedup when using default periods — when a
        // caller passes custom periods they explicitly want those snapshots.
        if (
          usingDefaults &&
          isPointInTime(reportType) &&
          period.label !== "mtd" &&
          period.label !== "last_month" &&
          period.label !== "prior_year"
        ) {
          continue;
        }

        try {
          const data = await fetchReport(conn, reportType, period);
          const { error } = await supabase
            .from("qbo_reports_cache")
            .upsert(
              {
                report_type: reportType,
                period_start: isPointInTime(reportType) ? null : period.start,
                period_end: period.end,
                params: { accounting_method: "Accrual", label: period.label },
                data,
                generated_at: new Date().toISOString(),
              },
              { onConflict: "report_type,period_start,period_end,params" },
            );
          if (error) throw error;
          summary[reportType][period.label] = "ok";
        } catch (err) {
          summary[reportType][period.label] =
            `failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }

    return jsonResponse({ ok: true, summary });
  } catch (err) {
    console.error("[qbo-sync-reports] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
