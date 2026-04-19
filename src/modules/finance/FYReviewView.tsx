// FY Review — month-by-month account hygiene for a fiscal year.
//
// Three sub-tabs:
//   * Monthly P&L   — 12-column grid of movements grouped by fs_line
//   * Monthly BS    — 12-column grid of month-end balances
//   * Recognition   — per-customer recognition status + per-orderform detail
//
// Data comes from fy_snapshots / fy_snapshot_lines / fy_fs_mapping /
// recognition_schedule / orderforms in the mgmt workspace. Append-only —
// each capture inserts fresh snapshot rows; UI uses latest per month.

import { Fragment, useMemo, useState } from "react";
import {
  useAcknowledgeDriftAlert,
  useFsMapping,
  useFyBuildRecognition,
  useFyCaptureSnapshot,
  useFyDriftAlerts,
  useFyReconciliation,
  useFySnapshotLines,
  useFyWatchdogRun,
  useLatestSnapshotsByMonth,
  useRecognitionSchedule,
  useUpdateReconciliation,
  type DriftAlert,
  type FsMapping,
  type FySnapshot,
  type FySnapshotLine,
  type Reconciliation,
  type RecognitionRow,
} from "../../hooks/finance/useFyReview";
import { formatMoney } from "./formatters";
import { cn } from "../../lib/cn";

type SubTab = "pnl" | "bs" | "recognition" | "reconciliation";

const FY_OPTIONS = ["FY2024", "FY2025", "FY2026"];

