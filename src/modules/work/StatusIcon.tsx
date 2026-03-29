// src/modules/work/StatusIcon.tsx
// Status circle indicator (Linear-style)

import { Check } from "lucide-react";
import type { StatusType } from "../../lib/work/types";

interface StatusIconProps {
  type: StatusType;
  color?: string;
  size?: number;
}

export function StatusIcon({ type, color = "#6B7280", size = 16 }: StatusIconProps) {
  switch (type) {
    case "complete":
      return (
        <div
          className="rounded-full flex items-center justify-center"
          style={{ width: size, height: size, backgroundColor: color }}
        >
          <Check size={size * 0.6} strokeWidth={2.5} className="text-white" />
        </div>
      );

    case "in_progress":
      return (
        <div
          className="rounded-full flex items-center justify-center"
          style={{ width: size, height: size, border: `2px solid ${color}` }}
        >
          <div
            className="rounded-full"
            style={{ width: size * 0.35, height: size * 0.35, backgroundColor: color }}
          />
        </div>
      );

    case "todo":
    default:
      return (
        <div
          className="rounded-full"
          style={{ width: size, height: size, border: `2px solid ${color}` }}
        />
      );
  }
}

// Priority bars (Linear-style)
interface PriorityBarsProps {
  priority: number;
  size?: number;
}

export function PriorityBars({ priority, size = 14 }: PriorityBarsProps) {
  // Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
  const barsCount = priority === 0 ? 0 : 5 - priority;
  const barHeight = size;
  const barWidth = 2;

  const colors: Record<number, string> = {
    0: "#6B7280",
    1: "#EF4444", // Urgent - red
    2: "#F59E0B", // High - amber
    3: "#3B82F6", // Medium - blue
    4: "#10B981", // Low - green
  };

  const color = colors[priority] || colors[0];

  if (priority === 0) {
    return null;
  }

  return (
    <div className="flex items-end gap-px" style={{ height: barHeight }}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          style={{
            width: barWidth,
            height: barHeight * (0.4 + i * 0.2),
            backgroundColor: i < barsCount ? color : "#3F3F46",
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}
