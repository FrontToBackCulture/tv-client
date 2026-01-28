// src/modules/product/SolutionDetailPanel.tsx
// Detail panel — tabs: Overview, Features (core/optional), Connectors (required/optional), Deployments

import { useState } from "react";
import { useProductSolutionWithRelations } from "../../hooks/useProduct";
import { SOLUTION_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { X, Loader2, FileText } from "lucide-react";
import { cn } from "../../lib/cn";

interface SolutionDetailPanelProps {
  id: string;
  onClose: () => void;
}

type Tab = "overview" | "features" | "connectors" | "deployments";

export function SolutionDetailPanel({ id, onClose }: SolutionDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data, isLoading, error } = useProductSolutionWithRelations(id);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm p-4">
        <p className="text-red-500 font-medium">Error loading solution</p>
        <p className="text-xs text-zinc-400 mt-1">{String(error)}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Solution not found
      </div>
    );
  }

  const statusDef = SOLUTION_STATUSES.find((s) => s.value === data.status);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "features", label: "Features", count: data.featureCount },
    { id: "connectors", label: "Connectors", count: data.connectorCount },
    { id: "deployments", label: "Deployments", count: data.deploymentCount },
  ];

  const coreFeatures = (data.features ?? []).filter((f) => f.is_core);
  const optionalFeatures = (data.features ?? []).filter((f) => !f.is_core);
  const requiredConnectors = (data.connectors ?? []).filter((c) => c.is_required);
  const optionalConnectors = (data.connectors ?? []).filter((c) => !c.is_required);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{data.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
            {data.target_industry && (
              <span className="text-xs text-zinc-400">{data.target_industry}</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-slate-200 dark:border-zinc-800 flex gap-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "py-2 text-sm border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-teal-500 text-teal-600 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs text-zinc-400">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {data.description && (
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Description</label>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{data.description}</p>
              </div>
            )}
            {data.roi_summary && (
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">ROI Summary</label>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{data.roi_summary}</p>
              </div>
            )}
            {data.doc_path && (
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Documentation</label>
                <p className="mt-1 text-sm text-zinc-500 flex items-center gap-1">
                  <FileText size={14} />
                  {data.doc_path}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "features" && (
          <div className="space-y-4">
            {coreFeatures.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Core Features</h4>
                <div className="space-y-1">
                  {coreFeatures.map((f) => (
                    <div key={f.id} className="p-2 rounded border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{f.feature?.name ?? f.feature_id}</span>
                      <StatusChip label="Core" color="green" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {optionalFeatures.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Optional Features</h4>
                <div className="space-y-1">
                  {optionalFeatures.map((f) => (
                    <div key={f.id} className="p-2 rounded border border-slate-200 dark:border-zinc-800">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{f.feature?.name ?? f.feature_id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {coreFeatures.length === 0 && optionalFeatures.length === 0 && (
              <p className="text-sm text-zinc-500">No features linked</p>
            )}
          </div>
        )}

        {activeTab === "connectors" && (
          <div className="space-y-4">
            {requiredConnectors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Required</h4>
                <div className="space-y-1">
                  {requiredConnectors.map((c) => (
                    <div key={c.id} className="p-2 rounded border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{c.connector?.name ?? c.connector_id}</span>
                      <StatusChip label="Required" color="red" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {optionalConnectors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Optional</h4>
                <div className="space-y-1">
                  {optionalConnectors.map((c) => (
                    <div key={c.id} className="p-2 rounded border border-slate-200 dark:border-zinc-800">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{c.connector?.name ?? c.connector_id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {requiredConnectors.length === 0 && optionalConnectors.length === 0 && (
              <p className="text-sm text-zinc-500">No connectors linked</p>
            )}
          </div>
        )}

        {activeTab === "deployments" && (
          <div className="space-y-2">
            {(data.deployments ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No deployments using this solution</p>
            ) : (
              data.deployments?.map((d) => (
                <div key={d.id} className="p-2 rounded border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 font-mono">{d.domain_id}</span>
                  <StatusChip
                    label={d.status}
                    color={d.status === "active" ? "green" : d.status === "trial" ? "blue" : "gray"}
                  />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
