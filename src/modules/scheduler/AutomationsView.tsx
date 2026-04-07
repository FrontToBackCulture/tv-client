// Automations tab — visual node canvas for automations

import { useState, useCallback, useMemo } from "react";
import {
  useAutomations,
  useAutomationNodes,
  useAutomationEdges,
  useCreateAutomation,
  useRunningJobsStore,
  useRuns,
} from "../../hooks/scheduler";
import { AutomationList } from "./canvas/AutomationList";
import { AutomationCanvas } from "./canvas/AutomationCanvas";
import { AutomationCanvasHeader } from "./canvas/AutomationCanvasHeader";
import { NodeConfigPanel } from "./canvas/NodeConfigPanel";
import { EmptyCanvasState } from "./canvas/EmptyCanvasState";
import { RunHistoryPanel } from "./RunHistoryPanel";
import type { AutomationGraph, AutomationNodeRow } from "./canvas/types";

export function AutomationsView() {
  const { data: automations = [], isLoading } = useAutomations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<AutomationNodeRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);

  const { data: nodes = [] } = useAutomationNodes(selectedId);
  const { data: edges = [] } = useAutomationEdges(selectedId);

  // Fetch all recent runs (for sidebar trend dots) + selected automation runs
  const { data: allRuns = [] } = useRuns(undefined, 100);
  const selectedRuns = useMemo(
    () => (selectedId ? allRuns.filter((r) => r.automation_id === selectedId || r.job_id === selectedId) : []),
    [allRuns, selectedId],
  );

  const selectedAutomation: AutomationGraph | null = (() => {
    const auto = automations.find((a) => a.id === selectedId);
    if (!auto) return null;
    return { ...auto, nodes, edges };
  })();

  const runningJobs = useRunningJobsStore((s) => s.runningJobs);
  const isRunning = selectedAutomation
    ? !!runningJobs[selectedAutomation.id] || selectedAutomation.last_run_status === "running"
    : false;

  const createAutomation = useCreateAutomation();

  const handleNew = useCallback(async () => {
    try {
      const autoId = await createAutomation.mutateAsync({
        name: "New Automation",
      });
      setSelectedId(autoId);
    } catch (e) {
      console.error("Failed to create automation:", e);
    }
  }, [createAutomation]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedNode(null);
  }, []);

  return (
    <div className="flex-1 flex overflow-hidden">
      <AutomationList
        automations={automations}
        allRuns={allRuns}
        isLoading={isLoading}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={handleNew}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedAutomation ? (
          <>
            <AutomationCanvasHeader
              automation={selectedAutomation}
              latestRun={selectedRuns[0]}
              onDeleted={() => { setSelectedId(null); setSelectedNode(null); }}
            />
            {/* Canvas — grows to fill, shrinks when history is open */}
            <div className={`${historyOpen ? "flex-1 min-h-[200px]" : "flex-1"} relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800`}>
              <AutomationCanvas
                key={selectedAutomation.id}
                automation={selectedAutomation}
                isRunning={isRunning}
                onNodeSelect={setSelectedNode}
              />
              <NodeConfigPanel
                node={selectedNode ? selectedAutomation.nodes.find((n) => n.id === selectedNode.id) ?? null : null}
                automation={selectedAutomation}
                onClose={() => setSelectedNode(null)}
              />
            </div>
            {/* Run History — collapsible bottom panel */}
            <div className={historyOpen ? "h-[280px] shrink-0 overflow-hidden flex flex-col" : ""}>
              <RunHistoryPanel
                runs={selectedRuns}
                isLoading={false}
                isOpen={historyOpen}
                onToggle={() => setHistoryOpen(!historyOpen)}
              />
            </div>
          </>
        ) : (
          <EmptyCanvasState />
        )}
      </div>
    </div>
  );
}
