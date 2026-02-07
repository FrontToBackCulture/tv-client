// src/modules/crm/CrmComponents.tsx
// Shared CRM components used across Directory and Clients views

import { Search, X, User } from "lucide-react";
import type { Company } from "../../lib/crm/types";

// ============================
// Config
// ============================
const STAGES = [
  { value: "opportunity", color: "bg-amber-500" },
  { value: "prospect", color: "bg-slate-400" },
  { value: "client", color: "bg-emerald-500" },
  { value: "partner", color: "bg-violet-500" },
  { value: "churned", color: "bg-zinc-400" },
] as const;

type StageValue = (typeof STAGES)[number]["value"];
const stageColorMap = Object.fromEntries(STAGES.map((s) => [s.value, s.color])) as Record<StageValue, string>;

// ============================
// Engagement Health
// ============================
export type HealthLevel = "active" | "healthy" | "cooling" | "needs_attention" | "at_risk";

export interface EngagementHealth {
  level: HealthLevel;
  daysSince: number;
  label: string;
  dotColor: string;
}

const HEALTH_TIERS: { level: HealthLevel; maxDays: number; label: string; dotColor: string }[] = [
  { level: "active", maxDays: 7, label: "Active", dotColor: "bg-emerald-500" },
  { level: "healthy", maxDays: 14, label: "Healthy", dotColor: "bg-teal-500" },
  { level: "cooling", maxDays: 30, label: "Cooling", dotColor: "bg-amber-500" },
  { level: "needs_attention", maxDays: 60, label: "Needs Attention", dotColor: "bg-orange-500" },
  { level: "at_risk", maxDays: Infinity, label: "At Risk", dotColor: "bg-red-500" },
];

export function getEngagementHealth(lastActivityDate: string | null | undefined): EngagementHealth {
  if (!lastActivityDate) {
    return { level: "at_risk", daysSince: -1, label: "At Risk", dotColor: "bg-red-500" };
  }
  const daysSince = Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / 86400000);
  const tier = HEALTH_TIERS.find((t) => daysSince <= t.maxDays) || HEALTH_TIERS[HEALTH_TIERS.length - 1];
  return { level: tier.level, daysSince, label: tier.label, dotColor: tier.dotColor };
}

export const HEALTH_TIER_CONFIG = HEALTH_TIERS;

// ============================
// Helpers
// ============================
export function timeAgo(dateStr: string): string {
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

// ============================
// SearchInput
// ============================
export function SearchInput({ value, onChange, placeholder }: {
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
// CompanyRow (compact list item)
// ============================
export function CompanyRow({ company, isSelected, onSelect, matchedContact }: {
  company: Company; isSelected: boolean; onSelect: () => void; matchedContact?: string;
}) {
  const dotColor = stageColorMap[company.stage as StageValue] || "bg-zinc-400";
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
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">{timeAgo(company.updated_at)}</span>
      </div>
    </button>
  );
}
