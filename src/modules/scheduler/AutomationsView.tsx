// Automations tab — visual node canvas for DIO + Skill automations

import { useState, useCallback } from "react";
import {
  useAutomations,
  useAutomationNodes,
  useAutomationEdges,
  useCreateAutomation,
  useRunningJobsStore,
  useCreateJob,
} from "../../hooks/scheduler";
import {
  DEFAULT_MODEL,
  DEFAULT_SOURCES,
  DEFAULT_THREAD_TITLE_NEW,
} from "../../hooks/chat/useTaskAdvisor";
import { useCreateDio } from "../../hooks/chat/useDioAutomations";
import { AutomationList } from "./canvas/AutomationList";
import { AutomationCanvas } from "./canvas/AutomationCanvas";
import { AutomationCanvasHeader } from "./canvas/AutomationCanvasHeader";
import { NodeConfigPanel } from "./canvas/NodeConfigPanel";
import { EmptyCanvasState } from "./canvas/EmptyCanvasState";
import type { AutomationGraph, AutomationNodeRow } from "./canvas/types";

export function AutomationsView() {
  // Automations list
  const { data: automations = [], isLoading } = useAutomations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<AutomationNodeRow | null>(null);

  // Load nodes + edges for selected automation
  const { data: nodes = [] } = useAutomationNodes(selectedId);
  const { data: edges = [] } = useAutomationEdges(selectedId);

  // Build the full graph for the selected automation
  const selectedAutomation: AutomationGraph | null = (() => {
    const auto = automations.find((a) => a.id === selectedId);
    if (!auto) return null;
    return { ...auto, nodes, edges };
  })();

  // Running state
  const runningJobs = useRunningJobsStore((s) => s.runningJobs);
  const isRunning = selectedAutomation?.job_id
    ? !!runningJobs[selectedAutomation.job_id] || selectedAutomation.last_run_status === "running"
    : false;

  // Create mutations
  const createAutomation = useCreateAutomation();
  const createDio = useCreateDio();
  const createJob = useCreateJob();

  const handleNew = useCallback(async (type: "dio" | "skill") => {
    try {
      if (type === "dio") {
        // Create backing DIO row first, then automation graph
        const dioRow = await createDio.mutateAsync({
          name: "New DIO Automation",
          enabled: true,
          interval_hours: 2,
          sources: DEFAULT_SOURCES,
          model: DEFAULT_MODEL,
          post_mode: "new_thread",
          thread_title: DEFAULT_THREAD_TITLE_NEW,
        });
        const autoId = await createAutomation.mutateAsync({
          name: "New DIO Automation",
          automation_type: "dio",
          dio_id: dioRow.id,
        });
        setSelectedId(autoId);
      } else {
        // Create backing job row first
        const jobRow = await createJob.mutateAsync({
          name: "New Skill Automation",
          skill_prompt: "",
          model: "sonnet",
          enabled: true,
        });
        const autoId = await createAutomation.mutateAsync({
          name: "New Skill Automation",
          automation_type: "skill",
          job_id: jobRow.id,
        });
        setSelectedId(autoId);
      }
    } catch (e) {
      console.error("Failed to create automation:", e);
    }
  }, [createDio, createJob, createAutomation]);

  // When selecting a different automation, close the config panel
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedNode(null);
  }, []);

  return (
    <div className="flex-1 flex overflow-hidden">
      <AutomationList
        automations={automations}
        isLoading={isLoading}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={handleNew}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedAutomation ? (
          <>
            <AutomationCanvasHeader automation={selectedAutomation} onDeleted={() => { setSelectedId(null); setSelectedNode(null); }} />
            <div className="flex-1 relative overflow-hidden">
              <AutomationCanvas
                key={selectedAutomation.id}
                automation={selectedAutomation}
                isRunning={isRunning}
                onNodeSelect={setSelectedNode}
              />
              <NodeConfigPanel
                node={selectedNode}
                automation={selectedAutomation}
                onClose={() => setSelectedNode(null)}
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
