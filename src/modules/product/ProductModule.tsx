// src/modules/product/ProductModule.tsx
// Product module — 4-tab layout: Platform, Business, Domains, Categories

import { useState, useCallback, useEffect, useRef } from "react";
import { Boxes, Package, Database, Tags, Layers, ArrowLeft, Sparkles } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useProductStats } from "../../hooks/product";
import { useDiscoverDomains } from "../../hooks/val-sync";
import { useRepository } from "../../stores/repositoryStore";
import type { ProductEntityType } from "../../lib/product/types";
import { PlatformTabView } from "./PlatformTabView";
import { SolutionsTabView } from "./SolutionsTabView";
import { DomainTabView } from "./DomainTabView";
import { CategoryLibraryPanel } from "./CategoryLibraryPanel";
import { DataModelTabView } from "./DataModelTabView";
import { EntityForm } from "./EntityForm";
import { UnifiedReviewView } from "../library/UnifiedReviewView";
import type { ReviewResourceType } from "../library/reviewTypes";
import { AiSkillsTabView } from "./AiSkillsTabView";
type ProductTab = "platform" | "solutions" | "domains" | "data-models" | "category-library" | "skills";
type ReviewType = "data-models" | "queries" | "dashboards" | "workflows";

// ============================
// Detail panel resize persistence
// ============================
const DETAIL_PANEL_WIDTH_KEY = "tv-desktop-product-detail-panel-width";

function getDetailPanelWidth(): number {
  if (typeof window === "undefined") return 50;
  const stored = localStorage.getItem(DETAIL_PANEL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 50;
}

function saveDetailPanelWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(DETAIL_PANEL_WIDTH_KEY, String(width));
  }
}

