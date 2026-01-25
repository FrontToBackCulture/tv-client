// src/modules/crm/CompanyListView.tsx
// Company list view with selectable rows

import { Company, COMPANY_STAGES } from "../../lib/crm/types";
import { Building2 } from "lucide-react";

interface CompanyListViewProps {
  companies: Company[];
  loading?: boolean;
  selectedCompanyId?: string | null;
  onCompanyClick?: (company: Company) => void;
}

export function CompanyListView({
  companies,
  loading = false,
  selectedCompanyId,
  onCompanyClick,
}: CompanyListViewProps) {
  if (loading) {
    return (
      <div className="p-2">
        <div className="animate-pulse space-y-0.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-12 bg-slate-200/50 dark:bg-zinc-800/50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Building2 size={40} className="text-zinc-300 dark:text-zinc-700 mb-3" />
        <p className="text-sm text-zinc-500">No companies found</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
          Try adjusting your filters or add a new company
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {companies.map((company) => {
        const stageConfig = COMPANY_STAGES.find((s) => s.value === company.stage);
        const isSelected = company.id === selectedCompanyId;

        return (
          <button
            key={company.id}
            onClick={() => onCompanyClick?.(company)}
            className={`w-full text-left px-4 py-3 border-b border-slate-200/50 dark:border-zinc-800/50 hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 transition-colors ${
              isSelected
                ? "bg-teal-50 dark:bg-teal-500/10 border-l-2 border-l-teal-500"
                : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate leading-tight">
                  {company.display_name || company.name}
                </h3>
                {company.industry && (
                  <span className="text-[11px] text-zinc-500 hidden sm:inline">
                    {company.industry}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {company.domain_id && (
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono">
                    {company.domain_id}
                  </span>
                )}
                <StageChip
                  stage={company.stage}
                  label={stageConfig?.label || company.stage}
                />
              </div>
            </div>
            {company.notes && (
              <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">
                {company.notes}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StageChip({ stage, label }: { stage: string; label: string }) {
  const colors: Record<string, string> = {
    prospect: "bg-slate-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
    opportunity: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400",
    client: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400",
    churned: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400",
    partner: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400",
  };

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
        colors[stage] || colors.prospect
      }`}
    >
      {label}
    </span>
  );
}
