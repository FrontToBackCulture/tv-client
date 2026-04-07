import { useEffect } from "react";
import { Zap, Activity, Library } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { useRuns, useSchedulerEvents } from "../../hooks/scheduler";
import { AutomationsView } from "./AutomationsView";
import { ActivityView } from "./ActivityView";
import { ResourcesView } from "./ResourcesView";
import { useViewContextStore } from "../../stores/viewContextStore";

type SchedulerView = "automations" | "activity" | "resources";

export function SchedulerModule() {
  const [view, setView] = usePersistedModuleView<SchedulerView>("scheduler", "automations");

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<SchedulerView, string> = { automations: "Automations", activity: "Activity", resources: "Resources" };
    setViewContext(view, labels[view]);
  }, [view, setViewContext]);

  useSchedulerEvents();

  const { data: allRuns = [], isLoading: runsLoading } = useRuns(undefined, 200);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <PageHeader
        description="Scheduled automations — manage jobs and view activity logs."
        tabs={<>
          <ViewTab label="Automations" icon={Zap} active={view === "automations"} onClick={() => setView("automations")} />
          <ViewTab label="Activity" icon={Activity} active={view === "activity"} onClick={() => setView("activity")} />
          <ViewTab label="Resources" icon={Library} active={view === "resources"} onClick={() => setView("resources")} />
        </>}
      />

      <div className="flex-1 flex overflow-hidden">
        {view === "automations" && <AutomationsView />}
        {view === "activity" && <ActivityView runs={allRuns} isLoading={runsLoading} />}
        {view === "resources" && <ResourcesView />}
      </div>
    </div>
  );
}
