// src/modules/product/SolutionCardView.tsx
// Solution cards showing feature/connector/deployment counts

import { useProductSolutions } from "../../hooks/useProduct";
import { SOLUTION_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { Loader2, Package } from "lucide-react";
import { cn } from "../../lib/cn";

interface SolutionCardViewProps {
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SolutionCardView({ search, selectedId, onSelect }: SolutionCardViewProps) {
  const { data: solutions, isLoading, error } = useProductSolutions(
    search ? { search } : undefined
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Package size={32} className="mb-2 opacity-50 text-red-400" />
        <p className="text-sm font-medium text-red-500">Failed to load solutions</p>
        <p className="text-xs text-zinc-400 mt-1 max-w-xs text-center">{String(error)}</p>
      </div>
    );
  }

  const all = solutions ?? [];

  if (all.length === 0) {
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
        {all.map((solution) => {
          const statusDef = SOLUTION_STATUSES.find((s) => s.value === solution.status);

          return (
            <button
              key={solution.id}
              onClick={() => onSelect(solution.id)}
              className={cn(
                "text-left p-4 rounded-lg border transition-colors",
                solution.id === selectedId
                  ? "border-teal-500 bg-teal-500/5 dark:bg-teal-500/10"
                  : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {solution.name}
                </span>
                {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
              </div>
              {solution.description && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2">
                  {solution.description}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                {solution.target_industry && (
                  <span>Industry: {solution.target_industry}</span>
                )}
                {solution.roi_summary && (
                  <span className="truncate">ROI: {solution.roi_summary}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
