import { useEffect } from "react";
import { Zap, Activity, Radio, LucideIcon } from "lucide-react";
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
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Automations" icon={Zap} active={view === "automations"} onClick={() => setView("automations")} />
        <ViewTab label="Activity" icon={Activity} active={view === "activity"} onClick={() => setView("activity")} />
        <ViewTab label="API Logs" icon={Radio} active={view === "api-logs"} onClick={() => setView("api-logs")} />
      </div>

      <ApiTasksBanner />

      <div className="flex-1 flex overflow-hidden">
        {view === "automations" && <AutomationsView />}
        {view === "activity" && <ActivityView runs={allRuns} isLoading={runsLoading} />}
        {view === "api-logs" && <ApiTaskLogs />}
      </div>
    </div>
  );
}

function ViewTab({ label, icon: Icon, active, onClick }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-teal-500 text-teal-600 dark:text-teal-400"
          : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
