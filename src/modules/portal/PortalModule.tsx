// src/modules/portal/PortalModule.tsx

import { useState, useRef, useEffect } from "react";
import { MessageSquare, AlertTriangle, Megaphone, BookOpen } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { useViewContextStore } from "../../stores/viewContextStore";
import { usePortalRealtime } from "../../hooks/portal";
import { ConversationsView } from "./ConversationsView";
import { AnnouncementsView } from "./AnnouncementsView";
import { HelpCenterView } from "./HelpCenterView";
import type { PortalView } from "../../lib/portal/types";

const DETAIL_WIDTH_KEY = "tv-desktop-portal-detail-width";

function getStoredDetailWidth(): number {
  const stored = localStorage.getItem(DETAIL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 50;
}

export function PortalModule() {
  const [activeView, setActiveView] = useState<PortalView>("conversations");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailWidth, setDetailWidth] = useState(getStoredDetailWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(50);

  // Realtime subscriptions
  usePortalRealtime();

  // View context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<PortalView, string> = {
      conversations: "Conversations",
      incidents: "Incidents",
      announcements: "Announcements",
      help: "Help Center",
    };
    setViewContext(activeView, labels[activeView]);
  }, [activeView, setViewContext]);

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = detailWidth;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const dx = startXRef.current - e.clientX;
      const dPct = (dx / containerWidth) * 100;
      const newWidth = Math.max(30, Math.min(70, startWidthRef.current + dPct));
      setDetailWidth(newWidth);
    };

    const handleUp = () => {
      setIsResizing(false);
      localStorage.setItem(DETAIL_WIDTH_KEY, String(Math.round(detailWidth)));
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, detailWidth]);

  // Clear selection when switching views
  useEffect(() => {
    setSelectedId(null);
  }, [activeView]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-200 dark:border-zinc-800 px-2">
        <ViewTab
          icon={MessageSquare}
          label="Conversations"
          active={activeView === "conversations"}
          onClick={() => setActiveView("conversations")}
        />
        <ViewTab
          icon={Megaphone}
          label="Announcements"
          active={activeView === "announcements"}
          onClick={() => setActiveView("announcements")}
        />
        <ViewTab
          icon={AlertTriangle}
          label="Incidents"
          active={activeView === "incidents"}
          onClick={() => setActiveView("incidents")}
        />
        <ViewTab
          icon={BookOpen}
          label="Help Center"
          active={activeView === "help"}
          onClick={() => setActiveView("help")}
        />
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {activeView === "conversations" && (
          <ConversationsView
            selectedId={selectedId}
            onSelect={setSelectedId}
            detailWidth={detailWidth}
            onResizeStart={handleResizeStart}
          />
        )}

        {activeView === "incidents" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle size={40} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm text-zinc-500">Incidents — coming in Phase 3</p>
            </div>
          </div>
        )}

        {activeView === "announcements" && (
          <AnnouncementsView
            selectedId={selectedId}
            onSelect={setSelectedId}
            detailWidth={detailWidth}
            onResizeStart={handleResizeStart}
          />
        )}

        {activeView === "help" && (
          <HelpCenterView
            selectedId={selectedId}
            onSelect={setSelectedId}
            detailWidth={detailWidth}
            onResizeStart={handleResizeStart}
          />
        )}

      </div>
    </div>
  );
}
