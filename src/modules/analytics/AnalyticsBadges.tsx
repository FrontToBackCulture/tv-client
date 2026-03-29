// Shared badge components for health status and trend indicators

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { HealthStatus } from "./analyticsTypes";

const HEALTH_STYLES: Record<HealthStatus, { dot: string; bg: string; text: string; label: string }> = {
  active: { dot: "bg-green-500", bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-300", label: "Active" },
  declining: { dot: "bg-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-900/20", text: "text-yellow-700 dark:text-yellow-300", label: "Declining" },
  stale: { dot: "bg-orange-500", bg: "bg-orange-50 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-300", label: "Stale" },
  dead: { dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", label: "Dead" },
  unused: { dot: "bg-zinc-400", bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500", label: "Unused" },
};

export function HealthBadge({ score, status }: { score: number; status: HealthStatus }) {
  const s = HEALTH_STYLES[status];
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      <span>{score}</span>
      <span className="opacity-70">{s.label}</span>
    </div>
  );
}

export function TrendBadge({ trend }: { trend: number }) {
  if (trend > 10) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
        <TrendingUp size={12} />
        +{trend}%
      </span>
    );
  }
  if (trend < -10) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-500">
        <TrendingDown size={12} />
        {trend}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-zinc-400">
      <Minus size={12} />
      {trend > 0 ? "+" : ""}{trend}%
    </span>
  );
}
