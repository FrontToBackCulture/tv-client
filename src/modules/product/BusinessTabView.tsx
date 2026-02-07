// src/modules/product/BusinessTabView.tsx
// Business tab: sidebar (Solutions / Releases / Deployments) + list + resizable detail

import { useState, useMemo } from "react";
import { Search, X, Plus, Package, Rocket, Globe } from "lucide-react";
import { useProductSolutions, useProductReleases, useProductDeployments } from "../../hooks/useProduct";
import { SolutionCardView } from "./SolutionCardView";
import { SolutionDetailPanel } from "./SolutionDetailPanel";
import { ReleaseListView } from "./ReleaseListView";
import { ReleaseDetailPanel } from "./ReleaseDetailPanel";
import { DeploymentListView } from "./DeploymentListView";
import { DeploymentDetailPanel } from "./DeploymentDetailPanel";
import type { ProductEntityType } from "../../lib/product/types";

type EntityType = "solutions" | "releases" | "deployments";

const ENTITY_META: Record<EntityType, { label: string; singular: ProductEntityType; icon: typeof Package }> = {
  solutions: { label: "Solutions", singular: "solution", icon: Package },
  releases: { label: "Releases", singular: "release", icon: Rocket },
  deployments: { label: "Deployments", singular: "deployment", icon: Globe },
};

const GROUP_ORDER: EntityType[] = ["solutions", "releases", "deployments"];

interface BusinessTabViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNew: (entityType: ProductEntityType) => void;
  detailPanelWidth: number;
  isResizingDetail: boolean;
  onDetailMouseDown: (e: React.MouseEvent) => void;
}

export function BusinessTabView({
  selectedId,
  onSelect,
  onNew,
  detailPanelWidth,
  isResizingDetail,
  onDetailMouseDown,
}: BusinessTabViewProps) {
  const [activeType, setActiveType] = useState<EntityType>("solutions");
  const [search, setSearch] = useState("");

  // Fetch data for sidebar
  const { data: solutions = [] } = useProductSolutions();
  const { data: releases = [] } = useProductReleases();
  const { data: deployments = [] } = useProductDeployments();

  const dataMap = useMemo(
    () => ({
      solutions: solutions.map((s) => ({ id: s.id, name: s.name })),
      releases: releases.map((r) => ({ id: r.id, name: r.name ? `v${r.version} — ${r.name}` : `v${r.version}` })),
      deployments: deployments.map((d) => ({ id: d.id, name: d.domain_id || d.description || d.id.slice(0, 8) })),
    }),
    [solutions, releases, deployments],
  );

  const handleSidebarSelect = (type: EntityType, id: string) => {
    setActiveType(type);
    onSelect(id);
  };

  // Render list view
  const renderListView = () => {
    const props = { search, selectedId, onSelect: (id: string) => onSelect(id) };
    switch (activeType) {
      case "solutions":
        return <SolutionCardView {...props} />;
      case "releases":
        return <ReleaseListView {...props} />;
      case "deployments":
        return <DeploymentListView {...props} />;
    }
  };

  // Render detail panel
  const renderDetail = () => {
    if (!selectedId) return null;
    const close = () => onSelect(null);
    switch (activeType) {
      case "solutions":
        return <SolutionDetailPanel id={selectedId} onClose={close} />;
      case "releases":
        return <ReleaseDetailPanel id={selectedId} onClose={close} />;
      case "deployments":
        return <DeploymentDetailPanel id={selectedId} onClose={close} />;
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-[220px] flex-shrink-0 h-full border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex flex-col">
        {/* Search */}
        <div className="p-2.5 pb-1.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Grouped items */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {GROUP_ORDER.map((type) => {
            const meta = ENTITY_META[type];
            const items = search
              ? dataMap[type].filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
              : dataMap[type];
            if (search && items.length === 0) return null;

            return (
              <div key={type} className="mb-2">
                <button
                  onClick={() => { setActiveType(type); onSelect(null); }}
                  className="w-full text-left"
                >
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-2.5 mb-0.5 flex items-center gap-1.5">
                    <meta.icon size={10} />
                    {meta.label}
                    <span className="text-zinc-300 dark:text-zinc-600 ml-auto tabular-nums">{items.length}</span>
                  </p>
                </button>
                <div>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSidebarSelect(type, item.id)}
                      className={`w-full text-left flex items-center gap-2 px-2.5 py-1 rounded-md text-xs transition-colors ${
                        selectedId === item.id && activeType === type
                          ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* New button */}
        <div className="px-2 py-2 border-t border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => onNew(ENTITY_META[activeType].singular)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-md text-xs font-medium transition-colors"
          >
            <Plus size={14} />
            New {ENTITY_META[activeType].label.replace(/s$/, "")}
          </button>
        </div>
      </div>

      {/* Main list view */}
      <div
        className="overflow-hidden flex flex-col"
        style={{
          flex: selectedId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto",
          transition: isResizingDetail ? "none" : "flex 200ms",
        }}
      >
        {renderListView()}
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div
          className="relative overflow-hidden border-l border-slate-200 dark:border-zinc-800"
          style={{
            flex: `0 0 ${detailPanelWidth}%`,
            transition: isResizingDetail ? "none" : "flex 200ms",
          }}
        >
          {/* Resize handle */}
          <div onMouseDown={onDetailMouseDown} className="absolute top-0 -left-1 w-3 h-full cursor-col-resize group z-50">
            <div className={`absolute right-1 w-0.5 h-full transition-all ${isResizingDetail ? "bg-teal-500 w-1" : "bg-transparent group-hover:bg-teal-500/60"}`} />
          </div>
          {renderDetail()}
        </div>
      )}
    </div>
  );
}
