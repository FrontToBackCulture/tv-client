// WorkTriageContextView — Admin UI for managing triage contexts
// 5 levels: Customer (40%), Product (25%), Team (15%), Individual (10%), Company (10%)

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ChevronRight, Plus, Pencil, Trash2, Save,
  Building2, Box, Users, User, Globe,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { toast } from "../../stores/toastStore";
import { useTeams } from "../../hooks/work/useTeams";
import { useUsers } from "../../hooks/work";

// ── Types ──

interface TriageContext {
  id: string;
  level: "company" | "team" | "individual" | "product" | "customer";
  name: string;
  text: string;
  boost: number;
  suppress: boolean;
  match_team_id: string | null;
  match_user_id: string | null;
  match_project_id: string | null;
  match_company_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ContextWeights {
  company: number;
  team: number;
  individual: number;
  product: number;
  customer: number;
}

const DEFAULT_WEIGHTS: ContextWeights = { company: 10, team: 15, individual: 10, product: 25, customer: 40 };

const LEVEL_CONFIG = [
  { key: "customer" as const, label: "Customer", icon: Building2, color: "teal", description: "highest priority, matches by client" },
  { key: "product" as const, label: "Product", icon: Box, color: "purple", description: "matches by project / module" },
  { key: "team" as const, label: "Team", icon: Users, color: "amber", description: "cascades to all team members" },
  { key: "individual" as const, label: "Individual", icon: User, color: "blue", description: "person-specific priorities" },
  { key: "company" as const, label: "Company", icon: Globe, color: "zinc", description: "applies to everything" },
] as const;

const LEVEL_COLORS: Record<string, { dot: string; bg: string; text: string; ring: string }> = {
  customer: { dot: "bg-teal-400", bg: "bg-teal-500/10", text: "text-teal-400", ring: "ring-teal-500/30" },
  product: { dot: "bg-purple-400", bg: "bg-purple-500/10", text: "text-purple-400", ring: "ring-purple-500/30" },
  team: { dot: "bg-amber-400", bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/30" },
  individual: { dot: "bg-blue-400", bg: "bg-blue-500/10", text: "text-blue-400", ring: "ring-blue-500/30" },
  company: { dot: "bg-zinc-400", bg: "bg-zinc-500/10", text: "text-zinc-400", ring: "ring-zinc-500/30" },
};

// ── Hooks ──

function useTriageContexts() {
  return useQuery({
    queryKey: ["triage-contexts"],
    queryFn: async (): Promise<TriageContext[]> => {
      const result = await invoke<TriageContext[]>("work_list_triage_contexts");
      return result;
    },
  });
}

function useContextWeights() {
  return useQuery({
    queryKey: ["triage-context-weights"],
    queryFn: async (): Promise<ContextWeights> => {
      const result = await invoke<ContextWeights>("work_get_context_weights");
      return result;
    },
  });
}

// ── Component ──

export function TriageContextView() {
  const qc = useQueryClient();
  const { data: contexts = [] } = useTriageContexts();
  const { data: weights = DEFAULT_WEIGHTS } = useContextWeights();
  const { data: teams = [] } = useTeams();
  const users = useUsers();

  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(["customer", "product"]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<string | null>(null); // level key for new entry
  const [localWeights, setLocalWeights] = useState<ContextWeights>(DEFAULT_WEIGHTS);
  const [weightsDirty, setWeightsDirty] = useState(false);

  useEffect(() => { setLocalWeights(weights); }, [weights]);

  // Mutations
  const upsertMutation = useMutation({
    mutationFn: async (data: Partial<TriageContext>) => {
      return invoke("work_upsert_triage_context", { data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["triage-contexts"] });
      toast.success("Context saved");
      setEditingId(null);
      setShowForm(null);
    },
    onError: (e: Error) => toast.error(`Failed to save: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => invoke("work_delete_triage_context", { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["triage-contexts"] });
      toast.success("Context deleted");
    },
  });

  const saveWeightsMutation = useMutation({
    mutationFn: async (w: ContextWeights) => invoke("work_set_context_weights", { weights: w }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["triage-context-weights"] });
      toast.success("Weights saved");
      setWeightsDirty(false);
    },
  });

  // Entity lookups for dropdowns
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("crm_companies").select("id,name").order("name").then(({ data }) => {
      if (data) setCompanies(data);
    });
    supabase.from("projects").select("id,name").eq("status", "active").order("name").then(({ data }) => {
      if (data) setProjects(data);
    });
  }, []);

  const toggleLevel = useCallback((level: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, TriageContext[]> = {};
    for (const c of contexts) {
      (map[c.level] ??= []).push(c);
    }
    return map;
  }, [contexts]);


  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Triage Context</h1>
        <p className="text-xs text-zinc-500 mt-1">Context feeds into Rust scoring + Claude AI summary at every triage level</p>
      </div>

      {/* Weight distribution bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Score Weight Distribution</span>
          {weightsDirty && (
            <button
              onClick={() => saveWeightsMutation.mutate(localWeights)}
              className="flex items-center gap-1 text-[11px] font-medium text-teal-400 hover:text-teal-300 transition-colors"
            >
              <Save className="w-3 h-3" /> Save weights
            </button>
          )}
        </div>
        {/* Bar */}
        <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-3">
          {LEVEL_CONFIG.map(l => (
            <div
              key={l.key}
              className={`rounded-sm transition-all ${LEVEL_COLORS[l.key].dot}`}
              style={{ flex: localWeights[l.key] || 1 }}
            />
          ))}
        </div>
        {/* Legend with editable weights */}
        <div className="flex gap-4 flex-wrap">
          {LEVEL_CONFIG.map(l => (
            <div key={l.key} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <div className={`w-2 h-2 rounded-full ${LEVEL_COLORS[l.key].dot}`} />
              <span>{l.label}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={localWeights[l.key]}
                onChange={e => {
                  setLocalWeights(prev => ({ ...prev, [l.key]: parseInt(e.target.value) || 0 }));
                  setWeightsDirty(true);
                }}
                className="w-10 bg-zinc-800 border border-zinc-700 rounded text-center text-[11px] font-mono text-zinc-300 py-0.5 focus:border-teal-500 outline-none"
              />
              <span className="text-zinc-600">%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Context levels */}
      <div className="flex flex-col gap-3">
        {LEVEL_CONFIG.map(level => {
          const expanded = expandedLevels.has(level.key);
          const entries = grouped[level.key] || [];
          const colors = LEVEL_COLORS[level.key];

          return (
            <div key={level.key} className={`bg-zinc-900 border rounded-lg transition-colors ${expanded ? "border-zinc-700" : "border-zinc-800"}`}>
              {/* Level header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                onClick={() => toggleLevel(level.key)}
              >
                <ChevronRight className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
                <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                <span className="text-[13px] font-semibold text-zinc-200">{level.label}</span>
                <span className="text-xs text-zinc-500">— {level.description}</span>
                {entries.length > 0 && (
                  <span className="ml-1 text-[11px] font-mono bg-zinc-800 text-zinc-400 px-1.5 rounded-full">{entries.length}</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    {localWeights[level.key]}%
                  </span>
                </div>
              </div>

              {/* Level body */}
              {expanded && (
                <div className="border-t border-zinc-800">
                  {/* Company level is a single textarea */}
                  {level.key === "company" ? (
                    <CompanyContextEditor
                      entry={entries[0]}
                      onSave={(data) => upsertMutation.mutate(data)}
                    />
                  ) : (
                    <>
                      {entries.map(entry => (
                        <ContextEntryRow
                          key={entry.id}
                          entry={entry}
                          colors={colors}
                          editing={editingId === entry.id}
                          onEdit={() => setEditingId(entry.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onSave={(data) => upsertMutation.mutate(data)}
                          onDelete={() => deleteMutation.mutate(entry.id)}
                          companies={companies}
                          projects={projects}
                          teams={teams}
                          users={users}
                        />
                      ))}
                      {/* Add button or inline form */}
                      {showForm === level.key ? (
                        <ContextForm
                          level={level.key}
                          onSave={(data) => upsertMutation.mutate(data)}
                          onCancel={() => setShowForm(null)}
                          companies={companies}
                          projects={projects}
                          teams={teams}
                          users={users}
                        />
                      ) : (
                        <div className="px-4 py-2">
                          <button
                            onClick={() => setShowForm(level.key)}
                            className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 border border-dashed border-zinc-800 hover:border-zinc-600 rounded px-3 py-1.5 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add {level.label.toLowerCase()} context
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ──

function CompanyContextEditor({ entry, onSave }: {
  entry?: TriageContext;
  onSave: (data: Partial<TriageContext>) => void;
}) {
  const [text, setText] = useState(entry?.text || "");
  const [boost, setBoost] = useState(entry?.boost ?? 10);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setText(entry?.text || "");
    setBoost(entry?.boost ?? 10);
    setDirty(false);
  }, [entry]);

  return (
    <div className="p-4">
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setDirty(true); }}
        placeholder="Set company-wide strategic context..."
        className="w-full min-h-[80px] bg-zinc-800/50 border border-zinc-700 rounded-lg text-[13px] text-zinc-200 p-3 resize-y outline-none focus:border-teal-500 placeholder:text-zinc-600"
      />
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Boost:</span>
          <input
            type="number" min={-20} max={20} value={boost}
            onChange={e => { setBoost(parseInt(e.target.value) || 0); setDirty(true); }}
            className="w-12 bg-zinc-800 border border-zinc-700 rounded text-center text-[11px] font-mono text-zinc-300 py-0.5 outline-none focus:border-teal-500"
          />
          {entry?.updated_at && (
            <span className="text-zinc-600 ml-2">Updated {new Date(entry.updated_at).toLocaleDateString()}</span>
          )}
        </div>
        {dirty && (
          <button
            onClick={() => onSave({ id: entry?.id, level: "company", name: "Company", text, boost, suppress: boost < 0 })}
            className="text-xs font-medium text-teal-400 hover:text-teal-300 flex items-center gap-1"
          >
            <Save className="w-3 h-3" /> Save
          </button>
        )}
      </div>
    </div>
  );
}

function ContextEntryRow({ entry, colors, editing, onEdit, onCancelEdit, onSave, onDelete, companies, projects, teams, users }: {
  entry: TriageContext;
  colors: { dot: string; bg: string; text: string };
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (data: Partial<TriageContext>) => void;
  onDelete: () => void;
  companies: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  teams: any[];
  users: any;
}) {
  if (editing) {
    return (
      <ContextForm
        level={entry.level}
        initial={entry}
        onSave={onSave}
        onCancel={onCancelEdit}
        companies={companies}
        projects={projects}
        teams={teams}
        users={users}
      />
    );
  }

  const targetName = entry.name;
  const initials = targetName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-zinc-800/50 last:border-b-0 group hover:bg-zinc-800/30 transition-colors">
      {/* Avatar */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 mt-0.5 ${colors.bg} ${colors.text}`}>
        {initials}
      </div>
      {/* Target name */}
      <div className="min-w-[100px] flex-shrink-0 pt-0.5">
        <span className="text-[13px] font-medium text-zinc-200">{targetName}</span>
      </div>
      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-zinc-400 leading-relaxed">{entry.text}</p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-600">
          <span>Boost: <span className={entry.suppress ? "text-orange-400" : "text-emerald-400"}>{entry.suppress ? "-" : "+"}{Math.abs(entry.boost)}</span></span>
          {entry.updated_at && <span>Updated {new Date(entry.updated_at).toLocaleDateString()}</span>}
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pt-0.5">
        <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function ContextForm({ level, initial, onSave, onCancel, companies, projects, teams, users }: {
  level: TriageContext["level"];
  initial?: TriageContext;
  onSave: (data: Partial<TriageContext>) => void;
  onCancel: () => void;
  companies: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  teams: any[];
  users: any;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [text, setText] = useState(initial?.text || "");
  const [boost, setBoost] = useState(initial?.boost ?? 10);
  const [suppress, setSuppress] = useState(initial?.suppress || false);
  const [matchId, setMatchId] = useState(
    initial?.match_company_id || initial?.match_project_id || initial?.match_team_id || initial?.match_user_id || ""
  );

  const entityOptions = useMemo((): { id: string; label: string }[] => {
    switch (level) {
      case "customer": return companies.map(c => ({ id: c.id, label: c.name }));
      case "product": return projects.map(p => ({ id: p.id, label: p.name }));
      case "team": return teams.map(t => ({ id: t.id, label: t.name }));
      case "individual": return (users || []).map((u: any) => ({ id: u.id, label: u.name || u.email }));
      default: return [];
    }
  }, [level, companies, projects, teams, users]);

  const handleEntityChange = useCallback((id: string) => {
    setMatchId(id);
    const entity = entityOptions.find(e => e.id === id);
    if (entity && !name) setName(entity.label);
  }, [entityOptions, name]);

  const handleSave = () => {
    const data: Partial<TriageContext> = {
      id: initial?.id,
      level,
      name: name || "Untitled",
      text,
      boost: Math.abs(boost),
      suppress,
    };
    if (level === "customer") data.match_company_id = matchId || null;
    if (level === "product") data.match_project_id = matchId || null;
    if (level === "team") data.match_team_id = matchId || null;
    if (level === "individual") data.match_user_id = matchId || null;
    onSave(data);
  };

  return (
    <div className="px-4 py-3 bg-zinc-800/30 border-b border-zinc-800/50">
      <div className="flex gap-3">
        {/* Entity selector */}
        {level !== "company" && (
          <div className="w-48 flex-shrink-0">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 block">
              {level === "customer" ? "Company" : level === "product" ? "Project" : level === "team" ? "Team" : "Person"}
            </label>
            <select
              value={matchId}
              onChange={e => handleEntityChange(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded text-[13px] text-zinc-200 py-1.5 px-2 outline-none focus:border-teal-500 appearance-none"
            >
              <option value="">Select...</option>
              {entityOptions.map(e => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>
        )}
        {/* Name */}
        <div className="w-32 flex-shrink-0">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 block">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Display name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded text-[13px] text-zinc-200 py-1.5 px-2 outline-none focus:border-teal-500"
          />
        </div>
        {/* Boost */}
        <div className="w-20 flex-shrink-0">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 block">Boost</label>
          <input
            type="number" min={0} max={20} value={boost}
            onChange={e => setBoost(parseInt(e.target.value) || 0)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded text-center text-[13px] font-mono text-zinc-200 py-1.5 outline-none focus:border-teal-500"
          />
        </div>
        {/* Suppress toggle */}
        <div className="flex-shrink-0 flex flex-col justify-end">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1 block">Suppress</label>
          <button
            onClick={() => setSuppress(!suppress)}
            className={`px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
              suppress ? "bg-orange-500/20 text-orange-400" : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {suppress ? "Yes" : "No"}
          </button>
        </div>
      </div>
      {/* Context text */}
      <div className="mt-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What should triage know about this context?"
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded text-[13px] text-zinc-200 p-2 resize-y outline-none focus:border-teal-500 placeholder:text-zinc-600"
        />
      </div>
      {/* Actions */}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded hover:bg-zinc-800 transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} className="text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 px-3 py-1.5 rounded transition-colors">
          {initial ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );
}
