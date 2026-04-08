// Prospecting Module — find, research, email, and track outbound prospects

import { useState, useEffect } from "react";
import { Search, ListFilter, Mailbox, BarChart3 } from "lucide-react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { useViewContextStore } from "../../stores/viewContextStore";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { ResizablePanel } from "../../components/ResizablePanel";
import { PipelineView } from "./PipelineView";
import { ProspectDetailPanel } from "./ProspectDetailPanel";
import { ProspectsView } from "../crm/ProspectsView";
import { OutreachView } from "../email/OutreachView";
import { OutreachDetailPanel } from "../email/OutreachDetailPanel";
import { OutreachAnalyticsView } from "./OutreachAnalyticsView";

type ProspectingView = "pipeline" | "search" | "outreach" | "analytics";

export function ProspectingModule() {
  const [activeView, setActiveView] = usePersistedModuleView<ProspectingView>("prospecting", "pipeline");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedOutreachId, setSelectedOutreachId] = useState<string | null>(null);

  // View context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<ProspectingView, string> = { pipeline: "Pipeline", search: "Search", outreach: "Outreach", analytics: "Analytics" };
    setViewContext(activeView, labels[activeView]);
  }, [activeView, setViewContext]);

  function handleViewChange(view: ProspectingView) {
    setActiveView(view);
    setSelectedContactId(null);
    setSelectedOutreachId(null);
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <PageHeader
        description="Find, research, and track outbound prospects — manage your pipeline, outreach, and performance."
        tabs={<>
          <ViewTab icon={ListFilter} label="Pipeline" active={activeView === "pipeline"} onClick={() => handleViewChange("pipeline")} />
          <ViewTab icon={Search} label="Search" active={activeView === "search"} onClick={() => handleViewChange("search")} />
          <ViewTab icon={Mailbox} label="Outreach" active={activeView === "outreach"} onClick={() => handleViewChange("outreach")} />
          <ViewTab icon={BarChart3} label="Analytics" active={activeView === "analytics"} onClick={() => handleViewChange("analytics")} />
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
          {activeView === "outreach" && (
            <OutreachView
              selectedId={selectedOutreachId}
              onSelect={setSelectedOutreachId}
            />
          )}
          {activeView === "analytics" && <OutreachAnalyticsView />}
        </div>

        {/* Detail panels */}
        {selectedContactId && activeView !== "outreach" && (
          <ResizablePanel storageKey="tv-prospecting-detail-width" defaultWidth={520} minWidth={380} maxWidth={800}>
            <ProspectDetailPanel
              contactId={selectedContactId}
              onClose={() => setSelectedContactId(null)}
            />
          </ResizablePanel>
        )}
        {selectedOutreachId && activeView === "outreach" && (
          <ResizablePanel storageKey="tv-prospecting-detail-width" defaultWidth={520} minWidth={380} maxWidth={800}>
            <OutreachDetailPanel
              draftId={selectedOutreachId}
              onClose={() => setSelectedOutreachId(null)}
            />
          </ResizablePanel>
        )}
      </div>
    </div>
  );
}
