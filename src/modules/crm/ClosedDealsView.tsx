// src/modules/crm/ClosedDealsView.tsx
// Closed deals view (won + lost) with sub-tabs and company detail on click

import { useState, useMemo } from "react";
import { CheckCircle, XCircle, ArrowUpDown } from "lucide-react";
import { useDeals } from "../../hooks/useCRM";
import type { Deal } from "../../lib/crm/types";
import { SearchInput, timeAgo } from "./CrmComponents";

interface ClosedDealsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

type ClosedTab = "won" | "lost";
type SortBy = "recent" | "value" | "name";

function formatValue(val: number): string {
  if (val === 0) return "$0";
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val}`;
}

function DealRow({ deal, isSelected, onSelect }: {
  deal: Deal & { company?: { name: string } };
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isWon = deal.stage === "won";
  return (
    <button onClick={onSelect}
      className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
        isSelected ? "bg-teal-50 dark:bg-teal-950/20 border-l-2 border-teal-500"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-l-2 border-transparent"
      }`}>
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isWon ? "bg-emerald-500" : "bg-red-400"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {deal.company?.name || "Unknown"}
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
          {deal.name}
          {deal.lost_reason && <span className="ml-1 text-red-400 dark:text-red-500">— {deal.lost_reason}</span>}
          {deal.won_notes && <span className="ml-1 text-emerald-500 dark:text-emerald-400">— {deal.won_notes}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {deal.value != null && deal.value > 0 && (
          <span className={`text-xs font-medium tabular-nums ${isWon ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}>
            {formatValue(deal.value)}
          </span>
        )}
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">
          {timeAgo(deal.actual_close_date || deal.updated_at)}
        </span>
      </div>
    </button>
  );
}

export function ClosedDealsView({ selectedId, onSelect }: ClosedDealsViewProps) {
  const [tab, setTab] = useState<ClosedTab>("won");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  const { data: wonDeals = [], isLoading: wonLoading } = useDeals({ stage: "won" });
  const { data: lostDeals = [], isLoading: lostLoading } = useDeals({ stage: "lost" });

  const loading = wonLoading || lostLoading;
  const deals = tab === "won" ? wonDeals : lostDeals;

  const wonTotal = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const lostTotal = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  const filtered = useMemo(() => {
    if (!search) return deals;
    const q = search.toLowerCase();
    return deals.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      d.company?.name?.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q)
    );
  }, [deals, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "value") return (b.value || 0) - (a.value || 0);
      if (sortBy === "name") return (a.company?.name || a.name).localeCompare(b.company?.name || b.name);
      // recent — by close date or updated_at
      return new Date(b.actual_close_date || b.updated_at).getTime() - new Date(a.actual_close_date || a.updated_at).getTime();
    });
  }, [filtered, sortBy]);

  const sortLabel = { recent: "Recent", value: "Value", name: "A-Z" }[sortBy];
  const nextSort: SortBy = sortBy === "recent" ? "value" : sortBy === "value" ? "name" : "recent";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Closed Deals</h1>

        {/* Won / Lost sub-tabs */}
        <div className="flex gap-2">
          <button onClick={() => setTab("won")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === "won"
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}>
            <CheckCircle size={12} />
            Won ({wonDeals.length})
            {wonTotal > 0 && <span className="text-[10px] tabular-nums ml-0.5">{formatValue(wonTotal)}</span>}
          </button>
          <button onClick={() => setTab("lost")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === "lost"
                ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}>
            <XCircle size={12} />
            Lost ({lostDeals.length})
            {lostTotal > 0 && <span className="text-[10px] tabular-nums ml-0.5">{formatValue(lostTotal)}</span>}
          </button>
        </div>

        <SearchInput value={search} onChange={setSearch} placeholder={`Search ${tab} deals...`} />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-zinc-400">{sorted.length} deal{sorted.length !== 1 ? "s" : ""}</p>
          <button onClick={() => setSortBy(nextSort)}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <ArrowUpDown size={11} />{sortLabel}
          </button>
        </div>
      </div>

      {/* Deal list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32"><p className="text-xs text-zinc-400">Loading...</p></div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1">
            <p className="text-xs text-zinc-400">No {tab} deals{search ? " matching search" : ""}</p>
          </div>
        ) : (
          <div className="py-1">
            {sorted.map((deal) => (
              <DealRow key={deal.id} deal={deal}
                isSelected={deal.company_id === selectedId}
                onSelect={() => onSelect(deal.company_id === selectedId ? null : deal.company_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
