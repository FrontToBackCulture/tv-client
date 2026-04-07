// Investment Overview page.
//
// Layout:
//   1. Four headline stat cards — NAV, Cash, Unrealized P&L, YTD Dividends
//   2. NAV composition row — Stock / Options / Other breakdown from nav_history
//   3. Per-account breakdown table (ONLY when "All Accounts" is selected AND
//      the workspace has multiple accounts) — lets the user see how NAV/cash
//      is distributed across accounts at a glance
//   4. Top 5 positions table (of the current filter)
//
// All numbers are scoped to the `accountId` prop: null means "all accounts
// consolidated", a specific ID means "just that account". Same hooks, same
// calc — we just pass the filter through.

import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
} from "lucide-react";
import { useLatestPositions } from "../../hooks/investment/usePositions";
import { useLatestNav } from "../../hooks/investment/useNavHistory";
import { useDividends } from "../../hooks/investment/useDividends";
import { SectionLoading } from "../../components/ui";

function formatMoney(n: number | null | undefined, currency = "USD", maxDigits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: maxDigits,
  }).format(n);
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  tone?: "default" | "positive" | "negative";
}

function StatCard({ label, value, subtitle, icon: Icon, tone = "default" }: StatCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-green-600 dark:text-green-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        <Icon size={14} className="text-zinc-400" />
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {subtitle && (
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</div>
      )}
    </div>
  );
}

interface OverviewPageProps {
  accountId: string | null;
  accounts: string[];
}

