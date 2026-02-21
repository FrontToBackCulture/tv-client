import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon: Icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4", className)}>
      {Icon && <Icon size={24} className="text-zinc-300 dark:text-zinc-600 mb-3" />}
      {title && (
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{title}</p>
      )}
      {message && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
