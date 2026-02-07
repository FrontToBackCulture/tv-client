// src/playground/Playground.tsx
// Prototype: CRM with 3 views — Pipeline, Directory, Clients
// Toggle with Shift+Cmd+X

import { useState, useMemo } from "react";
import {
  Search, Plus, ArrowUpDown, X,
  Globe, Phone, Mail, Calendar, FileText, MessageSquare,
  ExternalLink, Building2, BookUser, Users, User,
  AlertTriangle, CheckCircle2, Clock,
  Target, Zap, Activity as ActivityIcon, AlignLeft, Columns3,
} from "lucide-react";
import { useCompanies, usePipelineStats, useCompanyWithRelations, useContacts, useDealsWithTasks, useActivities } from "../hooks/useCRM";
import type { Company, DealWithTaskInfo } from "../lib/crm/types";

// ============================
// Config
// ============================
type CrmView = "pipeline" | "directory" | "clients";

const CLIENT_STAGES: Company["stage"][] = ["client"];

const STAGES = [
  { value: "opportunity", label: "Opportunity", color: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  { value: "prospect", label: "Prospect", color: "bg-slate-400", text: "text-slate-600 dark:text-slate-400" },
  { value: "client", label: "Client", color: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  { value: "partner", label: "Partner", color: "bg-violet-500", text: "text-violet-700 dark:text-violet-400" },
  { value: "churned", label: "Churned", color: "bg-zinc-400", text: "text-zinc-500 dark:text-zinc-500" },
] as const;

type StageValue = (typeof STAGES)[number]["value"];
const stageConfig = Object.fromEntries(STAGES.map((s) => [s.value, s])) as Record<StageValue, (typeof STAGES)[number]>;

// ============================
// Helpers
// ============================
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function freshnessColor(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 7) return "bg-emerald-400";
  if (days <= 30) return "bg-amber-400";
  if (days <= 90) return "bg-orange-400";
  return "bg-zinc-300 dark:bg-zinc-600";
}

function formatValue(val: number): string {
  if (val === 0) return "$0";
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

const activityIcons: Record<string, typeof Mail> = {
  email: Mail, note: FileText, meeting: Calendar,
  call: Phone, task: FileText, stage_change: ArrowUpDown,
};

// ============================
// Shared components
// ============================
function PipelineBar({ stats }: { stats: { stage: string; count: number; value: number }[] }) {
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;
  const colors: Record<string, string> = {
    target: "bg-zinc-300 dark:bg-zinc-600", prospect: "bg-slate-400", lead: "bg-slate-500",
    qualified: "bg-sky-400", pilot: "bg-violet-400", proposal: "bg-cyan-400",
    negotiation: "bg-amber-400", won: "bg-emerald-500", lost: "bg-red-400",
  };
  return (
    <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
      {stats.filter((s) => s.count > 0).map((s) => (
        <div key={s.stage} className={`${colors[s.stage] || "bg-zinc-300"} transition-all duration-500`}
          style={{ width: `${(s.count / total) * 100}%` }} title={`${s.stage}: ${s.count} deals`} />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{value}</p>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="relative">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
      <input type="text" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full pl-8 pr-7 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700" />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ============================
// Company row (compact)
// ============================
function CompanyRow({ company, isSelected, onSelect, matchedContact }: {
  company: Company; isSelected: boolean; onSelect: () => void; matchedContact?: string;
}) {
  const cfg = stageConfig[company.stage as StageValue];
  return (
    <button onClick={onSelect}
      className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
        isSelected ? "bg-teal-50 dark:bg-teal-950/20 border-l-2 border-teal-500"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-l-2 border-transparent"
      }`}>
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freshnessColor(company.updated_at)}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
            {company.display_name || company.name}
          </span>
          {company.industry && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex-shrink-0 truncate max-w-[80px]">
              {company.industry}
            </span>
          )}
        </div>
        {matchedContact ? (
          <p className="text-[11px] text-teal-600 dark:text-teal-400 truncate mt-0.5">
            <User size={9} className="inline mr-1" />via {matchedContact}
          </p>
        ) : company.notes ? (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{company.notes}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {cfg && <div className={`w-1.5 h-1.5 rounded-full ${cfg.color}`} title={cfg.label} />}
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">{timeAgo(company.updated_at)}</span>
      </div>
    </button>
  );
}

// ============================
// Detail panel
// ============================
function DetailPanel({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const { data: company, isLoading } = useCompanyWithRelations(companyId);

  if (isLoading) return <div className="h-full flex items-center justify-center"><p className="text-xs text-zinc-400">Loading...</p></div>;
  if (!company) return <div className="h-full flex items-center justify-center"><p className="text-xs text-zinc-400">Company not found</p></div>;

  const cfg = stageConfig[company.stage as StageValue];
  const activeDeals = company.deals?.filter((d) => !["won", "lost"].includes(d.stage)) || [];
  const wonDeals = company.deals?.filter((d) => d.stage === "won") || [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {cfg && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider ${cfg.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.color}`} />{cfg.label}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 truncate">{company.display_name || company.name}</h2>
            {company.industry && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{company.industry}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-4">
          <Stat label="Active deals" value={String(activeDeals.length)} />
          <Stat label="Won" value={String(wonDeals.length)} />
          <Stat label="Value" value={formatValue(company.totalDealValue || 0)} />
          <Stat label="Contacts" value={String(company.contacts?.length || 0)} />
        </div>
        <div className="flex items-center gap-3 mt-3">
          {company.website && (
            <a href={company.website} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-teal-600 dark:text-teal-400 hover:underline">
              <Globe size={11} /> Website <ExternalLink size={9} />
            </a>
          )}
          {company.primaryContact?.email && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Mail size={11} /> {company.primaryContact.email}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {company.notes && (
          <Section title="Notes">
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{company.notes}</p>
          </Section>
        )}

        {company.contacts && company.contacts.length > 0 && (
          <Section title="Contacts">
            <div className="space-y-2">
              {company.contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-medium text-zinc-500 flex-shrink-0">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{contact.name}</span>
                      {contact.is_primary && <span className="text-[9px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider">Primary</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {contact.role && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{contact.role}</p>}
                      {contact.email && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{contact.email}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {activeDeals.length > 0 && (
          <Section title="Active Deals">
            <div className="space-y-2">
              {activeDeals.map((deal) => (
                <div key={deal.id} className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{deal.name}</span>
                    <span className="text-[10px] font-medium text-zinc-500 capitalize">{deal.stage}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    {deal.value != null && deal.value > 0 && <span>{formatValue(deal.value)}</span>}
                    {deal.expected_close_date && <span>Close: {formatDate(deal.expected_close_date)}</span>}
                    {deal.openTaskCount != null && deal.openTaskCount > 0 && (
                      <span>{deal.openTaskCount} task{deal.openTaskCount > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {company.activities && company.activities.length > 0 && (
          <Section title="Recent Activity">
            <div className="space-y-0">
              {company.activities.slice(0, 10).map((a) => {
                const Icon = activityIcons[a.type] || MessageSquare;
                return (
                  <div key={a.id} className="flex gap-2.5 py-1.5">
                    <div className="w-5 h-5 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon size={11} className="text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {a.subject && <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{a.subject}</p>}
                      {a.content && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{a.content}</p>}
                    </div>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums flex-shrink-0">{timeAgo(a.activity_date)}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// ============================
// Pipeline — Attention Board
// ============================
type DealHealth = "needs_action" | "on_track" | "stale";

const healthConfig: Record<DealHealth, { label: string; icon: typeof AlertTriangle; color: string; bg: string }> = {
  needs_action: { label: "Needs Action", icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" },
  on_track: { label: "On Track", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
  stale: { label: "Stale", icon: Clock, color: "text-red-500 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20" },
};

function classifyDealHealth(deal: DealWithTaskInfo): { health: DealHealth; reason: string } {
  const daysSinceUpdate = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / 86400000);

  // Stale: no movement in 30+ days
  if (daysSinceUpdate > 30) return { health: "stale", reason: `No activity for ${daysSinceUpdate}d` };

  // Needs action: overdue tasks or no activity in 14+ days
  if (deal.nextTask?.due_date) {
    const daysUntilDue = Math.floor((new Date(deal.nextTask.due_date).getTime() - Date.now()) / 86400000);
    if (daysUntilDue < 0) return { health: "needs_action", reason: `Task overdue ${Math.abs(daysUntilDue)}d` };
  }
  if (daysSinceUpdate > 14) return { health: "needs_action", reason: `No activity for ${daysSinceUpdate}d` };

  // On track
  return { health: "on_track", reason: daysSinceUpdate === 0 ? "Active today" : `Active ${daysSinceUpdate}d ago` };
}

// ============================
// 0. Swimlane — solutions (rows) x stages (columns)
// ============================
const KANBAN_STAGES = ["prospect", "lead", "qualified", "pilot", "proposal", "negotiation"] as const;
const STAGE_COLORS: Record<string, string> = {
  prospect: "bg-slate-400", lead: "bg-slate-500", qualified: "bg-sky-400",
  pilot: "bg-violet-400", proposal: "bg-cyan-400", negotiation: "bg-amber-400",
};
const SOLUTION_LABELS: Record<string, { label: string; color: string }> = {
  ap_automation: { label: "AP Automation", color: "bg-indigo-500" },
  ar_automation: { label: "AR Automation", color: "bg-cyan-500" },
  free_invoice_scan: { label: "Invoice Scan", color: "bg-teal-500" },
  events_ai: { label: "Events AI", color: "bg-pink-500" },
};
const COL_W = 160;
const LABEL_W = 130;

function SwimlaneCard({ deal, companyName, health, isSelected, onSelect }: {
  deal: DealWithTaskInfo; companyName: string; health: DealHealth;
  isSelected: boolean; onSelect: () => void;
}) {
  return (
    <button onClick={onSelect}
      className={`w-full text-left p-1.5 rounded transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        isSelected
          ? "ring-1 ring-teal-500 bg-teal-50 dark:bg-teal-950/30 shadow-none"
          : "bg-white dark:bg-zinc-800/80 hover:shadow-md"
      }`}>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: HEALTH_FILL[health] }} />
        <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200 truncate">{companyName}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 pl-3 text-[10px] text-zinc-400 tabular-nums">
        {deal.value != null && deal.value > 0 && <span className="font-medium text-zinc-500">{formatValue(deal.value)}</span>}
        <span>{timeAgo(deal.updated_at)}</span>
        {deal.openTaskCount != null && deal.openTaskCount > 0 && <span className="ml-auto">{deal.openTaskCount}t</span>}
      </div>
    </button>
  );
}

function KanbanView({ selectedCompanyId, onSelectCompany }: {
  selectedCompanyId: string | null; onSelectCompany: (id: string | null) => void;
}) {
  const { data: deals = [], isLoading } = useDealsWithTasks();
  const { data: companies = [] } = useCompanies();
  const { data: pipelineStats } = usePipelineStats();

  const companyMap = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);

  // Build swimlane data: solution → stage → deals[]
  const { lanes, solutionKeys, stageTotals } = useMemo(() => {
    const activeDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
    const laneMap: Record<string, Record<string, DealWithTaskInfo[]>> = {};
    const totals: Record<string, { count: number; value: number }> = {};
    for (const s of KANBAN_STAGES) totals[s] = { count: 0, value: 0 };

    for (const deal of activeDeals) {
      const sol = deal.solution || "_other";
      if (!laneMap[sol]) {
        laneMap[sol] = {};
        for (const s of KANBAN_STAGES) laneMap[sol][s] = [];
      }
      if (laneMap[sol][deal.stage]) {
        laneMap[sol][deal.stage].push(deal);
      }
      if (totals[deal.stage]) {
        totals[deal.stage].count++;
        totals[deal.stage].value += deal.value || 0;
      }
    }

    // Sort: known solutions first alphabetically, _other last
    const keys = Object.keys(laneMap).sort((a, b) => {
      if (a === "_other") return 1;
      if (b === "_other") return -1;
      return a.localeCompare(b);
    });

    return { lanes: laneMap, solutionKeys: keys, stageTotals: totals };
  }, [deals]);

  if (isLoading) return <div className="flex items-center justify-center h-32"><p className="text-xs text-zinc-400">Loading...</p></div>;

  const gridW = KANBAN_STAGES.length * COL_W + LABEL_W;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Pipeline</h1>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-zinc-400 tabular-nums">
              {pipelineStats?.totalDeals ?? 0} deals · {formatValue(pipelineStats?.totalValue ?? 0)}
            </p>
            <button className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors">
              <Plus size={14} />
            </button>
          </div>
        </div>
        {pipelineStats?.byStage && <PipelineBar stats={pipelineStats.byStage} />}
      </div>

      {/* Swimlane grid — scrolls both axes */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: `${gridW}px` }}>
          {/* Stage column headers — sticky top */}
          <div className="sticky top-0 z-20 flex bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800/50">
            {/* Corner spacer — sticky top+left */}
            <div className="sticky left-0 z-30 bg-white dark:bg-zinc-950 flex-shrink-0 px-3 py-2"
              style={{ width: LABEL_W }}>
              <span className="text-[10px] text-zinc-400">Solution</span>
            </div>
            {KANBAN_STAGES.map((stage) => (
              <div key={stage} className="flex-shrink-0 px-2 py-2" style={{ width: COL_W }}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${STAGE_COLORS[stage] || "bg-zinc-300"}`} />
                  <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider capitalize">{stage}</span>
                  <span className="text-[10px] text-zinc-400 tabular-nums ml-auto">{stageTotals[stage]?.count || 0}</span>
                </div>
                {stageTotals[stage]?.value > 0 && (
                  <p className="text-[9px] text-zinc-400 tabular-nums mt-0.5 pl-3">{formatValue(stageTotals[stage].value)}</p>
                )}
              </div>
            ))}
          </div>

          {/* Solution rows */}
          {solutionKeys.map((sol) => {
            const cfg = SOLUTION_LABELS[sol];
            const laneDeals = lanes[sol];
            const laneTotal = KANBAN_STAGES.reduce((s, st) => s + (laneDeals[st]?.length || 0), 0);
            const laneValue = KANBAN_STAGES.reduce((s, st) => s + (laneDeals[st] || []).reduce((v, d) => v + (d.value || 0), 0), 0);

            return (
              <div key={sol} className="flex border-b border-zinc-50 dark:border-zinc-900/50 min-h-[80px]">
                {/* Solution label — sticky left */}
                <div className="sticky left-0 z-10 bg-white dark:bg-zinc-950 flex-shrink-0 px-3 py-2.5 border-r border-zinc-50 dark:border-zinc-900/50"
                  style={{ width: LABEL_W }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className={`w-2 h-2 rounded-full ${cfg?.color || "bg-zinc-400"}`} />
                    <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                      {cfg?.label || (sol === "_other" ? "Other" : sol)}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 tabular-nums pl-3.5">
                    {laneTotal} deal{laneTotal !== 1 ? "s" : ""}{laneValue > 0 ? ` · ${formatValue(laneValue)}` : ""}
                  </p>
                </div>

                {/* Stage cells */}
                {KANBAN_STAGES.map((stage) => {
                  const cellDeals = laneDeals[stage] || [];
                  return (
                    <div key={stage} className="flex-shrink-0 p-1.5 space-y-1 bg-zinc-50/50 dark:bg-zinc-900/10"
                      style={{ width: COL_W }}>
                      {cellDeals.map((deal) => {
                        const name = companyMap.get(deal.company_id)?.display_name || companyMap.get(deal.company_id)?.name || "?";
                        const { health } = classifyDealHealth(deal);
                        const isSelected = deal.company_id === selectedCompanyId;
                        return (
                          <SwimlaneCard key={deal.id} deal={deal} companyName={name} health={health}
                            isSelected={isSelected}
                            onSelect={() => onSelectCompany(isSelected ? null : deal.company_id)} />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================
// 1. Orbit View — spatial proximity map
// ============================
const STAGE_RING: Record<string, number> = {
  negotiation: 0, proposal: 1, pilot: 2, qualified: 2,
  lead: 3, prospect: 3, target: 3,
};
const RING_LABELS = ["Closing", "Proposal", "Qualified", "Prospecting"];
const HEALTH_FILL: Record<DealHealth, string> = { on_track: "#10b981", needs_action: "#f59e0b", stale: "#ef4444" };

function OrbitView({ selectedCompanyId, onSelectCompany }: {
  selectedCompanyId: string | null; onSelectCompany: (id: string | null) => void;
}) {
  const { data: deals = [], isLoading } = useDealsWithTasks();
  const { data: companies = [] } = useCompanies();
  const { data: pipelineStats } = usePipelineStats();

  const companyMap = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);

  const activeDeals = useMemo(() => deals.filter((d) => !["won", "lost"].includes(d.stage)), [deals]);
  const maxValue = useMemo(() => Math.max(...activeDeals.map((d) => d.value || 0), 1), [activeDeals]);

  // Group by ring
  const rings = useMemo(() => {
    const r: DealWithTaskInfo[][] = [[], [], [], []];
    for (const d of activeDeals) r[STAGE_RING[d.stage] ?? 3].push(d);
    return r;
  }, [activeDeals]);

  if (isLoading) return <div className="flex items-center justify-center h-32"><p className="text-xs text-zinc-400">Loading...</p></div>;

  const size = 520;
  const cx = size / 2;
  const cy = size / 2;
  const radii = [65, 120, 175, 225];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Orbit</h1>
          <p className="text-[11px] text-zinc-400">{activeDeals.length} active deals · {formatValue(pipelineStats?.totalValue ?? 0)}</p>
        </div>
        {pipelineStats?.byStage && <PipelineBar stats={pipelineStats.byStage} />}
        <div className="flex items-center gap-3 mt-2">
          {(["on_track", "needs_action", "stale"] as DealHealth[]).map((h) => (
            <div key={h} className="flex items-center gap-1 text-[10px] text-zinc-400">
              <div className="w-2 h-2 rounded-full" style={{ background: HEALTH_FILL[h] }} />
              {healthConfig[h].label}
            </div>
          ))}
          <div className="flex items-center gap-1 text-[10px] text-zinc-400 ml-auto">
            <div className="w-2 h-2 rounded-full bg-zinc-400" /> <span>small</span>
            <div className="w-3.5 h-3.5 rounded-full bg-zinc-400 ml-1" /> <span>large = high value</span>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full max-w-[520px] max-h-[520px]">
          {/* Rings */}
          {radii.map((r, i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
              <text x={cx + r - 4} y={cy - 6} className="fill-zinc-300 dark:fill-zinc-700" fontSize={9} textAnchor="end">{RING_LABELS[i]}</text>
            </g>
          ))}
          {/* Center */}
          <circle cx={cx} cy={cy} r={3} className="fill-teal-500" opacity={0.6} />
          <text x={cx} y={cy + 14} textAnchor="middle" className="fill-zinc-400" fontSize={8}>YOU</text>
          {/* Deal dots */}
          {rings.map((ringDeals, ri) =>
            ringDeals.map((deal, di) => {
              const angle = (di / Math.max(ringDeals.length, 1)) * Math.PI * 2 - Math.PI / 2;
              const jitter = (di % 3 - 1) * 8;
              const r = radii[ri] + jitter;
              const x = cx + r * Math.cos(angle);
              const y = cy + r * Math.sin(angle);
              const dotR = 4 + ((deal.value || 0) / maxValue) * 12;
              const { health } = classifyDealHealth(deal);
              const isSelected = deal.company_id === selectedCompanyId;
              const name = companyMap.get(deal.company_id)?.display_name || companyMap.get(deal.company_id)?.name || "?";

              return (
                <g key={deal.id} className="cursor-pointer" onClick={() => onSelectCompany(isSelected ? null : deal.company_id)}>
                  {isSelected && <circle cx={x} cy={y} r={dotR + 4} fill="none" className="stroke-teal-500" strokeWidth={2} />}
                  <circle cx={x} cy={y} r={dotR} fill={HEALTH_FILL[health]}
                    opacity={isSelected ? 1 : 0.75} className="hover:opacity-100 transition-opacity" />
                  <title>{`${name} — ${deal.name}\n${deal.stage} · ${formatValue(deal.value || 0)}`}</title>
                  {(dotR > 8 || isSelected) && (
                    <text x={x} y={y + dotR + 10} textAnchor="middle" className="fill-zinc-500 dark:fill-zinc-400 pointer-events-none" fontSize={8}>
                      {name.length > 12 ? name.slice(0, 10) + "…" : name}
                    </text>
                  )}
                </g>
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
}

// ============================
// 2. Today's Play — AI-curated action list
// ============================
function generateAction(deal: DealWithTaskInfo, companyName: string): { text: string; urgency: number; verb: string } {
  const daysSinceUpdate = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / 86400000);

  if (deal.nextTask?.due_date) {
    const daysUntilDue = Math.floor((new Date(deal.nextTask.due_date).getTime() - Date.now()) / 86400000);
    if (daysUntilDue < 0)
      return { text: `${companyName} — "${deal.nextTask.title}" is ${Math.abs(daysUntilDue)}d overdue`, urgency: 10, verb: "Chase" };
    if (daysUntilDue <= 2)
      return { text: `${companyName} — "${deal.nextTask.title}" due ${daysUntilDue === 0 ? "today" : `in ${daysUntilDue}d`}`, urgency: 8, verb: "Prepare" };
  }
  if (daysSinceUpdate > 30)
    return { text: `${companyName} — silent for ${daysSinceUpdate} days on "${deal.name}"`, urgency: 9, verb: "Re-engage" };
  if (daysSinceUpdate > 14)
    return { text: `${companyName} — last touched ${daysSinceUpdate}d ago`, urgency: 7, verb: "Check in" };
  if (deal.value && deal.value > 10000 && daysSinceUpdate <= 3)
    return { text: `${companyName} — ${formatValue(deal.value)} deal has momentum`, urgency: 5, verb: "Push forward" };
  return { text: `${companyName} — ${deal.name} (${deal.stage})`, urgency: 3, verb: "Continue" };
}

const verbColors: Record<string, string> = {
  "Chase": "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30",
  "Re-engage": "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30",
  "Prepare": "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
  "Check in": "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30",
  "Push forward": "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
  "Continue": "text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50",
};

function TodaysPlay({ selectedCompanyId, onSelectCompany }: {
  selectedCompanyId: string | null; onSelectCompany: (id: string | null) => void;
}) {
  const { data: deals = [], isLoading } = useDealsWithTasks();
  const { data: companies = [] } = useCompanies();

  const companyMap = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);

  const plays = useMemo(() => {
    const activeDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
    return activeDeals
      .map((deal) => {
        const name = companyMap.get(deal.company_id)?.display_name || companyMap.get(deal.company_id)?.name || "Unknown";
        return { deal, ...generateAction(deal, name) };
      })
      .sort((a, b) => b.urgency - a.urgency);
  }, [deals, companyMap]);

  const topPlays = plays.slice(0, 7);
  const benchPlays = plays.slice(7);

  if (isLoading) return <div className="flex items-center justify-center h-32"><p className="text-xs text-zinc-400">Loading...</p></div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Today's Play</h1>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
          {topPlays.length} actions prioritized from {plays.length} active deals
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {topPlays.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <CheckCircle2 size={24} className="text-emerald-400" />
            <p className="text-xs text-zinc-400">All clear — no urgent actions today</p>
          </div>
        ) : (
          <div className="py-2">
            {topPlays.map(({ deal, text, verb }, i) => {
              const isSelected = deal.company_id === selectedCompanyId;
              return (
                <button key={deal.id}
                  onClick={() => onSelectCompany(isSelected ? null : deal.company_id)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                    isSelected ? "bg-teal-50 dark:bg-teal-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                  }`}>
                  <span className="text-[13px] font-bold text-zinc-300 dark:text-zinc-700 tabular-nums w-5 flex-shrink-0 pt-0.5 text-right">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${verbColors[verb] || verbColors["Continue"]}`}>
                        {verb}
                      </span>
                      {deal.value != null && deal.value > 0 && (
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatValue(deal.value)}</span>
                      )}
                    </div>
                    <p className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-snug">{text}</p>
                  </div>
                </button>
              );
            })}

            {benchPlays.length > 0 && (
              <div className="mt-3 px-4">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Bench ({benchPlays.length} more)</p>
                {benchPlays.map(({ deal, verb }) => {
                  const name = companyMap.get(deal.company_id)?.display_name || companyMap.get(deal.company_id)?.name || "?";
                  return (
                    <button key={deal.id}
                      onClick={() => onSelectCompany(deal.company_id === selectedCompanyId ? null : deal.company_id)}
                      className="w-full text-left py-1.5 flex items-center gap-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                      <span className="text-[10px] w-16 flex-shrink-0 capitalize">{verb}</span>
                      <span className="text-[11px] truncate">{name}</span>
                      <span className="text-[10px] tabular-nums ml-auto">{deal.stage}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================
// 3. Pulse Monitor — activity sparklines
// ============================
function Sparkline({ bars, color }: { bars: number[]; color: string }) {
  const max = Math.max(...bars, 1);
  const hasAny = bars.some((v) => v > 0);
  return (
    <div className="flex items-end gap-[2px] h-5 w-8">
      {bars.map((v, i) => (
        <div key={i} className={`w-[3px] rounded-sm ${hasAny ? color : "bg-zinc-200 dark:bg-zinc-700"}`}
          style={{ height: v > 0 ? `${Math.max((v / max) * 100, 20)}%` : "3px", opacity: v > 0 ? 0.4 + (v / max) * 0.6 : 0.3 }} />
      ))}
    </div>
  );
}

type PulseLevel = "strong" | "moderate" | "weak" | "flatline";
const pulseConfig: Record<PulseLevel, { label: string; color: string; sparkColor: string; icon: typeof ActivityIcon }> = {
  strong: { label: "Strong Pulse", color: "text-emerald-600 dark:text-emerald-400", sparkColor: "bg-emerald-500", icon: ActivityIcon },
  moderate: { label: "Moderate", color: "text-sky-600 dark:text-sky-400", sparkColor: "bg-sky-500", icon: ActivityIcon },
  weak: { label: "Weak Pulse", color: "text-amber-600 dark:text-amber-400", sparkColor: "bg-amber-500", icon: ActivityIcon },
  flatline: { label: "Flatline", color: "text-red-500 dark:text-red-400", sparkColor: "bg-red-400", icon: AlertTriangle },
};

function PulseMonitor({ selectedCompanyId, onSelectCompany }: {
  selectedCompanyId: string | null; onSelectCompany: (id: string | null) => void;
}) {
  const { data: deals = [], isLoading } = useDealsWithTasks();
  const { data: companies = [] } = useCompanies();
  const { data: activities = [] } = useActivities({ limit: 500 });

  const companyMap = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);

  // Weekly activity counts per company (last 8 weeks)
  const weeklyActivity = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, number[]>();
    for (const a of activities) {
      const weeksAgo = Math.floor((now - new Date(a.activity_date).getTime()) / (7 * 86400000));
      if (weeksAgo >= 8) continue;
      const counts = map.get(a.company_id) || new Array(8).fill(0);
      counts[weeksAgo]++;
      map.set(a.company_id, counts);
    }
    return map;
  }, [activities]);

  const dealsWithPulse = useMemo(() => {
    const activeDeals = deals.filter((d) => !["won", "lost"].includes(d.stage));
    return activeDeals.map((deal) => {
      const raw = weeklyActivity.get(deal.company_id) || new Array(8).fill(0);
      const bars = [...raw].reverse(); // oldest first for sparkline
      const total = raw.reduce((s, v) => s + v, 0);
      const recent = raw[0] + raw[1];
      let pulse: PulseLevel;
      if (recent >= 3) pulse = "strong";
      else if (recent >= 1) pulse = "moderate";
      else if (total >= 1) pulse = "weak";
      else pulse = "flatline";
      return { deal, bars, pulse, total };
    });
  }, [deals, weeklyActivity]);

  const grouped: Record<PulseLevel, typeof dealsWithPulse> = { strong: [], moderate: [], weak: [], flatline: [] };
  for (const d of dealsWithPulse) grouped[d.pulse].push(d);

  if (isLoading) return <div className="flex items-center justify-center h-32"><p className="text-xs text-zinc-400">Loading...</p></div>;

  const order: PulseLevel[] = ["flatline", "weak", "moderate", "strong"];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Pulse Monitor</h1>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
          Activity patterns over 8 weeks · {dealsWithPulse.length} deals
        </p>
        <div className="flex items-center gap-3 mt-2">
          {order.map((p) => (
            <div key={p} className={`text-[10px] font-medium ${pulseConfig[p].color}`}>
              {grouped[p].length} {pulseConfig[p].label.toLowerCase()}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {order.map((p) => {
          const items = grouped[p];
          if (items.length === 0) return null;
          const cfg = pulseConfig[p];
          return (
            <div key={p} className="py-2">
              <div className="px-4 py-1.5 sticky top-0 bg-white dark:bg-zinc-950 z-10">
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${cfg.color}`}>
                  {cfg.label} ({items.length})
                </span>
              </div>
              {items.map(({ deal, bars, total }) => {
                const name = companyMap.get(deal.company_id)?.display_name || companyMap.get(deal.company_id)?.name || "?";
                const isSelected = deal.company_id === selectedCompanyId;
                return (
                  <button key={deal.id}
                    onClick={() => onSelectCompany(isSelected ? null : deal.company_id)}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                      isSelected ? "bg-teal-50 dark:bg-teal-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                    }`}>
                    <Sparkline bars={bars} color={cfg.sparkColor} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate block">{name}</span>
                      <span className="text-[11px] text-zinc-400 truncate block">{deal.name} · {deal.stage}</span>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-[11px] text-zinc-500 tabular-nums block">{total} activities</span>
                      {deal.value != null && deal.value > 0 && (
                        <span className="text-[10px] text-zinc-400 tabular-nums block">{formatValue(deal.value)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================
// 4. Narrative Timeline — plain english deal stories
// ============================
function buildNarrative(deal: DealWithTaskInfo, companyName: string): string {
  const parts: string[] = [];
  const daysSinceUpdate = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / 86400000);
  const created = Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86400000);

  // Opening: who and what stage
  parts.push(`${companyName} — ${deal.stage} stage`);
  if (deal.value && deal.value > 0) parts[0] += `, ${formatValue(deal.value)}`;
  parts[0] += ".";

  // How old is this deal
  if (created <= 7) parts.push(`Started ${created === 0 ? "today" : created === 1 ? "yesterday" : `${created}d ago`}.`);
  else if (created <= 30) parts.push(`In pipeline for ${Math.floor(created / 7)} weeks.`);
  else parts.push(`Open for ${Math.floor(created / 30)} months.`);

  // Last activity
  if (daysSinceUpdate === 0) parts.push("Active today.");
  else if (daysSinceUpdate === 1) parts.push("Last touched yesterday.");
  else if (daysSinceUpdate <= 7) parts.push(`Last activity ${daysSinceUpdate}d ago.`);
  else if (daysSinceUpdate <= 30) parts.push(`Quiet for ${daysSinceUpdate} days.`);
  else parts.push(`Gone cold — ${daysSinceUpdate} days of silence.`);

  // Next step
  if (deal.nextTask?.due_date) {
    const daysUntilDue = Math.floor((new Date(deal.nextTask.due_date).getTime() - Date.now()) / 86400000);
    if (daysUntilDue < 0) parts.push(`Next: "${deal.nextTask.title}" — ${Math.abs(daysUntilDue)}d OVERDUE.`);
    else if (daysUntilDue === 0) parts.push(`Next: "${deal.nextTask.title}" — due today.`);
    else parts.push(`Next: "${deal.nextTask.title}" in ${daysUntilDue}d.`);
  } else if (deal.openTaskCount && deal.openTaskCount > 0) {
    parts.push(`${deal.openTaskCount} open task${deal.openTaskCount > 1 ? "s" : ""}.`);
  } else {
    parts.push("No next steps defined.");
  }

  return parts.join(" ");
}

function NarrativeTimeline({ selectedCompanyId, onSelectCompany }: {
  selectedCompanyId: string | null; onSelectCompany: (id: string | null) => void;
}) {
  const { data: deals = [], isLoading } = useDealsWithTasks();
  const { data: companies = [] } = useCompanies();

  const companyMap = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);

  const narratives = useMemo(() => {
    return deals
      .filter((d) => !["won", "lost"].includes(d.stage))
      .map((deal) => {
        const name = companyMap.get(deal.company_id)?.display_name || companyMap.get(deal.company_id)?.name || "Unknown";
        const { health } = classifyDealHealth(deal);
        return { deal, name, narrative: buildNarrative(deal, name), health };
      })
      .sort((a, b) => new Date(b.deal.updated_at).getTime() - new Date(a.deal.updated_at).getTime());
  }, [deals, companyMap]);

  if (isLoading) return <div className="flex items-center justify-center h-32"><p className="text-xs text-zinc-400">Loading...</p></div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Briefing</h1>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
          {narratives.length} deals in plain English — most recent first
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {narratives.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">No active deals</p>
        ) : (
          <div className="py-1">
            {narratives.map(({ deal, narrative, health }) => {
              const isSelected = deal.company_id === selectedCompanyId;
              const borderColor = health === "stale" ? "border-l-red-400" : health === "needs_action" ? "border-l-amber-400" : "border-l-emerald-400";
              return (
                <button key={deal.id}
                  onClick={() => onSelectCompany(isSelected ? null : deal.company_id)}
                  className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${borderColor} ${
                    isSelected ? "bg-teal-50 dark:bg-teal-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                  }`}>
                  <p className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-relaxed">{narrative}</p>
                  <p className="text-[10px] text-zinc-400 mt-1 tabular-nums">{timeAgo(deal.updated_at)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================
// Pipeline container with 4-view toggle
// ============================
type PipelineMode = "kanban" | "orbit" | "play" | "pulse" | "narrative";
const pipelineModes: { key: PipelineMode; label: string; icon: typeof Target }[] = [
  { key: "kanban", label: "Board", icon: Columns3 },
  { key: "play", label: "Play", icon: Zap },
  { key: "narrative", label: "Briefing", icon: AlignLeft },
  { key: "orbit", label: "Orbit", icon: Target },
  { key: "pulse", label: "Pulse", icon: ActivityIcon },
];

function PipelineList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [mode, setMode] = useState<PipelineMode>("kanban");

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-1 px-4 pt-3 pb-0">
        {pipelineModes.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setMode(key)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
              mode === key ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}>
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === "kanban" && <KanbanView selectedCompanyId={selectedId} onSelectCompany={onSelect} />}
        {mode === "orbit" && <OrbitView selectedCompanyId={selectedId} onSelectCompany={onSelect} />}
        {mode === "play" && <TodaysPlay selectedCompanyId={selectedId} onSelectCompany={onSelect} />}
        {mode === "pulse" && <PulseMonitor selectedCompanyId={selectedId} onSelectCompany={onSelect} />}
        {mode === "narrative" && <NarrativeTimeline selectedCompanyId={selectedId} onSelectCompany={onSelect} />}
      </div>
    </div>
  );
}

// ============================
// Directory list (all companies + contacts unified search)
// ============================
function DirectoryList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "updated">("name");

  const { data: companies = [], isLoading: companiesLoading } = useCompanies({
    search: search || undefined,
  });

  // Also search contacts when there's a search term
  const { data: contacts = [] } = useContacts({
    search: search || undefined,
  });

  // Build a map of contact matches → company IDs
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

  // Merge: companies from direct search + companies matched via contacts
  const mergedCompanies = useMemo(() => {
    if (!search) return companies;
    // Annotate companies matched via contacts in CompanyRow (via matchedContact prop)
    // Contact-only matches without a company in results would need a separate fetch
    return companies;
  }, [companies, search, contactMatchMap]);

  const sorted = useMemo(() => {
    return [...mergedCompanies].sort((a, b) => {
      if (sortBy === "name") return (a.display_name || a.name).localeCompare(b.display_name || b.name);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [mergedCompanies, sortBy]);

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
              {mergedCompanies.length} companies
              {search && contacts.length > 0 && ` · ${contacts.length} contacts matched`}
            </p>
          </div>
          <button className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors">
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
          // Recent sort — flat list
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

// ============================
// Clients list (stage=client)
// ============================
function ClientsList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "updated">("name");

  const { data: companies = [], isLoading } = useCompanies({
    search: search || undefined,
    stage: CLIENT_STAGES,
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

// ============================
// View nav tab
// ============================
function ViewTab({ label, icon: Icon, active, count, onClick }: {
  label: string; icon: typeof Building2; active: boolean; count?: number; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
        active
          ? "border-teal-500 text-zinc-800 dark:text-zinc-100"
          : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400"
      }`}>
      <Icon size={14} />
      {label}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? "text-zinc-500 dark:text-zinc-400" : ""}`}>{count}</span>
      )}
    </button>
  );
}

// ============================
// Main Playground
// ============================
export function Playground() {
  const [view, setView] = useState<CrmView>("pipeline");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (id: string | null) => setSelectedId(id);
  const handleViewChange = (v: CrmView) => {
    setView(v);
    setSelectedId(null);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* View tabs */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Pipeline" icon={Building2} active={view === "pipeline"} onClick={() => handleViewChange("pipeline")} />
        <ViewTab label="Directory" icon={BookUser} active={view === "directory"} onClick={() => handleViewChange("directory")} />
        <ViewTab label="Clients" icon={Users} active={view === "clients"} onClick={() => handleViewChange("clients")} />
      </div>

      {/* Content: list + detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: list */}
        <div className={`flex flex-col overflow-hidden transition-all ${
          selectedId ? "w-[360px] flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800/50" : "flex-1"
        }`}>
          {view === "pipeline" && <PipelineList selectedId={selectedId} onSelect={handleSelect} />}
          {view === "directory" && <DirectoryList selectedId={selectedId} onSelect={handleSelect} />}
          {view === "clients" && <ClientsList selectedId={selectedId} onSelect={handleSelect} />}
        </div>

        {/* Right: detail */}
        {selectedId && (
          <div className="flex-1 min-w-0">
            <DetailPanel key={selectedId} companyId={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
