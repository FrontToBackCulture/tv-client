// src/modules/product/DeploymentDetailPanel.tsx
// Detail panel — tabs: Overview (domain + company link), Connectors (enabled), Solutions (enabled)

import { useState } from "react";
import { useProductDeploymentWithRelations } from "../../hooks/product";
import { DEPLOYMENT_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { X, Loader2, Building2, FileText, ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";

interface DeploymentDetailPanelProps {
  id: string;
  onClose: () => void;
}

type Tab = "overview" | "connectors" | "solutions";

export function DeploymentDetailPanel({ id, onClose }: DeploymentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data, isLoading } = useProductDeploymentWithRelations(id);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Deployment not found
      </div>
    );
  }

  const statusDef = DEPLOYMENT_STATUSES.find((s) => s.value === data.status);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "connectors", label: "Connectors", count: data.connectorCount },
    { id: "solutions", label: "Solutions", count: data.solutionCount },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 font-mono">{data.domain_id}</h2>
          <div className="flex items-center gap-2 mt-1">
            {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-zinc-200 dark:border-zinc-800 flex gap-4">
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

            {/* Company link */}
            {data.company && (
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Company</label>
                <div className="mt-1 p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                  <Building2 size={14} className="text-zinc-400" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {data.company.display_name || data.company.name}
                  </span>
                  <ExternalLink size={12} className="text-zinc-400 ml-auto" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Go Live Date</label>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {data.go_live_date
                    ? new Date(data.go_live_date).toLocaleDateString()
                    : "Not set"}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</label>
                <p className="mt-1">
                  {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} size="md" />}
                </p>
              </div>
            </div>

            {data.domain_path && (
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Domain Path</label>
                <p className="mt-1 text-sm text-zinc-500 flex items-center gap-1">
                  <FileText size={14} />
                  {data.domain_path}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "connectors" && (
          <div className="space-y-2">
            {(data.connectors ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No connectors enabled</p>
            ) : (
              data.connectors?.map((dc) => (
                <div key={dc.id} className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {dc.connector?.name ?? dc.connector_id}
                  </span>
                  <div className="flex items-center gap-2">
                    {dc.enabled_date && (
                      <span className="text-xs text-zinc-400">
                        {new Date(dc.enabled_date).toLocaleDateString()}
                      </span>
                    )}
                    <StatusChip
                      label={dc.status}
                      color={dc.status === "active" ? "green" : dc.status === "trial" ? "blue" : "gray"}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "solutions" && (
          <div className="space-y-2">
            {(data.solutions ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No solutions enabled</p>
            ) : (
              data.solutions?.map((ds) => (
                <div key={ds.id} className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {ds.solution?.name ?? ds.solution_id}
                  </span>
                  <div className="flex items-center gap-2">
                    {ds.enabled_date && (
                      <span className="text-xs text-zinc-400">
                        {new Date(ds.enabled_date).toLocaleDateString()}
                      </span>
                    )}
                    <StatusChip
                      label={ds.status}
                      color={ds.status === "active" ? "green" : ds.status === "trial" ? "blue" : "gray"}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