export function OverviewPage({ accountId, accounts }: OverviewPageProps) {
  const positionsQ = useLatestPositions(accountId);
  const navQ = useLatestNav(accountId);
  const dividendsQ = useDividends(accountId);

  // For the per-account breakdown we always need the full (unscoped) NAV set.
  // When accountId !== null the main useLatestNav is scoped, so we also need
  // an unscoped view for the breakdown. Calling useLatestNav(null) here keeps
  // the data available regardless of selection.
  const allAccountsNavQ = useLatestNav(null);

  const totals = useMemo(() => {
    const positions = positionsQ.data ?? [];
    const nav = navQ.data ?? [];
    const dividends = dividendsQ.data ?? [];

    const totalNav = nav.reduce((sum, r) => sum + (r.nav_base ?? 0), 0);
    const totalCash = nav.reduce((sum, r) => sum + (r.cash_base ?? 0), 0);
    const totalStock = nav.reduce((sum, r) => sum + (r.stock_base ?? 0), 0);
    const totalOptions = nav.reduce((sum, r) => sum + (r.options_base ?? 0), 0);
    const totalOther = nav.reduce((sum, r) => sum + (r.other_base ?? 0), 0);
    const baseCurrency = nav[0]?.base_currency ?? "USD";

    const totalUnrealized = positions.reduce((sum, p) => sum + (p.unrealized_pnl ?? 0), 0);
    const totalCost = positions.reduce((sum, p) => sum + (p.cost_basis ?? 0), 0);
    const unrealizedPct = totalCost > 0 ? totalUnrealized / totalCost : 0;

    const currentYear = new Date().getUTCFullYear();
    const ytdDividends = dividends
      .filter((d) => new Date(d.settle_date).getUTCFullYear() === currentYear)
      .reduce((sum, d) => sum + (d.amount ?? 0), 0);

    return {
      totalNav,
      totalCash,
      totalStock,
      totalOptions,
      totalOther,
      baseCurrency,
      totalUnrealized,
      unrealizedPct,
      positionCount: positions.length,
      ytdDividends,
    };
  }, [positionsQ.data, navQ.data, dividendsQ.data]);

  const topPositions = useMemo(() => {
    return (positionsQ.data ?? [])
      .filter((p) => p.position_value != null)
      .slice(0, 5);
  }, [positionsQ.data]);

  const perAccountRows = useMemo(() => {
    // Only meaningful when looking at "All Accounts" with >1 account.
    if (accountId !== null || accounts.length < 2) return [];
    const rows = allAccountsNavQ.data ?? [];
    return rows
      .map((r) => ({
        accountId: r.account_id,
        nav: r.nav_base ?? 0,
        cash: r.cash_base ?? 0,
        stock: r.stock_base ?? 0,
        currency: r.base_currency,
      }))
      .sort((a, b) => b.nav - a.nav);
  }, [accountId, accounts, allAccountsNavQ.data]);

  if (positionsQ.isLoading || navQ.isLoading) {
    return <SectionLoading className="flex-1" />;
  }

  const unrealizedTone = totals.totalUnrealized >= 0 ? "positive" : "negative";
  const scopeLabel = accountId ? `Account ${accountId}` : "All accounts";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Overview</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {scopeLabel} · snapshot from the latest IBKR Flex sync
        </p>
      </div>

      {/* Headline totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total NAV"
          value={formatMoney(totals.totalNav, totals.baseCurrency)}
          subtitle={`${totals.baseCurrency} base`}
          icon={DollarSign}
        />
        <StatCard
          label="Cash"
          value={formatMoney(totals.totalCash, totals.baseCurrency)}
          subtitle={
            totals.totalNav > 0
              ? `${formatPct(totals.totalCash / totals.totalNav)} of NAV`
              : undefined
          }
          icon={Wallet}
        />
        <StatCard
          label="Unrealized P&L"
          value={formatMoney(totals.totalUnrealized, totals.baseCurrency)}
          subtitle={formatPct(totals.unrealizedPct)}
          icon={totals.totalUnrealized >= 0 ? TrendingUp : TrendingDown}
          tone={unrealizedTone}
        />
        <StatCard
          label="YTD Dividends"
          value={formatMoney(totals.ytdDividends, totals.baseCurrency, 2)}
          icon={DollarSign}
        />
      </div>

      {/* NAV composition — useful sanity check that cash+stock+options+other ≈ NAV */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
          NAV Composition
        </h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 grid grid-cols-2 sm:grid-cols-4 divide-x divide-zinc-200 dark:divide-zinc-800">
          <CompositionCell label="Stock" value={totals.totalStock} total={totals.totalNav} currency={totals.baseCurrency} />
          <CompositionCell label="Cash" value={totals.totalCash} total={totals.totalNav} currency={totals.baseCurrency} />
          <CompositionCell label="Options" value={totals.totalOptions} total={totals.totalNav} currency={totals.baseCurrency} />
          <CompositionCell label="Other" value={totals.totalOther} total={totals.totalNav} currency={totals.baseCurrency} />
        </div>
      </div>

      {/* Per-account breakdown — only when All Accounts is selected */}
      {perAccountRows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
            By Account
          </h2>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Account</th>
                  <th className="px-4 py-2 text-right font-medium">NAV</th>
                  <th className="px-4 py-2 text-right font-medium">Stock</th>
                  <th className="px-4 py-2 text-right font-medium">Cash</th>
                  <th className="px-4 py-2 text-right font-medium">Share of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {perAccountRows.map((row) => (
                  <tr key={row.accountId} className="bg-white dark:bg-zinc-900">
                    <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {row.accountId}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-900 dark:text-zinc-100 font-medium">
                      {formatMoney(row.nav, row.currency)}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatMoney(row.stock, row.currency)}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatMoney(row.cash, row.currency)}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400">
                      {totals.totalNav > 0 ? formatPct(row.nav / totals.totalNav) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top positions */}
      {topPositions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
            Top Positions
          </h2>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Symbol</th>
                  <th className="px-4 py-2 text-right font-medium">Quantity</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 text-right font-medium">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {topPositions.map((p) => {
                  const pnl = p.unrealized_pnl ?? 0;
                  const pnlClass =
                    pnl > 0
                      ? "text-green-600 dark:text-green-400"
                      : pnl < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-500";
                  return (
                    <tr key={`${p.account_id}-${p.conid}`} className="bg-white dark:bg-zinc-900">
                      <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                        {p.symbol}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">
                        {p.quantity?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">
                        {formatMoney(p.position_value, p.currency ?? "USD", 2)}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${pnlClass}`}>
                        {formatMoney(p.unrealized_pnl, p.currency ?? "USD", 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CompositionCell({
  label,
  value,
  total,
  currency,
}: {
  label: string;
  value: number;
  total: number;
  currency: string;
}) {
  const pct = total > 0 ? value / total : 0;
  return (
    <div className="p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {formatMoney(value, currency)}
      </div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
        {total > 0 ? `${(pct * 100).toFixed(1)}%` : "—"}
      </div>
    </div>
  );
}
