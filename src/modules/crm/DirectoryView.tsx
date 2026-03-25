// src/modules/crm/DirectoryView.tsx
// Unified company + contact search with alphabetical grouping

import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, Plus } from "lucide-react";
import { useCompanies, useContacts } from "../../hooks/crm";
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
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
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
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {companies.length} companies
              {search && contacts.length > 0 && ` · ${contacts.length} contacts matched`}
            </p>
          </div>
          <button
            onClick={onNewCompany}
            data-help-id="crm-add-company"
            className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search companies or people..." />
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            {search ? "Searching companies & contacts" : "All companies & contacts"}
          </p>
          <button onClick={() => setSortBy(sortBy === "name" ? "updated" : "name")}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <ArrowUpDown size={11} />{sortBy === "name" ? "A-Z" : "Recent"}
          </button>
        </div>
      </div>
      <DirectoryList
        companiesLoading={companiesLoading}
        sorted={sorted}
        grouped={grouped}
        selectedId={selectedId}
        onSelect={onSelect}
        contactMatchMap={contactMatchMap}
        search={search}
      />
    </div>
  );
}

type FlatItem = { type: "header"; letter: string } | { type: "company"; company: Company };

const HEADER_HEIGHT = 28;
const COMPANY_ROW_HEIGHT = 56;

function DirectoryList({
  companiesLoading, sorted, grouped, selectedId, onSelect, contactMatchMap, search,
}: {
  companiesLoading: boolean;
  sorted: Company[];
  grouped: Record<string, Company[]> | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  contactMatchMap: Map<string, string>;
  search: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Flatten grouped data into a single list with header items
  const flatItems = useMemo<FlatItem[]>(() => {
    if (grouped) {
      const items: FlatItem[] = [];
      for (const [letter, comps] of Object.entries(grouped)) {
        items.push({ type: "header", letter });
        for (const c of comps) items.push({ type: "company", company: c });
      }
      return items;
    }
    return sorted.map((c) => ({ type: "company" as const, company: c }));
  }, [grouped, sorted]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => flatItems[i].type === "header" ? HEADER_HEIGHT : COMPANY_ROW_HEIGHT,
    overscan: 15,
  });

  if (companiesLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-32">
        <p className="text-xs text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-32 gap-1">
        <p className="text-xs text-zinc-400">No results</p>
        {search && <p className="text-xs text-zinc-400">Try a different search term</p>}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }} className="py-1">
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = flatItems[virtualRow.index];
          if (item.type === "header") {
            return (
              <div
                key={`header-${item.letter}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: HEADER_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="px-3 py-1.5 bg-white dark:bg-zinc-950 z-10"
              >
                <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">{item.letter}</span>
              </div>
            );
          }
          const c = item.company;
          return (
            <div
              key={c.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: COMPANY_ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <CompanyRow
                company={c}
                isSelected={c.id === selectedId}
                onSelect={() => onSelect(c.id === selectedId ? null : c.id)}
                matchedContact={contactMatchMap.get(c.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
