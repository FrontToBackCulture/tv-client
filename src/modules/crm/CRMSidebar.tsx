// src/modules/crm/CRMSidebar.tsx
// CRM sidebar with navigation and filters

import { useState } from "react";
import { Building2, Users, BarChart3, CheckCircle, Plus, Trophy } from "lucide-react";
import { CompanyFilters, COMPANY_STAGES, PipelineStats } from "../../lib/crm/types";
import { ClosedDealsPanel } from "./ClosedDealsPanel";

type CRMView = "companies" | "contacts" | "pipeline" | "clients";

interface CRMSidebarProps {
  activeView: CRMView;
  onViewChange: (view: CRMView) => void;
  filters: CompanyFilters;
  onFiltersChange: (filters: CompanyFilters) => void;
  pipelineStats?: PipelineStats | null;
  onNewCompany?: () => void;
}

const views: { id: CRMView; label: string; icon: typeof Building2 }[] = [
  { id: "companies", label: "All Companies", icon: Building2 },
  { id: "contacts", label: "All Contacts", icon: Users },
  { id: "pipeline", label: "Pipeline", icon: BarChart3 },
  { id: "clients", label: "Active Clients", icon: CheckCircle },
];

export function CRMSidebar({
  activeView,
  onViewChange,
  filters,
  onFiltersChange,
  pipelineStats,
  onNewCompany,
}: CRMSidebarProps) {
  const [showClosedDeals, setShowClosedDeals] = useState(false);

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">CRM</h2>
      </div>

      {/* Views */}
      <div className="px-2 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2 px-2">
          Views
        </h3>
        <nav className="space-y-0.5">
          {views.map((view) => {
            const isActive = view.id === activeView;
            const Icon = view.icon;
            return (
              <button
                key={view.id}
                onClick={() => onViewChange(view.id)}
                className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded transition-colors ${
                  isActive
                    ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-300"
                }`}
              >
                <Icon
                  size={16}
                  className={isActive ? "text-teal-400" : "text-zinc-500"}
                />
                <span className="text-sm flex-1">{view.label}</span>
                {view.id === "pipeline" && pipelineStats && (
                  <span className="text-xs text-zinc-500">
                    {pipelineStats.totalDeals ?? 0}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Filters - only show on companies view */}
      {activeView === "companies" && (
        <div className="px-2 py-3 flex-1 overflow-auto">
          <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2 px-2">
            Filters
          </h3>

          {/* Search */}
          <div className="mb-4 px-2">
            <input
              type="text"
              placeholder="Search..."
              value={filters.search || ""}
              onChange={(e) =>
                onFiltersChange({ ...filters, search: e.target.value || undefined })
              }
              className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Stage filter */}
          <div className="mb-4 px-2">
            <label className="text-[11px] font-medium text-zinc-500 block mb-2 uppercase tracking-wider">
              Stage
            </label>
            <div className="space-y-1">
              {COMPANY_STAGES.map((stage) => {
                const isChecked = Array.isArray(filters.stage)
                  ? filters.stage.includes(stage.value)
                  : filters.stage === stage.value;

                return (
                  <label
                    key={stage.value}
                    className="flex items-center gap-2 text-sm cursor-pointer py-1"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const currentStages = Array.isArray(filters.stage)
                          ? filters.stage
                          : filters.stage
                          ? [filters.stage]
                          : [];

                        const newStages = e.target.checked
                          ? [...currentStages, stage.value]
                          : currentStages.filter((s) => s !== stage.value);

                        onFiltersChange({
                          ...filters,
                          stage: newStages.length > 0 ? newStages : undefined,
                        });
                      }}
                      className="rounded border-zinc-600 bg-zinc-800 text-teal-500 focus:ring-teal-500 w-3.5 h-3.5"
                    />
                    <span className="text-zinc-400">{stage.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Clear filters */}
          {(filters.search || filters.stage || filters.industry || filters.tags?.length) && (
            <button
              onClick={() => onFiltersChange({})}
              className="text-sm text-teal-400 hover:text-teal-300 px-2"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Closed Deals button */}
      <div className="px-2 py-1">
        <button
          onClick={() => setShowClosedDeals(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Trophy size={16} />
          Closed Deals
        </button>
      </div>

      {/* New Company button */}
      <div className="px-2 py-2 border-t border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onNewCompany}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Company
        </button>
      </div>

      {/* Closed Deals Panel */}
      <ClosedDealsPanel
        isOpen={showClosedDeals}
        onClose={() => setShowClosedDeals(false)}
      />
    </div>
  );
}
