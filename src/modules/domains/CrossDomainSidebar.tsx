// CrossDomainSidebar — left rail for the cross-domain review tabs (Data Models,
// Queries, Workflows, Dashboards). Lets the user filter by domain with counts.

import { useMemo } from "react";
import { Layers, Globe } from "lucide-react";
import { cn } from "../../lib/cn";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import type { ReviewRow } from "./reviewTypes";

interface Props {
  rows: ReviewRow[];
  selectedDomains: string[];
  onSelectedDomainsChange: (domains: string[]) => void;
  storageKeyPrefix: string;
}

export function CrossDomainSidebar({ rows, selectedDomains, onSelectedDomainsChange, storageKeyPrefix }: Props) {
  const domainCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.domain) continue;
      counts.set(r.domain, (counts.get(r.domain) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const total = rows.length;
  const selectedSet = new Set(selectedDomains);

  const toggleDomain = (domain: string) => {
    if (selectedSet.has(domain)) {
      onSelectedDomainsChange(selectedDomains.filter((d) => d !== domain));
    } else {
      onSelectedDomainsChange([...selectedDomains, domain]);
    }
  };

  const itemBase = "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors";
  const itemActive = "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400";
  const itemIdle = "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50";

  return (
    <div className="h-full flex flex-col overflow-y-auto px-3 py-3 space-y-3">
      <CollapsibleSection title="View" storageKey={`${storageKeyPrefix}-view`}>
        <button
          onClick={() => onSelectedDomainsChange([])}
          className={cn(itemBase, selectedDomains.length === 0 ? itemActive : itemIdle)}
        >
          <Layers size={13} className={selectedDomains.length === 0 ? "text-teal-500" : "text-zinc-400"} />
          <span className="flex-1">All Domains</span>
          <span className="text-[10px] text-zinc-400">{total}</span>
        </button>
      </CollapsibleSection>

      <CollapsibleSection
        title="Domains"
        storageKey={`${storageKeyPrefix}-domains`}
        rightSlot={
          selectedDomains.length > 0 ? (
            <button onClick={() => onSelectedDomainsChange([])} className="text-[10px] text-teal-500 hover:text-teal-400">Clear</button>
          ) : undefined
        }
      >
        {domainCounts.map(([domain, count]) => {
          const isActive = selectedSet.has(domain);
          return (
            <button
              key={domain}
              onClick={() => toggleDomain(domain)}
              className={cn(itemBase, isActive ? itemActive : itemIdle)}
            >
              <Globe size={13} className={isActive ? "text-teal-500" : "text-zinc-400"} />
              <span className="flex-1 truncate" title={domain}>{domain}</span>
              <span className="text-[10px] text-zinc-400">{count}</span>
            </button>
          );
        })}
        {domainCounts.length === 0 && (
          <div className="px-2 py-1 text-[11px] text-zinc-400">No data loaded yet</div>
        )}
      </CollapsibleSection>

      <div className="flex-1" />
    </div>
  );
}
