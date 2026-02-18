// src/modules/product/PlatformTabView.tsx
// Platform tab: sidebar (Modules grouped by layer with nested features, Connectors) + list + resizable detail

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Search, X, Plus, ChevronRight, FileText, Play } from "lucide-react";
import { useProductModules, useProductFeatures, useProductConnectors } from "../../hooks/useProduct";
import { useRepository } from "../../stores/repositoryStore";
import { invoke } from "@tauri-apps/api/core";
import { ModuleGridView } from "./ModuleGridView";
import { ModuleDetailPanel } from "./ModuleDetailPanel";
import { FeatureListView } from "./FeatureListView";
import { FeatureDetailPanel } from "./FeatureDetailPanel";
import { ConnectorListView } from "./ConnectorListView";
import { ConnectorDetailPanel } from "./ConnectorDetailPanel";
import type { ModuleLayer, ProductEntityType } from "../../lib/product/types";

type EntityType = "modules" | "features" | "connectors";

const LAYER_ORDER: ModuleLayer[] = ["connectivity", "application", "experience"];

const LAYER_LABELS: Record<ModuleLayer, string> = {
  connectivity: "Connectivity Layer",
  application: "Application Layer",
  experience: "Experience Layer",
};

interface PlatformTabViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNew: (entityType: ProductEntityType) => void;
  detailPanelWidth: number;
  isResizingDetail: boolean;
  onDetailMouseDown: (e: React.MouseEvent) => void;
}

