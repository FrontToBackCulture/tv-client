// Pipeline view — list of all prospects with stage filters

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Plus, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useProspects } from "../../hooks/prospecting";
import { useUpdateProspectStage } from "../../hooks/prospecting";
import { PROSPECT_STAGES, STAGE_ORDER, type ProspectStage } from "./ProspectingComponents";
import { ProspectRow } from "./ProspectRow";
import { cn } from "../../lib/cn";
import { EmptyState } from "../../components/EmptyState";

interface PipelineViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function PipelineView({ selectedId, onSelect }: PipelineViewProps) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<ProspectStage | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const updateStage = useUpdateProspectStage();

  const { data: prospects = [], isLoading } = useProspects({
    search: search || undefined,
    stage: stageFilter || undefined,
  });

  // Search contacts for the add picker (direct Supabase query, debounced)
  const [debouncedAddSearch, setDebouncedAddSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAddSearch(addSearch), 200);
    return () => clearTimeout(t);
  }, [addSearch]);

  const { data: addCandidates = [] } = useQuery({
    queryKey: ["crm", "contacts", "add-picker", debouncedAddSearch],
    queryFn: async () => {
      if (!debouncedAddSearch || debouncedAddSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("id, name, email, company_id, crm_companies(name, display_name)")
        .is("prospect_stage", null)
        .or(`name.ilike.%${debouncedAddSearch}%,email.ilike.%${debouncedAddSearch}%`)
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: showAddPicker && debouncedAddSearch.length >= 2,
  });

  useEffect(() => {
    if (showAddPicker && addInputRef.current) addInputRef.current.focus();
  }, [showAddPicker]);

  // Group by stage
  const grouped = useMemo(() => {
    const sorted = [...prospects].sort((a, b) =>
      (STAGE_ORDER[a.prospect_stage] || 0) - (STAGE_ORDER[b.prospect_stage] || 0)
    );
    const groups: Record<string, typeof prospects> = {};
    for (const p of sorted) {
      const stage = p.prospect_stage || "new";
      if (!groups[stage]) groups[stage] = [];
      groups[stage].push(p);
    }
    return groups;
  }, [prospects]);

  // Stage counts for filter chips
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of prospects) {
      const s = p.prospect_stage || "new";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [prospects]);

  return (
    <div className="h-full flex flex-col">
      {/* Search + filters */}
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search prospects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-zinc-100 dark:bg-zinc-800 border-0 rounded-md text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <button
            onClick={() => setShowAddPicker(!showAddPicker)}
            className={cn(
              "flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0",
              showAddPicker
                ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-800"
                : "bg-teal-500 text-white hover:bg-teal-600",
            )}
          >
            {showAddPicker ? <X size={12} /> : <Plus size={12} />}
            Add
          </button>
        </div>
        {/* Add existing contact picker */}
        {showAddPicker && (
          <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
            <input
              ref={addInputRef}
              type="text"
              placeholder="Search contacts to add..."
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              className="w-full px-3 py-2 text-[11px] bg-transparent border-b border-zinc-100 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none"
            />
            <div className="max-h-48 overflow-y-auto">
              {addCandidates.length === 0 ? (
                <div className="px-3 py-3 text-[11px] text-zinc-400 text-center">
                  {addSearch.length < 2 ? "Type at least 2 characters to search" : "No matching contacts"}
                </div>
              ) : (
                addCandidates.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      updateStage.mutate({ contactId: c.id, stage: "new" });
                      setAddSearch("");
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
                  >
                    <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">{c.name}</div>
                    <div className="text-[10px] text-zinc-400">
                      {c.email}
                      {c.crm_companies && ` · ${c.crm_companies.display_name || c.crm_companies.name}`}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setStageFilter(null)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors",
              !stageFilter
                ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-800"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700",
            )}
          >
            All {prospects.length}
          </button>
          {PROSPECT_STAGES.map((stage) => (
            <button
              key={stage.value}
              onClick={() => setStageFilter(stageFilter === stage.value ? null : stage.value)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors",
                stageFilter === stage.value
                  ? `${stage.bgColor} ${stage.textColor}`
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700",
              )}
            >
              {stage.label} {stageCounts[stage.value] || 0}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-zinc-400">Loading...</div>
        ) : prospects.length === 0 ? (
          <EmptyState
            icon={Users}
            message={search ? "No prospects match your search" : "No prospects yet — import from Search tab"}
          />
        ) : stageFilter ? (
          // Flat list when filtered
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {prospects.map((p) => (
              <ProspectRow
                key={p.id}
                contact={p}
                isSelected={selectedId === p.id}
                onSelect={() => onSelect(p.id)}
              />
            ))}
          </div>
        ) : (
          // Grouped by stage
          Object.entries(grouped).map(([stage, contacts]) => {
            const config = PROSPECT_STAGES.find(s => s.value === stage);
            return (
              <div key={stage}>
                <div className="sticky top-0 z-10 px-3 py-1 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800">
                  <span className={cn("text-[10px] font-semibold uppercase tracking-wider", config?.textColor || "text-zinc-400")}>
                    {config?.label || stage} ({contacts.length})
                  </span>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {contacts.map((p) => (
                    <ProspectRow
                      key={p.id}
                      contact={p}
                      isSelected={selectedId === p.id}
                      onSelect={() => onSelect(p.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
