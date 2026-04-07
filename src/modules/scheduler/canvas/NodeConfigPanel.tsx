// Slide-in config panel — renders the right panel for the selected node

import { useState } from "react";
import { X, Code2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useUpdateAutomationNode } from "@/hooks/scheduler";
import { TriggerConfigPanel } from "./panels/TriggerConfigPanel";
import { DataSourceConfigPanel } from "./panels/DataSourceConfigPanel";
import { SkillsConfigPanel } from "./panels/SkillsConfigPanel";
import { ActionConfigPanel } from "./panels/ActionConfigPanel";
import { AiProcessConfigPanel } from "./panels/AiProcessConfigPanel";
import { OutputConfigPanel } from "./panels/OutputConfigPanel";
import { LoopConfigPanel } from "./panels/LoopConfigPanel";
import type {
  AutomationGraph,
  AutomationNodeRow,
  NodeConfig,
  TriggerConfig,
  DataSourceConfig,
  SkillsConfig,
  ActionConfig,
  AiProcessConfig,
  OutputConfig,
  LoopConfig,
} from "./types";

interface Props {
  node: AutomationNodeRow | null;
  automation: AutomationGraph;
  onClose: () => void;
}

export function NodeConfigPanel({ node, automation, onClose }: Props) {
  const updateNode = useUpdateAutomationNode();
  const [showJson, setShowJson] = useState(false);

  function handleChange(config: NodeConfig) {
    if (!node) return;
    updateNode.mutate({
      nodeId: node.id,
      automationId: automation.id,
      config,
      automation: { ...automation, nodes: automation.nodes.map((n) => n.id === node.id ? { ...n, config } : n) },
    });
  }

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          key="config-panel"
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute right-0 top-0 bottom-0 w-[380px] bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 z-10 flex flex-col shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
              {node.node_type.replace("_", " ")}
            </span>
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {showJson ? (
              <pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(node.config, null, 2)}
              </pre>
            ) : (
              <>
                {node.node_type === "trigger" && (
                  <TriggerConfigPanel
                    config={node.config as TriggerConfig}
                    onChange={handleChange}
                  />
                )}
                {node.node_type === "data_source" && (
                  <DataSourceConfigPanel
                    config={node.config as DataSourceConfig}
                    onChange={handleChange}
                  />
                )}
                {node.node_type === "skills" && (
                  <SkillsConfigPanel
                    config={node.config as SkillsConfig}
                    onChange={handleChange}
                  />
                )}
                {node.node_type === "action" && (
                  <ActionConfigPanel
                    config={node.config as ActionConfig}
                    onChange={handleChange}
                  />
                )}
                {node.node_type === "ai_process" && (
                  <AiProcessConfigPanel
                    config={node.config as AiProcessConfig}
                    onChange={handleChange}
                  />
                )}
                {node.node_type === "output" && (
                  <OutputConfigPanel
                    config={node.config as OutputConfig}
                    onChange={handleChange}
                  />
                )}
                {node.node_type === "loop" && (
                  <LoopConfigPanel
                    config={node.config as LoopConfig}
                    onChange={handleChange}
                  />
                )}
              </>
            )}
          </div>

          {/* Footer — JSON toggle + last saved */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setShowJson((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <Code2 size={12} />
              {showJson ? "Hide JSON" : "View JSON"}
            </button>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Saved {new Date(node.updated_at).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
