// Pure converters: DB rows → React Flow nodes/edges

import type { AutomationNodeRow, AutomationEdgeRow, AutomationNode, AutomationEdge, LoopConfig } from "./types";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const GROUP_PADDING = 30;

export function toReactFlowNodes(
  rows: AutomationNodeRow[],
  automationId: string,
  isRunning: boolean,
): AutomationNode[] {
  const nodes: AutomationNode[] = rows.map((row) => ({
    id: row.id,
    type: row.node_type,
    position: { x: row.position_x, y: row.position_y },
    data: {
      automationId,
      nodeType: row.node_type,
      config: row.config,
      label: row.node_type,
      isRunning,
    },
  }));

  return nodes;
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

/**
 * Compute bounding-box nodes for loop groups.
 * Traverses edges from each loop node forward, stopping at output nodes,
 * and returns a synthetic "loop_group" node sized to encompass the children.
 */
export function computeLoopGroups(
  rows: AutomationNodeRow[],
  edges: AutomationEdgeRow[],
  automationId: string,
  isRunning: boolean,
): AutomationNode[] {
  const loopNodes = rows.filter((r) => r.node_type === "loop");
  if (loopNodes.length === 0) return [];

  // Build adjacency: source → targets
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source_node_id) ?? [];
    list.push(e.target_node_id);
    adj.set(e.source_node_id, list);
  }

  const nodeById = new Map(rows.map((r) => [r.id, r]));
  const groups: AutomationNode[] = [];

  for (const loop of loopNodes) {
    // BFS forward from loop node — collect all downstream nodes except output
    const insideIds = new Set<string>();
    const queue = adj.get(loop.id) ?? [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const node = nodeById.get(id);
      if (!node) continue;
      if (node.node_type === "output") continue; // stop at output

      insideIds.add(id);
      const next = adj.get(id) ?? [];
      queue.push(...next);
    }

    // Include the loop node itself in the bounding box
    insideIds.add(loop.id);

    if (insideIds.size <= 1) continue; // only loop node, no children

    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of insideIds) {
      const n = nodeById.get(id);
      if (!n) continue;
      minX = Math.min(minX, n.position_x);
      minY = Math.min(minY, n.position_y);
      maxX = Math.max(maxX, n.position_x + NODE_WIDTH);
      maxY = Math.max(maxY, n.position_y + NODE_HEIGHT);
    }

    const config = loop.config as LoopConfig;

    groups.push({
      id: `loop-group-${loop.id}`,
      type: "loop_group",
      position: { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING },
      zIndex: -1,
      selectable: false,
      draggable: false,
      data: {
        automationId,
        nodeType: "loop" as const,
        config: loop.config,
        isRunning,
        width: maxX - minX + GROUP_PADDING * 2,
        height: maxY - minY + GROUP_PADDING * 2,
        label: `Loop: for each ${config.item_variable || "item"}`,
      },
    });
  }

  return groups;
}
