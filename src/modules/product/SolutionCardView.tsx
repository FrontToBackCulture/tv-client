// src/modules/product/SolutionCardView.tsx
// Solution cards — file-based, receives parsed solution data as props

import { Loader2, Package } from "lucide-react";
import { StatusChip } from "./StatusChip";
import { cn } from "../../lib/cn";
import type { SolutionInfo } from "./SolutionsTabView";

interface SolutionCardViewProps {
  solutions: SolutionInfo[];
  isLoading: boolean;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}

export function SolutionCardView({ solutions, isLoading, selectedSlug, onSelect }: SolutionCardViewProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (solutions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Package size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No solutions found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {solutions.map((solution) => (
          <button
            key={solution.slug}
            onClick={() => onSelect(solution.slug)}
            className={cn(
              "text-left p-4 rounded-lg border transition-colors",
              solution.slug === selectedSlug
                ? "border-teal-500 bg-teal-500/5 dark:bg-teal-500/10"
                : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700"
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {solution.title}
              </span>
              <StatusChip
                label={solution.status === "published" ? "Published" : "Draft"}
                color={solution.status === "published" ? "green" : "yellow"}
              />
            </div>
            {solution.summary && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                {solution.summary}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
