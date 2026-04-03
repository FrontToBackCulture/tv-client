// Pure converters: DB rows → React Flow nodes/edges

import type { AutomationNodeRow, AutomationEdgeRow, AutomationNode, AutomationEdge, AutomationType } from "./types";

export function toReactFlowNodes(
  rows: AutomationNodeRow[],
  automationId: string,
  automationType: AutomationType,
  isRunning: boolean,
): AutomationNode[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.node_type,
    position: { x: row.position_x, y: row.position_y },
    data: {
      automationId,
      automationType,
      nodeType: row.node_type,
      config: row.config,
      label: row.node_type,
      isRunning,
    },
  }));
}

export function toReactFlowEdges(rows: AutomationEdgeRow[]): AutomationEdge[] {
  return rows.map((row) => ({
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    type: "smoothstep",
    animated: false,
  }));
}
