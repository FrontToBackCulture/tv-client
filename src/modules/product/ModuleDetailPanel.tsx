// src/modules/product/ModuleDetailPanel.tsx
// Detail panel for a selected module — tabs: Overview, Features, Activity

import { useState } from "react";
import { useProductModuleWithRelations } from "../../hooks/product";
import { MODULE_LAYERS, MODULE_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { ProductActivityTimeline } from "./ProductActivityTimeline";
import { X, FileText } from "lucide-react";
import { IconButton } from "../../components/ui";
import { DetailLoading, DetailNotFound } from "../../components/ui/DetailStates";
import { cn } from "../../lib/cn";

interface ModuleDetailPanelProps {
  id: string;
  onClose: () => void;
}

type Tab = "overview" | "features" | "activity";

export function ModuleDetailPanel({ id, onClose }: ModuleDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data, isLoading } = useProductModuleWithRelations(id);

  if (isLoading) return <DetailLoading />;

  if (!data) return <DetailNotFound message="Module not found" />;

  const statusDef = MODULE_STATUSES.find((s) => s.value === data.status);
  const layerDef = MODULE_LAYERS.find((l) => l.value === data.layer);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "features", label: "Features", count: data.featureCount },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">{data.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
            {layerDef && <StatusChip label={layerDef.label} color={layerDef.color} />}
          </div>
        </div>
        <IconButton onClick={onClose} icon={X} label="Close" />
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
          <div className="space-y-6">
            {data.description && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Description</h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{data.description}</p>
              </div>
            )}
            <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Slug</span>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 font-mono">{data.slug}</p>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Layer</span>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 capitalize">{data.layer}</p>
                </div>
              </div>
              {data.doc_path && (
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Documentation</span>
                  <p className="mt-1 text-sm text-zinc-500 flex items-center gap-1">
                    <FileText size={12} />
                    {data.doc_path}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "features" && (
          <div className="space-y-2">
            {(data.features ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No features linked to this module</p>
            ) : (
              data.features?.map((f) => (
                <div key={f.id} className="p-2 rounded border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{f.name}</span>
                    <StatusChip
                      label={f.status}
                      color={
                        f.status === "ga" ? "green" :
                        f.status === "beta" ? "blue" :
                        f.status === "alpha" ? "orange" :
                        f.status === "deprecated" ? "red" : "gray"
                      }
                    />
                  </div>
                  {f.category && (
                    <span className="text-xs text-zinc-400 mt-1">{f.category}</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <ProductActivityTimeline entityType="module" entityId={id} />
        )}
      </div>
    </div>
  );
}
