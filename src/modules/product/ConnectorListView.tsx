// src/modules/product/ConnectorListView.tsx
// Filterable connector table with category chips, type, status, search

import { useProductConnectors } from "../../hooks/product";
import { CONNECTOR_TYPES, CONNECTOR_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { Loader2, Plug } from "lucide-react";
import { cn } from "../../lib/cn";

interface ConnectorListViewProps {
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConnectorListView({ search, selectedId, onSelect }: ConnectorListViewProps) {
  const { data: connectors, isLoading } = useProductConnectors(
    search ? { search } : undefined
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  const all = connectors ?? [];

  if (all.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Plug size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No connectors found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Table header */}
      <div className="flex items-center px-4 py-2 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
        <span className="flex-1">Name</span>
        <span className="w-28 text-center">Category</span>
        <span className="w-28 text-center">Type</span>
        <span className="w-24 text-center">Status</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto">
        {all.map((connector) => {
          const typeDef = CONNECTOR_TYPES.find((t) => t.value === connector.connector_type);
          const statusDef = CONNECTOR_STATUSES.find((s) => s.value === connector.status);

          return (
            <button
              key={connector.id}
              onClick={() => onSelect(connector.id)}
              className={cn(
                "w-full flex items-center px-4 py-2.5 text-left border-b border-zinc-100 dark:border-zinc-800/50 transition-colors",
                connector.id === selectedId
                  ? "bg-teal-500/5 dark:bg-teal-500/10"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              )}
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm text-zinc-700 dark:text-zinc-300 block truncate">
                  {connector.name}
                </span>
              </div>
              <span className="w-28 text-center">
                <StatusChip label={connector.platform_category} color="gray" />
              </span>
              <span className="w-28 text-center">
                {typeDef && <StatusChip label={typeDef.label} color={typeDef.color} />}
              </span>
              <span className="w-24 text-center">
                {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
