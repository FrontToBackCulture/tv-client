// Custom edge with ref-type coloring and dash patterns

import { memo } from "react";
import { getBezierPath, EdgeLabelRenderer } from "@xyflow/react";
import { REF_TYPE_COLORS, REF_TYPE_LABELS } from "../graphLayout";

const REF_DASH: Record<string, string> = {
  calc_lookup: "6 3",
  table_ref: "",
  query_ref: "3 3",
  sql_ref: "8 4",
  workflow_ref: "4 2",
  unknown: "2 2",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DepEdge = memo(function DepEdge(props: any) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const primaryRef = data?.refTypes?.[0] || "unknown";
  const color = REF_TYPE_COLORS[primaryRef] || REF_TYPE_COLORS.unknown;
  const dash = REF_DASH[primaryRef] || "";
  const label = REF_TYPE_LABELS[primaryRef] || primaryRef;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.3,
  });

  const isHighlighted = selected;

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={isHighlighted ? 2.5 : 1.2}
        strokeOpacity={isHighlighted ? 0.8 : 0.3}
        strokeDasharray={dash}
        markerEnd={`url(#arrow-${primaryRef})`}
      />
      {isHighlighted && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            <span
              className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border"
              style={{
                background: "rgba(7,8,12,0.9)",
                borderColor: color + "60",
                color: color,
              }}
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
