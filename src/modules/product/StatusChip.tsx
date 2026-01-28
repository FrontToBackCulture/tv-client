// src/modules/product/StatusChip.tsx
// Reusable status badge for product entities

import { cn } from "../../lib/cn";

const COLOR_MAP: Record<string, string> = {
  green: "bg-green-500/15 text-green-600 dark:text-green-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  yellow: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  gray: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

interface StatusChipProps {
  label: string;
  color: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusChip({ label, color, size = "sm", className }: StatusChipProps) {
  const colorClass = COLOR_MAP[color] ?? COLOR_MAP.gray;

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        colorClass,
        className,
      )}
    >
      {label}
    </span>
  );
}
