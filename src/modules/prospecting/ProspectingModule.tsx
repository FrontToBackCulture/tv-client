// Prospecting Module — find, research, email, and track prospects

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, ListFilter } from "lucide-react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { useViewContextStore } from "../../stores/viewContextStore";
import { ViewTab } from "../../components/ViewTab";
import { PipelineView } from "./PipelineView";
import { ProspectDetailPanel } from "./ProspectDetailPanel";
import { ProspectsView } from "../crm/ProspectsView";

type ProspectingView = "pipeline" | "search";

const DETAIL_WIDTH_KEY = "tv-desktop-prospecting-detail-width";

function getDetailWidth(): number {
  const stored = localStorage.getItem(DETAIL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 50;
}

export function ProspectingModule() {
  const [activeView, setActiveView] = usePersistedModuleView<ProspectingView>("prospecting", "pipeline");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // View context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<ProspectingView, string> = { pipeline: "Pipeline", search: "Search" };
    setViewContext(activeView, labels[activeView]);
  }, [activeView, setViewContext]);

  // Detail panel resize
  const [detailWidth, setDetailWidthState] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(50);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDetailWidthState(getDetailWidth()); }, []);

  const handleResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = detailWidth;
  };

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const delta = (e.clientX - startXRef.current) / containerRef.current.offsetWidth * 100;
      const w = Math.max(25, Math.min(75, startWidthRef.current - delta));
      setDetailWidthState(w);
      localStorage.setItem(DETAIL_WIDTH_KEY, String(w));
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const handleViewChange = useCallback((view: ProspectingView) => {
    setActiveView(view);
    setSelectedContactId(null);
  }, []);

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <ViewTab icon={ListFilter} label="Pipeline" active={activeView === "pipeline"} onClick={() => handleViewChange("pipeline")} />
        <ViewTab icon={Search} label="Search" active={activeView === "search"} onClick={() => handleViewChange("search")} />
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {activeView === "pipeline" && (
            <PipelineView
              selectedId={selectedContactId}
              onSelect={setSelectedContactId}
            />
          )}
          {activeView === "search" && <ProspectsView />}
        </div>

        {/* Detail panel */}
        {selectedContactId && (
          <>
            <div
              onMouseDown={handleResizeDown}
              className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors"
            />
            <div
              className="overflow-hidden border-l border-zinc-200 dark:border-zinc-800"
              style={{ flex: `0 0 ${detailWidth}%`, transition: isResizing ? "none" : "flex 200ms" }}
            >
              <ProspectDetailPanel
                contactId={selectedContactId}
                onClose={() => setSelectedContactId(null)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
