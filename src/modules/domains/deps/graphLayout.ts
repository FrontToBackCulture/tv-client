// Ego-graph layout engine
// Takes a DependencyReport and a focus node, returns positioned xyflow nodes/edges.

import type { ResourceNode } from "@/hooks/val-sync/useValDependencies";

// ============================================================
// Types
// ============================================================

export type ResourceType = "table" | "query" | "workflow" | "dashboard";

export interface DepNodeData {
  label: string;
  resourceId: string;
  resourceType: ResourceType;
  isCenter: boolean;
  isBidir: boolean;
  layer: number;
  upCount: number;
  dnCount: number;
  isGroup?: boolean;
  groupKey?: string;
  groupCount?: number;
  [key: string]: unknown;
}

export interface DepEdgeData {
  refTypes: string[];
  isBidir: boolean;
  [key: string]: unknown;
}

// xyflow-compatible node/edge shapes
export interface DepNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: DepNodeData;
}

export interface DepEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  data: DepEdgeData;
}

export const RESOURCE_COLORS: Record<string, string> = {
  table: "#5b9cf5",
  query: "#5dd9a3",
  workflow: "#e8944a",
  dashboard: "#b57cf5",
};

export const REF_TYPE_COLORS: Record<string, string> = {
  calc_lookup: "#f0c254",
  table_ref: "#5b9cf5",
  query_ref: "#5dd9a3",
  sql_ref: "#e06070",
  workflow_ref: "#e8944a",
  unknown: "#666",
};

export const REF_TYPE_LABELS: Record<string, string> = {
  calc_lookup: "calc",
  table_ref: "ref",
  query_ref: "query",
  sql_ref: "sql",
  workflow_ref: "workflow",
};

const TYPE_ORDER: ResourceType[] = ["table", "workflow", "dashboard", "query"];
const MAX_VISIBLE = 10;
const MAX_PER_COL = 10;
const BASE_ROW_H = 80;
const BASE_SUB_COL_W = 240;
const BASE_LAYER_SPACING = 350;

// Node dimensions for xyflow (used by custom node components)
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 50;
export const CENTER_NODE_WIDTH = 220;
export const CENTER_NODE_HEIGHT = 60;

// ============================================================
// Adjacency index (built once from DependencyReport)
// ============================================================

export interface AdjEntry {
  name: string;
  type: ResourceType;
  up: string[];
  dn: string[];
  upRefs: Record<string, string[]>; // upstream id -> ref types
  dnRefs: Record<string, string[]>;
}

export type AdjIndex = Record<string, AdjEntry>;

export function buildAdjIndex(resources: Record<string, ResourceNode>): AdjIndex {
  const adj: AdjIndex = {};
  for (const [id, r] of Object.entries(resources)) {
    const upRefs: Record<string, string[]> = {};
    const dnRefs: Record<string, string[]> = {};
    for (const d of r.depends_on) {
      if (!upRefs[d.id]) upRefs[d.id] = [];
      upRefs[d.id].push(d.reference_type);
    }
    for (const d of r.depended_by) {
      if (!dnRefs[d.id]) dnRefs[d.id] = [];
      dnRefs[d.id].push(d.reference_type);
    }
    adj[id] = {
      name: r.name,
      type: r.resource_type as ResourceType,
      up: [...new Set(r.depends_on.map((d) => d.id))],
      dn: [...new Set(r.depended_by.map((d) => d.id))],
      upRefs,
      dnRefs,
    };
  }
  return adj;
}

// ============================================================
// Ego-graph builder
// ============================================================

interface LayoutOptions {
  depth: number;
  typeFilter: Record<ResourceType, boolean>;
  spacingH: number;
  spacingV: number;
  expandedGroups: Set<string>;
  viewportWidth: number;
  viewportHeight: number;
}

