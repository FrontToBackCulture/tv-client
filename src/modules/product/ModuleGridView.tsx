// src/modules/product/ModuleGridView.tsx
// Card grid showing modules grouped by layer

import { useProductModules } from "../../hooks/product";
import { MODULE_LAYERS, MODULE_STATUSES } from "../../lib/product/types";
import type { ProductModule } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { Loader2, Boxes } from "lucide-react";
import { cn } from "../../lib/cn";

interface ModuleGridViewProps {
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ModuleGridView({ search, selectedId, onSelect }: ModuleGridViewProps) {
  const { data: modules, isLoading } = useProductModules(
    search ? { search } : undefined
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  const allModules = modules ?? [];

  // Group by layer
  const grouped = MODULE_LAYERS.map((layer) => ({
    ...layer,
    modules: allModules.filter((m) => m.layer === layer.value),
  }));

  if (allModules.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Boxes size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No modules found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6">
      {grouped.map((group) => {
        if (group.modules.length === 0) return null;
        return (
          <div key={group.value}>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              {group.label} Layer
              <span className="ml-2 text-zinc-400">({group.modules.length})</span>
            </h3>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {group.modules.map((mod) => (
                <ModuleCard
                  key={mod.id}
                  module={mod}
                  isSelected={mod.id === selectedId}
                  onClick={() => onSelect(mod.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModuleCard({
  module: mod,
  isSelected,
  onClick,
}: {
  module: ProductModule;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusDef = MODULE_STATUSES.find((s) => s.value === mod.status);
  const layerDef = MODULE_LAYERS.find((l) => l.value === mod.layer);

  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left p-3 rounded-lg border transition-colors",
        isSelected
          ? "border-teal-500 bg-teal-500/5 dark:bg-teal-500/10"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {mod.name}
        </span>
        {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
      </div>
      {mod.description && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2">
          {mod.description}
        </p>
      )}
      {layerDef && (
        <StatusChip label={layerDef.label} color={layerDef.color} />
      )}
    </button>
  );
}
