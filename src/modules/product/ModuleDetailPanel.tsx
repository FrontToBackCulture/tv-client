// src/modules/product/ModuleDetailPanel.tsx
// Detail panel for a selected module — tabs: Overview, Features, Activity

import { useState } from "react";
import { useProductModuleWithRelations } from "../../hooks/useProduct";
import { MODULE_LAYERS, MODULE_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { ProductActivityTimeline } from "./ProductActivityTimeline";
import { X, Loader2, FileText } from "lucide-react";
import { cn } from "../../lib/cn";

interface ModuleDetailPanelProps {
  id: string;
  onClose: () => void;
}

type Tab = "overview" | "features" | "activity";

export function ModuleDetailPanel({ id, onClose }: ModuleDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data, isLoading } = useProductModuleWithRelations(id);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Module not found
      </div>
    );
  }

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
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{data.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
            {layerDef && <StatusChip label={layerDef.label} color={layerDef.color} />}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Slug</label>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 font-mono">{data.slug}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Layer</label>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 capitalize">{data.layer}</p>
              </div>
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
              <p className="text-sm text-zinc-500">No features linked to this module</p>
            ) : (
              data.features?.map((f) => (
                <div key={f.id} className="p-2 rounded border border-slate-200 dark:border-zinc-800">
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
