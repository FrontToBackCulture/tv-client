// src/modules/product/ReleaseListView.tsx
// Release timeline/list ordered by date

import { useProductReleases } from "../../hooks/useProduct";
import { RELEASE_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { Loader2, Rocket } from "lucide-react";
import { cn } from "../../lib/cn";

interface ReleaseListViewProps {
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ReleaseListView({ search, selectedId, onSelect }: ReleaseListViewProps) {
  const { data: releases, isLoading } = useProductReleases(
    search ? { search } : undefined
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  const all = releases ?? [];

  if (all.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Rocket size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No releases found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {all.map((release) => {
        const statusDef = RELEASE_STATUSES.find((s) => s.value === release.status);

        return (
          <button
            key={release.id}
            onClick={() => onSelect(release.id)}
            className={cn(
              "w-full flex items-center px-4 py-3 text-left border-b border-slate-100 dark:border-zinc-800/50 transition-colors",
              release.id === selectedId
                ? "bg-teal-500/5 dark:bg-teal-500/10"
                : "hover:bg-slate-50 dark:hover:bg-zinc-900/50"
            )}
          >
            {/* Timeline dot */}
            <div className="mr-3 flex flex-col items-center">
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  release.status === "released"
                    ? "bg-green-500"
                    : release.status === "in_progress"
                    ? "bg-blue-500"
                    : "bg-zinc-400"
                )}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 font-mono">
                  v{release.version}
                </span>
                {release.name && (
                  <span className="text-sm text-zinc-500 truncate">{release.name}</span>
                )}
              </div>
              {release.description && (
                <p className="text-xs text-zinc-400 mt-0.5 truncate">{release.description}</p>
              )}
            </div>

            <div className="flex items-center gap-2 ml-2">
              {release.release_date && (
                <span className="text-xs text-zinc-400 whitespace-nowrap">
                  {new Date(release.release_date).toLocaleDateString()}
                </span>
              )}
              {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
