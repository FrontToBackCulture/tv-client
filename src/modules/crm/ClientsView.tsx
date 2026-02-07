// src/modules/crm/ClientsView.tsx
// Clients list filtered by stage=client

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import { useCompanies } from "../../hooks/useCRM";
import { SearchInput, CompanyRow } from "./CrmComponents";

interface ClientsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function ClientsView({ selectedId, onSelect }: ClientsViewProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "updated">("name");

  const { data: companies = [], isLoading } = useCompanies({
    search: search || undefined,
    stage: "client",
  });

  const sorted = useMemo(() => {
    return [...companies].sort((a, b) => {
      if (sortBy === "name") return (a.display_name || a.name).localeCompare(b.display_name || b.name);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [companies, sortBy]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Clients</h1>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{companies.length} active clients</p>
          </div>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search clients..." />
        <div className="flex items-center justify-end">
          <button onClick={() => setSortBy(sortBy === "name" ? "updated" : "name")}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <ArrowUpDown size={11} />{sortBy === "name" ? "A-Z" : "Recent"}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><p className="text-xs text-zinc-400">Loading...</p></div>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">No clients yet</p>
        ) : (
          <div className="py-1">
            {sorted.map((c) => (
              <CompanyRow key={c.id} company={c} isSelected={c.id === selectedId}
                onSelect={() => onSelect(c.id === selectedId ? null : c.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
