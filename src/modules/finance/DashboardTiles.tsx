import {
  useQboAccounts,
  useQboBills,
  useQboInvoices,
  useQboReport,
} from "../../hooks/finance";
import type { QboReportPayload, QboReportRow } from "../../hooks/finance";
import { formatMoney } from "./formatters";
import { cn } from "../../lib/cn";
import { DollarSign, TrendingUp, Wallet, FileInput, FileOutput, type LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Extract a specific line from a QBO report by matching the group or header.
// ---------------------------------------------------------------------------

function findRowByGroup(rows: QboReportRow[], group: string): QboReportRow | null {
  for (const r of rows) {
    if (r.group === group) return r;
    const children = r.Rows?.Row;
    if (children) {
      const hit = findRowByGroup(children, group);
      if (hit) return hit;
    }
  }
  return null;
}

function totalFromRow(row: QboReportRow | null): number | null {
  const cells = row?.Summary?.ColData;
  if (!cells || cells.length < 2) return null;
  const raw = cells[cells.length - 1].value;
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

function extractNetIncome(payload: QboReportPayload | undefined): number | null {
  if (!payload) return null;
  const rows = payload.Rows?.Row ?? [];
  const row = findRowByGroup(rows, "NetIncome") ?? findRowByGroup(rows, "NetOperatingIncome");
  return totalFromRow(row);
}

function extractTotalIncome(payload: QboReportPayload | undefined): number | null {
  if (!payload) return null;
  const rows = payload.Rows?.Row ?? [];
  return totalFromRow(findRowByGroup(rows, "Income"));
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "emerald" | "amber" | "blue" | "slate";
  loading?: boolean;
}) {
  const accentClass =
    accent === "emerald" ? "text-emerald-600 dark:text-emerald-400"
      : accent === "amber" ? "text-amber-600 dark:text-amber-400"
        : accent === "blue" ? "text-blue-600 dark:text-blue-400"
          : "text-zinc-600 dark:text-zinc-400";

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </div>
        <Icon size={14} className={accentClass} />
      </div>
      <div className={cn("mt-2 text-xl font-semibold tabular-nums", accentClass)}>
        {loading ? "—" : value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function DashboardTiles() {
  const { data: plMtd } = useQboReport("ProfitAndLoss", "mtd");
  const { data: plYtd } = useQboReport("ProfitAndLoss", "ytd");
  const { data: accounts = [] } = useQboAccounts();
  const { data: invoices = [] } = useQboInvoices();
  const { data: bills = [] } = useQboBills();

  const currency = plMtd?.data.Header.Currency ?? plYtd?.data.Header.Currency ?? "SGD";

  const revenueMtd = extractTotalIncome(plMtd?.data);
  const revenueYtd = extractTotalIncome(plYtd?.data);
  const netIncomeMtd = extractNetIncome(plMtd?.data);
  const netIncomeYtd = extractNetIncome(plYtd?.data);

  const cashBalance = accounts
    .filter((a: any) => a.account_type === "Bank")
    .reduce((sum: number, a: any) => sum + Number(a.current_balance ?? 0), 0);

  const outstandingAR = invoices
    .reduce((sum: number, i: any) => sum + Math.max(0, Number(i.balance ?? 0)), 0);

  const outstandingAP = bills
    .reduce((sum: number, b: any) => sum + Math.max(0, Number(b.balance ?? 0)), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Tile
        label="Revenue · MTD"
        value={formatMoney(revenueMtd, currency)}
        hint={plMtd?.data.Header.EndPeriod ? `as of ${plMtd.data.Header.EndPeriod}` : undefined}
        icon={TrendingUp}
        accent="emerald"
        loading={!plMtd}
      />
      <Tile
        label="Revenue · YTD"
        value={formatMoney(revenueYtd, currency)}
        hint={plYtd?.data.Header.EndPeriod ? `as of ${plYtd.data.Header.EndPeriod}` : undefined}
        icon={TrendingUp}
        accent="emerald"
        loading={!plYtd}
      />
      <Tile
        label="Net income · YTD"
        value={formatMoney(netIncomeYtd, currency)}
        hint={netIncomeMtd != null ? `MTD ${formatMoney(netIncomeMtd, currency)}` : undefined}
        icon={DollarSign}
        accent={netIncomeYtd != null && netIncomeYtd < 0 ? "amber" : "blue"}
        loading={!plYtd}
      />
      <Tile
        label="Cash balance"
        value={formatMoney(cashBalance, currency)}
        hint={`${accounts.filter((a: any) => a.account_type === "Bank").length} bank account(s)`}
        icon={Wallet}
        accent="blue"
      />
      <Tile
        label="Outstanding AR"
        value={formatMoney(outstandingAR, currency)}
        hint={`${invoices.filter((i: any) => Number(i.balance ?? 0) > 0).length} unpaid invoice(s)`}
        icon={FileInput}
        accent="emerald"
      />
      <Tile
        label="Outstanding AP"
        value={formatMoney(outstandingAP, currency)}
        hint={`${bills.filter((b: any) => Number(b.balance ?? 0) > 0).length} unpaid bill(s)`}
        icon={FileOutput}
        accent={outstandingAP > 0 ? "amber" : "slate"}
      />
    </div>
  );
}
