// src/modules/product/DeploymentListView.tsx
// Deployment table with domain, company link, status, counts

import { useProductDeployments } from "../../hooks/useProduct";
import { DEPLOYMENT_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { Loader2, Globe } from "lucide-react";
import { cn } from "../../lib/cn";

interface DeploymentListViewProps {
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DeploymentListView({ search, selectedId, onSelect }: DeploymentListViewProps) {
  const { data: deployments, isLoading } = useProductDeployments(
    search ? { search } : undefined
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  const all = deployments ?? [];

  if (all.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
        <Globe size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No deployments found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Table header */}
      <div className="flex items-center px-4 py-2 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
        <span className="flex-1">Domain</span>
        <span className="w-32 text-center">Go Live</span>
        <span className="w-24 text-center">Status</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto">
        {all.map((deployment) => {
          const statusDef = DEPLOYMENT_STATUSES.find((s) => s.value === deployment.status);

          return (
            <button
              key={deployment.id}
              onClick={() => onSelect(deployment.id)}
              className={cn(
                "w-full flex items-center px-4 py-2.5 text-left border-b border-slate-100 dark:border-zinc-800/50 transition-colors",
                deployment.id === selectedId
                  ? "bg-teal-500/5 dark:bg-teal-500/10"
                  : "hover:bg-slate-50 dark:hover:bg-zinc-900/50"
              )}
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 font-mono block truncate">
                  {deployment.domain_id}
                </span>
                {deployment.description && (
                  <span className="text-xs text-zinc-400 block truncate">{deployment.description}</span>
                )}
              </div>
              <span className="w-32 text-center text-xs text-zinc-400">
                {deployment.go_live_date
                  ? new Date(deployment.go_live_date).toLocaleDateString()
                  : "-"}
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
