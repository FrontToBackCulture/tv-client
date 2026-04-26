// src/modules/crm/CrmModule.tsx
// CRM module — pipeline kanban with a left sidebar (filters/sort) and the
// shared chrome: PageHeader (last activity), StatsStrip, RecentChangesPanel.

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePipelineStats, useCRMRealtime, useDealsWithTasks } from "../../hooks/crm";
import { CompanyDetailPanel } from "./CompanyDetailPanel";
import { useSelectedEntityStore } from "../../stores/selectedEntityStore";
import { CompanyForm } from "./CompanyForm";
import { Company, DealWithTaskInfo, DEAL_STAGES } from "../../lib/crm/types";
import { DealPipeline, type DealSortField, type DealSortDirection } from "./DealPipeline";
import { PipelineSidebar, type PipelineView, type DateWindow, type UpdateWindow } from "./PipelineSidebar";
import { PageHeader } from "../../components/PageHeader";
import { StatsStrip } from "../../components/StatsStrip";
import { RecentChangesPanel } from "../../components/RecentChangesPanel";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { timeAgoVerbose } from "../../lib/date";

const DETAIL_PANEL_WIDTH_KEY = "tv-desktop-crm-detail-panel-width";
const SOLUTION_FILTER_KEY = "tv-desktop-crm-solution-filter";
const PIPELINE_VIEW_KEY = "tv-desktop-crm-pipeline-view";
const SORT_FIELD_KEY = "tv-desktop-crm-sort-field";
const SORT_DIR_KEY = "tv-desktop-crm-sort-direction";
const REFERRAL_FILTER_KEY = "tv-desktop-crm-referral-filter";
const CLOSE_WINDOW_KEY = "tv-desktop-crm-close-window";
const UPDATE_WINDOW_KEY = "tv-desktop-crm-update-window";

function getStoredDetailWidth(): number {
  if (typeof window === "undefined") return 50;
  const stored = localStorage.getItem(DETAIL_PANEL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 50;
}

function setStoredDetailWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(DETAIL_PANEL_WIDTH_KEY, String(width));
  }
}

