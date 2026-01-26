// src/modules/crm/CrmModule.tsx
// Main CRM module container with sidebar, company list, and detail panel

import { useState, useCallback, useEffect, useRef } from "react";
import { useCompanies, usePipelineStats } from "../../hooks/useCRM";
import { Company, CompanyFilters, DealWithTaskInfo } from "../../lib/crm/types";
import { CRMSidebar } from "./CRMSidebar";
import { CompanyListView } from "./CompanyListView";
import { CompanyDetailPanel } from "./CompanyDetailPanel";
import { CompanyForm } from "./CompanyForm";
import { DealPipeline } from "./DealPipeline";
import { PipelineStatsBar } from "./PipelineStatsBar";
import { Loader2 } from "lucide-react";


type CRMView = "companies" | "contacts" | "pipeline" | "clients";

// Storage key for sidebar width
const CRM_SIDEBAR_WIDTH_KEY = "tv-desktop-crm-sidebar-width";

function getSidebarWidth(): number {
  if (typeof window === "undefined") return 240;
  const stored = localStorage.getItem(CRM_SIDEBAR_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 240;
}

function setSidebarWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(CRM_SIDEBAR_WIDTH_KEY, String(width));
  }
}

export function CrmModule() {
  const [activeView, setActiveView] = useState<CRMView>("companies");
  const [filters, setFilters] = useState<CompanyFilters>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | undefined>(undefined);

  // Sidebar resizing
  const [sidebarWidth, setSidebarWidthState] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);

  // Load sidebar width on mount
  useEffect(() => {
    setSidebarWidthState(getSidebarWidth());
  }, []);

  // Handle sidebar resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + deltaX;
      const clampedWidth = Math.max(180, Math.min(360, newWidth));
      setSidebarWidthState(clampedWidth);
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
      }
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // Data fetching
  const companiesQuery = useCompanies(
    activeView === "clients"
      ? { ...filters, stage: "client" }
      : filters
  );
  const pipelineStatsQuery = usePipelineStats();

  const companies = companiesQuery.data ?? [];
  const pipelineStats = pipelineStatsQuery.data;
  const isLoading = companiesQuery.isLoading;

  // Handlers
  const handleCompanyClick = useCallback((company: Company) => {
    setSelectedCompanyId(company.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCompanyId(null);
  }, []);

  const handleNewCompany = useCallback(() => {
    setEditingCompany(undefined);
    setShowCompanyForm(true);
  }, []);

  const handleCompanySaved = useCallback(() => {
    setShowCompanyForm(false);
    setEditingCompany(undefined);
    companiesQuery.refetch();
    pipelineStatsQuery.refetch();
  }, [companiesQuery, pipelineStatsQuery]);

  const handleCompanyDeleted = useCallback(() => {
    setSelectedCompanyId(null);
    companiesQuery.refetch();
    pipelineStatsQuery.refetch();
  }, [companiesQuery, pipelineStatsQuery]);

  const handleViewChange = useCallback((view: CRMView) => {
    setActiveView(view);
    setSelectedCompanyId(null);
  }, []);

  // Handle deal click in pipeline view - open company detail panel
  const handleDealClick = useCallback((deal: DealWithTaskInfo) => {
    setSelectedCompanyId(deal.company_id);
  }, []);

  return (
    <div className="h-full flex bg-slate-50 dark:bg-zinc-950">
      {/* Sidebar with resize handle */}
      <aside
        className="relative flex-shrink-0 border-r border-slate-200 dark:border-zinc-800"
        style={{
          width: sidebarWidth,
          transition: isResizing ? "none" : "width 200ms",
        }}
      >
        <CRMSidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          filters={filters}
          onFiltersChange={setFilters}
          pipelineStats={pipelineStats}
          onNewCompany={handleNewCompany}
        />

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 -right-1 w-3 h-full cursor-col-resize group z-50"
        >
          <div
            className={`absolute left-1 w-0.5 h-full transition-all ${
              isResizing
                ? "bg-teal-500 w-1"
                : "bg-transparent group-hover:bg-teal-500/60"
            }`}
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Pipeline stats header - only on companies/clients view */}
        {(activeView === "companies" || activeView === "clients") && (
          <PipelineStatsBar
            stats={pipelineStats}
            loading={pipelineStatsQuery.isLoading && !pipelineStats}
          />
        )}

        {/* Content area */}
        {activeView === "pipeline" ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Pipeline view */}
            <div
              className={`${
                selectedCompanyId
                  ? "w-1/2 border-r border-slate-200 dark:border-zinc-800"
                  : "flex-1"
              } overflow-hidden`}
            >
              <DealPipeline
                onRefresh={() => pipelineStatsQuery.refetch()}
                onDealClick={handleDealClick}
              />
            </div>

            {/* Company detail panel */}
            {selectedCompanyId && (
              <div className="w-1/2 overflow-hidden">
                <CompanyDetailPanel
                  companyId={selectedCompanyId}
                  onClose={handleCloseDetail}
                  onCompanyUpdated={() => {
                    companiesQuery.refetch();
                    pipelineStatsQuery.refetch();
                  }}
                  onCompanyDeleted={() => {
                    setSelectedCompanyId(null);
                    companiesQuery.refetch();
                    pipelineStatsQuery.refetch();
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Company list */}
            <div
              className={`${
                selectedCompanyId
                  ? "w-1/2 border-r border-slate-200 dark:border-zinc-800"
                  : "flex-1"
              } overflow-hidden flex flex-col`}
            >
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 size={24} className="text-zinc-600 animate-spin" />
                </div>
              ) : (
                <CompanyListView
                  companies={companies}
                  selectedCompanyId={selectedCompanyId}
                  onCompanyClick={handleCompanyClick}
                  loading={isLoading}
                />
              )}
            </div>

            {/* Company detail panel */}
            {selectedCompanyId && (
              <div className="w-1/2 overflow-hidden">
                <CompanyDetailPanel
                  companyId={selectedCompanyId}
                  onClose={handleCloseDetail}
                  onCompanyUpdated={() => companiesQuery.refetch()}
                  onCompanyDeleted={handleCompanyDeleted}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Company form modal */}
      {showCompanyForm && (
        <CompanyForm
          company={editingCompany}
          onClose={() => {
            setShowCompanyForm(false);
            setEditingCompany(undefined);
          }}
          onSaved={handleCompanySaved}
        />
      )}
    </div>
  );
}
