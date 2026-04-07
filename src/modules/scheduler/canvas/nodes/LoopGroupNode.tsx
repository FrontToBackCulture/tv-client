// Visual bounding box rendered behind nodes that are inside a loop.
// This is a regular React Flow node with low zIndex, styled as a dashed border region.

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";

interface LoopGroupData {
  width: number;
  height: number;
  label: string;
  [key: string]: unknown;
}

export const LoopGroupNode = memo(function LoopGroupNode({ data }: NodeProps) {
  const { width, height, label } = data as LoopGroupData;

  return (
    <div
      style={{ width, height }}
      className="rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 pointer-events-none"
    >
      <div className="absolute -top-3 left-3 flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 rounded-full">
        <Repeat size={10} className="text-emerald-600 dark:text-emerald-400" />
        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          {label}
        </span>
      </div>
    </div>
  );
});
