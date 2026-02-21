// src/modules/crm/ClientsView.tsx
// Enhanced clients list with engagement health bar, health-based sorting, and tier filters

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import { useCompanies } from "../../hooks/crm";
import { useClientEngagement } from "../../hooks/useClientEngagement";
import { SearchInput, HEALTH_TIER_CONFIG, type HealthLevel } from "./CrmComponents";
import { ClientRow } from "./ClientRow";

type SortMode = "health" | "name" | "updated";

const SORT_LABELS: Record<SortMode, string> = {
  health: "Health",
  name: "A-Z",
  updated: "Recent",
};

const SORT_ORDER: SortMode[] = ["health", "name", "updated"];

// Health sort priority (higher = more urgent = shown first)
const HEALTH_PRIORITY: Record<HealthLevel, number> = {
  at_risk: 0,
  needs_attention: 1,
  cooling: 2,
  healthy: 3,
  active: 4,
};

interface ClientsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function ClientsView({ selectedId, onSelect }: ClientsViewProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("health");
  const [healthFilter, setHealthFilter] = useState<HealthLevel | null>(null);

  const { data: companies = [], isLoading } = useCompanies({
    search: search || undefined,
    stage: "client",
  });

  const companyIds = useMemo(() => companies.map((c) => c.id), [companies]);
  const { data: engagementMap } = useClientEngagement(companyIds);

  // Tier counts for health bar
  const tierCounts = useMemo(() => {
    const counts: Record<HealthLevel, number> = {
      active: 0,
      healthy: 0,
      cooling: 0,
      needs_attention: 0,
      at_risk: 0,
    };
    for (const id of companyIds) {
      const eng = engagementMap?.get(id);
      const level = eng?.health.level || "at_risk";
      counts[level]++;
    }
    return counts;
  }, [companyIds, engagementMap]);

  // Filter + sort
  const sortedCompanies = useMemo(() => {
    let list = [...companies];

    // Apply health filter
    if (healthFilter && engagementMap) {
      list = list.filter((c) => {
        const eng = engagementMap.get(c.id);
        return eng?.health.level === healthFilter;
      });
    }

    // Sort
    if (sortBy === "name") {
      list.sort((a, b) =>
        (a.display_name || a.name).localeCompare(b.display_name || b.name)
      );
    } else if (sortBy === "updated") {
      list.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    } else {
      // Health sort: At Risk first → Active last
      list.sort((a, b) => {
        const aHealth = engagementMap?.get(a.id)?.health.level || "at_risk";
        const bHealth = engagementMap?.get(b.id)?.health.level || "at_risk";
        const diff = HEALTH_PRIORITY[aHealth] - HEALTH_PRIORITY[bHealth];
        if (diff !== 0) return diff;
        // Within same tier, sort by name
        return (a.display_name || a.name).localeCompare(
          b.display_name || b.name
        );
      });
    }

    return list;
  }, [companies, sortBy, healthFilter, engagementMap]);

  // Build grouped list for health sort (with sticky headers)
  const groups = useMemo(() => {
    if (sortBy !== "health") return null;
    const grouped: { level: HealthLevel; label: string; dotColor: string; items: typeof sortedCompanies }[] = [];
    let currentLevel: HealthLevel | null = null;

    for (const company of sortedCompanies) {
      const level = engagementMap?.get(company.id)?.health.level || "at_risk";
      if (level !== currentLevel) {
        currentLevel = level;
        const tier = HEALTH_TIER_CONFIG.find((t) => t.level === level)!;
        grouped.push({ level, label: tier.label, dotColor: tier.dotColor, items: [] });
      }
      grouped[grouped.length - 1].items.push(company);
    }
    return grouped;
  }, [sortBy, sortedCompanies, engagementMap]);

  const cycleSortBy = () => {
    const idx = SORT_ORDER.indexOf(sortBy);
    setSortBy(SORT_ORDER[(idx + 1) % SORT_ORDER.length]);
  };

  const toggleHealthFilter = (level: HealthLevel) => {
    setHealthFilter((prev) => (prev === level ? null : level));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Clients
            </h1>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              {companies.length} active clients
            </p>
          </div>
        </div>

        {/* Engagement Health Bar */}
        <div className="flex gap-1.5 flex-wrap">
          {HEALTH_TIER_CONFIG.map((tier) => {
            const count = tierCounts[tier.level];
            if (count === 0) return null;
            const isActive = healthFilter === tier.level;
            return (
              <button
                key={tier.level}
                onClick={() => toggleHealthFilter(tier.level)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                  isActive
                    ? "ring-2 ring-offset-1 ring-zinc-400 dark:ring-zinc-500 dark:ring-offset-zinc-950"
                    : "hover:opacity-80"
                } bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300`}
              >
                <div className={`w-2 h-2 rounded-full ${tier.dotColor}`} />
                {tier.label}
                <span className="text-zinc-400 dark:text-zinc-500 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search clients..."
        />
        <div className="flex items-center justify-end">
          <button
            onClick={cycleSortBy}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowUpDown size={11} />
            {SORT_LABELS[sortBy]}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-zinc-400">Loading...</p>
          </div>
        ) : sortedCompanies.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">
            {healthFilter ? "No clients in this tier" : "No clients yet"}
          </p>
        ) : groups ? (
          // Grouped by health tier with sticky headers
          <div>
            {groups.map((group) => (
              <div key={group.level}>
                <div className="sticky top-0 z-10 px-3 py-1.5 bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800/50">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${group.dotColor}`} />
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      {group.label}
                    </span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">
                      {group.items.length}
                    </span>
                  </div>
                </div>
                {group.items.map((c) => (
                  <ClientRow
                    key={c.id}
                    company={c}
                    engagement={engagementMap?.get(c.id)}
                    isSelected={c.id === selectedId}
                    onSelect={() => onSelect(c.id === selectedId ? null : c.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          // Flat list (A-Z or Recent sort)
          <div className="py-1">
            {sortedCompanies.map((c) => (
              <ClientRow
                key={c.id}
                company={c}
                engagement={engagementMap?.get(c.id)}
                isSelected={c.id === selectedId}
                onSelect={() => onSelect(c.id === selectedId ? null : c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
