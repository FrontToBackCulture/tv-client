import type { ReactNode } from "react";

export type StatItem = {
  value: number;
  label: ReactNode;
  color?: "emerald" | "red" | "blue" | "amber" | "zinc" | "purple";
};

const colorClass: Record<NonNullable<StatItem["color"]>, string> = {
  emerald: "text-emerald-500",
  red: "text-red-500",
  blue: "text-blue-500",
  amber: "text-amber-500",
  zinc: "text-zinc-300",
  purple: "text-purple-500",
};

export function StatsStrip({ stats, right }: { stats: StatItem[]; right?: ReactNode }) {
  return (
    <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
      {stats.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${colorClass[s.color ?? "zinc"]}`}>{s.value}</span>
          <span className="text-[10px] text-zinc-400 leading-tight">{s.label}</span>
        </div>
      ))}
      {right && (
        <>
          <div className="flex-1" />
          {right}
        </>
      )}
    </div>
  );
}
