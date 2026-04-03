import { useEffect } from "react";
import { Zap, Activity, Radio } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { useRuns, useSchedulerEvents } from "../../hooks/scheduler";
import { AutomationsView } from "./AutomationsView";
import { ActivityView } from "./ActivityView";
import { ApiTaskLogs } from "./ApiTaskLogs";
import { useViewContextStore } from "../../stores/viewContextStore";
import { ApiTasksBanner } from "./ApiTasksBanner";

type SchedulerView = "automations" | "activity" | "api-logs";

export function SchedulerModule() {
  const [view, setView] = usePersistedModuleView<SchedulerView>("scheduler", "automations");

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<SchedulerView, string> = { automations: "Automations", activity: "Activity", "api-logs": "API Logs" };
    setViewContext(view, labels[view]);
  }, [view, setViewContext]);

  useSchedulerEvents();

  const { data: allRuns = [], isLoading: runsLoading } = useRuns(undefined, 200);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      <PageHeader
        description="Scheduled automations — manage jobs, view activity logs, and monitor API task execution."
        tabs={<>
          <ViewTab label="Automations" icon={Zap} active={view === "automations"} onClick={() => setView("automations")} />
          <ViewTab label="Activity" icon={Activity} active={view === "activity"} onClick={() => setView("activity")} />
          <ViewTab label="API Logs" icon={Radio} active={view === "api-logs"} onClick={() => setView("api-logs")} />
        </>}
      />

      <ApiTasksBanner />

      <div className="flex-1 flex overflow-hidden">
        {view === "automations" && <AutomationsView />}
        {view === "activity" && <ActivityView runs={allRuns} isLoading={runsLoading} />}
        {view === "api-logs" && <ApiTaskLogs />}
      </div>
    </div>
  );
}
