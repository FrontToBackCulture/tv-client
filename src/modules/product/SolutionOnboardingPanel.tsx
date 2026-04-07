import { useState } from "react";
import { useSolutionTemplates, useUpdateSolutionTemplate } from "../../hooks/solutions";
import type { TemplateTab, SolutionInstanceWithTemplate } from "../../lib/solutions/types";
import SolutionMatrixView from "../domains/solutions/SolutionMatrixView";

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

  // Preview mode — render the matrix with example data
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
      <SolutionMatrixView
        instance={mockInstance}
        onBack={() => setPreviewing(false)}
      />
    );
  }

  const tabs = template.template.tabs || [];
  const allSections = tabs.flatMap((t) => t.sections);
  const statusBadge = template.status === "published"
    ? { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Published" }
    : { bg: "bg-amber-500/10", text: "text-amber-400", label: "Draft" };

  const handlePublish = () => {
    updateTemplate.mutate({
      id: template.id,
      updates: { status: template.status === "published" ? "draft" : "published" },
    });
  };

  return (
    <div className="p-6 max-w-none">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 pb-5 border-b border-zinc-200 dark:border-zinc-800">
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
            onClick={handlePublish}
            className="text-xs font-semibold px-3 py-1.5 rounded border cursor-pointer transition-colors bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
          >
            {template.status === "published" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

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

      {/* VAL Master Tables */}
      {(template.template as any).valMasterTables && (
        <div className="mb-6">
          <SectionLabel label="VAL Master Tables" />
          <div className="grid grid-cols-3 gap-2">
            {Object.entries((template.template as any).valMasterTables as Record<string, any>).map(([key, config]) => (
              <div key={key} className="flex items-center justify-between text-xs px-3 py-2.5 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-400">
                <div>
                  <div className="font-medium capitalize">{key}</div>
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{config.description}</div>
                </div>
                <span className="font-mono text-[10px] text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded ml-2">{config.table}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VAL Table Mapping */}
      {(template.template as any).valTables && (
        <div className="mb-6">
          <SectionLabel label={`VAL Table Mapping (${((template.template as any).valTables as any[]).length})`} />
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[12%]">ID</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Type</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Statement Source</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Outlet Map</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Platform Map</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Bank Acct Map</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Bank Counterparty Map</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[50px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {((template.template as any).valTables as any[]).map((vt: any) => {
                  const configured = !!vt.statementSource;
                  const typeBadge: Record<string, string> = {
                    "POS": "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400",
                    "Platform Delivery": "bg-amber-500/10 text-amber-500 dark:text-amber-400",
                    "Platform In Store Payment": "bg-purple-500/10 text-purple-500 dark:text-purple-400",
                    "Bank": "bg-teal-500/10 text-teal-500 dark:text-teal-400",
                  };
                  const typeLabel: Record<string, string> = {
                    "Platform Delivery": "Delivery",
                    "Platform In Store Payment": "In-Store",
                  };
                  return (
                    <tr key={vt.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{vt.id}</td>
                      <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${typeBadge[vt.type] || "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                          {typeLabel[vt.type] || vt.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                        {vt.statementSource ? (
                          <div className="flex flex-wrap gap-1">
                            {vt.statementSource.split(",").map((t: string) => (
                              <span key={t} className="font-mono text-[10px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{t.trim()}</span>
                            ))}
                          </div>
                        ) : <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{vt.outletMap || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{vt.platformMap || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{vt.bankAcctMap || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{vt.bankCounterpartyMap || "—"}</td>
                      <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${configured ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"}`}>
                          {configured ? "Ready" : "TBD"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setPreviewing(true)}
          disabled={!template.example_data}
          className="text-xs font-semibold px-4 py-2 rounded border cursor-pointer transition-colors bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Preview with Example Data
        </button>
      </div>
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
