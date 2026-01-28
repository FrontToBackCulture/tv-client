// src/modules/product/ProductModule.tsx
// Main Product module container with sidebar, list/grid, and detail panel

import { useState, useCallback, useEffect, useRef } from "react";
import { useProductStats } from "../../hooks/useProduct";
import { useDiscoverDomains } from "../../hooks/useValSync";
import { useRepository } from "../../stores/repositoryStore";
import type { ProductView } from "../../lib/product/types";
import { ProductSidebar } from "./ProductSidebar";
import { ModuleGridView } from "./ModuleGridView";
import { ModuleDetailPanel } from "./ModuleDetailPanel";
import { ConnectorListView } from "./ConnectorListView";
import { ConnectorDetailPanel } from "./ConnectorDetailPanel";
import { FeatureListView } from "./FeatureListView";
import { FeatureDetailPanel } from "./FeatureDetailPanel";
import { SolutionCardView } from "./SolutionCardView";
import { SolutionDetailPanel } from "./SolutionDetailPanel";
import { ReleaseListView } from "./ReleaseListView";
import { ReleaseDetailPanel } from "./ReleaseDetailPanel";
import { DeploymentListView } from "./DeploymentListView";
import { DeploymentDetailPanel } from "./DeploymentDetailPanel";
import { DomainListView } from "./DomainListView";
import { DomainDetailPanel } from "./DomainDetailPanel";
import { EntityForm } from "./EntityForm";

const SIDEBAR_WIDTH_KEY = "tv-desktop-product-sidebar-width";

function getSidebarWidth(): number {
  if (typeof window === "undefined") return 240;
  const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 240;
}

function saveSidebarWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  }
}

export function ProductModule() {
  const [activeView, setActiveView] = useState<ProductView>("modules");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Sidebar resizing
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);

  useEffect(() => {
    setSidebarWidth(getSidebarWidth());
  }, []);

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
      const clamped = Math.max(180, Math.min(360, newWidth));
      setSidebarWidth(clamped);
      saveSidebarWidth(clamped);
    };
    const handleMouseUp = () => {
      if (isResizing) setIsResizing(false);
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

  // Data
  const statsQuery = useProductStats();
  const { activeRepository } = useRepository();
  const domainsPath = activeRepository
    ? `${activeRepository.path}/0_Platform/domains`
    : null;
  const domainsQuery = useDiscoverDomains(domainsPath);

  // Merge domain count into stats
  const statsWithDomains = statsQuery.data
    ? { ...statsQuery.data, domains: domainsQuery.data?.length ?? 0 }
    : null;

  // Handlers
  const handleViewChange = useCallback((view: ProductView) => {
    setActiveView(view);
    setSelectedId(null);
    setSearchQuery("");
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleNew = useCallback(async () => {
    if (activeView === "domains") {
      // Domains are auto-discovered, refresh the query
      domainsQuery.refetch();
      return;
    }
    setShowForm(true);
  }, [activeView, domainsQuery]);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
  }, []);

  const handleFormSaved = useCallback(() => {
    setShowForm(false);
    statsQuery.refetch();
  }, [statsQuery]);

  // Render view content
  const renderListView = () => {
    switch (activeView) {
      case "modules":
        return <ModuleGridView search={searchQuery} selectedId={selectedId} onSelect={handleSelect} />;
      case "connectors":
        return <ConnectorListView search={searchQuery} selectedId={selectedId} onSelect={handleSelect} />;
      case "features":
        return <FeatureListView search={searchQuery} selectedId={selectedId} onSelect={handleSelect} />;
      case "solutions":
        return <SolutionCardView search={searchQuery} selectedId={selectedId} onSelect={handleSelect} />;
      case "releases":
        return <ReleaseListView search={searchQuery} selectedId={selectedId} onSelect={handleSelect} />;
      case "deployments":
        return <DeploymentListView search={searchQuery} selectedId={selectedId} onSelect={handleSelect} />;
      case "domains":
        return <DomainListView search={searchQuery} selectedId={selectedId} onSelect={handleSelect} />;
    }
  };

  const renderDetailPanel = () => {
    if (!selectedId) return null;
    switch (activeView) {
      case "modules":
        return <ModuleDetailPanel id={selectedId} onClose={handleCloseDetail} />;
      case "connectors":
        return <ConnectorDetailPanel id={selectedId} onClose={handleCloseDetail} />;
      case "features":
        return <FeatureDetailPanel id={selectedId} onClose={handleCloseDetail} />;
      case "solutions":
        return <SolutionDetailPanel id={selectedId} onClose={handleCloseDetail} />;
      case "releases":
        return <ReleaseDetailPanel id={selectedId} onClose={handleCloseDetail} />;
      case "deployments":
        return <DeploymentDetailPanel id={selectedId} onClose={handleCloseDetail} />;
      case "domains":
        return <DomainDetailPanel id={selectedId} onClose={handleCloseDetail} />;
    }
  };

  return (
    <div className="h-full flex bg-slate-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside
        className="relative flex-shrink-0 border-r border-slate-200 dark:border-zinc-800"
        style={{
          width: sidebarWidth,
          transition: isResizing ? "none" : "width 200ms",
        }}
      >
        <ProductSidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          stats={statsWithDomains}
          onNew={handleNew}
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
      <div className="flex-1 flex overflow-hidden">
        {/* List / Grid view */}
        <div
          className={`${
            selectedId
              ? "w-1/2 border-r border-slate-200 dark:border-zinc-800"
              : "flex-1"
          } overflow-hidden flex flex-col`}
        >
          {renderListView()}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div className="w-1/2 overflow-hidden">
            {renderDetailPanel()}
          </div>
        )}
      </div>

      {/* Create/Edit form modal (not for domains view) */}
      {showForm && activeView !== "domains" && (
        <EntityForm
          entityType={activeView === "modules" ? "module" : activeView === "connectors" ? "connector" : activeView === "features" ? "feature" : activeView === "solutions" ? "solution" : activeView === "releases" ? "release" : "deployment"}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}
    </div>
  );
}
