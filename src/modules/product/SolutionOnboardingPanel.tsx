import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSolutionTemplates, useUpdateSolutionTemplate } from "../../hooks/solutions";
import type { TemplateTab, SolutionInstanceWithTemplate, ScanBinding, TemplateDefinition } from "../../lib/solutions/types";
import SolutionMatrixView from "../domains/solutions/SolutionMatrixView";
import { useValDomains, useSchemaResources } from "../../hooks/val-sync";
import { usePrimaryKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { timeAgoVerbose, formatDateTimeSGT } from "../../lib/date";
import ResourcePicker from "./ResourcePicker";

const TAB_DOT_COLORS: Record<string, string> = {
  purple: "bg-purple-400",
  cyan: "bg-cyan-400",
  teal: "bg-teal-400",
  amber: "bg-amber-400",
  green: "bg-emerald-400",
};

const SECTION_TYPE_TAGS: Record<string, { label: string; color: string } | undefined> = {
  "scope-outlets": undefined,
  "scope-payment-methods": { label: "Chips", color: "bg-cyan-500/10 text-cyan-400" },
  "scope-banks": { label: "Chips", color: "bg-cyan-500/10 text-cyan-400" },
  "scope-suppliers": undefined,
  "scope-reports": undefined,
  periods: undefined,
  "auto-pos": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-credentials": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-gl": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-pos-data": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-settlement": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-bank-statements": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-bot-setup": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-pos-setup": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-sync-items": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-workflow-items": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-populate": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-accounting": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "auto-go-live": { label: "Auto", color: "bg-emerald-500/10 text-emerald-400" },
  "grid-outlet-map": { label: "Grid", color: "bg-amber-500/10 text-amber-400" },
  "grid-pm-map": { label: "Grid", color: "bg-amber-500/10 text-amber-400" },
  "grid-bank-verify": { label: "Grid", color: "bg-amber-500/10 text-amber-400" },
  "grid-recon": { label: "Grid", color: "bg-amber-500/10 text-amber-400" },
};

const AUTO_GEN_RULES = [
  { tab: "Scope", colorClass: "text-purple-400", description: "Drives all downstream tabs. Outlets, PMs, Banks, Periods generate rows automatically." },
  { tab: "Connectivity", colorClass: "text-cyan-400", description: "1 row per unique POS + 1 row per credential platform (GrabFood, foodpanda)." },
  { tab: "Collection", colorClass: "text-teal-400", description: "Outlet\u00d7Period for POS data. PM\u00d7Period for settlements. Bank\u00d7Period for statements." },
  { tab: "Implement", colorClass: "text-emerald-400", description: "Recon grid = Outlet\u00d7PM\u00d7Period. Go-live = Outlet\u00d7PM with date." },
];

interface Props {
  slug: string;
}

export default function SolutionOnboardingPanel({ slug }: Props) {
  const [previewing, setPreviewing] = useState(false);
  const [activeTab, setActiveTab] = useState<"template" | "config" | "scan" | "master-data">("template");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ status: string; stats: any } | null>(null);
  const { data: templates } = useSolutionTemplates();
  const updateTemplate = useUpdateSolutionTemplate();

  const template = templates?.find((t) => t.slug === slug);

  if (!template) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-zinc-500">
        No onboarding template found for "{slug}"
      </div>
    );
  }

  // Preview mode — render the matrix with example data, full-screen overlay
  if (previewing && template.example_data) {
    const mockInstance: SolutionInstanceWithTemplate = {
      id: "preview",
      domain: "Example Domain",
      template_id: template.id,
      template_version: template.version,
      data: template.example_data,
      total_items: 0,
      completed_items: 0,
      progress_pct: 0,
      status: "active",
      started_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      template: template,
    };
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950">
        <SolutionMatrixView
          instance={mockInstance}
          onBack={() => setPreviewing(false)}
        />
      </div>
    );
  }

  const tabs = template.template.tabs || [];
  const allSections = tabs.flatMap((t) => t.sections);
  const statusBadge = template.status === "published"
    ? { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Published" }
    : { bg: "bg-amber-500/10", text: "text-amber-400", label: "Draft" };
  const hasValConfig = !!(template.template as any).valConfig;

  const handlePublish = () => {
    updateTemplate.mutate({
      id: template.id,
      updates: { status: template.status === "published" ? "draft" : "published" },
    });
  };

  const panelTabs = [
    { key: "template" as const, label: "Template" },
    ...(hasValConfig ? [{ key: "config" as const, label: "Config" }] : []),
    ...(hasValConfig ? [{ key: "scan" as const, label: "Scan Rules" }] : []),
    ...(hasValConfig ? [{ key: "master-data" as const, label: "Master Data" }] : []),
  ];

  return (
    <div className="p-6 max-w-none">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex-1 mr-6">
          <h2 className="text-lg font-bold">{template.name}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {template.description}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${statusBadge.bg} ${statusBadge.text}`}>
            {statusBadge.label}
          </span>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-500 font-mono">v{template.version}</span>
          <button
            onClick={() => setPreviewing(true)}
            disabled={!template.example_data}
            className="text-xs font-semibold px-3 py-1.5 rounded border cursor-pointer transition-colors bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Preview with Example Data
          </button>
          <button
            onClick={handlePublish}
            className="text-xs font-semibold px-3 py-1.5 rounded border cursor-pointer transition-colors bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
          >
            {template.status === "published" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {/* Panel Tabs */}
      {panelTabs.length > 1 && (
        <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
          {panelTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`text-xs font-semibold px-4 py-2 border-b-2 -mb-px transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-500 dark:text-blue-400"
                  : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Template Tab */}
      {activeTab === "template" && (
        <>
          {/* Tabs preview */}
          <div className="mb-6">
            <SectionLabel label="Tabs" />
            <div className="flex gap-2 flex-wrap">
              {tabs.map((tab: TemplateTab) => (
                <div key={tab.key} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${TAB_DOT_COLORS[tab.color] || "bg-blue-400"}`} />
                  {tab.label}
                </div>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="mb-6">
            <SectionLabel label={`Sections (${allSections.length})`} />
            <div className="grid grid-cols-2 gap-2">
              {allSections.map((section) => {
                const tag = SECTION_TYPE_TAGS[section.type];
                return (
                  <div key={section.key} className="flex items-center gap-2 text-xs px-3 py-2.5 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-400">
                    {section.label}
                    {tag && (
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ml-auto ${tag.color}`}>
                        {tag.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Auto-generation rules */}
          <div className="mb-6">
            <SectionLabel label="Auto-Generation Rules" />
            <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
              {AUTO_GEN_RULES.map((rule) => (
                <div key={rule.tab} className="flex gap-2">
                  <span className={`font-semibold w-[100px] shrink-0 ${rule.colorClass}`}>{rule.tab}</span>
                  <span className="text-zinc-600 dark:text-zinc-600">&rarr;</span>
                  <span>{rule.description}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Config Tab */}
      {activeTab === "config" && hasValConfig && (
        <>
          {/* Generate Config button */}
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={async () => {
                if (!confirm("This will regenerate workflow assignments based on production deployment data. Existing table and dashboard configs will be preserved. Continue?")) return;
                setGenerating(true);
                setGenResult(null);
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  const [supabaseUrl, anonKey] = await invoke<[string | null, string | null]>("settings_get_supabase_credentials");
                  if (!supabaseUrl || !anonKey) throw new Error("Supabase credentials not configured");
                  const res = await fetch(`${supabaseUrl}/functions/v1/generate-solution-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "apikey": anonKey },
                    body: JSON.stringify({ template_slug: slug }),
                  });
                  const result = await res.json();
                  if (!res.ok) throw new Error(result.error || `Failed (${res.status})`);
                  setGenResult(result);
                  window.location.reload();
                } catch (e: any) {
                  alert(`Generate failed: ${e.message || e}`);
                } finally {
                  setGenerating(false);
                }
              }}
              disabled={generating}
              className="text-[11px] font-semibold px-4 py-2 rounded border cursor-pointer transition-colors bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 hover:bg-teal-500/20 disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate Config from Domains"}
            </button>
            <button
              onClick={async () => {
                setGenerating(true);
                setGenResult(null);
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  const [supabaseUrl, anonKey] = await invoke<[string | null, string | null]>("settings_get_supabase_credentials");
                  if (!supabaseUrl || !anonKey) throw new Error("Supabase credentials not configured");
                  const res = await fetch(`${supabaseUrl}/functions/v1/generate-solution-config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "apikey": anonKey },
                    body: JSON.stringify({ template_slug: slug, dry_run: true }),
                  });
                  const result = await res.json();
                  if (!res.ok) throw new Error(result.error || `Failed (${res.status})`);
                  setGenResult(result);
                } catch (e: any) {
                  alert(`Dry run failed: ${e.message || e}`);
                } finally {
                  setGenerating(false);
                }
              }}
              disabled={generating}
              className="text-[11px] font-semibold px-3 py-2 rounded border cursor-pointer transition-colors bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20 disabled:opacity-50"
            >
              Dry Run
            </button>
            <span className="text-[10px] text-zinc-400">Scans production domains to classify workflows by deployment frequency</span>
          </div>

          {/* Dry run results */}
          {genResult && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-teal-500/5 border border-teal-500/20">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${genResult.status === "updated" ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"}`}>
                  {genResult.status === "updated" ? "Applied" : "Preview"}
                </span>
                <span className="text-xs text-zinc-500">{genResult.stats?.totalProdDomains} production domains scanned</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-zinc-500">Base workflows:</span>{" "}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{genResult.stats?.baseWorkflows}</span>
                  <span className="text-zinc-400 ml-1">(threshold: {genResult.stats?.baseThreshold}+ domains)</span>
                </div>
                <div>
                  <span className="text-zinc-500">System workflows:</span>{" "}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{genResult.stats?.systemWorkflows}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Systems with workflows:</span>{" "}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{genResult.stats?.systemsWithWorkflows?.length}</span>
                </div>
              </div>
              {genResult.stats?.systemsWithWorkflows && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {genResult.stats.systemsWithWorkflows.map((s: any) => {
                    const total = Object.values(s.categories as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
                    return (
                      <span key={s.system} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {s.system} <span className="font-mono">{total}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <ValConfigSection
            valConfig={(template.template as any).valConfig}
            onSave={(newConfig: any) => {
              updateTemplate.mutate({
                id: template.id,
                updates: { template: { ...template.template, valConfig: newConfig } as any },
              });
            }}
          />
        </>
      )}

      {/* Scan Rules Tab */}
      {activeTab === "scan" && hasValConfig && (
        <ScanRulesSection
          scanBindings={template.template.scanBindings}
          systems={(template.template as any).valConfig?.systems || []}
          onSave={(newBindings) => {
            const nextTemplate: TemplateDefinition = { ...template.template, scanBindings: newBindings };
            updateTemplate.mutate({
              id: template.id,
              updates: { template: nextTemplate as any },
            });
          }}
        />
      )}

      {/* Master Data Tab — template-level preset values that get pushed to
          VAL master tables during onboarding. First section: Date Params. */}
      {activeTab === "master-data" && hasValConfig && (
        <MasterDataSection
          valConfig={(template.template as any).valConfig}
          onSave={(newValConfig: any) => {
            updateTemplate.mutate({
              id: template.id,
              updates: { template: { ...template.template, valConfig: newValConfig } as any },
            });
          }}
        />
      )}
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
      {label}
      <span className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

const WF_CAT_COLORS: Record<string, string> = {
  transform: "bg-emerald-500/10 text-emerald-400",
  missingMapping: "bg-amber-500/10 text-amber-400",
  dataChecks: "bg-blue-500/10 text-blue-400",
  dailyAgg: "bg-cyan-500/10 text-cyan-400",
  enrichment: "bg-purple-500/10 text-purple-400",
  execution: "bg-rose-500/10 text-rose-400",
  glRecon: "bg-orange-500/10 text-orange-400",
  crossDomain: "bg-indigo-500/10 text-indigo-400",
  dataLoad: "bg-sky-500/10 text-sky-400",
  solRecon: "bg-pink-500/10 text-pink-400",
  solAnalytics: "bg-violet-500/10 text-violet-400",
  shared: "bg-zinc-500/10 text-zinc-400",
  raw: "bg-teal-500/10 text-teal-400",
  udt: "bg-lime-500/10 text-lime-400",
  udtCrossRecon: "bg-lime-500/10 text-lime-500",
  posRecon: "bg-orange-500/10 text-orange-400",
  internal: "bg-zinc-400/10 text-zinc-400",
  other: "bg-zinc-500/10 text-zinc-500",
};

function WfBadge({ category, count }: { category: string; count: number }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded ${WF_CAT_COLORS[category] || WF_CAT_COLORS.other}`}>
      {category} <span className="opacity-60">{count}</span>
    </span>
  );
}

function TableChip({ id }: { id: string }) {
  return (
    <span className="font-mono text-[10px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
      {id.trim()}
    </span>
  );
}

const TABLE_ROLES_BY_TYPE: Record<string, string[]> = {
  POS: ["statementSource", "outletMap", "platformMap"],
  "Platform Delivery": ["statementSource", "outletMap", "platformMap"],
  "Platform In Store Payment": ["statementSource", "outletMap", "platformMap"],
  Bank: ["statementSource", "outletMap", "bankAcctMap", "bankCounterpartyMap"],
};

const inputClass = "w-full text-[11px] font-mono px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 placeholder:text-zinc-300 dark:placeholder:text-zinc-600";
const labelClass = "text-[10px] font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wide";

function ValConfigSection({ valConfig, onSave }: { valConfig: any; onSave: (config: any) => void }) {
  const [expandedSystem, setExpandedSystem] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newSystem, setNewSystem] = useState({ id: "", type: "" });
  const base = valConfig.base;
  const systems: any[] = valConfig.systems || [];

  // All template configs reference lab domain — auto-load schema resources
  const { data: domains } = useValDomains();
  const globalPath = domains?.find((d) => d.domain === "lab")?.global_path ?? null;
  const { data: schema } = useSchemaResources(globalPath);

  // Memoize picker items from schema
  const workflowItems = useMemo(
    () => (schema?.workflows ?? []).map((w) => ({ id: w.id, label: w.name, sublabel: String(w.id) })),
    [schema?.workflows],
  );
  const tableItems = useMemo(
    () => (schema?.tables ?? []).map((t) => ({ id: t.value, label: t.name, sublabel: t.value })),
    [schema?.tables],
  );
  const dashboardItems = useMemo(
    () => (schema?.dashboards ?? []).map((d) => ({ id: d.id, label: d.name, sublabel: String(d.id) })),
    [schema?.dashboards],
  );

  const groups = [
    { type: "Bank", label: "Banks" },
    { type: "Platform Delivery", label: "Delivery Platforms" },
    { type: "Platform In Store Payment", label: "In-Store Payments" },
    { type: "POS", label: "POS Systems" },
  ];

  // Save a system field change
  const saveSystem = (systemId: string, path: string[], value: any) => {
    const newSystems = systems.map((s: any) => {
      if (s.id !== systemId) return s;
      const updated = JSON.parse(JSON.stringify(s));
      let target = updated;
      for (let i = 0; i < path.length - 1; i++) {
        if (!target[path[i]]) target[path[i]] = {};
        target = target[path[i]];
      }
      target[path[path.length - 1]] = value;
      return updated;
    });
    onSave({ ...valConfig, systems: newSystems });
  };

  // Delete a system
  const deleteSystem = (systemId: string) => {
    onSave({ ...valConfig, systems: systems.filter((s: any) => s.id !== systemId) });
    setExpandedSystem(null);
  };

  // Add a new system
  const addSystem = (type: string) => {
    if (!newSystem.id.trim()) return;
    const roles = TABLE_ROLES_BY_TYPE[type] || [];
    const tables: Record<string, string> = {};
    roles.forEach((r) => { tables[r] = ""; });
    const sys = { id: newSystem.id.trim(), type, tables, workflows: {}, dashboards: [], driveFolder: "" };
    onSave({ ...valConfig, systems: [...systems, sys] });
    setNewSystem({ id: "", type: "" });
    setAddingTo(null);
    setExpandedSystem(sys.id);
  };

  // Delete a workflow category
  const deleteWfCategory = (systemId: string, cat: string) => {
    const sys = systems.find((s: any) => s.id === systemId);
    if (!sys) return;
    const wf = { ...sys.workflows };
    delete wf[cat];
    saveSystem(systemId, ["workflows"], wf);
  };

  // Add a workflow category
  const addWfCategory = (systemId: string, cat: string) => {
    saveSystem(systemId, ["workflows", cat], []);
  };

  // Delete a table role
  const deleteTableRole = (systemId: string, role: string) => {
    const sys = systems.find((s: any) => s.id === systemId);
    if (!sys) return;
    const tables = { ...sys.tables };
    delete tables[role];
    saveSystem(systemId, ["tables"], tables);
  };

  // Add a table role
  const addTableRole = (systemId: string, role: string) => {
    saveSystem(systemId, ["tables", role], "");
  };

  return (
    <>
      {/* Base Resources — editable */}
      <div className="mb-6">
        <SectionLabel label="Base Resources (always synced)" />
        <BaseResourcesEditor
          base={base}
          onSave={(newBase: any) => onSave({ ...valConfig, base: newBase })}
          workflowItems={workflowItems}
          tableItems={tableItems}
          dashboardItems={dashboardItems}
          hasSchema={!!schema}
        />
      </div>

      {/* Per-System Config */}
      {groups.map((group) => {
        const groupSystems = systems.filter((s: any) => s.type === group.type);
        const isGroupExpanded = expandedGroups.has(group.type);
        const toggleGroup = () => {
          setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(group.type)) next.delete(group.type);
            else next.add(group.type);
            return next;
          });
        };
        return (
          <div key={group.type} className="mb-6">
            <div onClick={toggleGroup} className="cursor-pointer">
              <SectionLabel label={`${group.label} (${groupSystems.length})`} />
            </div>
            {isGroupExpanded && (
            <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
              <table className="w-full table-fixed border-collapse text-xs">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[12%]">System</th>
                    <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[24%]">Tables</th>
                    <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[30%]">Workflows</th>
                    <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[18%]">Drive Folder</th>
                    <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Dashboards</th>
                    <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[6%]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groupSystems.map((sys: any) => {
                    const tableCount = Object.values(sys.tables || {}).filter(Boolean).length;
                    const wfCount = Object.values(sys.workflows || {}).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0);
                    const dashCount = Array.isArray(sys.dashboards) ? sys.dashboards.length : Object.values(sys.dashboards || {}).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0);
                    const hasResources = tableCount > 0 || wfCount > 0;
                    const isExpanded = expandedSystem === sys.id;

                    return (
                      <SystemRow
                        key={sys.id}
                        sys={sys}
                        tableCount={tableCount}
                        wfCount={wfCount}
                        dashCount={dashCount}
                        hasResources={hasResources}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedSystem(isExpanded ? null : sys.id)}
                        onSaveField={(path, value) => saveSystem(sys.id, path, value)}
                        onDelete={() => deleteSystem(sys.id)}
                        onDeleteWfCat={(cat) => deleteWfCategory(sys.id, cat)}
                        onAddWfCat={(cat) => addWfCategory(sys.id, cat)}
                        onDeleteTableRole={(role) => deleteTableRole(sys.id, role)}
                        onAddTableRole={(role) => addTableRole(sys.id, role)}
                        workflowItems={workflowItems}
                        tableItems={tableItems}
                        dashboardItems={dashboardItems}
                        hasSchema={!!schema}
                      />
                    );
                  })}
                  {/* Add system row */}
                  <tr>
                    <td colSpan={6} className="px-3 py-2">
                      {addingTo === group.type ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={newSystem.id}
                            onChange={(e) => setNewSystem({ ...newSystem, id: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && addSystem(group.type)}
                            placeholder="System name..."
                            className={`${inputClass} w-48`}
                          />
                          <button
                            onClick={() => addSystem(group.type)}
                            disabled={!newSystem.id.trim()}
                            className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-40 cursor-pointer"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => { setAddingTo(null); setNewSystem({ id: "", type: "" }); }}
                            className="text-[10px] font-semibold px-2 py-1 rounded text-zinc-400 hover:text-zinc-600 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingTo(group.type)}
                          className="text-[10px] font-semibold text-zinc-400 hover:text-blue-400 cursor-pointer"
                        >
                          + Add {group.label.replace(/s$/, "")}
                        </button>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Picker item type ───
type PickerItem = { id: string | number; label: string; sublabel?: string };

// ─── Base Resources Editor ───
function BaseResourcesEditor({ base, onSave, workflowItems, tableItems, dashboardItems, hasSchema }: {
  base: any; onSave: (base: any) => void;
  workflowItems: PickerItem[]; tableItems: PickerItem[]; dashboardItems: PickerItem[];
  hasSchema: boolean;
}) {
  const [expanded, setExpanded] = useState<"tables" | "workflows" | "dashboards" | null>(null);
  const [newTableKey, setNewTableKey] = useState("");
  const [newWfCat, setNewWfCat] = useState("");

  const masterTables = base.masterTables || {};
  const workflows = base.workflows || {};
  const dashboards = base.dashboards || [];

  const masterTableCount = Object.values(masterTables).reduce((sum: number, v: any) => {
    if (typeof v === "string" || v?.table) return sum + 1;
    return sum + Object.keys(v).length;
  }, 0);
  const totalWf = Object.values(workflows).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0);

  const parseIds = (val: string): number[] =>
    val.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));

  const saveTable = (key: string, value: string) => {
    onSave({ ...base, masterTables: { ...masterTables, [key]: value } });
  };
  const deleteTable = (key: string) => {
    const next = { ...masterTables };
    delete next[key];
    onSave({ ...base, masterTables: next });
  };
  const addTable = () => {
    if (!newTableKey.trim()) return;
    onSave({ ...base, masterTables: { ...masterTables, [newTableKey.trim()]: "" } });
    setNewTableKey("");
  };

  const saveWfCat = (cat: string, ids: number[]) => {
    onSave({ ...base, workflows: { ...workflows, [cat]: ids } });
  };
  const deleteWfCat = (cat: string) => {
    const next = { ...workflows };
    delete next[cat];
    onSave({ ...base, workflows: next });
  };
  const addWfCat = () => {
    if (!newWfCat.trim() || workflows[newWfCat.trim()]) return;
    onSave({ ...base, workflows: { ...workflows, [newWfCat.trim()]: [] } });
    setNewWfCat("");
  };

  // saveDashboards handled inline via CategorizedResourceEditor onChange

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Master Tables */}
      <div
        onClick={() => setExpanded(expanded === "tables" ? null : "tables")}
        className="px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 cursor-pointer hover:border-blue-500/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold text-zinc-700 dark:text-zinc-300">{masterTableCount}</div>
          <span className={`text-[9px] text-zinc-400 transition-transform ${expanded === "tables" ? "rotate-90" : ""}`}>&#9654;</span>
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Master Tables</div>
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
          {Object.keys(masterTables).slice(0, 5).join(", ")}{Object.keys(masterTables).length > 5 ? "..." : ""}
        </div>
      </div>

      {/* Workflows */}
      <div
        onClick={() => setExpanded(expanded === "workflows" ? null : "workflows")}
        className="px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 cursor-pointer hover:border-blue-500/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold text-zinc-700 dark:text-zinc-300">{totalWf}</div>
          <span className={`text-[9px] text-zinc-400 transition-transform ${expanded === "workflows" ? "rotate-90" : ""}`}>&#9654;</span>
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Workflows</div>
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
          {Object.entries(workflows).sort(([, a]: any, [, b]: any) => b.length - a.length).slice(0, 4).map(([cat, ids]: [string, any]) => `${cat} (${ids.length})`).join(", ")}
        </div>
      </div>

      {/* Dashboards */}
      <div
        onClick={() => setExpanded(expanded === "dashboards" ? null : "dashboards")}
        className="px-4 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 cursor-pointer hover:border-blue-500/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold text-zinc-700 dark:text-zinc-300">{Array.isArray(dashboards) ? dashboards.length : Object.values(dashboards).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0)}</div>
          <span className={`text-[9px] text-zinc-400 transition-transform ${expanded === "dashboards" ? "rotate-90" : ""}`}>&#9654;</span>
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Dashboards</div>
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
          {Array.isArray(dashboards) ? "Recon, analytics, and reporting dashboards" :
            Object.entries(dashboards).sort(([, a]: any, [, b]: any) => b.length - a.length).slice(0, 4).map(([cat, ids]: [string, any]) => `${cat} (${ids.length})`).join(", ")
          }
        </div>
      </div>

      {/* Expanded editor — full width below cards */}
      {expanded === "tables" && (
        <div className="col-span-3 px-4 py-4 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
          <div className={`${labelClass} mb-3`}>Master Tables</div>
          <div className="space-y-2">
            {Object.entries(masterTables).map(([key, val]: [string, any]) => {
              const tableVal = typeof val === "object" && val?.table ? val.table : (typeof val === "string" ? val : "");
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 w-[140px] shrink-0 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  {hasSchema ? (
                    <div className="flex-1">
                      <ResourcePicker
                        items={tableItems}
                        value={tableVal ? [tableVal] : []}
                        onChange={(v) => saveTable(key, (v[0] as string) ?? "")}
                        mode="single"
                        placeholder="Search tables..."
                      />
                    </div>
                  ) : (
                    <input
                      className={`${inputClass} flex-1`}
                      defaultValue={tableVal}
                      placeholder="custom_tbl_..."
                      onBlur={(e) => { if (e.target.value !== tableVal) saveTable(key, e.target.value); }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  )}
                  <button onClick={() => deleteTable(key)} className="text-[9px] text-red-400 hover:text-red-500 cursor-pointer shrink-0">&times;</button>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-1">
              <input
                value={newTableKey}
                onChange={(e) => setNewTableKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTable()}
                placeholder="+ table key (e.g. outlets)"
                className={`${inputClass} w-[200px]`}
              />
              {newTableKey.trim() && (
                <button onClick={addTable} className="text-[10px] font-semibold text-blue-400 hover:text-blue-500 cursor-pointer">Add</button>
              )}
            </div>
          </div>
        </div>
      )}

      {expanded === "workflows" && (
        <div className="col-span-3 px-4 py-4 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
          <div className={`${labelClass} mb-3`}>Workflows by Category</div>
          <div className="space-y-2">
            {Object.entries(workflows).map(([cat, ids]: [string, any]) => (
              <div key={cat}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-zinc-500 capitalize">{cat} <span className="text-zinc-400">({(ids || []).length})</span></span>
                  <button onClick={() => deleteWfCat(cat)} className="text-[9px] text-red-400 hover:text-red-500 cursor-pointer">remove</button>
                </div>
                {hasSchema ? (
                  <ResourcePicker
                    items={workflowItems}
                    value={ids || []}
                    onChange={(v) => saveWfCat(cat, v as number[])}
                    mode="multi"
                    placeholder="Search workflows..."
                  />
                ) : (
                  <input
                    className={inputClass}
                    defaultValue={(ids || []).join(", ")}
                    placeholder="Workflow IDs (comma-separated)"
                    onBlur={(e) => {
                      const newIds = parseIds(e.target.value);
                      if (JSON.stringify(newIds) !== JSON.stringify(ids)) saveWfCat(cat, newIds);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <input
                value={newWfCat}
                onChange={(e) => setNewWfCat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addWfCat()}
                placeholder="+ category name"
                className={`${inputClass} w-[200px]`}
              />
              {newWfCat.trim() && (
                <button onClick={addWfCat} className="text-[10px] font-semibold text-blue-400 hover:text-blue-500 cursor-pointer">Add</button>
              )}
            </div>
          </div>
        </div>
      )}

      {expanded === "dashboards" && (
        <div className="col-span-3 px-4 py-4 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
          <div className={`${labelClass} mb-3`}>Dashboards by Category</div>
          <CategorizedResourceEditor
            data={normalizeDashboards(dashboards)}
            onChange={(v) => onSave({ ...base, dashboards: v })}
            items={dashboardItems}
            hasSchema={hasSchema}
            resourceLabel="dashboard"
            parseIds={parseIds}
          />
        </div>
      )}
    </div>
  );
}

// Editable row for a single system
function SystemRow({
  sys, tableCount, wfCount, dashCount, hasResources, isExpanded,
  onToggle, onSaveField, onDelete, onDeleteWfCat, onAddWfCat,
  onDeleteTableRole, onAddTableRole,
  workflowItems, tableItems, dashboardItems, hasSchema,
}: {
  sys: any; tableCount: number; wfCount: number; dashCount: number;
  hasResources: boolean; isExpanded: boolean;
  onToggle: () => void;
  onSaveField: (path: string[], value: any) => void;
  onDelete: () => void;
  onDeleteWfCat: (cat: string) => void;
  onAddWfCat: (cat: string) => void;
  onDeleteTableRole: (role: string) => void;
  onAddTableRole: (role: string) => void;
  workflowItems: PickerItem[]; tableItems: PickerItem[]; dashboardItems: PickerItem[];
  hasSchema: boolean;
}) {
  const [newCat, setNewCat] = useState("");
  const [newTableRole, setNewTableRole] = useState("");

  // Parse comma-separated IDs to number array
  const parseIds = (val: string): number[] =>
    val.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));

  return (
    <>
      <tr
        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>&#9654;</span>
            <span className="font-medium">{sys.id}</span>
          </div>
        </td>
        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
          <div className="flex flex-wrap gap-1">
            {Object.entries(sys.tables || {}).map(([role, id]: [string, any]) =>
              id ? <TableChip key={role} id={id} /> : null
            )}
            {tableCount === 0 && <span className="text-zinc-400">—</span>}
          </div>
        </td>
        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
          <div className="flex flex-wrap gap-1">
            {Object.entries(sys.workflows || {}).map(([cat, ids]: [string, any]) =>
              ids?.length ? <WfBadge key={cat} category={cat} count={ids.length} /> : null
            )}
            {wfCount === 0 && <span className="text-zinc-400">—</span>}
          </div>
        </td>
        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50 font-mono text-[10px] text-zinc-400 max-w-[160px]">
          {sys.driveFolder
            ? <span className="truncate block" title={sys.driveFolder}>{sys.driveFolder}</span>
            : <span className="text-zinc-300 dark:text-zinc-600">—</span>
          }
        </td>
        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50 font-mono text-[10px] text-zinc-500">
          {dashCount > 0 ? dashCount : "—"}
        </td>
        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${hasResources ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-500 dark:text-amber-400"}`}>
            {hasResources ? "Ready" : "Needs Config"}
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="px-4 py-4 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="grid grid-cols-3 gap-6 text-[11px]">
              {/* Tables */}
              <div>
                <div className={`${labelClass} mb-2`}>Tables</div>
                <div className="space-y-2">
                  {Object.entries(sys.tables || {}).map(([role, val]: [string, any]) => (
                    <div key={role} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-zinc-500 capitalize">{role.replace(/([A-Z])/g, " $1").trim()}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteTableRole(role); }}
                          className="text-[9px] text-red-400 hover:text-red-500 cursor-pointer"
                        >
                          remove
                        </button>
                      </div>
                      {hasSchema ? (
                        <ResourcePicker
                          items={tableItems}
                          value={val ? (Array.isArray(val) ? val : [val]) : []}
                          onChange={(v) => onSaveField(["tables", role], v.length > 1 ? v.join(",") : (v[0] as string) ?? "")}
                          mode={typeof val === "string" && val.includes(",") ? "multi" : "single"}
                          placeholder="Search tables..."
                        />
                      ) : (
                        <input
                          className={inputClass}
                          defaultValue={val || ""}
                          placeholder="custom_tbl_..."
                          onBlur={(e) => {
                            if (e.target.value !== (val || "")) {
                              onSaveField(["tables", role], e.target.value);
                            }
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  ))}
                  {/* Add table role */}
                  <div className="flex items-center gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={newTableRole}
                      onChange={(e) => setNewTableRole(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTableRole.trim()) {
                          onAddTableRole(newTableRole.trim());
                          setNewTableRole("");
                        }
                      }}
                      placeholder="+ role (e.g. platformMap)"
                      className={`${inputClass} w-36`}
                    />
                    {newTableRole.trim() && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAddTableRole(newTableRole.trim()); setNewTableRole(""); }}
                        className="text-[9px] font-semibold text-blue-400 hover:text-blue-500 cursor-pointer"
                      >
                        add
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Workflows */}
              <div>
                <div className={`${labelClass} mb-2`}>Workflows</div>
                <div className="space-y-2">
                  {Object.entries(sys.workflows || {}).map(([cat, ids]: [string, any]) => (
                    <div key={cat} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-zinc-500 capitalize">{cat}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteWfCat(cat); }}
                          className="text-[9px] text-red-400 hover:text-red-500 cursor-pointer"
                        >
                          remove
                        </button>
                      </div>
                      {hasSchema ? (
                        <ResourcePicker
                          items={workflowItems}
                          value={ids || []}
                          onChange={(v) => onSaveField(["workflows", cat], v as number[])}
                          mode="multi"
                          placeholder="Search workflows..."
                        />
                      ) : (
                        <input
                          className={inputClass}
                          defaultValue={(ids || []).join(", ")}
                          placeholder="Workflow IDs (comma-separated)"
                          onBlur={(e) => {
                            const newIds = parseIds(e.target.value);
                            if (JSON.stringify(newIds) !== JSON.stringify(ids)) {
                              onSaveField(["workflows", cat], newIds);
                            }
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  ))}
                  {/* Add workflow category */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newCat.trim()) {
                          onAddWfCat(newCat.trim());
                          setNewCat("");
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="+ category"
                      className={`${inputClass} w-28`}
                    />
                    {newCat.trim() && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAddWfCat(newCat.trim()); setNewCat(""); }}
                        className="text-[9px] font-semibold text-blue-400 hover:text-blue-500 cursor-pointer"
                      >
                        add
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Dashboards */}
              <div onClick={(e) => e.stopPropagation()}>
                <div className={`${labelClass} mb-2`}>Dashboards</div>
                <CategorizedResourceEditor
                  data={normalizeDashboards(sys.dashboards)}
                  onChange={(v) => onSaveField(["dashboards"], v)}
                  items={dashboardItems}
                  hasSchema={hasSchema}
                  resourceLabel="dashboard"
                  parseIds={parseIds}
                />
              </div>
            </div>

            {/* VAL Drive Folder */}
            <div className="mt-4 pt-3 border-t border-zinc-200/50 dark:border-zinc-800/50" onClick={(e) => e.stopPropagation()}>
              <div className={`${labelClass} mb-1.5`}>VAL Drive Folder</div>
              <input
                className={`${inputClass} max-w-sm`}
                defaultValue={sys.driveFolder || ""}
                placeholder="val_drive/RevRec/01_SourceReports"
                onBlur={(e) => {
                  if (e.target.value !== (sys.driveFolder || "")) {
                    onSaveField(["driveFolder"], e.target.value);
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </div>

            {/* Delete */}
            <div className="mt-3 flex justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${sys.id}?`)) onDelete(); }}
                className="text-[10px] font-semibold text-red-400 hover:text-red-500 cursor-pointer"
              >
                Delete System
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Normalize dashboards: convert number[] to Record<string, number[]> ───
function normalizeDashboards(dashboards: any): Record<string, number[]> {
  if (!dashboards) return {};
  // Already categorized
  if (typeof dashboards === "object" && !Array.isArray(dashboards)) return dashboards;
  // Legacy flat array — put all under "general"
  if (Array.isArray(dashboards) && dashboards.length > 0) {
    return { general: dashboards.filter((d: any) => typeof d === "number") };
  }
  return {};
}

// ─── Categorized resource editor (used for dashboards, same pattern as workflows) ───
function CategorizedResourceEditor({ data, onChange, items, hasSchema, resourceLabel, parseIds }: {
  data: Record<string, number[]>;
  onChange: (data: Record<string, number[]>) => void;
  items: PickerItem[];
  hasSchema: boolean;
  resourceLabel: string;
  parseIds: (val: string) => number[];
}) {
  const [newCat, setNewCat] = useState("");

  const saveCat = (cat: string, ids: number[]) => {
    onChange({ ...data, [cat]: ids });
  };
  const deleteCat = (cat: string) => {
    const next = { ...data };
    delete next[cat];
    onChange(next);
  };
  const addCat = () => {
    if (!newCat.trim() || data[newCat.trim()]) return;
    onChange({ ...data, [newCat.trim()]: [] });
    setNewCat("");
  };

  return (
    <div className="space-y-2">
      {Object.entries(data).map(([cat, ids]) => (
        <div key={cat}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-zinc-500 capitalize">{cat} <span className="text-zinc-400">({(ids || []).length})</span></span>
            <button onClick={() => deleteCat(cat)} className="text-[9px] text-red-400 hover:text-red-500 cursor-pointer">remove</button>
          </div>
          {hasSchema ? (
            <ResourcePicker
              items={items}
              value={ids || []}
              onChange={(v) => saveCat(cat, v as number[])}
              mode="multi"
              placeholder={`Search ${resourceLabel}s...`}
            />
          ) : (
            <input
              className={inputClass}
              defaultValue={(ids || []).join(", ")}
              placeholder={`${resourceLabel} IDs (comma-separated)`}
              onBlur={(e) => {
                const newIds = parseIds(e.target.value);
                if (JSON.stringify(newIds) !== JSON.stringify(ids)) saveCat(cat, newIds);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-1.5 mt-1">
        <input
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newCat.trim()) addCat(); }}
          placeholder="+ category (e.g. recon, analytics)"
          className={`${inputClass} w-[200px]`}
        />
        {newCat.trim() && (
          <button onClick={addCat} className="text-[9px] font-semibold text-blue-400 hover:text-blue-500 cursor-pointer">add</button>
        )}
      </div>
    </div>
  );
}

// ─── ScanRulesSection ───
// Template-level defaults for "which column in a scanned file is the outlet /
// date" per connector. Reads the fingerprint index so the pickers show real
// trained headers. Instance-level overrides in the Collection tab take
// precedence over whatever's saved here.

interface ConnectorFingerprint {
  platform: string;
  headers: string[];
  format: string;
}

function normalizePlatform(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]+/g, "");
}

// Loose match: same after normalization, or one is a prefix of the other.
// Catches cases like "NETS" fingerprint serving "NETS CC" system, or
// "CDC" fingerprint serving "CDC Voucher".
function platformMatches(systemId: string, fingerprintPlatform: string): boolean {
  const s = normalizePlatform(systemId);
  const f = normalizePlatform(fingerprintPlatform);
  if (!s || !f) return false;
  return s === f || s.startsWith(f) || f.startsWith(s);
}

// Mirror of the regex heuristics in useFileScanner.ts — used here to show
// implementers what the auto-detector *would* pick for a given fingerprint,
// so the "— auto —" option in the dropdown isn't opaque.
// IMPORTANT: keep these in sync with useFileScanner.ts. If you change one,
// change both — they implement the same semantics for live scanning vs preview.
function autoDetectOutletColumn(headers: string[]): string | null {
  // Exclude IDs, codes, types, maps — these are not outlet *name* columns.
  // Uses word boundaries so `store id` is rejected but `storeid` is too
  // (since id is at the end), while `reportstore` etc. stay untouched.
  const excludeRx = /\b(id|code|number|type|group|category|map|mdr|no)\b|id$|_id|_code|_no$/i;
  const tryFind = (pat: RegExp) =>
    headers.find((h) => pat.test(h) && !excludeRx.test(h)) || null;

  return (
    tryFind(/store[\s_-]?name/i) ||
    tryFind(/outlet[\s_-]?name/i) ||
    tryFind(/branch[\s_-]?name/i) ||
    tryFind(/restaurant[\s_-]?name/i) ||
    tryFind(/location[\s_-]?name/i) ||
    tryFind(/shop[\s_-]?name/i) ||
    tryFind(/site[\s_-]?name/i) ||
    tryFind(/merchant[\s_-]?name/i) ||
    tryFind(/\bstore\b/i) ||
    tryFind(/\boutlet\b/i) ||
    tryFind(/\bbranch\b/i) ||
    tryFind(/\brestaurant\b/i) ||
    tryFind(/\blocation\b/i) ||
    null
  );
}

function autoDetectDateColumn(headers: string[]): string | null {
  // Keywords distinctive enough to avoid false positives. Deliberately
  // excludes short tokens like `to`, `from`, `end`, `start`, `day`, `month`,
  // `transaction`, `order` — those caused matches like `store name → to`,
  // `order id → order`, `subtotal → to`, etc.
  const includeRx = /date|timestamp|time|created|updated|posted|posting|settled|settlement|payout|processed|effective/i;
  // Exclude headers that are clearly money/identifiers even if they share a
  // keyword (e.g. `settlement amount` contains `settlement` but is currency).
  const excludeRx = /\b(amount|value|fee|total|sum|currency|price|rate|reference|id|number|mdr)\b|id$|_id/i;
  // Prefer headers that explicitly contain `date` or `time` before verb forms.
  const datePat = /date|timestamp|\btime\b|_time\b|time_/i;
  const datePreferred = headers.find((h) => datePat.test(h) && !excludeRx.test(h));
  if (datePreferred) return datePreferred;
  return headers.find((h) => includeRx.test(h) && !excludeRx.test(h)) || null;
}

function ScanRulesSection({
  scanBindings,
  systems,
  onSave,
}: {
  scanBindings: Record<string, ScanBinding> | undefined;
  systems: { id: string; type?: string }[];
  onSave: (bindings: Record<string, ScanBinding>) => void;
}) {
  const paths = usePrimaryKnowledgePaths();
  const fingerprintPath = paths ? `${paths.platform}/connectors/_fingerprints.json` : null;

  const [fingerprints, setFingerprints] = useState<Record<string, ConnectorFingerprint>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!fingerprintPath) return;
    let cancelled = false;
    invoke<string>("read_file", { path: fingerprintPath })
      .then((raw) => {
        if (cancelled) return;
        try {
          setFingerprints(JSON.parse(raw) as Record<string, ConnectorFingerprint>);
          setLoadError(null);
        } catch (e) {
          setLoadError(`Failed to parse fingerprints: ${e instanceof Error ? e.message : String(e)}`);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(`Failed to load fingerprints: ${e instanceof Error ? e.message : String(e)}`);
      });
    return () => { cancelled = true; };
  }, [fingerprintPath]);

  const bindings = scanBindings || {};

  const update = (connectorId: string, field: "outlet" | "date", value: string) => {
    const current = bindings[connectorId] || {};
    const next: ScanBinding = { ...current };
    if (value) next[field] = value;
    else delete next[field];

    const nextMap: Record<string, ScanBinding> = { ...bindings };
    if (!next.outlet && !next.date) {
      delete nextMap[connectorId];
    } else {
      next.updatedAt = new Date().toISOString();
      nextMap[connectorId] = next;
    }
    onSave(nextMap);
  };

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"platform" | "updated">("platform");
  const [boundOnly, setBoundOnly] = useState(false);

  const allEntries = Object.entries(fingerprints);

  const matchesSearch = (connectorId: string, fp: ConnectorFingerprint): boolean => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return connectorId.toLowerCase().includes(q) || fp.platform.toLowerCase().includes(q) || fp.format.toLowerCase().includes(q);
  };

  const isBound = (connectorId: string): boolean => {
    const b = bindings[connectorId];
    return Boolean(b?.outlet || b?.date);
  };

  const filter = (list: typeof allEntries) =>
    list.filter(([id, fp]) => matchesSearch(id, fp) && (!boundOnly || isBound(id)));

  const relevant = filter(allEntries.filter(([, fp]) =>
    systems.some((s) => platformMatches(s.id, fp.platform)),
  ));
  const relevantIds = new Set(relevant.map(([id]) => id));
  const other = filter(allEntries.filter(([id]) => !relevantIds.has(id) && !systems.some((s) => platformMatches(s.id, fingerprints[id]?.platform || ""))));

  const sortByUpdated = (list: typeof allEntries) => {
    return [...list].sort((a, b) => {
      const ua = bindings[a[0]]?.updatedAt || "";
      const ub = bindings[b[0]]?.updatedAt || "";
      if (ua && !ub) return -1;
      if (!ua && ub) return 1;
      return ub.localeCompare(ua); // desc
    });
  };

  const groupByPlatform = (list: typeof allEntries) => {
    const groups = new Map<string, typeof allEntries>();
    for (const entry of list) {
      const platform = entry[1].platform;
      if (!groups.has(platform)) groups.set(platform, []);
      groups.get(platform)!.push(entry);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  };

  const renderList = (list: typeof allEntries) => {
    if (list.length === 0) return null;
    if (sortMode === "updated") {
      // Flat table, no platform grouping, sorted by updatedAt desc.
      return <ScanRulesTable groups={[["", sortByUpdated(list)]]} bindings={bindings} onUpdate={update} hideGroupHeaders />;
    }
    return <ScanRulesTable groups={groupByPlatform(list)} bindings={bindings} onUpdate={update} />;
  };

  return (
    <div className="mb-6 w-full">
      <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-4 leading-relaxed">
        Per-connector defaults for which columns the drop-folder scanner uses to extract <span className="font-mono text-zinc-600 dark:text-zinc-400">outlet</span> and <span className="font-mono text-zinc-600 dark:text-zinc-400">date</span> values. Domains can override any of these per-instance from their Collection tab.
      </p>

      {/* Search + sort controls */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search connectors, platforms…"
          className="flex-1 text-xs px-3 py-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
        />
        <div className="flex items-center rounded border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setSortMode("platform")}
            className={`text-xs font-semibold px-3 py-2 cursor-pointer ${sortMode === "platform" ? "bg-blue-500/10 text-blue-500" : "bg-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
          >
            Platform
          </button>
          <button
            type="button"
            onClick={() => setSortMode("updated")}
            className={`text-xs font-semibold px-3 py-2 cursor-pointer border-l border-zinc-200 dark:border-zinc-700 ${sortMode === "updated" ? "bg-blue-500/10 text-blue-500" : "bg-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
          >
            Recently Updated
          </button>
        </div>
        <button
          type="button"
          onClick={() => setBoundOnly((v) => !v)}
          className={`text-xs font-semibold px-3 py-2 rounded border cursor-pointer ${boundOnly ? "bg-teal-500/10 text-teal-500 border-teal-500/30" : "bg-transparent text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
          title="Show only connectors with a template-level binding set"
        >
          Bound only
        </button>
      </div>

      {loadError && (
        <div className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 mb-3">
          {loadError}
        </div>
      )}
      {!loadError && allEntries.length === 0 && (
        <div className="text-[10px] text-zinc-400 italic">Loading fingerprints…</div>
      )}

      {allEntries.length > 0 && (
        <>
          {relevant.length > 0 ? (
            renderList(relevant)
          ) : (
            <div className="text-[10px] text-zinc-400 italic">
              {search.trim() || boundOnly
                ? "No connectors match the current search/filter."
                : "No fingerprint connectors match the platforms in this template."}
            </div>
          )}

          {sortMode === "platform" && other.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-[10px] font-semibold text-zinc-400 hover:text-blue-500 cursor-pointer"
              >
                {showAll ? "Hide" : "Show"} {other.length} other connector{other.length === 1 ? "" : "s"} not used by this template
              </button>
              {showAll && (
                <div className="mt-2">
                  {renderList(other)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScanRulesTable({
  groups,
  bindings,
  onUpdate,
  hideGroupHeaders = false,
}: {
  groups: [string, [string, ConnectorFingerprint][]][];
  bindings: Record<string, ScanBinding>;
  onUpdate: (connectorId: string, field: "outlet" | "date", value: string) => void;
  hideGroupHeaders?: boolean;
}) {
  const renderRow = ([connectorId, fp]: [string, ConnectorFingerprint]) => {
    const binding = bindings[connectorId] || {};
    return (
      <tr key={connectorId} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30">
        <td className="px-3 py-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-400 border-b border-zinc-200/50 dark:border-zinc-800/50" title={connectorId}>
          {connectorId}
        </td>
        <td className="px-3 py-1.5 text-[10px] font-mono text-zinc-400 uppercase border-b border-zinc-200/50 dark:border-zinc-800/50">
          {fp.format}
        </td>
        <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
          <HeaderSelect
            value={binding.outlet || ""}
            headers={fp.headers}
            autoHint={autoDetectOutletColumn(fp.headers)}
            onChange={(v) => onUpdate(connectorId, "outlet", v)}
          />
        </td>
        <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
          <HeaderSelect
            value={binding.date || ""}
            headers={fp.headers}
            autoHint={autoDetectDateColumn(fp.headers)}
            onChange={(v) => onUpdate(connectorId, "date", v)}
          />
        </td>
        <td className="px-3 py-1.5 text-[11px] text-zinc-500 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50 whitespace-nowrap">
          {binding.updatedAt ? (
            <span title={formatDateTimeSGT(new Date(binding.updatedAt))}>
              {timeAgoVerbose(binding.updatedAt)}
            </span>
          ) : (
            <span className="text-zinc-300 dark:text-zinc-600">—</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        <col className="w-[30%]" />
        <col className="w-[60px]" />
        <col className="w-[28%]" />
        <col className="w-[28%]" />
        <col className="w-[140px]" />
      </colgroup>
      <thead>
        <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Connector</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Format</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Outlet Column</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Date Column</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Updated</th>
        </tr>
      </thead>
      <tbody>
        {hideGroupHeaders
          ? groups.flatMap(([, list]) => list.map(renderRow))
          : groups.flatMap(([platform, list]) => [
              <tr key={`header-${platform}`}>
                <td colSpan={5} className="px-3 pt-4 pb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 capitalize">
                  {platform}
                </td>
              </tr>,
              ...list.map(renderRow),
            ])}
      </tbody>
    </table>
  );
}

function HeaderSelect({
  value,
  headers,
  autoHint,
  onChange,
}: {
  value: string;
  headers: string[];
  autoHint?: string | null;
  onChange: (v: string) => void;
}) {
  const autoLabel = autoHint ? `— auto → ${autoHint} —` : "— auto —";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-xs font-mono px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500"
    >
      <option value="">{autoLabel}</option>
      {headers.map((h) => (
        <option key={h} value={h}>{h}</option>
      ))}
    </select>
  );
}

// ─── MasterDataSection ───
// Template-level preset values that every domain inherits. First iteration
// owns the Date Params presets. Future iterations can add Platform Defaults
// (upfrontPayment, bankPaymentByOutlet, etc) and any other master-table
// seed rows that aren't per-instance.

interface DateParamPreset {
  id: string;
  configName?: string;
  workflowId?: string;
  calcType?: string;
  daysBack?: number | null;
  daysForward?: number | null;
  periodUnit?: string;
  includeToday?: boolean;
  isActive?: boolean;
  description?: string;
}

function MasterDataSection({ valConfig, onSave }: { valConfig: any; onSave: (newConfig: any) => void }) {
  const dateParamsRaw = valConfig?.base?.masterTables?.Date_Params;
  const defaults: DateParamPreset[] = Array.isArray(dateParamsRaw?.defaults) ? dateParamsRaw.defaults : [];

  const saveDefaults = (next: DateParamPreset[]) => {
    const nextBase = {
      ...valConfig.base,
      masterTables: {
        ...valConfig.base?.masterTables,
        Date_Params: { ...dateParamsRaw, defaults: next },
      },
    };
    onSave({ ...valConfig, base: nextBase });
  };

  const addRow = () => {
    const nextId = `DAT${defaults.length + 1}`;
    saveDefaults([
      ...defaults,
      { id: nextId, workflowId: "All", calcType: "Fixed", includeToday: false, isActive: false, description: "" },
    ]);
  };

  const removeRow = (idx: number) => {
    saveDefaults(defaults.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<DateParamPreset>) => {
    const next = defaults.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    saveDefaults(next);
  };

  return (
    <div className="mb-6">
      {/* Date Params — template-level preset rows pushed to custom_tbl_1156_166 */}
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Date Params Presets</h3>
        <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
          {dateParamsRaw?.table || "—"}
        </code>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-4 leading-relaxed">
        Date-window presets pushed to the Data Date Pull Config table during onboarding. Each row is a "mode" — operators toggle{" "}
        <code className="font-mono text-zinc-600 dark:text-zinc-400">is_active</code> in VAL to switch between historical backfills and rolling incremental runs.
      </p>

      {/* Column legend — explains each field so future template editors know what to type */}
      <details className="mb-4 text-xs text-zinc-500 dark:text-zinc-500">
        <summary className="cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 font-semibold">
          What each column means
        </summary>
        <dl className="mt-2 space-y-1.5 pl-4 border-l border-zinc-200 dark:border-zinc-800">
          <div><dt className="inline font-mono text-[11px] text-zinc-600 dark:text-zinc-400">ID</dt>: <dd className="inline">Record ID — short key like <code>All</code>, <code>RevRec</code>, <code>DAT1</code>. Must be unique.</dd></div>
          <div><dt className="inline font-mono text-[11px] text-zinc-600 dark:text-zinc-400">Workflow</dt>: <dd className="inline">Which workflow this preset applies to. Use <code>All</code> for every workflow, or a specific name like <code>RevRec</code>.</dd></div>
          <div><dt className="inline font-mono text-[11px] text-zinc-600 dark:text-zinc-400">Calc Type</dt>: <dd className="inline">How the date window is computed. Options: <code>Fixed</code> (explicit start/end dates), <code>Days Back</code> (rolling window counting back from today), <code>Current Period</code> (this month/week/day).</dd></div>
          <div><dt className="inline font-mono text-[11px] text-zinc-600 dark:text-zinc-400">Days Back / Forward</dt>: <dd className="inline">Only used with <code>Days Back</code> calc type. Days Back = 1 → pulls yesterday.</dd></div>
          <div><dt className="inline font-mono text-[11px] text-zinc-600 dark:text-zinc-400">Period Unit</dt>: <dd className="inline">Only used with <code>Current Period</code> calc type. Options: <code>Month</code>, <code>Week</code>, <code>Day</code>.</dd></div>
          <div><dt className="inline font-mono text-[11px] text-zinc-600 dark:text-zinc-400">Include Today</dt>: <dd className="inline">If true, today's data is included in the window. Usually on for daily incremental runs, off for historical backfills.</dd></div>
          <div><dt className="inline font-mono text-[11px] text-zinc-600 dark:text-zinc-400">Active</dt>: <dd className="inline">Which preset is the default "currently running" mode. Operators can flip this in VAL without editing the template.</dd></div>
          <div><dt className="inline font-mono text-[11px] text-zinc-600 dark:text-zinc-400">Description</dt>: <dd className="inline">Plain-English explanation of when to use this preset. Shown in the Load tab.</dd></div>
        </dl>
      </details>

      {defaults.length === 0 ? (
        <p className="text-xs text-zinc-400 italic py-3">No presets defined. Add a row to bootstrap Date Params for this solution.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[80px]">ID</th>
              <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[110px]">Workflow</th>
              <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[130px]">Calc Type</th>
              <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Days Back</th>
              <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[100px]">Period Unit</th>
              <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Today</th>
              <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[60px]">Active</th>
              <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800">Description</th>
              <th className="border-b border-zinc-200 dark:border-zinc-800 w-[32px]"></th>
            </tr>
          </thead>
          <tbody>
            {defaults.map((row, idx) => (
              <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30">
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <input value={row.id} onChange={(e) => updateRow(idx, { id: e.target.value })} className={`${inputClass} text-xs`} />
                </td>
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <input value={row.workflowId || ""} onChange={(e) => updateRow(idx, { workflowId: e.target.value })} className={`${inputClass} text-xs`} placeholder="All" />
                </td>
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <select value={row.calcType || ""} onChange={(e) => updateRow(idx, { calcType: e.target.value })} className={`${inputClass} text-xs`}>
                    <option value="">—</option>
                    <option value="Fixed">Fixed</option>
                    <option value="Days Back">Days Back</option>
                    <option value="Current Period">Current Period</option>
                  </select>
                </td>
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <input
                    type="number"
                    value={row.daysBack ?? ""}
                    onChange={(e) => updateRow(idx, { daysBack: e.target.value === "" ? null : Number(e.target.value) })}
                    disabled={row.calcType !== "Days Back"}
                    className={`${inputClass} text-xs disabled:opacity-40`}
                  />
                </td>
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <select
                    value={row.periodUnit || ""}
                    onChange={(e) => updateRow(idx, { periodUnit: e.target.value })}
                    disabled={row.calcType !== "Current Period" && row.calcType !== "Fixed"}
                    className={`${inputClass} text-xs disabled:opacity-40`}
                  >
                    <option value="">—</option>
                    <option value="Month">Month</option>
                    <option value="Week">Week</option>
                    <option value="Day">Day</option>
                  </select>
                </td>
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <label className="flex items-center justify-center cursor-pointer">
                    <input type="checkbox" checked={Boolean(row.includeToday)} onChange={(e) => updateRow(idx, { includeToday: e.target.checked })} />
                  </label>
                </td>
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <label className="flex items-center justify-center cursor-pointer">
                    <input type="checkbox" checked={Boolean(row.isActive)} onChange={(e) => updateRow(idx, { isActive: e.target.checked })} />
                  </label>
                </td>
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <input value={row.description || ""} onChange={(e) => updateRow(idx, { description: e.target.value })} className={`${inputClass} text-xs`} placeholder="What this preset does..." />
                </td>
                <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <button
                    onClick={() => removeRow(idx)}
                    title="Remove preset"
                    className="text-xs text-zinc-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={addRow}
          className="text-xs font-semibold text-blue-500 hover:text-blue-600 cursor-pointer bg-transparent border-none"
        >
          + Add preset
        </button>
      </div>
    </div>
  );
}

