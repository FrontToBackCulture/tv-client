import { cn } from "../../lib/cn";

type BadgeColor =
  | "zinc"
  | "teal"
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "purple"
  | "yellow";

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  className?: string;
}

const colorStyles: Record<BadgeColor, string> = {
  zinc: "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
  teal: "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400",
  blue: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400",
  green: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400",
  red: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400",
  orange: "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400",
  purple: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400",
  yellow: "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400",
};

export function Badge({ children, color = "zinc", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-xs font-medium",
        colorStyles[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
