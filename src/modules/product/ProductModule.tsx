// src/modules/product/ProductModule.tsx
// Product module — 4-tab layout: Platform, Business, Domains, Categories

import { useState, useCallback, useEffect, useRef } from "react";
import { Boxes, Package, Database, Tags, ArrowLeft } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { useProductStats } from "../../hooks/useProduct";
import { useDiscoverDomains } from "../../hooks/useValSync";
import { useRepository } from "../../stores/repositoryStore";
import type { ProductEntityType } from "../../lib/product/types";
import { PlatformTabView } from "./PlatformTabView";
import { BusinessTabView } from "./BusinessTabView";
import { DomainTabView } from "./DomainTabView";
import { CategoryLibraryPanel } from "./CategoryLibraryPanel";
import { EntityForm } from "./EntityForm";
import { DataModelsReviewView } from "../library/DataModelsReviewView";

type ProductTab = "platform" | "business" | "domains" | "category-library";

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

  // DataModelsReview escape hatch
  const [reviewingDomain, setReviewingDomain] = useState<string | null>(null);

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

  // DataModelsReview (full-screen escape hatch for domains)
  const handleReviewDataModels = useCallback((domain: string) => setReviewingDomain(domain), []);
  const handleExitReview = useCallback(() => setReviewingDomain(null), []);

  // ── Full-screen DataModelsReview ──
  if (reviewingDomain) {
    const discoveredDomain = domainsQuery.data?.find((d) => d.domain === reviewingDomain);
    const domainPath = discoveredDomain
      ? `${discoveredDomain.global_path}/data_models`
      : activeRepository
        ? `${activeRepository.path}/0_Platform/domains/production/${reviewingDomain}/data_models`
        : null;

    return (
      <div className="h-full flex flex-col bg-slate-50 dark:bg-zinc-950">
        <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleExitReview}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Domains
          </button>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{reviewingDomain}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          {domainPath && <DataModelsReviewView dataModelsPath={domainPath} domainName={reviewingDomain} />}
        </div>
      </div>
    );
  }

  // ── Normal layout ──
  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Platform" icon={Boxes} active={activeTab === "platform"} onClick={() => handleTabChange("platform")} />
        <ViewTab label="Business" icon={Package} active={activeTab === "business"} onClick={() => handleTabChange("business")} />
        <ViewTab label="Domains" icon={Database} active={activeTab === "domains"} onClick={() => handleTabChange("domains")} />
        <ViewTab label="Categories" icon={Tags} active={activeTab === "category-library"} onClick={() => handleTabChange("category-library")} />
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

        {activeTab === "business" && (
          <BusinessTabView
            selectedId={selectedId}
            onSelect={handleSelect}
            onNew={handleNew}
            detailPanelWidth={detailPanelWidth}
            isResizingDetail={isResizingDetail}
            onDetailMouseDown={handleDetailMouseDown}
          />
        )}

        {activeTab === "domains" && (
          <DomainTabView onReviewDataModels={handleReviewDataModels} />
        )}

        {activeTab === "category-library" && (
          <div className="flex-1 overflow-hidden">
            <CategoryLibraryPanel />
          </div>
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
