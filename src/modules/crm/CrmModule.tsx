// src/modules/crm/CrmModule.tsx
// Main CRM module container with sidebar, company list, and detail panel

import { useState, useCallback, useEffect, useRef } from "react";
import { useCompanies, usePipelineStats, useCRMRealtime } from "../../hooks/useCRM";
import { Company, CompanyFilters, DealWithTaskInfo } from "../../lib/crm/types";
import { CRMSidebar } from "./CRMSidebar";
import { CompanyListView } from "./CompanyListView";
import { CompanyDetailPanel } from "./CompanyDetailPanel";
import { CompanyForm } from "./CompanyForm";
import { DealPipeline } from "./DealPipeline";
import { PipelineStatsBar } from "./PipelineStatsBar";
import { Loader2 } from "lucide-react";


type CRMView = "companies" | "contacts" | "pipeline" | "clients";

// Storage keys
const CRM_SIDEBAR_WIDTH_KEY = "tv-desktop-crm-sidebar-width";
const CRM_DETAIL_PANEL_WIDTH_KEY = "tv-desktop-crm-detail-panel-width";

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

function getDetailPanelWidth(): number {
  if (typeof window === "undefined") return 50;
  const stored = localStorage.getItem(CRM_DETAIL_PANEL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 50;
}

function setDetailPanelWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(CRM_DETAIL_PANEL_WIDTH_KEY, String(width));
  }
}

export function CrmModule() {
  const [activeView, setActiveView] = useState<CRMView>("companies");
  const [filters, setFilters] = useState<CompanyFilters>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | undefined>(undefined);

  // Enable real-time updates from Supabase
  useCRMRealtime();

  // Sidebar resizing
  const [sidebarWidth, setSidebarWidthState] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);

  // Detail panel resizing (stored as percentage)
  const [detailPanelWidth, setDetailPanelWidthState] = useState(50);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const detailStartXRef = useRef(0);
  const detailStartWidthRef = useRef(50);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load widths on mount
  useEffect(() => {
    setSidebarWidthState(getSidebarWidth());
    setDetailPanelWidthState(getDetailPanelWidth());
  }, []);

  // Handle sidebar resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
  };

  // Handle detail panel resize
  const handleDetailMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingDetail(true);
    detailStartXRef.current = e.clientX;
    detailStartWidthRef.current = detailPanelWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const deltaX = e.clientX - startXRef.current;
        const newWidth = startWidthRef.current + deltaX;
        const clampedWidth = Math.max(180, Math.min(360, newWidth));
        setSidebarWidthState(clampedWidth);
        setSidebarWidth(clampedWidth);
      }
      if (isResizingDetail && containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const deltaX = e.clientX - detailStartXRef.current;
        // Moving left increases detail panel width (subtract delta)
        const deltaPercent = (deltaX / containerWidth) * 100;
        const newWidth = detailStartWidthRef.current - deltaPercent;
        const clampedWidth = Math.max(25, Math.min(75, newWidth));
        setDetailPanelWidthState(clampedWidth);
        setDetailPanelWidth(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
      }
      if (isResizingDetail) {
        setIsResizingDetail(false);
      }
    };

    if (isResizing || isResizingDetail) {
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
  }, [isResizing, isResizingDetail]);

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
            onRefresh={() => {
              companiesQuery.refetch();
              pipelineStatsQuery.refetch();
            }}
          />
        )}

        {/* Content area */}
        {activeView === "pipeline" ? (
          <div ref={containerRef} className="flex-1 flex overflow-hidden">
            {/* Pipeline view */}
            <div
              className="overflow-hidden"
              style={{
                flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto",
                transition: isResizingDetail ? "none" : "flex 200ms",
              }}
            >
              <DealPipeline
                onRefresh={() => pipelineStatsQuery.refetch()}
                onDealClick={handleDealClick}
              />
            </div>

            {/* Company detail panel with resize handle */}
            {selectedCompanyId && (
              <div
                className="relative overflow-hidden border-l border-slate-200 dark:border-zinc-800"
                style={{
                  flex: `0 0 ${detailPanelWidth}%`,
                  transition: isResizingDetail ? "none" : "flex 200ms",
                }}
              >
                {/* Resize Handle */}
                <div
                  onMouseDown={handleDetailMouseDown}
                  className="absolute top-0 -left-1 w-3 h-full cursor-col-resize group z-50"
                >
                  <div
                    className={`absolute right-1 w-0.5 h-full transition-all ${
                      isResizingDetail
                        ? "bg-teal-500 w-1"
                        : "bg-transparent group-hover:bg-teal-500/60"
                    }`}
                  />
                </div>
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
          <div ref={containerRef} className="flex-1 flex overflow-hidden">
            {/* Company list */}
            <div
              className="overflow-hidden flex flex-col"
              style={{
                flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto",
                transition: isResizingDetail ? "none" : "flex 200ms",
              }}
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

            {/* Company detail panel with resize handle */}
            {selectedCompanyId && (
              <div
                className="relative overflow-hidden border-l border-slate-200 dark:border-zinc-800"
                style={{
                  flex: `0 0 ${detailPanelWidth}%`,
                  transition: isResizingDetail ? "none" : "flex 200ms",
                }}
              >
                {/* Resize Handle */}
                <div
                  onMouseDown={handleDetailMouseDown}
                  className="absolute top-0 -left-1 w-3 h-full cursor-col-resize group z-50"
                >
                  <div
                    className={`absolute right-1 w-0.5 h-full transition-all ${
                      isResizingDetail
                        ? "bg-teal-500 w-1"
                        : "bg-transparent group-hover:bg-teal-500/60"
                    }`}
                  />
                </div>
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
