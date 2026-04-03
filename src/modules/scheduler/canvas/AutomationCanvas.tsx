// React Flow canvas — renders automation nodes + edges

import { useCallback, useEffect, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type OnNodeDrag,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./canvas.css";
import { useUpdateNodePosition, useUpdateViewport } from "@/hooks/scheduler";
import { nodeTypes } from "./nodes";
import { toReactFlowNodes, toReactFlowEdges } from "./utils";
import type { AutomationGraph, AutomationNodeRow } from "./types";

interface Props {
  automation: AutomationGraph;
  isRunning: boolean;
  onNodeSelect: (node: AutomationNodeRow | null) => void;
}

export function AutomationCanvas({ automation, isRunning, onNodeSelect }: Props) {
  const updatePosition = useUpdateNodePosition();
  const updateViewport = useUpdateViewport();
  const viewportTimer = useRef<ReturnType<typeof setTimeout>>();

  const rfNodes = useMemo(
    () => toReactFlowNodes(automation.nodes, automation.id, automation.automation_type, isRunning),
    [automation.nodes, automation.id, automation.automation_type, isRunning],
  );
  const rfEdges = useMemo(
    () => toReactFlowEdges(automation.edges),
    [automation.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  // Sync when upstream data changes (async load, config update, etc.)
  useEffect(() => { setNodes(rfNodes); }, [rfNodes, setNodes]);
  useEffect(() => { setEdges(rfEdges); }, [rfEdges, setEdges]);

  // Persist node position on drag end
  const onNodeDragStop: OnNodeDrag = useCallback((_, node) => {
    updatePosition.mutate({
      nodeId: node.id,
      position_x: node.position.x,
      position_y: node.position.y,
    });
  }, [updatePosition]);

  // Click node → open config panel
  const onNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    const row = automation.nodes.find((n) => n.id === node.id) ?? null;
    onNodeSelect(row);
  }, [automation.nodes, onNodeSelect]);

  // Click canvas background → close panel
  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // Debounced viewport save
  const onMoveEnd = useCallback((_: unknown, viewport: Viewport) => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      updateViewport.mutate({
        id: automation.id,
        viewport_x: viewport.x,
        viewport_y: viewport.y,
        viewport_zoom: viewport.zoom,
      });
    }, 500);
  }, [automation.id, updateViewport]);

  const defaultViewport: Viewport = {
    x: automation.viewport_x,
    y: automation.viewport_y,
    zoom: automation.viewport_zoom,
  };

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        defaultViewport={defaultViewport}
        fitView={automation.viewport_x === 0 && automation.viewport_y === 0 && automation.viewport_zoom === 1}
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable
        edgesReconnectable={false}
        deleteKeyCode={null}
        panOnScroll
        zoomOnScroll
        snapToGrid
        snapGrid={[20, 20]}
        proOptions={{ hideAttribution: true }}
        className="bg-zinc-50 dark:bg-zinc-950"
      >
        <Background gap={20} size={1} className="!stroke-zinc-200 dark:!stroke-zinc-800" />
        <Controls
          showInteractive={false}
          className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 !shadow-sm [&>button]:!bg-white dark:[&>button]:!bg-zinc-900 [&>button]:!border-zinc-200 dark:[&>button]:!border-zinc-800 [&>button]:!text-zinc-600 dark:[&>button]:!text-zinc-400"
        />
      </ReactFlow>
    </div>
  );
}
