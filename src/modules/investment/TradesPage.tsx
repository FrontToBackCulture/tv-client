// Investment Trades page.
//
// Trade history with client-side filtering: search by symbol, filter by side
// (BUY/SELL/all). Sorted by trade_date desc by default. 5000-row hard cap in
// the hook matches the expected tail of a 3-year history for an active retail
// portfolio — widen in useTrades if you actually hit it.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTrades, type IbkrTrade } from "../../hooks/investment/useTrades";
import { SectionLoading, ErrorBanner } from "../../components/ui";

type SideFilter = "all" | "BUY" | "SELL";

function formatMoney(n: number | null | undefined, currency = "USD"): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

interface TradesPageProps {
  accountId: string | null;
  hasMultipleAccounts: boolean;
}

export function TradesPage({ accountId, hasMultipleAccounts }: TradesPageProps) {
  const { data: trades, isLoading, error } = useTrades(accountId);
  const [search, setSearch] = useState("");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const showAccountColumn = accountId === null && hasMultipleAccounts;

  const filtered = useMemo<IbkrTrade[]>(() => {
    const rows = trades ?? [];
    const q = search.trim().toUpperCase();
    return rows.filter((t) => {
      if (sideFilter !== "all" && t.side !== sideFilter) return false;
      if (q && !t.symbol.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [trades, search, sideFilter]);

  if (isLoading) return <SectionLoading className="flex-1" />;
  if (error) return <ErrorBanner message={String(error)} />;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Trades</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {filtered.length === trades?.length
            ? `${filtered.length} trades`
            : `${filtered.length} of ${trades?.length ?? 0} trades`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by symbol…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="flex items-center gap-1 border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5">
          {(["all", "BUY", "SELL"] as SideFilter[]).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setSideFilter(side)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                sideFilter === side
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {side === "all" ? "All" : side}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                {showAccountColumn && <th className="px-3 py-2 text-left font-medium">Account</th>}
                <th className="px-3 py-2 text-left font-medium">Symbol</th>
                <th className="px-3 py-2 text-left font-medium">Side</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Proceeds</th>
                <th className="px-3 py-2 text-right font-medium">Commission</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((t) => {
                const sideClass =
                  t.side === "BUY"
                    ? "text-green-600 dark:text-green-400"
                    : t.side === "SELL"
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-500";
                return (
                  <tr
                    key={t.trade_id}
                    className="bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {t.trade_date}
                    </td>
                    {showAccountColumn && (
                      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        {t.account_id}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {t.symbol}
                    </td>
                    <td className={`px-3 py-2 font-medium ${sideClass}`}>{t.side ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatNumber(t.quantity)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatMoney(t.price, t.currency ?? "USD")}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatMoney(t.proceeds, t.currency ?? "USD")}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">
                      {formatMoney(t.commission, t.currency ?? "USD")}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-100 font-medium">
                      {formatMoney(t.net_cash, t.currency ?? "USD")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-zinc-500 py-12 text-center">
          No trades match the current filters.
        </div>
      )}
    </div>
  );
}
