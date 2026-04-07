// Dependency graph explorer using @xyflow/react

import { useState, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Search, Minus, Plus, RotateCcw, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DependencyReport } from "@/hooks/val-sync/useValDependencies";
import { depNodeTypes } from "./nodes";
import { DepEdge } from "./edges/DepEdge";
import {
  buildAdjIndex,
  buildEgoGraph,
  RESOURCE_COLORS,
  REF_TYPE_COLORS,
  REF_TYPE_LABELS,
  type ResourceType,
} from "./graphLayout";
import { DepsDetailSidebar } from "./DepsDetailSidebar";

// xyflow requires plain Record<string, unknown> compatible types, so we use `any` for the edge/node type maps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes = { depEdge: DepEdge } as any;

const TYPE_ORDER: ResourceType[] = ["table", "query", "workflow", "dashboard"];
const TYPE_LABELS: Record<ResourceType, string> = {
  table: "Tables",
  query: "Queries",
  workflow: "Workflows",
  dashboard: "Dashboards",
};

interface Props {
  report: DependencyReport;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function DepsGraphInner({ report, onRefresh, isRefreshing }: Props) {
  const adj = useMemo(() => buildAdjIndex(report.resources), [report]);
  const { fitView } = useReactFlow();

  // State
  const [centerId, setCenterId] = useState<string | null>(null);
  const [depth, setDepth] = useState(1);
  const [typeFilter, setTypeFilter] = useState<Record<ResourceType, boolean>>({
    table: true,
    query: true,
    workflow: true,
    dashboard: true,
  });
  const [spacingH, setSpacingH] = useState(1);
  const [spacingV, setSpacingV] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState(new Set<string>());
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Searchable items
  const searchItems = useMemo(() => {
    return Object.entries(adj)
      .map(([id, v]) => ({
        id,
        name: v.name,
        type: v.type,
        lc: (v.name + " " + id).toLowerCase(),
        conn: v.up.length + v.dn.length,
      }))
      .sort((a, b) => b.conn - a.conn);
  }, [adj]);

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return searchItems.filter((it) => it.lc.includes(q)).slice(0, 12);
  }, [searchQuery, searchItems]);

  const topNodes = useMemo(() => searchItems.slice(0, 4), [searchItems]);

  // Build graph — use untyped state since xyflow v12 expects Node/Edge base types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  const rebuildGraph = useCallback(
    (focusId: string, opts?: { d?: number; tf?: Record<ResourceType, boolean>; sh?: number; sv?: number; eg?: Set<string> }) => {
      const el = containerRef.current;
      const w = el?.clientWidth ?? 1200;
      const h = el?.clientHeight ?? 800;

      const result = buildEgoGraph(adj, focusId, {
        depth: opts?.d ?? depth,
        typeFilter: opts?.tf ?? typeFilter,
        spacingH: opts?.sh ?? spacingH,
        spacingV: opts?.sv ?? spacingV,
        expandedGroups: opts?.eg ?? expandedGroups,
        viewportWidth: w,
        viewportHeight: h,
      });

      setNodes(result.nodes);
      setEdges(result.edges);
      setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    },
    [adj, depth, typeFilter, spacingH, spacingV, expandedGroups, setNodes, setEdges, fitView],
  );

  // Navigate to a node
  const navigate = useCallback(
    (id: string) => {
      setCenterId(id);
      setExpandedGroups(new Set());
      setSearchQuery(adj[id]?.name ?? id);
      setShowSuggestions(false);
      rebuildGraph(id, { eg: new Set() });
    },
    [adj, rebuildGraph],
  );

  // Node click handler
  const onNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_: React.MouseEvent, node: any) => {
      if (node.data.isGroup && node.data.groupKey) {
        // Toggle group expand/collapse
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          if (next.has(node.data.groupKey!)) next.delete(node.data.groupKey!);
          else next.add(node.data.groupKey!);
          if (centerId) rebuildGraph(centerId, { eg: next });
          return next;
        });
      } else if (!node.data.isCenter) {
        navigate(node.id);
      }
    },
    [centerId, navigate, rebuildGraph],
  );

  // Depth change
  const changeDepth = (d: number) => {
    setDepth(d);
    if (centerId) rebuildGraph(centerId, { d });
  };

  // Type filter toggle
  const toggleType = (t: ResourceType) => {
    const next = { ...typeFilter, [t]: !typeFilter[t] };
    setTypeFilter(next);
    if (centerId) rebuildGraph(centerId, { tf: next });
  };

  // Spacing
  const adjustSpacing = (axis: "h" | "v", delta: number) => {
    if (axis === "h") {
      const next = Math.max(0.4, Math.min(3, spacingH + delta));
      setSpacingH(next);
      if (centerId) rebuildGraph(centerId, { sh: next });
    } else {
      const next = Math.max(0.4, Math.min(3, spacingV + delta));
      setSpacingV(next);
      if (centerId) rebuildGraph(centerId, { sv: next });
    }
  };

  const resetView = () => {
    setSpacingH(1);
    setSpacingV(1);
    if (centerId) rebuildGraph(centerId, { sh: 1, sv: 1 });
  };

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Sidebar */}
      <div className="w-[340px] flex-shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden">
        {/* Header with stats + refresh */}
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-500">
            {report.summary.total_resources} resources · {report.summary.total_edges} edges
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title="Re-compute dependencies"
            >
              <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "..." : "Refresh"}
            </button>
          )}
        </div>

        {/* Search */}
        <div className="p-3 border-b border-zinc-800">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => searchQuery.trim() && setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && suggestions.length) {
                  navigate(suggestions[0].id);
                }
                if (e.key === "Escape") setShowSuggestions(false);
              }}
              placeholder="Search by name or table ID..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl z-20 max-h-[280px] overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center gap-2 border-b border-zinc-800/50 last:border-b-0"
                    onClick={() => navigate(s.id)}
                  >
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ color: RESOURCE_COLORS[s.type], background: RESOURCE_COLORS[s.type] + "18" }}
                    >
                      {s.type.slice(0, 3)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 truncate">{s.name}</p>
                      <p className="text-[10px] font-mono text-zinc-500 truncate">{s.id}</p>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-600">{s.conn}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Type filters */}
        <div className="px-3 py-2 border-b border-zinc-800 flex gap-1.5 flex-wrap">
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={cn(
                "text-[10px] font-mono uppercase tracking-wide px-2 py-1 rounded border transition-colors",
                typeFilter[t]
                  ? "border-current"
                  : "border-zinc-800 text-zinc-600",
              )}
              style={typeFilter[t] ? { color: RESOURCE_COLORS[t], borderColor: RESOURCE_COLORS[t] + "50" } : undefined}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Detail or empty state */}
        <div className="flex-1 overflow-y-auto">
          {centerId && adj[centerId] ? (
            <DepsDetailSidebar adj={adj} nodeId={centerId} onNavigate={navigate} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <p className="text-sm text-zinc-500 mb-4">Search for a resource to explore its dependencies</p>
              <div className="flex flex-col gap-1.5 w-full">
                {topNodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => navigate(n.id)}
                    className="text-xs font-mono px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                  >
                    {n.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Depth + spacing controls */}
        {centerId && (
          <div className="px-3 py-2 border-t border-zinc-800 flex items-center gap-3">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide">Depth</span>
            <div className="flex gap-0.5">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  onClick={() => changeDepth(d)}
                  className={cn(
                    "w-7 h-6 text-xs font-mono rounded border transition-colors",
                    d === depth
                      ? "bg-zinc-800 border-zinc-700 text-zinc-200 font-bold"
                      : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-zinc-600">H</span>
              <button onClick={() => adjustSpacing("h", -0.2)} className="text-zinc-500 hover:text-zinc-300"><Minus size={12} /></button>
              <button onClick={() => adjustSpacing("h", 0.2)} className="text-zinc-500 hover:text-zinc-300"><Plus size={12} /></button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-zinc-600">V</span>
              <button onClick={() => adjustSpacing("v", -0.2)} className="text-zinc-500 hover:text-zinc-300"><Minus size={12} /></button>
              <button onClick={() => adjustSpacing("v", 0.2)} className="text-zinc-500 hover:text-zinc-300"><Plus size={12} /></button>
            </div>
            <button onClick={resetView} className="text-zinc-500 hover:text-zinc-300" title="Reset"><RotateCcw size={12} /></button>
          </div>
        )}
      </div>

      {/* Graph canvas */}
      <div className="flex-1 bg-zinc-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={depNodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="bg-zinc-950"
          defaultEdgeOptions={{ animated: false }}
        >
          <Background color="#1c2030" gap={32} size={1} />
          {/* SVG arrow markers for each ref type */}
          <svg>
            <defs>
              {Object.entries(REF_TYPE_COLORS).map(([type, color]) => (
                <marker
                  key={type}
                  id={`arrow-${type}`}
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={color} fillOpacity="0.5" />
                </marker>
              ))}
            </defs>
          </svg>
        </ReactFlow>

        {/* HUD overlay */}
        {nodes.length > 0 && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-500 px-2 py-1 bg-zinc-900/80 rounded border border-zinc-800 backdrop-blur">
              {nodes.length} nodes · {edges.length} edges
            </span>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5">
          <div className="flex gap-3 px-2.5 py-1.5 bg-zinc-900/85 rounded border border-zinc-800 backdrop-blur text-[11px]">
            {TYPE_ORDER.map((t) => (
              <div key={t} className="flex items-center gap-1.5 text-zinc-400">
                <div className="w-2 h-2 rounded-full" style={{ background: RESOURCE_COLORS[t] }} />
                {t}
              </div>
            ))}
          </div>
          <div className="px-2.5 py-1.5 bg-zinc-900/85 rounded border border-zinc-800 backdrop-blur text-[10px]">
            <p className="text-zinc-500 font-medium mb-1">Edge types</p>
            {Object.entries(REF_TYPE_LABELS).map(([type, label]) => (
              <div key={type} className="flex items-center gap-2 text-zinc-400 py-0.5">
                <div className="w-4 border-b-2" style={{ borderColor: REF_TYPE_COLORS[type], borderStyle: type === "table_ref" ? "solid" : "dashed" }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DepsGraphView({ report, onRefresh, isRefreshing }: Props) {
  return (
    <ReactFlowProvider>
      <DepsGraphInner report={report} onRefresh={onRefresh} isRefreshing={isRefreshing} />
    </ReactFlowProvider>
  );
}
