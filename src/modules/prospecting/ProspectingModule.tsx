// Prospecting Module — find, research, email, and track prospects

import { useState, useEffect } from "react";
import { Search, ListFilter } from "lucide-react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { useViewContextStore } from "../../stores/viewContextStore";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { ResizablePanel } from "../../components/ResizablePanel";
import { PipelineView } from "./PipelineView";
import { ProspectDetailPanel } from "./ProspectDetailPanel";
import { ProspectsView } from "../crm/ProspectsView";

type ProspectingView = "pipeline" | "search";

export function ProspectingModule() {
  const [activeView, setActiveView] = usePersistedModuleView<ProspectingView>("prospecting", "pipeline");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // View context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<ProspectingView, string> = { pipeline: "Pipeline", search: "Search" };
    setViewContext(activeView, labels[activeView]);
  }, [activeView, setViewContext]);

  function handleViewChange(view: ProspectingView) {
    setActiveView(view);
    setSelectedContactId(null);
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <PageHeader
        description="Find, research, and track outbound prospects — manage your pipeline and search for new contacts."
        tabs={<>
          <ViewTab icon={ListFilter} label="Pipeline" active={activeView === "pipeline"} onClick={() => handleViewChange("pipeline")} />
          <ViewTab icon={Search} label="Search" active={activeView === "search"} onClick={() => handleViewChange("search")} />
        </>}
      />

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
          <ResizablePanel storageKey="tv-prospecting-detail-width" defaultWidth={520} minWidth={380} maxWidth={800}>
            <ProspectDetailPanel
              contactId={selectedContactId}
              onClose={() => setSelectedContactId(null)}
            />
          </ResizablePanel>
        )}
      </div>
    </div>
  );
}
