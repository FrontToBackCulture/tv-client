// src/modules/product/ProductModule.tsx
// Product module — catalog/reference: Platform, Solutions, Connectors, Categories

import { useState, useCallback, useEffect, useRef } from "react";
import { Boxes, Package, Tags, Plug, Layers } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useProductStats } from "../../hooks/product";
import { useRepository } from "../../stores/repositoryStore";
import type { ProductEntityType } from "../../lib/product/types";
import { PlatformTabView } from "./PlatformTabView";
import { SolutionsTabView } from "./SolutionsTabView";
import { CategoryLibraryPanel } from "./CategoryLibraryPanel";
import { EntityForm } from "./EntityForm";
import { ConnectorsTabView } from "./ConnectorsTabView";
import { DataModelTabView } from "./DataModelTabView";

type ProductTab = "platform" | "solutions" | "data-model" | "connectors" | "category-library";

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
  useEffect(() => {
    const labels: Record<ProductTab, string> = {
      platform: "Platform",
      solutions: "Solutions",
      "data-model": "Data Model",
      connectors: "Connectors",
      "category-library": "Categories",
    };
    setViewContext(activeTab, labels[activeTab]);
  }, [activeTab, setViewContext]);

  // Detail panel resize (percentage-based, CRM pattern)
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

  // Data for stats
  const statsQuery = useProductStats();
  const { activeRepository } = useRepository();

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

  // Selection
  const handleSelect = useCallback((id: string | null) => setSelectedId(id), []);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Platform" icon={Boxes} active={activeTab === "platform"} onClick={() => handleTabChange("platform")} data-help-id="product-tab-platform" />
        <ViewTab label="Solutions" icon={Package} active={activeTab === "solutions"} onClick={() => handleTabChange("solutions")} data-help-id="product-tab-solutions" />
        <ViewTab label="Data Model" icon={Layers} active={activeTab === "data-model"} onClick={() => handleTabChange("data-model")} data-help-id="product-tab-data-model" />
        <ViewTab label="Connectors" icon={Plug} active={activeTab === "connectors"} onClick={() => handleTabChange("connectors")} data-help-id="product-tab-connectors" />
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

        {activeTab === "data-model" && <DataModelTabView />}

        {activeTab === "connectors" && (
          <ConnectorsTabView
            selectedId={selectedId}
            onSelect={handleSelect}
            onNew={handleNew}
            detailPanelWidth={detailPanelWidth}
            isResizingDetail={isResizingDetail}
            onDetailMouseDown={handleDetailMouseDown}
          />
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