export function buildEgoGraph(
  adj: AdjIndex,
  centerId: string,
  opts: LayoutOptions,
): { nodes: DepNode[]; edges: DepEdge[] } {
  const center = adj[centerId];
  if (!center) return { nodes: [], edges: [] };

  const { depth, typeFilter, spacingH, spacingV, expandedGroups, viewportWidth, viewportHeight } = opts;
  const W = viewportWidth;
  const H = viewportHeight;
  const cx = W / 2;
  const cy = H / 2;

  // BFS both directions
  const upMap = new Map<string, number>();
  const dnMap = new Map<string, number>();

  function bfs(startId: string, direction: "up" | "dn", map: Map<string, number>) {
    const q: { id: string; d: number }[] = [{ id: startId, d: 0 }];
    map.set(startId, 0);
    while (q.length) {
      const { id, d } = q.shift()!;
      if (d >= depth) continue;
      const n = adj[id];
      if (!n) continue;
      const neighbors = direction === "up" ? n.up : n.dn;
      for (const nid of neighbors) {
        if (nid === centerId && d === 0) continue;
        if (!map.has(nid)) {
          map.set(nid, d + 1);
          q.push({ id: nid, d: d + 1 });
        }
      }
    }
  }

  bfs(centerId, "up", upMap);
  bfs(centerId, "dn", dnMap);

  // Deduplicate bidirectional
  const bidir = new Set<string>();
  for (const [id] of upMap) {
    if (id !== centerId && dnMap.has(id)) {
      bidir.add(id);
      dnMap.delete(id);
    }
  }

  const nodes: DepNode[] = [];
  const nodeIds = new Set<string>();

  // Center node
  nodes.push({
    id: centerId,
    type: "depCenter",
    position: { x: cx - CENTER_NODE_WIDTH / 2, y: cy - CENTER_NODE_HEIGHT / 2 },
    data: {
      label: center.name,
      resourceId: centerId,
      resourceType: center.type,
      isCenter: true,
      isBidir: false,
      layer: 0,
      upCount: center.up.length,
      dnCount: center.dn.length,
    },
  });
  nodeIds.add(centerId);

  // Place layers
  function placeLayer(map: Map<string, number>, dir: -1 | 1) {
    const ROW_H = BASE_ROW_H * spacingV;
    const SUB_COL_W = BASE_SUB_COL_W * spacingH;
    const layerSpacing = Math.min(BASE_LAYER_SPACING * spacingH, (W - 80) / (depth * 2 + 1)) * spacingH;

    for (let d = 1; d <= depth; d++) {
      let layerIds = [...map.entries()].filter(([, dd]) => dd === d).map(([id]) => id);
      layerIds = layerIds.filter((id) => {
        const n = adj[id];
        return n && typeFilter[n.type];
      });
      if (!layerIds.length) continue;

      // Group by type
      const groups: Partial<Record<ResourceType, string[]>> = {};
      for (const id of layerIds) {
        const t = adj[id]?.type ?? "table";
        (groups[t] = groups[t] || []).push(id);
      }

      const orderedTypes = TYPE_ORDER.filter((t) => groups[t]?.length);

      // Build sub-column layout
      const typeLayouts: {
        type: ResourceType;
        cols: string[][];
        needsCollapse: boolean;
        groupKey: string;
        remaining: number;
      }[] = [];

      for (const type of orderedTypes) {
        const ids = groups[type]!;
        ids.sort((a, b) => (adj[a]?.name || "").localeCompare(adj[b]?.name || ""));

        const groupKey = `${centerId}_${dir}_${d}_${type}`;
        const isExpanded = expandedGroups.has(groupKey);
        const needsCollapse = ids.length > MAX_VISIBLE;
        const visibleIds = needsCollapse && !isExpanded ? ids.slice(0, MAX_VISIBLE) : ids;

        const numCols = Math.ceil(visibleIds.length / MAX_PER_COL);
        const cols: string[][] = [];
        for (let c = 0; c < numCols; c++) {
          cols.push(visibleIds.slice(c * MAX_PER_COL, (c + 1) * MAX_PER_COL));
        }

        typeLayouts.push({ type, cols, needsCollapse, groupKey, remaining: ids.length - MAX_VISIBLE });
      }

      const baseX = cx + dir * d * layerSpacing;

      let colIdx = 0;
      for (const tl of typeLayouts) {
        for (const colIds of tl.cols) {
          const xFinal = baseX + dir * colIdx * (SUB_COL_W * 0.85);
          const totalH = Math.min(colIds.length * ROW_H, H - 80);
          const startY = cy - totalH / 2;
          const step = colIds.length > 1 ? totalH / (colIds.length - 1) : 0;

          for (let i = 0; i < colIds.length; i++) {
            const id = colIds[i];
            const n = adj[id];
            if (!n) continue;
            const y = colIds.length === 1 ? cy : startY + i * step;

            nodes.push({
              id,
              type: "depNode",
              position: { x: xFinal - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
              data: {
                label: n.name,
                resourceId: id,
                resourceType: n.type,
                isCenter: false,
                isBidir: bidir.has(id),
                layer: dir * d,
                upCount: n.up.length,
                dnCount: n.dn.length,
              },
            });
            nodeIds.add(id);
          }
          colIdx++;
        }

        // Collapse/expand group node
        if (tl.needsCollapse) {
          const lastColX = baseX + dir * (colIdx - 1) * (SUB_COL_W * 0.85);
          const lastCol = tl.cols[tl.cols.length - 1];
          const lastColH = Math.min(lastCol.length * ROW_H, H - 80);
          const yPos = cy + lastColH / 2 + 40;
          const summaryId = `__group_${tl.groupKey}`;

          const isExpanded = expandedGroups.has(tl.groupKey);
          nodes.push({
            id: summaryId,
            type: "depGroup",
            position: { x: lastColX - 70, y: yPos },
            data: {
              label: isExpanded ? "Collapse" : `+${tl.remaining} more ${tl.type}s`,
              resourceId: summaryId,
              resourceType: tl.type,
              isCenter: false,
              isBidir: false,
              layer: dir * d,
              upCount: 0,
              dnCount: 0,
              isGroup: true,
              groupKey: tl.groupKey,
              groupCount: tl.remaining,
            },
          });
        }
      }
    }
  }

  placeLayer(upMap, -1);
  placeLayer(dnMap, 1);

  // Build edges
  const edges: DepEdge[] = [];
  const edgeSet = new Set<string>();
  for (const node of nodes) {
    if (node.data.isGroup) continue;
    const a = adj[node.id];
    if (!a) continue;
    for (const uid of a.up) {
      if (nodeIds.has(uid)) {
        const key = `${uid}>${node.id}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          const refs = a.upRefs[uid] || [];
          edges.push({
            id: key,
            source: uid,
            target: node.id,
            type: "depEdge",
            data: {
              refTypes: refs,
              isBidir: bidir.has(uid) && node.data.isCenter,
            },
          });
        }
      }
    }
  }

  return { nodes, edges };
}
