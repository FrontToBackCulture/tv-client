// Investment Dividends page.
//
// Two views of the same data: a totals-by-year summary at the top (most
// common question: "how much did I get this year"), then a full chronological
// table below. Reads from the `ibkr_dividends` view which pre-filters
// ibkr_cash_transactions to Dividends + PIL types.

import { useMemo } from "react";
import { useDividends, type IbkrDividend } from "../../hooks/investment/useDividends";
import { SectionLoading, ErrorBanner } from "../../components/ui";

function formatMoney(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

interface YearBucket {
  year: number;
  total: number;
  count: number;
  byCurrency: Map<string, number>;
}

function bucketByYear(dividends: IbkrDividend[]): YearBucket[] {
  const buckets = new Map<number, YearBucket>();
  for (const d of dividends) {
    const year = new Date(d.settle_date).getUTCFullYear();
    let bucket = buckets.get(year);
    if (!bucket) {
      bucket = { year, total: 0, count: 0, byCurrency: new Map() };
      buckets.set(year, bucket);
    }
    bucket.total += d.amount;
    bucket.count += 1;
    bucket.byCurrency.set(d.currency, (bucket.byCurrency.get(d.currency) ?? 0) + d.amount);
  }
  return Array.from(buckets.values()).sort((a, b) => b.year - a.year);
}

interface DividendsPageProps {
  accountId: string | null;
  hasMultipleAccounts: boolean;
}

export function DividendsPage({ accountId, hasMultipleAccounts }: DividendsPageProps) {
  const { data: dividends, isLoading, error } = useDividends(accountId);

  const byYear = useMemo(() => bucketByYear(dividends ?? []), [dividends]);
  const showAccountColumn = accountId === null && hasMultipleAccounts;

  if (isLoading) return <SectionLoading className="flex-1" />;
  if (error) return <ErrorBanner message={String(error)} />;

  const rows = dividends ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dividends</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {rows.length} dividend payments received across {byYear.length} year
          {byYear.length === 1 ? "" : "s"}.
        </p>
      </div>

      {/* By-year summary */}
      {byYear.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {byYear.map((bucket) => {
            // Use the largest-total currency as the display currency.
            const topCurrency = Array.from(bucket.byCurrency.entries()).sort(
              (a, b) => b[1] - a[1],
            )[0];
            const [displayCurrency, displayTotal] = topCurrency ?? ["USD", bucket.total];
            const hasMultiCurrency = bucket.byCurrency.size > 1;
            return (
              <div
                key={bucket.year}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
              >
                <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {bucket.year}
                </div>
                <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatMoney(displayTotal, displayCurrency)}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {bucket.count} payment{bucket.count === 1 ? "" : "s"}
                  {hasMultiCurrency && " · multi-currency"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full list */}
      {rows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 uppercase tracking-wide">
            All Payments
          </h2>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  {showAccountColumn && <th className="px-3 py-2 text-left font-medium">Account</th>}
                  <th className="px-3 py-2 text-left font-medium">Symbol</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.map((d) => (
                  <tr
                    key={d.transaction_id}
                    className="bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {d.settle_date}
                    </td>
                    {showAccountColumn && (
                      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        {d.account_id}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {d.symbol ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 truncate max-w-[360px]">
                      {d.description ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-100 font-medium">
                      {formatMoney(d.amount, d.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
