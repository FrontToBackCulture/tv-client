// Full analytics table — sortable, filterable, used for Platform and Website tabs

import { useState, useMemo } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { ListSkeleton } from "../../components/ui";
import type { PageAnalytics, HealthStatus, AnalyticsSource } from "./analyticsTypes";
import { HealthBadge, TrendBadge } from "./AnalyticsBadges";

type SortField = "pagePath" | "views7d" | "views30d" | "views90d" | "users30d" | "trend" | "healthScore" | "lastViewed";
type SortDir = "asc" | "desc";

interface AnalyticsTableProps {
  pages: PageAnalytics[] | undefined;
  isLoading: boolean;
  source: AnalyticsSource;
  showDomain?: boolean;
  showUsers?: boolean;
}

const STATUS_FILTERS: { value: HealthStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "declining", label: "Declining" },
  { value: "stale", label: "Stale" },
  { value: "dead", label: "Dead" },
  { value: "unused", label: "Unused" },
];

export function AnalyticsTable({ pages, isLoading, source: _source, showDomain, showUsers }: AnalyticsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HealthStatus | "all">("all");
  const [sortField, setSortField] = useState<SortField>("healthScore");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [domainFilter, setDomainFilter] = useState<string>("all");

  const domains = useMemo(() => {
    if (!pages || !showDomain) return [];
    const set = new Set<string>();
    for (const p of pages) {
      if (p.domain) set.add(p.domain);
    }
    return Array.from(set).sort();
  }, [pages, showDomain]);

  const filtered = useMemo(() => {
    if (!pages) return [];
    let result = pages;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.pagePath.toLowerCase().includes(q) || (p.domain && p.domain.toLowerCase().includes(q)));
    }
    if (statusFilter !== "all") {
      result = result.filter((p) => p.healthStatus === statusFilter);
    }
    if (domainFilter !== "all") {
      result = result.filter((p) => p.domain === domainFilter);
    }

    result = [...result].sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

    return result;
  }, [pages, search, statusFilter, domainFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "pagePath" || field === "lastViewed" ? "asc" : "desc");
    }
  };

  if (isLoading) {
    return <div className="p-6"><ListSkeleton /></div>;
  }

  const SortHeader = ({ field, label, align }: { field: SortField; label: string; align?: "right" }) => (
    <th
      className={`px-4 py-2 font-medium cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 select-none ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && <ArrowUpDown size={10} className="text-teal-500" />}
      </span>
    </th>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search pages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                statusFilter === f.value
                  ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-medium"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {showDomain && domains.length > 0 && (
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
          >
            <option value="all">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}

        <span className="text-xs text-zinc-400 ml-auto">{filtered.length} pages</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500 z-10">
            <tr>
              <SortHeader field="pagePath" label="Page" />
              {showDomain && <th className="px-4 py-2 font-medium text-left">Domain</th>}
              <SortHeader field="views7d" label="7d" align="right" />
              <SortHeader field="views30d" label="30d" align="right" />
              <SortHeader field="views90d" label="90d" align="right" />
              {showUsers && <SortHeader field="users30d" label="Users" align="right" />}
              <SortHeader field="lastViewed" label="Last Viewed" />
              <SortHeader field="trend" label="Trend" />
              <SortHeader field="healthScore" label="Health" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {filtered.map((p) => (
              <tr key={`${p.source}-${p.pagePath}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <td className="px-4 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300 max-w-sm truncate" title={p.pagePath}>
                  {p.pagePath}
                </td>
                {showDomain && (
                  <td className="px-4 py-2 text-xs text-zinc-500 max-w-[140px] truncate">{p.domain || "—"}</td>
                )}
                <td className="px-4 py-2 text-right text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">{p.views7d}</td>
                <td className="px-4 py-2 text-right text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">{p.views30d}</td>
                <td className="px-4 py-2 text-right text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">{p.views90d}</td>
                {showUsers && (
                  <td className="px-4 py-2 text-right text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">{p.users30d || "—"}</td>
                )}
                <td className="px-4 py-2 text-xs text-zinc-500">{p.lastViewed || "Never"}</td>
                <td className="px-4 py-2"><TrendBadge trend={p.trend} /></td>
                <td className="px-4 py-2"><HealthBadge score={p.healthScore} status={p.healthStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-zinc-400">
            {pages && pages.length > 0 ? "No pages match your filters." : "No analytics data yet. Sync GA4 from the Domains page or wait for daily auto-sync."}
          </div>
        )}
      </div>
    </div>
  );
}
