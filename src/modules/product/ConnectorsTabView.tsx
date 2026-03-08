// src/modules/product/ConnectorsTabView.tsx
// Connectors tab — sidebar list + detail panel + GitHub sync controls

import { useState, useCallback, useEffect, useRef } from "react";
import { Search, X, Plus, ChevronRight, GitBranch } from "lucide-react";
import { useProductConnectors } from "../../hooks/product";
import { ConnectorDetailPanel } from "./ConnectorDetailPanel";
import { GitHubSyncPanel } from "./GitHubSyncPanel";
import type { ProductEntityType } from "../../lib/product/types";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";

type SidebarSection = "list" | "sync";

interface ConnectorsTabViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNew: (entityType: ProductEntityType) => void;
  detailPanelWidth: number;
  isResizingDetail: boolean;
  onDetailMouseDown: (e: React.MouseEvent) => void;
}

// ── Sidebar resize persistence ──────────────────────────
const SIDEBAR_WIDTH_KEY = "tv-desktop-connectors-sidebar-width";

export function ConnectorsTabView({
  selectedId,
  onSelect,
  onNew,
}: ConnectorsTabViewProps) {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<SidebarSection>("list");
  const [connectorsExpanded, setConnectorsExpanded] = useState(true);
  const { data: connectors = [] } = useProductConnectors();

  // ── Sidebar resize ───────────────────────────────────
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

  // ── Search filtering ─────────────────────────────────
  const searchLower = search.toLowerCase();
  const filteredConnectors = search
    ? connectors.filter((c) => c.name.toLowerCase().includes(searchLower))
    : connectors;

  const handleSelectConnector = useCallback((id: string) => {
    setActiveSection("list");
    onSelect(id);
  }, [onSelect]);

  return (
    <div className="flex h-full flex-1 min-w-0">
      {/* Sidebar */}
      <div
        className="flex-shrink-0 h-full border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col relative"
        style={{ width: sidebarWidth, transition: isResizingSidebar ? "none" : "width 200ms" }}
      >
        {/* Top bar: GitHub Sync action + Search */}
        <div className="p-2.5 pb-1.5 space-y-1.5">
          <button
            onClick={() => { setActiveSection("sync"); onSelect(null); }}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              activeSection === "sync"
                ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
            )}
          >
            <GitBranch size={14} />
            GitHub Sync
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search connectors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:border-teal-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {/* Connectors list */}
          <div className="mb-2">
            <button
              onClick={() => { setActiveSection("list"); setConnectorsExpanded((v) => !v); }}
              className="w-full text-left px-2.5 mb-0.5 flex items-center gap-1"
            >
              <ChevronRight
                size={10}
                className={cn(
                  "text-zinc-400 transition-transform flex-shrink-0",
                  connectorsExpanded && "rotate-90"
                )}
              />
              <span className={cn(
                "text-xs font-medium uppercase tracking-wider",
                activeSection === "list" ? "text-teal-600 dark:text-teal-400" : "text-zinc-400 dark:text-zinc-500"
              )}>
                Connectors
              </span>
              <span className="text-xs text-zinc-300 dark:text-zinc-600 ml-auto tabular-nums">
                {connectors.length}
              </span>
            </button>

            {connectorsExpanded && (
              <div>
                {filteredConnectors.map((conn) => {
                  const isSelected = selectedId === conn.id && activeSection === "list";
                  return (
                    <button
                      key={conn.id}
                      onClick={() => handleSelectConnector(conn.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-2 px-2.5 pl-5 py-1.5 rounded-md text-xs transition-colors",
                        isSelected
                          ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                      )}
                    >
                      <span className="truncate">{conn.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* New connector button */}
        <div className="px-2 py-2 border-t border-zinc-200 dark:border-zinc-800">
          <Button
            onClick={() => onNew("connector")}
            icon={Plus}
            className="w-full justify-center"
          >
            New Connector
          </Button>
        </div>

        {/* Sidebar resize handle */}
        <div
          onMouseDown={handleSidebarMouseDown}
          className="absolute top-0 -right-1.5 w-3 h-full cursor-col-resize group z-50"
        >
          <div className={cn(
            "absolute left-1 w-0.5 h-full transition-all",
            isResizingSidebar ? "bg-teal-500 w-1" : "bg-transparent group-hover:bg-teal-500/60"
          )} />
        </div>
      </div>

      {/* Main content */}
      {activeSection === "sync" ? (
        <div className="flex-1 overflow-auto">
          <GitHubSyncPanel />
        </div>
      ) : selectedId ? (
        <div className="flex-1 overflow-hidden min-w-0">
          <ConnectorDetailPanel id={selectedId} onClose={() => onSelect(null)} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
          Select a connector from the sidebar
        </div>
      )}
    </div>
  );
}
