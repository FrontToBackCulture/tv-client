// src/modules/crm/CrmModule.tsx
// Main CRM module with 4-tab layout: Pipeline, Directory, Clients, Closed

import { useState, useCallback, useEffect, useRef } from "react";
import { usePipelineStats, useCRMRealtime } from "../../hooks/useCRM";
import { Company, DealWithTaskInfo } from "../../lib/crm/types";
import { CompanyDetailPanel } from "./CompanyDetailPanel";
import { CompanyForm } from "./CompanyForm";
import { DealPipeline } from "./DealPipeline";
import { DirectoryView } from "./DirectoryView";
import { ClientsView } from "./ClientsView";
import { ClosedDealsView } from "./ClosedDealsView";
import { Building2, BookUser, Users, Archive } from "lucide-react";

type CrmView = "pipeline" | "directory" | "clients" | "closed";

// Storage key
const CRM_DETAIL_PANEL_WIDTH_KEY = "tv-desktop-crm-detail-panel-width";

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

// ============================
// Tab component
// ============================
function ViewTab({ label, icon: Icon, active, onClick }: {
  label: string; icon: typeof Building2; active: boolean; onClick: () => void;
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
    </button>
  );
}

// ============================
// Main module
// ============================
export function CrmModule() {
  const [activeView, setActiveView] = useState<CrmView>("pipeline");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | undefined>(undefined);

  // Enable real-time updates from Supabase
  useCRMRealtime();

  // Detail panel resizing (stored as percentage)
  const [detailPanelWidth, setDetailPanelWidthState] = useState(50);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const detailStartXRef = useRef(0);
  const detailStartWidthRef = useRef(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const pipelineStatsQuery = usePipelineStats();

  // Load width on mount
  useEffect(() => {
    setDetailPanelWidthState(getDetailPanelWidth());
  }, []);

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
      if (isResizingDetail && containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const deltaX = e.clientX - detailStartXRef.current;
        const deltaPercent = (deltaX / containerWidth) * 100;
        const newWidth = detailStartWidthRef.current - deltaPercent;
        const clampedWidth = Math.max(25, Math.min(75, newWidth));
        setDetailPanelWidthState(clampedWidth);
        setDetailPanelWidth(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizingDetail) {
        setIsResizingDetail(false);
      }
    };

    if (isResizingDetail) {
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
  }, [isResizingDetail]);

  // Handlers
  const handleSelect = useCallback((id: string | null) => {
    setSelectedCompanyId(id);
  }, []);

  const handleViewChange = useCallback((view: CrmView) => {
    setActiveView(view);
    setSelectedCompanyId(null);
  }, []);

  const handleDealClick = useCallback((deal: DealWithTaskInfo) => {
    setSelectedCompanyId(deal.company_id);
  }, []);

  const handleNewCompany = useCallback(() => {
    setEditingCompany(undefined);
    setShowCompanyForm(true);
  }, []);

  const handleCompanySaved = useCallback(() => {
    setShowCompanyForm(false);
    setEditingCompany(undefined);
    pipelineStatsQuery.refetch();
  }, [pipelineStatsQuery]);

  const handleCloseDetail = useCallback(() => {
    setSelectedCompanyId(null);
  }, []);

  // Detail panel component (shared across all views)
  const detailPanel = selectedCompanyId && (
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
        onCompanyUpdated={() => pipelineStatsQuery.refetch()}
        onCompanyDeleted={() => {
          setSelectedCompanyId(null);
          pipelineStatsQuery.refetch();
        }}
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Pipeline" icon={Building2} active={activeView === "pipeline"} onClick={() => handleViewChange("pipeline")} />
        <ViewTab label="Directory" icon={BookUser} active={activeView === "directory"} onClick={() => handleViewChange("directory")} />
        <ViewTab label="Clients" icon={Users} active={activeView === "clients"} onClick={() => handleViewChange("clients")} />
        <ViewTab label="Closed" icon={Archive} active={activeView === "closed"} onClick={() => handleViewChange("closed")} />
      </div>

      {/* Content area */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {activeView === "pipeline" ? (
          <>
            {/* Pipeline takes available space, shrinks when detail is open */}
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
            {detailPanel}
          </>
        ) : activeView === "directory" ? (
          <>
            <div
              className="flex flex-col overflow-hidden"
              style={{
                flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto",
                transition: isResizingDetail ? "none" : "flex 200ms",
              }}
            >
              <DirectoryView
                selectedId={selectedCompanyId}
                onSelect={handleSelect}
                onNewCompany={handleNewCompany}
              />
            </div>
            {detailPanel}
          </>
        ) : activeView === "clients" ? (
          <>
            <div
              className="flex flex-col overflow-hidden"
              style={{
                flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto",
                transition: isResizingDetail ? "none" : "flex 200ms",
              }}
            >
              <ClientsView
                selectedId={selectedCompanyId}
                onSelect={handleSelect}
              />
            </div>
            {detailPanel}
          </>
        ) : (
          <>
            <div
              className="flex flex-col overflow-hidden"
              style={{
                flex: selectedCompanyId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto",
                transition: isResizingDetail ? "none" : "flex 200ms",
              }}
            >
              <ClosedDealsView
                selectedId={selectedCompanyId}
                onSelect={handleSelect}
              />
            </div>
            {detailPanel}
          </>
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