function getStoredString(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function CrmModule() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Sync to global selection store so Cmd+J chat modal knows the focus.
  const setGlobalSelected = useSelectedEntityStore((s) => s.setSelected);
  useEffect(() => {
    setGlobalSelected(selectedCompanyId ? { type: "company", id: selectedCompanyId } : null);
    return () => setGlobalSelected(null);
  }, [selectedCompanyId, setGlobalSelected]);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | undefined>(undefined);
  const [showChanges, setShowChanges] = useState(false);

  // Pipeline filter state (lifted from DealPipeline)
  const [pipelineView, setPipelineViewState] = useState<PipelineView>(
    () => getStoredString(PIPELINE_VIEW_KEY, "active") as PipelineView
  );
  const [solutionFilter, setSolutionFilterState] = useState<string>(
    () => getStoredString(SOLUTION_FILTER_KEY, "all")
  );
  const [sortField, setSortFieldState] = useState<DealSortField>(
    () => getStoredString(SORT_FIELD_KEY, "company") as DealSortField
  );
  const [sortDirection, setSortDirectionState] = useState<DealSortDirection>(
    () => getStoredString(SORT_DIR_KEY, "asc") as DealSortDirection
  );
  const [availableSolutions, setAvailableSolutions] = useState<{ value: string; label: string }[]>([]);
  const [referralFilter, setReferralFilterState] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(REFERRAL_FILTER_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [closeWindow, setCloseWindowState] = useState<DateWindow>(
    () => getStoredString(CLOSE_WINDOW_KEY, "any") as DateWindow
  );
  const [updateWindow, setUpdateWindowState] = useState<UpdateWindow>(
    () => getStoredString(UPDATE_WINDOW_KEY, "any") as UpdateWindow
  );

  const setReferralFilter = useCallback((v: string[]) => {
    setReferralFilterState(v);
    if (typeof window !== "undefined") localStorage.setItem(REFERRAL_FILTER_KEY, JSON.stringify(v));
  }, []);
  const setCloseWindow = useCallback((v: DateWindow) => {
    setCloseWindowState(v);
    if (typeof window !== "undefined") localStorage.setItem(CLOSE_WINDOW_KEY, v);
  }, []);
  const setUpdateWindow = useCallback((v: UpdateWindow) => {
    setUpdateWindowState(v);
    if (typeof window !== "undefined") localStorage.setItem(UPDATE_WINDOW_KEY, v);
  }, []);

  const setPipelineView = useCallback((v: PipelineView) => {
    setPipelineViewState(v);
    if (typeof window !== "undefined") localStorage.setItem(PIPELINE_VIEW_KEY, v);
  }, []);
  const setSolutionFilter = useCallback((v: string) => {
    setSolutionFilterState(v);
    if (typeof window !== "undefined") localStorage.setItem(SOLUTION_FILTER_KEY, v);
  }, []);
  const setSortField = useCallback((v: string) => {
    setSortFieldState(v as DealSortField);
    if (typeof window !== "undefined") localStorage.setItem(SORT_FIELD_KEY, v);
  }, []);
  const toggleSortDirection = useCallback(() => {
    setSortDirectionState((prev) => {
      const next = prev === "asc" ? "desc" : "asc";
      if (typeof window !== "undefined") localStorage.setItem(SORT_DIR_KEY, next);
      return next;
    });
  }, []);

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    setViewContext("pipeline", "Pipeline");
  }, [setViewContext]);

  useCRMRealtime();
  const pipelineStatsQuery = usePipelineStats();

  // All deals — used for stats strip + last activity
  const { data: allDeals = [] } = useDealsWithTasks();

  // Open a company when navigated from a notification or chat entity card
  const navTarget = useNotificationNavStore((s) => s.target);
  const clearNavTarget = useNotificationNavStore((s) => s.clearTarget);
  useEffect(() => {
    if (!navTarget) return;
    if (navTarget.entityType === "crm_company" || navTarget.entityType === "crm_deal") {
      setSelectedCompanyId(navTarget.entityId);
      clearNavTarget();
    }
  }, [navTarget, clearNavTarget]);

  // Detail panel resizing
  const [detailPanelWidth, setDetailPanelWidthState] = useState(50);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const detailStartXRef = useRef(0);
  const detailStartWidthRef = useRef(50);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDetailPanelWidthState(getStoredDetailWidth());
  }, []);

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
        setStoredDetailWidth(clampedWidth);
      }
    };
    const handleMouseUp = () => {
      if (isResizingDetail) setIsResizingDetail(false);
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

  const handleDealClick = useCallback((deal: DealWithTaskInfo) => setSelectedCompanyId(deal.company_id), []);
  const handleCompanySaved = useCallback(() => {
    setShowCompanyForm(false);
    setEditingCompany(undefined);
    pipelineStatsQuery.refetch();
  }, [pipelineStatsQuery]);

  const lastActivity = useMemo(() => {
    let max = 0;
    for (const d of allDeals) {
      const ts = d.updated_at ? new Date(d.updated_at).getTime() : 0;
      if (ts > max) max = ts;
    }
    return max > 0 ? `Last activity ${timeAgoVerbose(new Date(max).toISOString())}` : undefined;
  }, [allDeals]);

  const stats = useMemo(() => {
    const active = allDeals.filter((d) => !["won", "lost"].includes(d.stage ?? ""));
    const totalValue = active.reduce((s, d) => s + (d.value || 0), 0);
    const weightedValue = active.reduce((s, d) => {
      const stage = DEAL_STAGES.find((st) => st.value === d.stage);
      return s + (d.value || 0) * (stage?.weight ?? 0);
    }, 0);
    const won = allDeals.filter((d) => d.stage === "won").length;
    const lost = allDeals.filter((d) => d.stage === "lost").length;
    const stale = active.filter((d) => {
      if (!d.stage_changed_at) return false;
      const days = (Date.now() - new Date(d.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24);
      return days > 30;
    }).length;
    return {
      activeCount: active.length,
      totalValue: Math.round(totalValue / 1000),
      weightedValue: Math.round(weightedValue / 1000),
      won,
      lost,
      stale,
    };
  }, [allDeals]);

  const dealNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of allDeals) map[d.id] = d.name;
    return map;
  }, [allDeals]);

  const availableReferrals = useMemo(() => {
    const set = new Set<string>();
    for (const d of allDeals) {
      const r = d.company?.referred_by;
      if (r && r.trim()) set.add(r);
    }
    return [...set].sort();
  }, [allDeals]);

  const detailPanel = selectedCompanyId && (
    <div
      className="relative overflow-hidden border-l border-zinc-200 dark:border-zinc-800"
      style={{
        flex: `0 0 ${detailPanelWidth}%`,
        transition: isResizingDetail ? "none" : "flex 200ms",
      }}
    >
      <div
        onMouseDown={handleDetailMouseDown}
        className="absolute top-0 -left-1 w-3 h-full cursor-col-resize group z-50"
      >
        <div className={`absolute right-1 w-0.5 h-full transition-all ${isResizingDetail ? "bg-teal-500 w-1" : "bg-transparent group-hover:bg-teal-500/60"}`} />
      </div>
      <CompanyDetailPanel
        companyId={selectedCompanyId}
        onClose={() => setSelectedCompanyId(null)}
        onCompanyUpdated={() => pipelineStatsQuery.refetch()}
        onCompanyDeleted={() => {
          setSelectedCompanyId(null);
          pipelineStatsQuery.refetch();
        }}
      />
    </div>
  );

  // Map sidebar view → DealPipeline showClosed prop. "active" hides won/lost,
  // "all" shows everything, "closed_only" shows only won/lost (DealPipeline
  // doesn't natively support this; for now treat closed_only same as all and
  // let the user filter columns visually — leaves room for future polish).
  const showClosed = pipelineView !== "active";

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        description={lastActivity}
      />

      <StatsStrip stats={[
        { value: stats.activeCount, label: <>active<br/>deals</>, color: "blue" },
        { value: stats.totalValue, label: <>total value<br/>(K)</>, color: "emerald" },
        { value: stats.weightedValue, label: <>weighted<br/>(K)</>, color: "purple" },
        { value: stats.won, label: <>won</>, color: "emerald" },
        { value: stats.lost, label: <>lost</>, color: stats.lost > 0 ? "red" : "zinc" },
        { value: stats.stale, label: <>stale<br/>(30d+)</>, color: stats.stale > 0 ? "amber" : "zinc" },
      ]} />

      <div className="flex-1 h-full flex overflow-hidden px-4 py-4">
        <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 relative">
          <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
            <PipelineSidebar
              view={pipelineView}
              onViewChange={setPipelineView}
              solutionFilter={solutionFilter}
              onSolutionFilterChange={setSolutionFilter}
              availableSolutions={availableSolutions}
              referralFilter={referralFilter}
              onReferralFilterChange={setReferralFilter}
              availableReferrals={availableReferrals}
              closeWindow={closeWindow}
              onCloseWindowChange={setCloseWindow}
              updateWindow={updateWindow}
              onUpdateWindowChange={setUpdateWindow}
              sortField={sortField}
              onSortFieldChange={setSortField}
              sortDirection={sortDirection}
              onToggleSortDirection={toggleSortDirection}
              staleCount={stats.stale}
              totalCount={allDeals.length}
            />
          </aside>

          <div ref={containerRef} className="flex-1 min-w-0 flex overflow-hidden">
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
                solutionFilter={solutionFilter}
                showClosed={showClosed}
                sortField={sortField}
                sortDirection={sortDirection}
                onSolutionsAvailableChange={setAvailableSolutions}
                referralFilter={referralFilter}
                closeWindow={closeWindow}
                updateWindow={updateWindow}
              />
            </div>
            {detailPanel}
          </div>

          <RecentChangesPanel
            open={showChanges}
            onClose={() => setShowChanges(false)}
            table="project_changes"
            queryKey={["crm_deal_changes_recent"]}
            fieldLabels={{ deal_stage: "Stage", deal_value: "Value", deal_solution: "Solution", deal_expected_close: "Expected Close", name: "Name", company_id: "Company", deal_actual_close: "Actual Close", deal_lost_reason: "Lost Reason", deal_won_notes: "Won Notes" }}
            titleFor={(c) => dealNames[c.project_id] || c.project_id?.slice(0, 8)}
          />
        </div>
      </div>

      {showCompanyForm && (
        <CompanyForm
          company={editingCompany}
          onClose={() => { setShowCompanyForm(false); setEditingCompany(undefined); }}
          onSaved={handleCompanySaved}
        />
      )}
    </div>
  );
}
