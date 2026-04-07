// Sidebar showing details for the selected (center) node

import { RESOURCE_COLORS, REF_TYPE_COLORS, REF_TYPE_LABELS, type AdjIndex } from "./graphLayout";

interface Props {
  adj: AdjIndex;
  nodeId: string;
  onNavigate: (id: string) => void;
}

export function DepsDetailSidebar({ adj, nodeId, onNavigate }: Props) {
  const node = adj[nodeId];
  if (!node) return null;

  const ups = node.up.filter((u) => u !== nodeId);
  const dns = node.dn.filter((d) => d !== nodeId);

  // Group downstream by type
  const dnByType: Record<string, string[]> = {};
  for (const did of dns) {
    const d = adj[did];
    if (d) (dnByType[d.type] = dnByType[d.type] || []).push(did);
  }

  return (
    <div className="text-xs">
      {/* Header */}
      <div className="px-3 py-3 border-b border-zinc-800">
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ color: RESOURCE_COLORS[node.type], background: RESOURCE_COLORS[node.type] + "18" }}
        >
          {node.type}
        </span>
        <p className="text-sm font-semibold text-zinc-100 mt-1.5">{node.name}</p>
        <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{nodeId}</p>

        <div className="flex gap-0 mt-3">
          <div className="flex-1 text-center py-2 bg-zinc-900 border border-zinc-800 rounded-l-md">
            <p className="text-base font-mono font-bold text-zinc-200">{ups.length}</p>
            <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Upstream</p>
          </div>
          <div className="flex-1 text-center py-2 bg-zinc-900 border-y border-zinc-800">
            <p className="text-base font-mono font-bold text-zinc-200">{dns.length}</p>
            <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Downstream</p>
          </div>
          <div className="flex-1 text-center py-2 bg-zinc-900 border border-zinc-800 rounded-r-md">
            <p className="text-base font-mono font-bold text-zinc-200">{ups.length + dns.length}</p>
            <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Total</p>
          </div>
        </div>
      </div>

      {/* Upstream */}
      {ups.length > 0 && (
        <div className="px-3 py-2">
          <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wide mb-2 pb-1 border-b border-zinc-800">
            Depends on <span className="text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full ml-1">{ups.length}</span>
          </p>
          {ups.slice(0, 40).map((uid) => (
            <DepRow key={uid} id={uid} adj={adj} refTypes={node.upRefs[uid]} onNavigate={onNavigate} />
          ))}
          {ups.length > 40 && <p className="text-zinc-600 py-1">+{ups.length - 40} more</p>}
        </div>
      )}

      {/* Downstream by type */}
      {Object.entries(dnByType).map(([type, ids]) => (
        <div key={type} className="px-3 py-2">
          <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wide mb-2 pb-1 border-b border-zinc-800">
            {type}s <span className="text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full ml-1">{ids.length}</span>
          </p>
          {ids.slice(0, 40).map((did) => (
            <DepRow key={did} id={did} adj={adj} refTypes={node.dnRefs[did]} onNavigate={onNavigate} />
          ))}
          {ids.length > 40 && <p className="text-zinc-600 py-1">+{ids.length - 40} more</p>}
        </div>
      ))}
    </div>
  );
}

function DepRow({
  id,
  adj,
  refTypes,
  onNavigate,
}: {
  id: string;
  adj: AdjIndex;
  refTypes?: string[];
  onNavigate: (id: string) => void;
}) {
  const n = adj[id];
  if (!n) return null;

  const refs = [...new Set(refTypes || [])];

  return (
    <button
      onClick={() => onNavigate(id)}
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50 transition-colors group"
    >
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: RESOURCE_COLORS[n.type] }} />
      <div className="flex-1 min-w-0">
        <p className="text-zinc-300 truncate">{n.name}</p>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-zinc-600 truncate">{id}</span>
          {refs.map((rt) => (
            <span
              key={rt}
              className="text-[8px] font-mono font-bold px-1 py-0 rounded"
              style={{
                color: REF_TYPE_COLORS[rt],
                background: REF_TYPE_COLORS[rt] + "18",
                border: `1px solid ${REF_TYPE_COLORS[rt]}33`,
              }}
            >
              {REF_TYPE_LABELS[rt] || rt}
            </span>
          ))}
        </div>
      </div>
      <span className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">›</span>
    </button>
  );
}