export function FYReviewView() {
  const [fyCode, setFyCode] = useState("FY2024");
  const [subTab, setSubTab] = useState<SubTab>("pnl");

  const capture = useFyCaptureSnapshot();
  const build = useFyBuildRecognition();
  const watchdog = useFyWatchdogRun();
  const openAlerts = useFyDriftAlerts(fyCode, "open");
  const [showAlerts, setShowAlerts] = useState(false);

  return (
    <div className="space-y-5">
      {/* Header — FY picker + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-zinc-500">Fiscal year</label>
          <select
            value={fyCode}
            onChange={(e) => setFyCode(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          >
            {FY_OPTIONS.map((fy) => (
              <option key={fy}>{fy}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => capture.mutate({ fy_code: fyCode })}
            disabled={capture.isPending}
            className="text-xs px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
          >
            {capture.isPending ? "Capturing…" : "Capture snapshot"}
          </button>
          <button
            onClick={() => build.mutate({ fy_code: fyCode })}
            disabled={build.isPending}
            className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {build.isPending ? "Building…" : "Rebuild recognition"}
          </button>
          <button
            onClick={() => watchdog.mutate({ fy_code: fyCode })}
            disabled={watchdog.isPending}
            className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            title="Re-capture + diff against prior snapshots. Alerts any drifted closed-period lines."
          >
            {watchdog.isPending ? "Running…" : "Run watchdog"}
          </button>
        </div>
      </div>

      {/* Drift alert banner */}
      {(openAlerts.data?.length ?? 0) > 0 && (
        <DriftAlertBanner
          count={openAlerts.data!.length}
          expanded={showAlerts}
          onToggle={() => setShowAlerts((s) => !s)}
          alerts={openAlerts.data!}
        />
      )}

      {/* Sub-tab switcher */}
      <nav className="flex gap-0.5 border-b border-zinc-200 dark:border-zinc-800">
        {([
          { id: "pnl", label: "Monthly P&L" },
          { id: "bs", label: "Monthly BS" },
          { id: "recognition", label: "Recognition" },
          { id: "reconciliation", label: "Reconciliation" },
        ] as { id: SubTab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              subTab === t.id
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Action result banner */}
      {capture.data ? (
        <div className="text-xs p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
          Capture: {capture.data.months_captured ?? 0} months, {capture.data.lines_inserted ?? 0} lines
          {capture.data.unmapped_accounts?.length
            ? ` — ${capture.data.unmapped_accounts.length} unmapped accounts`
            : ""}
        </div>
      ) : null}
      {build.data ? (
        <div className="text-xs p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
          Recognition: {build.data.orderforms_processed ?? 0} orderforms, {build.data.schedule_rows ?? 0} rows
          {build.data.by_status
            ? ` — posted ${build.data.by_status.posted ?? 0}, missing ${build.data.by_status.missing ?? 0}, mismatched ${build.data.by_status.mismatched ?? 0}`
            : ""}
        </div>
      ) : null}

      {/* Body */}
      {subTab === "pnl" && <MonthlyGrid fyCode={fyCode} statement="pnl" />}
      {subTab === "bs" && <MonthlyGrid fyCode={fyCode} statement="bs" />}
      {subTab === "recognition" && <RecognitionBoard fyCode={fyCode} />}
      {subTab === "reconciliation" && <ReconciliationView fyCode={fyCode} />}
    </div>
  );
}

// ─── Monthly grid ────────────────────────────────────────────────────────

interface GridProps {
  fyCode: string;
  statement: "pnl" | "bs";
}

const REVENUE_DRILLDOWN_LEGS: Record<string, "SUB" | "SVC"> = {
  "pnl.revenue.subscription": "SUB",
  "pnl.revenue.service_fee": "SVC",
};

function MonthlyGrid({ fyCode, statement }: GridProps) {
  const { latest, isLoading: snapsLoading } = useLatestSnapshotsByMonth(fyCode, "qbo");
  const snapshotIds = latest.map((s) => s.id);
  const { data: lines, isLoading: linesLoading } = useFySnapshotLines(snapshotIds);
  const { data: mapping } = useFsMapping();
  const { data: recognition } = useRecognitionSchedule(statement === "pnl" ? fyCode : "__none__");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (fsLine: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fsLine)) next.delete(fsLine);
      else next.add(fsLine);
      return next;
    });
  };

  const { months, monthStarts, rows } = useMemo(
    () => buildGrid(latest, lines ?? [], mapping ?? [], statement),
    [latest, lines, mapping, statement],
  );

  // Pivot recognition schedule by (leg → orderform → month_start → posted_amount)
  const breakdownByLeg = useMemo(() => {
    const map = new Map<"SUB" | "SVC", OrderformMonthlyRow[]>();
    if (!recognition) return map;
    const indexByLegOrderform = new Map<string, OrderformMonthlyRow>();
    for (const r of recognition) {
      const key = `${r.leg}|${r.orderform_code}`;
      if (!indexByLegOrderform.has(key)) {
        indexByLegOrderform.set(key, {
          orderform_code: r.orderform_code,
          customer_name: r.customer_name,
          leg: r.leg,
          byMonth: new Map<string, { posted: number | null; expected: number; status: RecognitionRow["status"] }>(),
          total: 0,
        });
      }
      const entry = indexByLegOrderform.get(key)!;
      const amount = r.posted_amount ?? 0;
      entry.byMonth.set(r.period_start, {
        posted: r.posted_amount,
        expected: r.expected_amount,
        status: r.status,
      });
      entry.total += amount;
    }
    for (const entry of indexByLegOrderform.values()) {
      if (!map.has(entry.leg)) map.set(entry.leg, []);
      map.get(entry.leg)!.push(entry);
    }
    // Sort each leg by customer name for readability
    for (const list of map.values()) {
      list.sort((a, b) => a.customer_name.localeCompare(b.customer_name) || a.orderform_code.localeCompare(b.orderform_code));
    }
    return map;
  }, [recognition]);

  if (snapsLoading || linesLoading) {
    return <div className="text-sm text-zinc-500">Loading snapshot data…</div>;
  }

  if (latest.length === 0) {
    return (
      <div className="text-sm text-zinc-500 p-6 text-center border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md">
        No captured snapshots yet for {fyCode}. Click <span className="font-medium">Capture snapshot</span> to start.
      </div>
    );
  }

  const sections = Array.from(new Set(rows.map((r) => r.section)));

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <table className="text-xs min-w-full border-collapse">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
            <th className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-left font-medium text-zinc-500 min-w-[260px]">
              FS Line
            </th>
            {months.map((m) => (
              <th key={m} className="px-3 py-2 text-right font-medium text-zinc-500 min-w-[90px]">
                {m}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium text-zinc-500 min-w-[110px] bg-zinc-100 dark:bg-zinc-800">
              FY Total
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <GridSection
              key={section}
              section={section}
              rows={rows.filter((r) => r.section === section)}
              months={months}
              monthStarts={monthStarts}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              breakdownByLeg={breakdownByLeg}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface OrderformMonthlyRow {
  orderform_code: string;
  customer_name: string;
  leg: "SUB" | "SVC";
  byMonth: Map<string, { posted: number | null; expected: number; status: RecognitionRow["status"] }>;
  total: number;
}

interface GridRow {
  fs_line: string;
  label: string;
  section: string;
  values: number[];
  total: number;
}

function buildGrid(
  snapshots: FySnapshot[],
  lines: FySnapshotLine[],
  mapping: FsMapping[],
  statement: "pnl" | "bs",
): { months: string[]; monthStarts: string[]; rows: GridRow[] } {
  // month label, ordered by period_start
  const months = snapshots.map((s) => s.period_label);
  const monthStarts = snapshots.map((s) => s.period_start);
  const monthBySnapshotId = new Map<string, string>(
    snapshots.map((s) => [s.id, s.period_label]),
  );

  // fs_line metadata — section here is the *display* section (QBO-style grouping).
  const meta = new Map<string, { label: string; section: string; order: number }>();
  for (const m of mapping) {
    if (!meta.has(m.fs_line)) {
      meta.set(m.fs_line, {
        label: fsLineDisplayLabel(m.fs_line),
        section: displaySection(m.fs_section),
        order: m.display_order,
      });
    }
  }
  // Ensure our synthetic fs_lines (e.g. pnl.finance_cost, pnl.net_profit) have meta.
  for (const [fsLine, label] of Object.entries(FS_LINE_LABELS)) {
    if (!meta.has(fsLine)) {
      // Infer section from prefix
      const guessSection = fsLine.startsWith("pnl.revenue") ? "pnl.revenue"
        : fsLine.startsWith("pnl.cogs") ? "pnl.cogs"
        : fsLine.startsWith("pnl.other_income") ? "pnl.other_revenue"
        : fsLine.startsWith("pnl.other_expense") ? "pnl.other_expenses"
        : fsLine.startsWith("pnl.finance_cost") || fsLine.startsWith("pnl.opex") ? "pnl.expenses"
        : fsLine.startsWith("bs.") ? fsLine.split(".").slice(0, 2).join(".")
        : "pnl.unmapped";
      meta.set(fsLine, { label, section: guessSection, order: 999 });
    }
  }

  // Aggregate by fs_line × month_label
  const agg = new Map<string, Map<string, number>>();
  for (const l of lines) {
    if (l.account_type !== statement) continue;
    const fsLine = l.fs_line ?? "unmapped";
    const month = monthBySnapshotId.get(l.snapshot_id) ?? "";
    if (!month) continue;
    const amount = statement === "pnl" ? l.movement : l.balance;
    if (amount == null) continue;
    if (!agg.has(fsLine)) agg.set(fsLine, new Map());
    const byMonth = agg.get(fsLine)!;
    byMonth.set(month, (byMonth.get(month) ?? 0) + amount);
  }

  const rows: GridRow[] = [];
  for (const [fsLine, byMonth] of agg) {
    const m = meta.get(fsLine) ?? {
      label: fsLineDisplayLabel(fsLine),
      section: statement === "pnl" ? "pnl.unmapped" : "bs.unmapped",
      order: 999,
    };
    const values = months.map((mo) => byMonth.get(mo) ?? 0);
    const total = values.reduce((a, b) => a + b, 0);
    rows.push({ fs_line: fsLine, label: m.label, section: m.section, values, total });
  }

  rows.sort((a, b) => {
    const sa = sectionOrder(a.section);
    const sb = sectionOrder(b.section);
    if (sa !== sb) return sa - sb;
    // Expenses section sorts alphabetically by display label (QBO style).
    if (a.section === "pnl.expenses") return a.label.localeCompare(b.label);
    // Everything else: follow fs_fs_mapping display_order, then label as tiebreak.
    const oa = meta.get(a.fs_line)?.order ?? 999;
    const ob = meta.get(b.fs_line)?.order ?? 999;
    if (oa !== ob) return oa - ob;
    return a.label.localeCompare(b.label);
  });

  return { months, monthStarts, rows };
}

function fsLineLabel(fsLine: string): string {
  const leaf = fsLine.split(".").pop() ?? fsLine;
  return leaf
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// QBO-style P&L sequence:
//   Revenue → Cost of Sales → Other Revenue → Expenses → Other Expenses
// The underlying fs_section values still split OpEx (salary / admin / finance_cost)
// for flexibility, but the grid collapses them into a single "Expenses" block
// sorted alphabetically by line label — matching the QBO P&L report.
function displaySection(fs_section: string): string {
  if (fs_section === "pnl.opex.salary" || fs_section === "pnl.opex.admin" || fs_section === "pnl.finance_cost") {
    return "pnl.expenses";
  }
  if (fs_section === "pnl.other_income") return "pnl.other_revenue";
  if (fs_section === "pnl.other_expense") return "pnl.other_expenses";
  return fs_section;
}

const SECTION_ORDER: Record<string, number> = {
  // P&L (QBO style)
  "pnl.revenue": 10,
  "pnl.cogs": 20,
  "pnl.other_revenue": 30,
  "pnl.expenses": 40,
  "pnl.other_expenses": 50,
  "pnl.unmapped": 99,
  // BS (statutory order)
  "bs.noncurrent_assets": 110,
  "bs.current_assets": 120,
  "bs.equity": 130,
  "bs.noncurrent_liabilities": 140,
  "bs.current_liabilities": 150,
  "bs.unmapped": 199,
};

function sectionOrder(section: string): number {
  return SECTION_ORDER[section] ?? 999;
}

function sectionLabel(section: string): string {
  const map: Record<string, string> = {
    "pnl.revenue": "Revenue",
    "pnl.cogs": "Cost of Sales",
    "pnl.other_revenue": "Other Revenue",
    "pnl.expenses": "Expenses",
    "pnl.other_expenses": "Other Expenses",
    "bs.current_assets": "Current assets",
    "bs.noncurrent_assets": "Non-current assets",
    "bs.current_liabilities": "Current liabilities",
    "bs.noncurrent_liabilities": "Non-current liabilities",
    "bs.equity": "Equity",
  };
  return map[section] ?? section;
}

// Display labels for specific fs_lines — matches QBO P&L report nomenclature.
// Fall back to title-cased leaf if not listed.
const FS_LINE_LABELS: Record<string, string> = {
  // Revenue
  "pnl.revenue.subscription": "Sales of Product Subscription Revenue",
  "pnl.revenue.service_fee": "Service/Fee Revenue",
  "pnl.revenue.other": "Other Revenue",
  "pnl.revenue.discounts": "Discounts / Refunds",
  // Cost of Sales
  "pnl.cogs.cloud_infra": "Cloud Infrastructure",
  "pnl.cogs.payroll_cs": "COGS Payroll - Customer Success",
  "pnl.cogs.payroll_cc": "COGS Payroll - Customer Support",
  "pnl.cogs.payroll_ps": "COGS Payroll - Professional Services",
  "pnl.cogs.software": "COGS Software Subscription",
  "pnl.cogs.subcontractors": "COGS Subcontractors",
  "pnl.cogs.travel": "COGS Travel & Entertainment",
  "pnl.cogs.other": "Other COGS",
  // Other Revenue
  "pnl.other_income.grant": "Govt Rebate/Subsidies",
  "pnl.other_income.interest": "Interest Income",
  "pnl.other_income.intercompany": "Intercompany Income",
  "pnl.other_income.other": "Bank Rebate / Other Income",
  // Expenses — salary
  "pnl.opex.salary_directors": "Directors Payroll",
  "pnl.opex.salary_sales": "Sales Payroll",
  "pnl.opex.salary_marketing": "Marketing Payroll",
  "pnl.opex.salary_rd": "R&D Payroll",
  "pnl.opex.salary_ga": "G&A Payroll",
  "pnl.opex.salary_intern": "Intern",
  "pnl.opex.salary_other": "Other Payroll",
  // Expenses — admin
  "pnl.opex.bank_charges": "Bank charges",
  "pnl.opex.rent_utilities": "Rent & Utilities",
  "pnl.opex.software": "Software Subscription",
  "pnl.opex.subcontractors_sales": "Sales Subcontractors",
  "pnl.opex.subcontractors_marketing": "Marketing Subcontractors",
  "pnl.opex.subcontractors_rd": "R&D Subcontractors",
  "pnl.opex.subcontractors_ga": "G&A Subcontractors",
  "pnl.opex.professional_fees": "Professional Services",
  "pnl.opex.licenses": "Licenses, Fees & Insurance",
  "pnl.opex.office": "Office Expenses",
  "pnl.opex.memberships": "Memberships",
  "pnl.opex.marketing_ads": "Marketing Ads",
  "pnl.opex.advertising": "Advertising",
  "pnl.opex.events": "Events",
  "pnl.opex.promotions": "Promotions",
  "pnl.opex.other_marketing": "Other Marketing Expense",
  "pnl.opex.travel_sales": "Sales Travel & Entertainment",
  "pnl.opex.travel_ga": "G&A Meals, Travel & Entertainment",
  "pnl.opex.auto": "Automobile Expenses",
  "pnl.opex.bad_debt": "Bad Debt Expense",
  "pnl.opex.other_employee": "Other Employee Expenses",
  "pnl.opex.rm": "Repair and maintenance",
  "pnl.opex.purchases": "Purchases",
  "pnl.opex.gst_expense": "GST Expense",
  "pnl.opex.other_ga": "Other G&A Expense",
  "pnl.opex.other_product_dev": "Other Product Development Expense",
  "pnl.opex.other_sales": "Other Sales Expense",
  "pnl.opex.uncategorised": "Uncategorised",
  "pnl.finance_cost": "Interest paid",
  // Other Expenses
  "pnl.other_expense.dep_amort": "Depreciation & Amortization",
  "pnl.other_expense.tax": "Taxes",
  "pnl.other_expense.fx": "Exchange Gain or Loss",
  "pnl.other_expense.intercompany": "Intercompany Expense",
  "pnl.other_expense.other": "Other Expense",
  // Net profit (FS baseline only)
  "pnl.net_profit": "Profit/Loss",
};

function fsLineDisplayLabel(fs_line: string): string {
  const explicit = FS_LINE_LABELS[fs_line];
  if (explicit) return explicit;
  return fsLineLabel(fs_line);
}

function GridSection({
  section,
  rows,
  months,
  monthStarts,
  expanded,
  onToggleExpand,
  breakdownByLeg,
}: {
  section: string;
  rows: GridRow[];
  months: string[];
  monthStarts: string[];
  expanded: Set<string>;
  onToggleExpand: (fsLine: string) => void;
  breakdownByLeg: Map<"SUB" | "SVC", OrderformMonthlyRow[]>;
}) {
  if (rows.length === 0) return null;
  const totals = months.map((_, i) => rows.reduce((a, r) => a + (r.values[i] ?? 0), 0));
  const grandTotal = totals.reduce((a, b) => a + b, 0);
  return (
    <>
      <tr className="bg-zinc-100 dark:bg-zinc-800">
        <td className="sticky left-0 z-10 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800">
          {sectionLabel(section)}
        </td>
        {months.map((_, i) => (
          <td key={i} className="bg-zinc-100 dark:bg-zinc-800" />
        ))}
        <td className="bg-zinc-100 dark:bg-zinc-800" />
      </tr>
      {rows.map((r) => {
        const leg = REVENUE_DRILLDOWN_LEGS[r.fs_line];
        const isExpanded = leg ? expanded.has(r.fs_line) : false;
        return (
          <Fragment key={r.fs_line}>
            <tr
              className={cn(
                "border-b border-zinc-100 dark:border-zinc-900",
                leg
                  ? "hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-950",
              )}
              onClick={leg ? () => onToggleExpand(r.fs_line) : undefined}
              title={leg ? (isExpanded ? "Click to collapse" : "Click to drill into orderforms") : undefined}
            >
              <td className="sticky left-0 z-10 pl-8 pr-3 py-1.5 text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900">
                {leg && (
                  <span className="inline-block w-3 text-zinc-500 mr-1 select-none">
                    {isExpanded ? "▾" : "▸"}
                  </span>
                )}
                {r.label}
              </td>
              {r.values.map((v, i) => (
                <td key={i} className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                  {v === 0 ? "—" : formatNum(v)}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-950">
                {formatMoney(r.total)}
              </td>
            </tr>
            {leg && isExpanded && breakdownByLeg.get(leg)?.map((ofRow) => (
              <BreakdownRow
                key={`${r.fs_line}-${ofRow.orderform_code}`}
                row={ofRow}
                monthStarts={monthStarts}
              />
            ))}
          </Fragment>
        );
      })}
      <tr className="border-b border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 font-medium">
        <td className="sticky left-0 z-10 pl-5 pr-3 py-1.5 text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-950">
          Total for {sectionLabel(section)}
        </td>
        {totals.map((v, i) => (
          <td key={i} className="px-3 py-1.5 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
            {v === 0 ? "—" : formatNum(v)}
          </td>
        ))}
        <td className="px-3 py-1.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800">
          {formatMoney(grandTotal)}
        </td>
      </tr>
    </>
  );
}

// ─── Revenue drilldown rows ──────────────────────────────────────────────

function BreakdownRow({
  row,
  monthStarts,
}: {
  row: OrderformMonthlyRow;
  monthStarts: string[];
}) {
  const monthValues = monthStarts.map((ms) => {
    const cell = row.byMonth.get(ms);
    // Only show actual posted amounts. Missing / expected cells render empty
    // so the grid reads as "what was actually posted" and nothing else.
    return {
      amount: cell?.posted ?? 0,
      status: cell?.status,
    };
  });
  const total = monthValues.reduce((a, b) => a + b.amount, 0);
  return (
    <tr className="border-b border-emerald-100 dark:border-emerald-950 bg-emerald-50/40 dark:bg-emerald-950/20">
      <td className="sticky left-0 z-10 pl-14 pr-3 py-1 text-[11px] text-zinc-600 dark:text-zinc-400 bg-emerald-50/60 dark:bg-emerald-950/30">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{row.orderform_code}</span>
        <span className="text-zinc-500"> · {row.customer_name}</span>
      </td>
      {monthValues.map((cell, i) => (
        <td
          key={i}
          className="px-3 py-1 text-right tabular-nums text-[11px] text-zinc-600 dark:text-zinc-400"
        >
          {cell.amount === 0 ? "—" : formatNum(cell.amount)}
        </td>
      ))}
      <td className="px-3 py-1 text-right tabular-nums text-[11px] font-medium text-zinc-700 dark:text-zinc-300 bg-emerald-100/50 dark:bg-emerald-900/30">
        {formatMoney(total)}
      </td>
    </tr>
  );
}

function formatNum(v: number): string {
  return new Intl.NumberFormat("en-SG", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(v);
}

// ─── Recognition board ────────────────────────────────────────────────────

function RecognitionBoard({ fyCode }: { fyCode: string }) {
  const { data: rows, isLoading } = useRecognitionSchedule(fyCode);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const summary = useMemo(() => buildRecognitionSummary(rows ?? []), [rows]);

  if (isLoading) {
    return <div className="text-sm text-zinc-500">Loading recognition data…</div>;
  }

  if ((rows ?? []).length === 0) {
    return (
      <div className="text-sm text-zinc-500 p-6 text-center border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md">
        No recognition data for {fyCode}. Click <span className="font-medium">Rebuild recognition</span> to populate.
      </div>
    );
  }

  const totals = {
    posted: summary.reduce((a, c) => a + c.posted, 0),
    missing: summary.reduce((a, c) => a + c.missing, 0),
    mismatched: summary.reduce((a, c) => a + c.mismatched, 0),
    total: rows?.length ?? 0,
  };

  const detailRows = selectedCustomer
    ? (rows ?? []).filter((r) => (r.customer_qbo_id ?? "") === selectedCustomer)
    : [];

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Posted" value={totals.posted} tone="ok" />
        <Stat label="Missing" value={totals.missing} tone={totals.missing > 0 ? "bad" : "ok"} />
        <Stat label="Mismatched" value={totals.mismatched} tone={totals.mismatched > 0 ? "warn" : "ok"} />
        <Stat label="Total rows" value={totals.total} tone="neutral" />
      </div>

      <div className="grid grid-cols-[360px_1fr] gap-4">
        {/* Customer list */}
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-3 py-2 text-xs font-medium text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
            Customers ({summary.length}) — click to drill
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
            {summary.map((c) => (
              <button
                key={c.customer_qbo_id}
                onClick={() => setSelectedCustomer(c.customer_qbo_id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-950",
                  selectedCustomer === c.customer_qbo_id && "bg-emerald-50 dark:bg-emerald-950/50",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-zinc-800 dark:text-zinc-200">
                    {c.customer_name || "(no customer)"}
                  </div>
                  <div className="text-zinc-500 text-[11px]">
                    {c.orderforms.size} orderform{c.orderforms.size === 1 ? "" : "s"} · {c.total} rows
                  </div>
                </div>
                <div className="flex gap-1 text-[10px] tabular-nums">
                  {c.missing > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                      {c.missing} miss
                    </span>
                  )}
                  {c.mismatched > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                      {c.mismatched} mis
                    </span>
                  )}
                  {c.missing === 0 && c.mismatched === 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      ✓
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail pane */}
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          {selectedCustomer ? (
            <RecognitionDetail rows={detailRows} />
          ) : (
            <div className="p-6 text-sm text-zinc-500 text-center">
              Select a customer to see their recognition schedule.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CustomerSummary {
  customer_qbo_id: string;
  customer_name: string;
  orderforms: Set<string>;
  total: number;
  posted: number;
  missing: number;
  mismatched: number;
  expected: number;
}

function buildRecognitionSummary(rows: RecognitionRow[]): CustomerSummary[] {
  const m = new Map<string, CustomerSummary>();
  for (const r of rows) {
    const key = r.customer_qbo_id ?? "";
    if (!m.has(key)) {
      m.set(key, {
        customer_qbo_id: key,
        customer_name: r.customer_name,
        orderforms: new Set(),
        total: 0,
        posted: 0,
        missing: 0,
        mismatched: 0,
        expected: 0,
      });
    }
    const c = m.get(key)!;
    c.orderforms.add(r.orderform_code);
    c.total += 1;
    if (r.status === "posted") c.posted += 1;
    else if (r.status === "missing") c.missing += 1;
    else if (r.status === "mismatched") c.mismatched += 1;
    else if (r.status === "expected") c.expected += 1;
  }
  return Array.from(m.values()).sort(
    (a, b) => (b.missing + b.mismatched) - (a.missing + a.mismatched),
  );
}

function RecognitionDetail({ rows }: { rows: RecognitionRow[] }) {
  // Group by orderform_code, split by leg
  const byOrderform = new Map<string, RecognitionRow[]>();
  for (const r of rows) {
    if (!byOrderform.has(r.orderform_code)) byOrderform.set(r.orderform_code, []);
    byOrderform.get(r.orderform_code)!.push(r);
  }

  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-[700px] overflow-y-auto">
      {Array.from(byOrderform.entries()).map(([of, ofRows]) => {
        const legs = { SUB: [] as RecognitionRow[], SVC: [] as RecognitionRow[] };
        for (const r of ofRows) legs[r.leg].push(r);
        const sorted = (list: RecognitionRow[]) => list.sort((a, b) => a.period_index - b.period_index);

        const firstRow = ofRows[0];
        const term = Math.max(...ofRows.map((r) => r.period_index));
        const subMonthly = legs.SUB[0]?.expected_amount ?? 0;
        const svcMonthly = legs.SVC[0]?.expected_amount ?? 0;
        const issues = ofRows.filter((r) => r.status === "missing" || r.status === "mismatched").length;

        return (
          <div key={of} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                Orderform {of}
              </div>
              <div className="text-[11px] text-zinc-500">
                {firstRow.customer_name} · term {term}m · SUB {formatMoney(subMonthly)}/mo · SVC {formatMoney(svcMonthly)}/mo
                {issues > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                    {issues} issue{issues === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
            {legs.SUB.length > 0 && <LegRow label="SUB" rows={sorted(legs.SUB)} />}
            {legs.SVC.length > 0 && <LegRow label="SVC" rows={sorted(legs.SVC)} />}
          </div>
        );
      })}
    </div>
  );
}

function LegRow({ label, rows }: { label: string; rows: RecognitionRow[] }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-10 text-[10px] font-medium text-zinc-500 shrink-0">{label}</div>
      <div className="flex flex-wrap gap-1">
        {rows.map((r) => (
          <div
            key={r.id}
            title={`${r.period_start} · ${r.status}${r.posted_amount != null ? ` · posted ${formatMoney(r.posted_amount)}` : ""} · expected ${formatMoney(r.expected_amount)}`}
            className={cn(
              "text-[10px] px-2 py-1 rounded tabular-nums",
              r.status === "posted" && "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
              r.status === "missing" && "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300",
              r.status === "mismatched" && "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
              r.status === "expected" && "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
            )}
          >
            {`p${r.period_index} ${r.period_start.slice(0, 7)}`}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Drift alerts ────────────────────────────────────────────────────────

function DriftAlertBanner({
  count,
  expanded,
  onToggle,
  alerts,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  alerts: DriftAlert[];
}) {
  const ack = useAcknowledgeDriftAlert();
  return (
    <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-red-800 dark:text-red-300 hover:bg-red-100/50 dark:hover:bg-red-900/30"
      >
        <div>
          <span className="font-medium">{count}</span> drift alert{count === 1 ? "" : "s"} on closed-period lines — balances changed since a prior capture
        </div>
        <span className="text-[10px] opacity-70">{expanded ? "hide" : "show"}</span>
      </button>
      {expanded && (
        <div className="max-h-[400px] overflow-y-auto border-t border-red-200 dark:border-red-900">
          <table className="text-xs min-w-full">
            <thead className="sticky top-0 bg-red-50 dark:bg-red-950">
              <tr className="text-red-800 dark:text-red-300">
                <th className="px-3 py-2 text-left font-medium">Period</th>
                <th className="px-3 py-2 text-left font-medium">Account</th>
                <th className="px-3 py-2 text-left font-medium">Field</th>
                <th className="px-3 py-2 text-right font-medium">Before</th>
                <th className="px-3 py-2 text-right font-medium">After</th>
                <th className="px-3 py-2 text-right font-medium">Δ</th>
                <th className="px-3 py-2 text-left font-medium">Detected</th>
                <th className="px-3 py-2 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-t border-red-100 dark:border-red-900/60">
                  <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{a.period_start.slice(0, 7)}</td>
                  <td className="px-3 py-1.5 text-zinc-800 dark:text-zinc-200">{a.account_name}</td>
                  <td className="px-3 py-1.5 text-zinc-500 text-[10px]">{a.amount_field}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {a.old_value == null ? "—" : formatMoney(a.old_value)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {a.new_value == null ? "—" : formatMoney(a.new_value)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-red-700 dark:text-red-400">
                    {formatMoney(a.delta)}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-500 text-[10px]">
                    {new Date(a.detected_at).toLocaleString("en-SG", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => ack.mutate({ id: a.id, status: "acknowledged" })}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                    >
                      ack
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Reconciliation ──────────────────────────────────────────────────────

function ReconciliationView({ fyCode }: { fyCode: string }) {
  const { data: rows, isLoading } = useFyReconciliation(fyCode);
  const update = useUpdateReconciliation();

  if (isLoading) return <div className="text-sm text-zinc-500">Loading reconciliation…</div>;

  if (!rows || rows.length === 0) {
    return (
      <div className="text-sm text-zinc-500 p-6 text-center border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md">
        No reconciliation data for {fyCode}. Apply the seed migration
        (<code className="text-[11px]">20260418_fy24_reconciliation.sql</code>) to populate.
      </div>
    );
  }

  const counts = {
    open: rows.filter((r) => r.status === "open").length,
    investigating: rows.filter((r) => r.status === "investigating").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
    accepted: rows.filter((r) => r.status === "accepted").length,
  };

  // Group by section (bs / pnl)
  const bsRows = rows.filter((r) => r.fs_line.startsWith("bs."));
  const pnlRows = rows.filter((r) => r.fs_line.startsWith("pnl."));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Open" value={counts.open} tone={counts.open > 0 ? "bad" : "ok"} />
        <Stat label="Investigating" value={counts.investigating} tone={counts.investigating > 0 ? "warn" : "ok"} />
        <Stat label="Resolved" value={counts.resolved} tone="ok" />
        <Stat label="Accepted" value={counts.accepted} tone="neutral" />
      </div>

      {bsRows.length > 0 && (
        <ReconciliationTable title="Balance Sheet" rows={bsRows} onUpdate={update.mutate} />
      )}
      {pnlRows.length > 0 && (
        <ReconciliationTable title="P&L" rows={pnlRows} onUpdate={update.mutate} />
      )}
    </div>
  );
}

function ReconciliationTable({
  title,
  rows,
  onUpdate,
}: {
  title: string;
  rows: Reconciliation[];
  onUpdate: (input: { id: string; status?: Reconciliation["status"]; resolution_note?: string }) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        {title}
      </div>
      <table className="text-xs min-w-full">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
            <th className="px-3 py-2 text-left font-medium min-w-[260px]">Line</th>
            <th className="px-3 py-2 text-right font-medium">Official (FS)</th>
            <th className="px-3 py-2 text-right font-medium">QBO</th>
            <th className="px-3 py-2 text-right font-medium">Variance</th>
            <th className="px-3 py-2 text-left font-medium min-w-[140px]">Status</th>
            <th className="px-3 py-2 text-left font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ReconciliationRow key={r.id} row={r} onUpdate={onUpdate} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReconciliationRow({
  row,
  onUpdate,
}: {
  row: Reconciliation;
  onUpdate: (input: { id: string; status?: Reconciliation["status"]; resolution_note?: string }) => void;
}) {
  const [note, setNote] = useState(row.resolution_note ?? "");
  const [editing, setEditing] = useState(false);

  const saveNote = () => {
    if (note !== (row.resolution_note ?? "")) {
      onUpdate({ id: row.id, resolution_note: note });
    }
    setEditing(false);
  };

  const variance = row.variance;
  const varianceCls =
    row.status === "resolved" || row.status === "accepted"
      ? "text-zinc-500"
      : Math.abs(variance) < 1
        ? "text-emerald-600 dark:text-emerald-400"
        : Math.abs(variance) < 1000
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-950 align-top">
      <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
        <div className="font-medium">{row.fs_line_label}</div>
        <div className="text-[10px] text-zinc-500 font-mono">{row.fs_line}</div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
        {formatMoney(row.official_amount)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
        {row.qbo_amount == null ? "—" : formatMoney(row.qbo_amount)}
      </td>
      <td className={cn("px-3 py-2 text-right tabular-nums font-medium", varianceCls)}>
        {formatMoney(variance)}
      </td>
      <td className="px-3 py-2">
        <select
          value={row.status}
          onChange={(e) => onUpdate({ id: row.id, status: e.target.value as Reconciliation["status"] })}
          className={cn(
            "text-xs px-2 py-1 rounded border",
            row.status === "open" && "border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-900",
            row.status === "investigating" && "border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-900",
            (row.status === "resolved" || row.status === "accepted") && "border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-900",
          )}
        >
          <option value="open">open</option>
          <option value="investigating">investigating</option>
          <option value="resolved">resolved</option>
          <option value="accepted">accepted</option>
        </select>
      </td>
      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 min-w-[300px]">
        {editing ? (
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
              if (e.key === "Escape") {
                setNote(row.resolution_note ?? "");
                setEditing(false);
              }
            }}
            rows={3}
            className="w-full text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full text-left text-xs hover:underline decoration-dotted"
          >
            {row.resolution_note || <span className="text-zinc-400">click to add note…</span>}
          </button>
        )}
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "bad" | "warn" | "neutral";
}) {
  const toneCls = {
    ok: "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    bad: "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900",
    warn: "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    neutral: "bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800",
  }[tone];
  return (
    <div className={cn("rounded-md border p-3", toneCls)}>
      <div className="text-[10px] uppercase tracking-wide font-medium opacity-70">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
