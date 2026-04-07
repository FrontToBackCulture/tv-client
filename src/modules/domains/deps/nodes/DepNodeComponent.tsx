// Custom xyflow nodes for the dependency graph

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/cn";
import { RESOURCE_COLORS } from "../graphLayout";

const TYPE_LABELS: Record<string, string> = {
  table: "TBL",
  query: "QRY",
  workflow: "WFL",
  dashboard: "DSH",
};

const TYPE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  table: { bg: "bg-blue-950/40", text: "text-blue-400", border: "border-blue-800/50" },
  query: { bg: "bg-emerald-950/40", text: "text-emerald-400", border: "border-emerald-800/50" },
  workflow: { bg: "bg-orange-950/40", text: "text-orange-400", border: "border-orange-800/50" },
  dashboard: { bg: "bg-purple-950/40", text: "text-purple-400", border: "border-purple-800/50" },
};

/** Standard dependency node */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DepNode = memo(function DepNode({ data, selected }: any) {
  const style = TYPE_STYLES[data.resourceType] || TYPE_STYLES.table;
  const color = RESOURCE_COLORS[data.resourceType] || "#888";

  return (
    <div
      className={cn(
        "w-[180px] rounded-lg border bg-zinc-900 shadow-sm transition-all",
        selected ? "border-teal-500 ring-2 ring-teal-500/20" : "border-zinc-800 hover:border-zinc-700",
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-zinc-900" style={{ background: color }} />
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", style.bg, style.text, "border", style.border)}>
            {TYPE_LABELS[data.resourceType] || "???"}
          </span>
          {data.isBidir && (
            <span className="text-[9px] text-amber-400/70 font-mono">⇄</span>
          )}
        </div>
        <p className="text-xs font-medium text-zinc-200 truncate">{data.label}</p>
        <p className="text-[10px] font-mono text-zinc-500 truncate">{data.resourceId}</p>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-zinc-900" style={{ background: color }} />
    </div>
  );
});

/** Center (focus) node — larger, glowing */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DepCenterNode = memo(function DepCenterNode({ data }: any) {
  const style = TYPE_STYLES[data.resourceType] || TYPE_STYLES.table;
  const color = RESOURCE_COLORS[data.resourceType] || "#888";

  return (
    <div
      className="w-[220px] rounded-xl border-2 bg-zinc-900 shadow-lg"
      style={{ borderColor: color, boxShadow: `0 0 24px ${color}22` }}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !border-zinc-900" style={{ background: color }} />
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", style.bg, style.text, "border", style.border)}>
            {TYPE_LABELS[data.resourceType] || "???"}
          </span>
          <span className="text-[9px] text-zinc-500">{data.upCount} up · {data.dnCount} dn</span>
        </div>
        <p className="text-sm font-semibold text-zinc-100">{data.label}</p>
        <p className="text-[10px] font-mono text-zinc-500">{data.resourceId}</p>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border-zinc-900" style={{ background: color }} />
    </div>
  );
});

/** Group collapse/expand node */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DepGroupNode = memo(function DepGroupNode({ data }: any) {
  const color = RESOURCE_COLORS[data.resourceType] || "#888";

  return (
    <div
      className="w-[140px] rounded-md border border-dashed px-3 py-1.5 text-center cursor-pointer hover:bg-zinc-800/50 transition-colors"
      style={{ borderColor: color + "60", color: color + "aa" }}
    >
      <p className="text-xs font-medium">{data.label}</p>
    </div>
  );
});