export function PlatformTabView({
  selectedId,
  onSelect,
  onNew,
  detailPanelWidth,
  isResizingDetail,
  onDetailMouseDown,
}: PlatformTabViewProps) {
  const [activeType, setActiveType] = useState<EntityType>("modules");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Fetch data
  const { data: modules = [] } = useProductModules();
  const { data: features = [] } = useProductFeatures();
  const { data: connectors = [] } = useProductConnectors();
  const { activeRepository } = useRepository();

  // ── Sidebar resize (pixel-based, persisted) ───────────────
  const SIDEBAR_WIDTH_KEY = "tv-desktop-product-sidebar-width";
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(SIDEBAR_WIDTH_KEY) : null;
    return stored ? parseInt(stored, 10) : 220;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarStartXRef = useRef(0);
  const sidebarStartWidthRef = useRef(220);

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingSidebar(true);
    sidebarStartXRef.current = e.clientX;
    sidebarStartWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - sidebarStartXRef.current;
      const newWidth = Math.max(160, Math.min(400, sidebarStartWidthRef.current + delta));
      setSidebarWidth(newWidth);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(newWidth));
    };
    const handleMouseUp = () => setIsResizingSidebar(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingSidebar]);

  // ── Doc/Demo indicators ───────────────────────────────────
  // Check which feature folders actually have guide.md and/or demo.json on disk
  const [featuresWithDocs, setFeaturesWithDocs] = useState<Set<string>>(new Set());
  const [featuresWithDemo, setFeaturesWithDemo] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeRepository?.path || features.length === 0) return;
    const repoPath = activeRepository.path;

    const checkFeatures = async () => {
      const docsSet = new Set<string>();
      const demoSet = new Set<string>();

      const checks = features
        .filter((f) => f.doc_path)
        .map(async (f) => {
          const fullPath = `${repoPath}/${f.doc_path}`;
          const folder = fullPath.substring(0, fullPath.lastIndexOf("/"));
          try {
            const entries = await invoke<{ name: string }[]>("list_directory", { path: folder });
            if (entries.some((e) => e.name === "guide.md")) docsSet.add(f.id);
            if (entries.some((e) => e.name === "demo.json")) demoSet.add(f.id);
          } catch {
            // Folder doesn't exist on disk — skip
          }
        });

      await Promise.all(checks);
      setFeaturesWithDocs(docsSet);
      setFeaturesWithDemo(demoSet);
    };

    checkFeatures();
  }, [features, activeRepository?.path]);

  const searchLower = search.toLowerCase();

  // Group modules by layer
  const modulesByLayer = useMemo(() => {
    const map = new Map<ModuleLayer, typeof modules>();
    for (const layer of LAYER_ORDER) {
      map.set(layer, modules.filter((m) => m.layer === layer));
    }
    return map;
  }, [modules]);

  // Group features by module_id
  const featuresByModule = useMemo(() => {
    const map = new Map<string, typeof features>();
    for (const f of features) {
      if (!f.module_id) continue;
      const list = map.get(f.module_id);
      if (list) list.push(f);
      else map.set(f.module_id, [f]);
    }
    return map;
  }, [features]);

  // Toggle collapse state
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isExpanded = useCallback((key: string) => !collapsed.has(key), [collapsed]);

  // Determine "new" button context
  const newButtonType = useMemo((): ProductEntityType => {
    if (activeType === "connectors") return "connector";
    return "module";
  }, [activeType]);

  const newButtonLabel = newButtonType === "connector" ? "New Connector" : "New Module";

  // ── Selection handlers ──────────────────────────────────────
  const handleSelectModule = (id: string) => {
    setActiveType("modules");
    onSelect(id);
  };

  const handleSelectFeature = (id: string) => {
    setActiveType("features");
    onSelect(id);
  };

  const handleSelectConnector = (id: string) => {
    setActiveType("connectors");
    onSelect(id);
  };

  // ── Search filtering ────────────────────────────────────────
  // When searching, compute which modules/features/connectors match
  const { filteredModuleIds, filteredFeatureIds, matchingLayers } = useMemo(() => {
    if (!search) {
      return {
        filteredModuleIds: null,
        filteredFeatureIds: null,
        filteredConnectorIds: null,
        matchingLayers: null,
      };
    }

    const mIds = new Set<string>();
    const fIds = new Set<string>();
    const layers = new Set<ModuleLayer>();

    // Match modules by name
    for (const m of modules) {
      if (m.name.toLowerCase().includes(searchLower)) {
        mIds.add(m.id);
        if (m.layer) layers.add(m.layer as ModuleLayer);
      }
    }

    // Match features by name, also include their parent module
    for (const f of features) {
      if (f.name.toLowerCase().includes(searchLower)) {
        fIds.add(f.id);
        if (f.module_id) {
          mIds.add(f.module_id);
          const parentModule = modules.find((m) => m.id === f.module_id);
          if (parentModule?.layer) layers.add(parentModule.layer as ModuleLayer);
        }
      }
    }

    return {
      filteredModuleIds: mIds,
      filteredFeatureIds: fIds,
      matchingLayers: layers,
    };
  }, [search, searchLower, modules, features, connectors]);

  // Check if a module is visible (either no search, or it matches)
  const isModuleVisible = (id: string) => !filteredModuleIds || filteredModuleIds.has(id);

  // Check if a feature is visible
  const isFeatureVisible = (id: string) => !filteredFeatureIds || filteredFeatureIds.has(id);

  // Check if a layer has any visible modules
  const isLayerVisible = (layer: ModuleLayer) => !matchingLayers || matchingLayers.has(layer);

  // ── Render list view ────────────────────────────────────────
  const renderListView = () => {
    const props = { search, selectedId, onSelect: (id: string) => onSelect(id) };
    switch (activeType) {
      case "modules":
        return <ModuleGridView {...props} />;
      case "features":
        return <FeatureListView {...props} />;
      case "connectors":
        return <ConnectorListView {...props} />;
    }
  };

  // ── Render detail panel ─────────────────────────────────────
  const renderDetail = () => {
    if (!selectedId) return null;
    const close = () => onSelect(null);
    switch (activeType) {
      case "modules":
        return <ModuleDetailPanel id={selectedId} onClose={close} />;
      case "features":
        return <FeatureDetailPanel id={selectedId} onClose={close} />;
      case "connectors":
        return <ConnectorDetailPanel id={selectedId} onClose={close} />;
    }
  };

  // ── Sidebar: Modules section ────────────────────────────────
  const renderModulesSection = () => {
    const totalCount = modules.length;
    const modulesExpanded = isExpanded("modules");

    // When searching, hide entire section if no matches
    if (search && filteredModuleIds && filteredModuleIds.size === 0 && filteredFeatureIds && filteredFeatureIds.size === 0) {
      return null;
    }

    return (
      <div className="mb-2">
        {/* MODULES header */}
        <button
          onClick={() => toggle("modules")}
          className="w-full text-left px-2.5 mb-0.5 flex items-center gap-1"
        >
          <ChevronRight
            size={10}
            className={`text-zinc-400 transition-transform flex-shrink-0 ${modulesExpanded ? "rotate-90" : ""}`}
          />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Modules
          </span>
          <span className="text-[9px] text-zinc-300 dark:text-zinc-600 ml-auto tabular-nums">
            {totalCount}
          </span>
        </button>

        {modulesExpanded && (
          <div>
            {LAYER_ORDER.map((layer) => {
              if (!isLayerVisible(layer)) return null;
              const layerModules = modulesByLayer.get(layer) || [];
              if (layerModules.length === 0) return null;

              const layerKey = `layer:${layer}`;
              const layerExpanded = search ? true : isExpanded(layerKey);

              return (
                <div key={layer} className="mb-0.5">
                  {/* Layer header */}
                  <button
                    onClick={() => toggle(layerKey)}
                    className="w-full text-left pl-4 pr-2.5 py-0.5 flex items-center gap-1"
                  >
                    <ChevronRight
                      size={9}
                      className={`text-zinc-400 transition-transform flex-shrink-0 ${layerExpanded ? "rotate-90" : ""}`}
                    />
                    <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500">
                      {LAYER_LABELS[layer]}
                    </span>
                  </button>

                  {layerExpanded && (
                    <div>
                      {layerModules.map((mod) => {
                        if (!isModuleVisible(mod.id)) return null;

                        const modFeatures = featuresByModule.get(mod.id) || [];
                        const visibleFeatures = search
                          ? modFeatures.filter((f) => isFeatureVisible(f.id))
                          : modFeatures;
                        const featureCount = modFeatures.length;
                        const moduleExpanded = search ? true : isExpanded(mod.id);
                        const isSelected = selectedId === mod.id && activeType === "modules";

                        return (
                          <div key={mod.id}>
                            {/* Module row */}
                            <button
                              onClick={() => handleSelectModule(mod.id)}
                              className={`w-full text-left flex items-center gap-1.5 px-2.5 pl-6 py-1 rounded-md text-xs transition-colors ${
                                isSelected
                                  ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                              }`}
                            >
                              {featureCount > 0 && (
                                <ChevronRight
                                  size={9}
                                  className={`text-zinc-400 transition-transform flex-shrink-0 ${moduleExpanded ? "rotate-90" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggle(mod.id);
                                  }}
                                />
                              )}
                              <span className="truncate">{mod.name}</span>
                              {featureCount > 0 && (
                                <span className="text-[9px] text-zinc-300 dark:text-zinc-600 ml-auto tabular-nums flex-shrink-0">
                                  {featureCount}
                                </span>
                              )}
                            </button>

                            {/* Nested features */}
                            {moduleExpanded && visibleFeatures.length > 0 && (
                              <div>
                                {visibleFeatures.map((feat) => {
                                  const isFeatSelected = selectedId === feat.id && activeType === "features";
                                  return (
                                    <button
                                      key={feat.id}
                                      onClick={() => handleSelectFeature(feat.id)}
                                      className={`w-full text-left pl-10 pr-2.5 py-0.5 text-[11px] transition-colors rounded-md ${
                                        isFeatSelected
                                          ? "text-teal-600 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20"
                                          : "text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-zinc-300 dark:text-zinc-600 flex-shrink-0">·</span>
                                        <span className="truncate">{feat.name}</span>
                                        {featuresWithDemo.has(feat.id) && (
                                          <span title="Has demo">
                                            <Play size={9} className="flex-shrink-0 text-teal-400/60" />
                                          </span>
                                        )}
                                        {featuresWithDocs.has(feat.id) && (
                                          <span title="Has documentation">
                                            <FileText size={9} className="flex-shrink-0 text-teal-400/60" />
                                          </span>
                                        )}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Sidebar: Connectors section ─────────────────────────────
  const renderConnectorsSection = () => {
    const filteredConnectors = search
      ? connectors.filter((c) => c.name.toLowerCase().includes(searchLower))
      : connectors;

    if (search && filteredConnectors.length === 0) return null;

    const connectorsExpanded = isExpanded("connectors");

    return (
      <div className="mb-2">
        {/* CONNECTORS header */}
        <button
          onClick={() => toggle("connectors")}
          className="w-full text-left px-2.5 mb-0.5 flex items-center gap-1"
        >
          <ChevronRight
            size={10}
            className={`text-zinc-400 transition-transform flex-shrink-0 ${connectorsExpanded ? "rotate-90" : ""}`}
          />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Connectors
          </span>
          <span className="text-[9px] text-zinc-300 dark:text-zinc-600 ml-auto tabular-nums">
            {connectors.length}
          </span>
        </button>

        {connectorsExpanded && (
          <div>
            {filteredConnectors.map((conn) => {
              const isSelected = selectedId === conn.id && activeType === "connectors";
              return (
                <button
                  key={conn.id}
                  onClick={() => handleSelectConnector(conn.id)}
                  className={`w-full text-left flex items-center gap-2 px-2.5 pl-5 py-1 rounded-md text-xs transition-colors ${
                    isSelected
                      ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <span className="truncate">{conn.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-1 min-w-0">
      {/* Sidebar */}
      <div
        className="flex-shrink-0 h-full border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex flex-col relative"
        style={{ width: sidebarWidth, transition: isResizingSidebar ? "none" : "width 200ms" }}
      >
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

        {/* Collapsible sections */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {renderModulesSection()}
          {renderConnectorsSection()}
        </div>

        {/* New button */}
        <div className="px-2 py-2 border-t border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => onNew(newButtonType)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-md text-xs font-medium transition-colors"
          >
            <Plus size={14} />
            {newButtonLabel}
          </button>
        </div>

        {/* Sidebar resize handle */}
        <div
          onMouseDown={handleSidebarMouseDown}
          className="absolute top-0 -right-1.5 w-3 h-full cursor-col-resize group z-50"
        >
          <div className={`absolute left-1 w-0.5 h-full transition-all ${
            isResizingSidebar ? "bg-teal-500 w-1" : "bg-transparent group-hover:bg-teal-500/60"
          }`} />
        </div>
      </div>

      {/* Main list view — hidden when a feature is selected (detail panel takes full width) */}
      {!(activeType === "features" && selectedId) && (
        <div
          className="overflow-hidden flex flex-col"
          style={{
            flex: selectedId ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto",
            transition: isResizingDetail ? "none" : "flex 200ms",
          }}
        >
          {renderListView()}
        </div>
      )}

      {/* Detail panel — full width for features, resizable for modules/connectors */}
      {selectedId && (
        <div
          className="relative overflow-hidden border-l border-slate-200 dark:border-zinc-800 min-w-0"
          style={{
            flex: activeType === "features" ? "1 1 auto" : `0 0 ${detailPanelWidth}%`,
            transition: isResizingDetail ? "none" : "flex 200ms",
          }}
        >
          {/* Resize handle — only for non-feature views */}
          {activeType !== "features" && (
            <div onMouseDown={onDetailMouseDown} className="absolute top-0 -left-1 w-3 h-full cursor-col-resize group z-50">
              <div className={`absolute right-1 w-0.5 h-full transition-all ${isResizingDetail ? "bg-teal-500 w-1" : "bg-transparent group-hover:bg-teal-500/60"}`} />
            </div>
          )}
          {renderDetail()}
        </div>
      )}
    </div>
  );
}
