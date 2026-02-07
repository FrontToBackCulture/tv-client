// src/modules/crm/DirectoryView.tsx
// Unified company + contact search with alphabetical grouping

import { useState, useMemo } from "react";
import { ArrowUpDown, Plus } from "lucide-react";
import { useCompanies, useContacts } from "../../hooks/useCRM";
import type { Company } from "../../lib/crm/types";
import { SearchInput, CompanyRow } from "./CrmComponents";

interface DirectoryViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewCompany: () => void;
}

export function DirectoryView({ selectedId, onSelect, onNewCompany }: DirectoryViewProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "updated">("name");

  const { data: companies = [], isLoading: companiesLoading } = useCompanies({
    search: search || undefined,
  });

  // Also search contacts when there's a search term
  const { data: contacts = [] } = useContacts({
    search: search || undefined,
  });

  // Build a map of contact matches -> company IDs
  const contactMatchMap = useMemo(() => {
    if (!search) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of contacts) {
      if (c.company_id && !map.has(c.company_id)) {
        map.set(c.company_id, c.name);
      }
    }
    return map;
  }, [contacts, search]);

  const sorted = useMemo(() => {
    return [...companies].sort((a, b) => {
      if (sortBy === "name") return (a.display_name || a.name).localeCompare(b.display_name || b.name);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [companies, sortBy]);

  // Group alphabetically
  const grouped = useMemo(() => {
    if (sortBy !== "name") return null;
    const groups: Record<string, Company[]> = {};
    for (const c of sorted) {
      const letter = (c.display_name || c.name).charAt(0).toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    }
    return groups;
  }, [sorted, sortBy]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Directory</h1>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              {companies.length} companies
              {search && contacts.length > 0 && ` · ${contacts.length} contacts matched`}
            </p>
          </div>
          <button
            onClick={onNewCompany}
            className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search companies or people..." />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-zinc-400">
            {search ? "Searching companies & contacts" : "All companies & contacts"}
          </p>
          <button onClick={() => setSortBy(sortBy === "name" ? "updated" : "name")}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <ArrowUpDown size={11} />{sortBy === "name" ? "A-Z" : "Recent"}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {companiesLoading ? (
          <div className="flex items-center justify-center h-32"><p className="text-xs text-zinc-400">Loading...</p></div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1">
            <p className="text-xs text-zinc-400">No results</p>
            {search && <p className="text-[11px] text-zinc-400">Try a different search term</p>}
          </div>
        ) : grouped ? (
          // Alphabetical grouping
          <div className="py-1">
            {Object.entries(grouped).map(([letter, comps]) => (
              <div key={letter}>
                <div className="px-3 py-1.5 sticky top-0 bg-white dark:bg-zinc-950 z-10">
                  <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">{letter}</span>
                </div>
                {comps.map((c) => (
                  <CompanyRow key={c.id} company={c} isSelected={c.id === selectedId}
                    onSelect={() => onSelect(c.id === selectedId ? null : c.id)}
                    matchedContact={contactMatchMap.get(c.id)} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          // Recent sort - flat list
          <div className="py-1">
            {sorted.map((c) => (
              <CompanyRow key={c.id} company={c} isSelected={c.id === selectedId}
                onSelect={() => onSelect(c.id === selectedId ? null : c.id)}
                matchedContact={contactMatchMap.get(c.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
