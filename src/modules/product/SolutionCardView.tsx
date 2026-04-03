// src/modules/product/SolutionCardView.tsx
// Solution cards — file-based, receives parsed solution data as props

import { Package } from "lucide-react";
import { DetailLoading } from "../../components/ui/DetailStates";
import { EmptyState } from "../../components/EmptyState";
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
  if (isLoading) return <DetailLoading />;

  if (solutions.length === 0) {
    return <EmptyState icon={Package} message="No solutions found" className="flex-1" />;
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
                : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-200 dark:hover:border-zinc-700"
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
