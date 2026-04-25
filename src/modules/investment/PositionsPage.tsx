// Investment Positions page.
//
// Full table of current holdings from the most recent ibkr_positions snapshot.
// Sortable client-side (no row count concerns at this scale — portfolios
// rarely exceed a few hundred positions).
//
// Research folder integration: on mount we list the contents of
// `{library_root}/0_Investment/Research/` via the Tauri `list_directory`
// command. Each position whose symbol matches a folder name (pattern
// `EXCHANGE.SYMBOL`, e.g. `NASDAQ.NVDA`) gets a "Notes" button that opens the
// folder in Finder via `open_in_finder`.

import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileText, ArrowUpDown } from "lucide-react";
import { useLatestPositions, type IbkrPosition } from "../../hooks/investment/usePositions";
import { useKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { SectionLoading, ErrorBanner } from "../../components/ui";

type SortKey = "symbol" | "position_value" | "unrealized_pnl" | "quantity";
type SortDir = "asc" | "desc";

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

/** File-system entry returned by the Rust `list_directory` command. Kept
 *  narrow — we only care about directory names and their full paths. */
interface DirEntry {
  name: string;
  path: string;
  is_directory: boolean;
}

/** Build a map from symbol → research folder path by scanning the Research
 *  directory for sub-folders named `EXCHANGE.SYMBOL`. Called once on mount. */
async function loadResearchFolders(libraryBase: string): Promise<Map<string, string>> {
  const researchPath = `${libraryBase}/0_Investment/Research`;
  try {
    const entries = await invoke<DirEntry[]>("list_directory", { path: researchPath });
    const bySymbol = new Map<string, string>();
    for (const entry of entries) {
      if (!entry.is_directory) continue;
      // Match the trailing token after the last dot: "NASDAQ.NVDA" → "NVDA"
      const lastDot = entry.name.lastIndexOf(".");
      if (lastDot > 0 && lastDot < entry.name.length - 1) {
        const symbol = entry.name.slice(lastDot + 1).toUpperCase();
        bySymbol.set(symbol, entry.path);
      }
    }
    return bySymbol;
  } catch {
    // Missing Research folder or workspace without one — silently fall back
    // to "no research links" rather than blocking the table render.
    return new Map();
  }
}

interface PositionsPageProps {
  accountId: string | null;
  hasMultipleAccounts: boolean;
  onSelectSymbol?: (symbol: string) => void;
}

export function PositionsPage({ accountId, hasMultipleAccounts, onSelectSymbol }: PositionsPageProps) {
  const { data: positions, isLoading, error } = useLatestPositions(accountId);
  const knowledgePaths = useKnowledgePaths();
  const showAccountColumn = accountId === null && hasMultipleAccounts;
  const [researchFolders, setResearchFolders] = useState<Map<string, string>>(new Map());
  const [sortKey, setSortKey] = useState<SortKey>("position_value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!knowledgePaths?.base) return;
    let cancelled = false;
    loadResearchFolders(knowledgePaths.base).then((m) => {
      if (!cancelled) setResearchFolders(m);
    });
    return () => {
      cancelled = true;
    };
  }, [knowledgePaths?.base]);

  const sorted = useMemo<IbkrPosition[]>(() => {
    const rows = [...(positions ?? [])];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return rows;
  }, [positions, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const openResearch = async (path: string) => {
    try {
      await invoke("open_in_finder", { path });
    } catch (e) {
      console.error("Failed to open research folder:", e);
    }
  };

  if (isLoading) return <SectionLoading className="flex-1" />;
  if (error) return <ErrorBanner message={String(error)} />;

  const snapshotDate = sorted[0]?.snapshot_date;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Positions</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {snapshotDate
            ? `Snapshot as of ${snapshotDate} — ${sorted.length} open positions`
            : "No positions yet. Run IBKR Flex sync in Settings → Integrations."}
        </p>
      </div>

      {sorted.length > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                {showAccountColumn && <th className="px-3 py-2 text-left font-medium">Account</th>}
                <SortableHeader label="Symbol" sortKey="symbol" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="left" />
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <SortableHeader label="Qty" sortKey="quantity" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
                <th className="px-3 py-2 text-right font-medium">Mark</th>
                <th className="px-3 py-2 text-right font-medium">Avg Cost</th>
                <SortableHeader label="Value" sortKey="position_value" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <SortableHeader label="Unrealized P&L" sortKey="unrealized_pnl" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
                <th className="px-3 py-2 text-right font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sorted.map((p) => {
                const pnl = p.unrealized_pnl ?? 0;
                const pnlClass =
                  pnl > 0
                    ? "text-green-600 dark:text-green-400"
                    : pnl < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-500";
                const researchPath = researchFolders.get(p.symbol.toUpperCase());
                return (
                  <tr
                    key={`${p.account_id}-${p.conid}`}
                    className="bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    {showAccountColumn && (
                      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        {p.account_id}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {onSelectSymbol ? (
                        <button
                          type="button"
                          onClick={() => onSelectSymbol(p.symbol)}
                          className="text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 hover:underline"
                        >
                          {p.symbol}
                        </button>
                      ) : (
                        p.symbol
                      )}
                      {p.asset_class && (
                        <span className="ml-1.5 text-[10px] uppercase text-zinc-400">
                          {p.asset_class}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]">
                      {p.description ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatNumber(p.quantity)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatMoney(p.mark_price, p.currency ?? "USD")}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {p.cost_basis != null && p.quantity != null && p.quantity !== 0
                        ? formatMoney(p.cost_basis / p.quantity, p.currency ?? "USD")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-100 font-medium">
                      {formatMoney(p.position_value, p.currency ?? "USD")}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">
                      {formatMoney(p.cost_basis, p.currency ?? "USD")}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${pnlClass}`}>
                      {formatMoney(p.unrealized_pnl, p.currency ?? "USD")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {researchPath ? (
                        <button
                          type="button"
                          onClick={() => openResearch(researchPath)}
                          className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
                          title={`Open ${p.symbol} research folder`}
                        >
                          <FileText size={12} />
                          Open
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onToggle: (key: SortKey) => void;
  align?: "left" | "right";
}

function SortableHeader({ label, sortKey, currentKey, currentDir, onToggle, align = "left" }: SortableHeaderProps) {
  const isActive = currentKey === sortKey;
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 ${
          isActive ? "text-zinc-700 dark:text-zinc-200" : ""
        }`}
      >
        {label}
        <ArrowUpDown size={10} className={isActive ? "" : "opacity-30"} />
        {isActive && <span className="text-[10px]">{currentDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
