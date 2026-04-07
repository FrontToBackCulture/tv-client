// Domain Dependencies Tab — dependency graph explorer

import { RefreshCw, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useValDependencies, useRecomputeDependencies, depKeys } from "@/hooks/val-sync/useValDependencies";
import { useValSyncAll } from "@/hooks/val-sync";
import { DepsGraphView } from "./deps/DepsGraphView";

interface Props {
  domainName: string;
}

export function DomainDependenciesTab({ domainName }: Props) {
  const { data: report, isLoading, error } = useValDependencies(domainName);
  const qc = useQueryClient();
  const recompute = useRecomputeDependencies();
  const syncAll = useValSyncAll();

  // After sync completes, refetch dependencies
  const handleSyncAll = () => {
    syncAll.mutate(domainName, {
      onSuccess: () => qc.invalidateQueries({ queryKey: depKeys.report(domainName) }),
    });
  };

  const isBusy = recompute.isPending || syncAll.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        Loading dependency graph...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-zinc-500">
          No dependency data found for this domain.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => recompute.mutate(domainName)}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md border border-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={recompute.isPending ? "animate-spin" : ""} />
            {recompute.isPending ? "Computing..." : "Compute from existing data"}
          </button>
          <button
            onClick={handleSyncAll}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-900 hover:bg-teal-800 text-teal-200 rounded-md border border-teal-700 transition-colors disabled:opacity-50"
          >
            <Download size={12} className={syncAll.isPending ? "animate-spin" : ""} />
            {syncAll.isPending ? "Syncing..." : "Sync & Compute"}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 max-w-xs text-center">
          "Compute" uses existing synced data. "Sync & Compute" fetches fresh data from VAL first.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <DepsGraphView
        report={report}
        onRefresh={() => recompute.mutate(domainName)}
        isRefreshing={recompute.isPending}
      />
    </div>
  );
}
