// src/modules/product/FeatureDetailPanel.tsx
// Detail panel for a selected feature — tabs: Overview, Connectors, Solutions, Releases, Activity

import { useState, useMemo } from "react";
import { useProductFeatureWithRelations } from "../../hooks/useProduct";
import { useReadFile } from "../../hooks/useFiles";
import { useRepository } from "../../stores/repositoryStore";
import { FEATURE_STATUSES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { ProductActivityTimeline } from "./ProductActivityTimeline";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

interface FeatureDetailPanelProps {
  id: string;
  onClose: () => void;
}

type Tab = "overview" | "connectors" | "solutions" | "activity";

export function FeatureDetailPanel({ id }: FeatureDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data, isLoading } = useProductFeatureWithRelations(id);
  const { activeRepository } = useRepository();

  // Build full path from doc_path + repo base
  const docFullPath = useMemo(() => {
    if (!data?.doc_path || !activeRepository?.path) return undefined;
    return `${activeRepository.path}/${data.doc_path}`;
  }, [data?.doc_path, activeRepository?.path]);

  // Base directory for resolving relative media paths
  const docBasePath = useMemo(() => {
    if (!docFullPath) return undefined;
    return docFullPath.substring(0, docFullPath.lastIndexOf("/"));
  }, [docFullPath]);

  const { data: docContent, isLoading: docLoading } = useReadFile(docFullPath);

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
        Feature not found
      </div>
    );
  }

  const statusDef = FEATURE_STATUSES.find((s) => s.value === data.status);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "connectors", label: "Connectors", count: data.connectors?.length },
    { id: "solutions", label: "Solutions", count: data.solutions?.length },
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
            {data.module && (
              <span className="text-xs text-zinc-400">{data.module.name}</span>
            )}
          </div>
        </div>
        {/* No close button — sidebar handles navigation */}
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
      <div className="flex-1 overflow-auto p-6 min-w-0">
        {activeTab === "overview" && (
          <div className="w-full">
            {docContent ? (
              <MarkdownViewer content={docContent} basePath={docBasePath} />
            ) : docLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="text-zinc-400 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {data.description && (
                  <div>
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Description</label>
                    <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{data.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {data.category && (
                    <div>
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Category</label>
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{data.category}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Priority</label>
                    <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{data.priority}</p>
                  </div>
                </div>
                {!data.doc_path && (
                  <p className="text-sm text-zinc-400 italic">No documentation yet. Add a guide.md to the feature folder.</p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "connectors" && (
          <div className="space-y-2">
            {(data.connectors ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No connectors linked</p>
            ) : (
              data.connectors?.map((c) => (
                <div key={c.id} className="p-2 rounded border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{c.name}</span>
                  <StatusChip label={c.connector_type} color="blue" />
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "solutions" && (
          <div className="space-y-2">
            {(data.solutions ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No solutions using this feature</p>
            ) : (
              data.solutions?.map((s) => (
                <div key={s.id} className="p-2 rounded border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{s.name}</span>
                  <StatusChip
                    label={s.status}
                    color={s.status === "active" ? "green" : s.status === "draft" ? "gray" : "red"}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <ProductActivityTimeline entityType="feature" entityId={id} />
        )}
      </div>
    </div>
  );
}
