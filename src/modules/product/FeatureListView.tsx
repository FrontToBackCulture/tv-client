// src/modules/product/FeatureListView.tsx
// Features grouped by module with collapsible sections

import { useState } from "react";
import { useProductFeatures, useProductModules } from "../../hooks/product";
import { FEATURE_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { Loader2, Star, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

interface FeatureListViewProps {
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function FeatureListView({ search, selectedId, onSelect }: FeatureListViewProps) {
  const { data: features, isLoading: featuresLoading } = useProductFeatures(
    search ? { search } : undefined
  );
  const { data: modules, isLoading: modulesLoading } = useProductModules();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const isLoading = featuresLoading || modulesLoading;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  const allFeatures = features ?? [];
  const allModules = modules ?? [];

  if (allFeatures.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Star size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No features found</p>
      </div>
    );
  }

  // Group features by module
  const grouped = allModules
    .map((mod) => ({
      module: mod,
      features: allFeatures.filter((f) => f.module_id === mod.id),
    }))
    .filter((g) => g.features.length > 0);

  // Features without a module match (orphaned)
  const moduleIds = new Set(allModules.map((m) => m.id));
  const orphaned = allFeatures.filter((f) => !moduleIds.has(f.module_id));

  const toggleCollapse = (moduleId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  return (
    <div className="flex-1 overflow-auto">
      {grouped.map((group) => {
        const isCollapsed = collapsed.has(group.module.id);
        return (
          <div key={group.module.id}>
            <button
              onClick={() => toggleCollapse(group.module.id)}
              className="w-full flex items-center gap-2 px-4 py-2 text-left bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              {isCollapsed ? <ChevronRight size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                {group.module.name}
              </span>
              <span className="text-xs text-zinc-400 ml-1">({group.features.length})</span>
            </button>
            {!isCollapsed && group.features.map((feature) => {
              const statusDef = FEATURE_STATUSES.find((s) => s.value === feature.status);
              return (
                <button
                  key={feature.id}
                  onClick={() => onSelect(feature.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-zinc-100 dark:border-zinc-800/50 transition-colors",
                    feature.id === selectedId
                      ? "bg-teal-500/5 dark:bg-teal-500/10"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300 block truncate">
                      {feature.name}
                    </span>
                    {feature.category && (
                      <span className="text-xs text-zinc-400">{feature.category}</span>
                    )}
                  </div>
                  {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
                </button>
              );
            })}
          </div>
        );
      })}
      {orphaned.length > 0 && (
        <div>
          <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Unassigned ({orphaned.length})
            </span>
          </div>
          {orphaned.map((feature) => {
            const statusDef = FEATURE_STATUSES.find((s) => s.value === feature.status);
            return (
              <button
                key={feature.id}
                onClick={() => onSelect(feature.id)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-zinc-100 dark:border-zinc-800/50 transition-colors",
                  feature.id === selectedId
                    ? "bg-teal-500/5 dark:bg-teal-500/10"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                )}
              >
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                  {feature.name}
                </span>
                {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