// ============================
// Main module
// ============================
export function ProductModule() {
  const [activeTab, setActiveTab] = useState<ProductTab>("platform");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formEntityType, setFormEntityType] = useState<ProductEntityType>("module");

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    const labels: Record<ProductTab, string> = { platform: "Platform", solutions: "Solutions", domains: "Domains", "data-models": "Data Models", "category-library": "Categories", skills: "AI Skills" };
    setViewContext(activeTab, labels[activeTab]);
  }, [activeTab, setViewContext]);

  // Review escape hatch (full-screen review for domains)
  const [reviewingDomain, setReviewingDomain] = useState<string | null>(null);
  const lastReviewedDomainRef = useRef<string | null>(null);
  const [reviewType, setReviewType] = useState<ReviewType>("data-models");

  // Report review mode context for help bot
  useEffect(() => {
    if (reviewingDomain) {
      const reviewLabels: Record<ReviewType, string> = { "data-models": "Data Models", queries: "Queries", workflows: "Workflows", dashboards: "Dashboards" };
      const reviewDescriptions: Record<ReviewType, string> = {
        "data-models": "Review Mode with action buttons: Fetch All Samples, Fetch All Categorical, Fetch All Details, AI Describe All, AI Classify All, Generate All Overviews, Sync to Portal, Export. Grid shows all tables with editable classification fields.",
        queries: "Review Mode showing all queries with category, table name, field count. Split panel with detail preview on the right.",
        workflows: "Review Mode showing all workflows with schedule, cron expression, plugin count. Split panel with detail preview.",
        dashboards: "Review Mode showing all dashboards with category, widget count, creator. Split panel with detail preview.",
      };
      setViewContext("domains", "Domains");
      setViewDetail(`${reviewingDomain} → ${reviewLabels[reviewType]} ${reviewDescriptions[reviewType]}`);
    } else {
      setViewDetail(null);
    }
  }, [reviewingDomain, reviewType, setViewContext, setViewDetail]);

  // Detail panel resize (percentage-based, CRM pattern) — used by Platform & Business tabs
  const [detailPanelWidth, setDetailPanelWidthState] = useState(50);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const detailStartXRef = useRef(0);
  const detailStartWidthRef = useRef(50);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load width on mount
  useEffect(() => {
    setDetailPanelWidthState(getDetailPanelWidth());
  }, []);

  // Resize handlers
  const handleDetailMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingDetail(true);
    detailStartXRef.current = e.clientX;
    detailStartWidthRef.current = detailPanelWidth;
  }, [detailPanelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingDetail && containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const deltaX = e.clientX - detailStartXRef.current;
        const deltaPercent = (deltaX / containerWidth) * 100;
        const newWidth = detailStartWidthRef.current - deltaPercent;
        const clamped = Math.max(25, Math.min(75, newWidth));
        setDetailPanelWidthState(clamped);
        saveDetailPanelWidth(clamped);
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

  // Data for stats & domain path (used for DataModelsReview escape hatch)
  const statsQuery = useProductStats();
  const { activeRepository } = useRepository();
  const domainsPath = activeRepository ? `${activeRepository.path}/0_Platform/domains` : null;
  const domainsQuery = useDiscoverDomains(domainsPath);

  // Tab change resets selection
  const handleTabChange = useCallback((tab: ProductTab) => {
    setActiveTab(tab);
    setSelectedId(null);
  }, []);

  // Entity form
  const handleNew = useCallback((entityType: ProductEntityType) => {
    setFormEntityType(entityType);
    setShowForm(true);
  }, []);

  const handleFormClose = useCallback(() => setShowForm(false), []);
  const handleFormSaved = useCallback(() => {
    setShowForm(false);
    statsQuery.refetch();
  }, [statsQuery]);

  // Selection (Platform & Business tabs)
  const handleSelect = useCallback((id: string | null) => setSelectedId(id), []);

  // Review (full-screen escape hatch for domains)
  const handleReviewDataModels = useCallback((domain: string) => {
    setReviewType("data-models");
    setReviewingDomain(domain);
    lastReviewedDomainRef.current = domain;
  }, []);
  const handleReviewQueries = useCallback((domain: string) => {
    setReviewType("queries");
    setReviewingDomain(domain);
    lastReviewedDomainRef.current = domain;
  }, []);
  const handleReviewWorkflows = useCallback((domain: string) => {
    setReviewType("workflows");
    setReviewingDomain(domain);
    lastReviewedDomainRef.current = domain;
  }, []);
  const handleReviewDashboards = useCallback((domain: string) => {
    setReviewType("dashboards");
    setReviewingDomain(domain);
    lastReviewedDomainRef.current = domain;
  }, []);
  const handleExitReview = useCallback(() => setReviewingDomain(null), []);

  // ── Full-screen Review ──
  if (reviewingDomain) {
    const discoveredDomain = domainsQuery.data?.find((d) => d.domain === reviewingDomain);
    const basePath = discoveredDomain
      ? discoveredDomain.global_path
      : activeRepository
        ? `${activeRepository.path}/0_Platform/domains/production/${reviewingDomain}`
        : null;

    const REVIEW_FOLDER: Record<ReviewType, string> = {
      "data-models": "data_models",
      queries: "queries",
      workflows: "workflows",
      dashboards: "dashboards",
    };

    const REVIEW_LABEL: Record<ReviewType, string> = {
      "data-models": "Data Models",
      queries: "Queries",
      workflows: "Workflows",
      dashboards: "Dashboards",
    };

    const REVIEW_RESOURCE_TYPE: Record<ReviewType, ReviewResourceType> = {
      "data-models": "table",
      queries: "query",
      workflows: "workflow",
      dashboards: "dashboard",
    };

    const folderPath = basePath ? `${basePath}/${REVIEW_FOLDER[reviewType]}` : null;

    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleExitReview}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Domains
          </button>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {reviewingDomain} — {REVIEW_LABEL[reviewType]}
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          {folderPath && (
            <UnifiedReviewView
              resourceType={REVIEW_RESOURCE_TYPE[reviewType]}
              folderPath={folderPath}
              domainName={reviewingDomain}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Normal layout ──
  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Platform" icon={Boxes} active={activeTab === "platform"} onClick={() => handleTabChange("platform")} data-help-id="product-tab-platform" />
        <ViewTab label="Solutions" icon={Package} active={activeTab === "solutions"} onClick={() => handleTabChange("solutions")} data-help-id="product-tab-solutions" />
        <ViewTab label="Domains" icon={Database} active={activeTab === "domains"} onClick={() => handleTabChange("domains")} data-help-id="product-tab-domains" />
        <ViewTab label="Data Model" icon={Layers} active={activeTab === "data-models"} onClick={() => handleTabChange("data-models")} data-help-id="product-tab-data-models" />
        <ViewTab label="Skills" icon={Sparkles} active={activeTab === "skills"} onClick={() => handleTabChange("skills")} data-help-id="product-tab-skills" />
        <ViewTab label="Categories" icon={Tags} active={activeTab === "category-library"} onClick={() => handleTabChange("category-library")} data-help-id="product-tab-categories" />
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {activeTab === "platform" && (
          <PlatformTabView
            selectedId={selectedId}
            onSelect={handleSelect}
            onNew={handleNew}
            detailPanelWidth={detailPanelWidth}
            isResizingDetail={isResizingDetail}
            onDetailMouseDown={handleDetailMouseDown}
          />
        )}

        {activeTab === "solutions" && (
          <SolutionsTabView
            onSelect={handleSelect}
            solutionsPath={activeRepository ? `${activeRepository.path}/2_Solutions` : undefined}
            detailPanelWidth={detailPanelWidth}
            isResizingDetail={isResizingDetail}
            onDetailMouseDown={handleDetailMouseDown}
          />
        )}

        {activeTab === "domains" && (
          <DomainTabView
            initialDomain={lastReviewedDomainRef.current}
            onReviewDataModels={handleReviewDataModels}
            onReviewQueries={handleReviewQueries}
            onReviewWorkflows={handleReviewWorkflows}
            onReviewDashboards={handleReviewDashboards}
          />
        )}

        {activeTab === "data-models" && (
          <DataModelTabView />
        )}

        {activeTab === "category-library" && (
          <div className="flex-1 overflow-hidden">
            <CategoryLibraryPanel />
          </div>
        )}

        {activeTab === "skills" && (
          <AiSkillsTabView />
        )}

      </div>

      {/* Entity form modal */}
      {showForm && (
        <EntityForm
          entityType={formEntityType}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}
    </div>
  );
}
