// src/modules/product/ConnectorDetailPanel.tsx
// Detail panel — tabs: Overview, Features, Deployments, Activity

import { useState } from "react";
import { useProductConnectorWithRelations } from "../../hooks/product";
import { CONNECTOR_TYPES, CONNECTOR_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { ProductActivityTimeline } from "./ProductActivityTimeline";
import { X, Loader2, FileText } from "lucide-react";
import { cn } from "../../lib/cn";

interface ConnectorDetailPanelProps {
  id: string;
  onClose: () => void;
}

type Tab = "overview" | "features" | "deployments" | "activity";

export function ConnectorDetailPanel({ id, onClose }: ConnectorDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data, isLoading } = useProductConnectorWithRelations(id);

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
        Connector not found
      </div>
    );
  }

  const typeDef = CONNECTOR_TYPES.find((t) => t.value === data.connector_type);
  const statusDef = CONNECTOR_STATUSES.find((s) => s.value === data.status);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "features", label: "Features", count: data.features?.length },
    { id: "deployments", label: "Deployments", count: data.deploymentCount },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{data.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
            {typeDef && <StatusChip label={typeDef.label} color={typeDef.color} />}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Platform Category</label>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{data.platform_category}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Type</label>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{typeDef?.label ?? data.connector_type}</p>
              </div>
              {data.region && (
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Region</label>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{data.region}</p>
                </div>
              )}
            </div>
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
          <div className="space-y-2">
            {(data.features ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No features linked</p>
            ) : (
              data.features?.map((f) => (
                <div key={f.id} className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{f.name}</span>
                  <StatusChip
                    label={f.status}
                    color={f.status === "ga" ? "green" : f.status === "beta" ? "blue" : f.status === "alpha" ? "orange" : f.status === "deprecated" ? "red" : "gray"}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "deployments" && (
          <div className="space-y-2">
            {(data.deployments ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No deployments using this connector</p>
            ) : (
              data.deployments?.map((d) => (
                <div key={d.id} className="p-2 rounded border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
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

        {activeTab === "activity" && (
          <ProductActivityTimeline entityType="connector" entityId={id} />
        )}
      </div>
    </div>
  );
}
