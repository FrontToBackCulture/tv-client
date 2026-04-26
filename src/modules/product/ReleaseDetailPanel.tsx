// src/modules/product/ReleaseDetailPanel.tsx
// Detail panel — tabs: Overview, Items (grouped by type)

import { useState } from "react";
import { useProductReleaseWithRelations } from "../../hooks/product";
import { RELEASE_STATUSES, RELEASE_ITEM_TYPES } from "../../lib/product/types";
import { StatusChip } from "./StatusChip";
import { X, FileText } from "lucide-react";
import { IconButton } from "../../components/ui";
import { DetailLoading, DetailNotFound } from "../../components/ui/DetailStates";
import { cn } from "../../lib/cn";

interface ReleaseDetailPanelProps {
  id: string;
  onClose: () => void;
}

type Tab = "overview" | "items";

export function ReleaseDetailPanel({ id, onClose }: ReleaseDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data, isLoading } = useProductReleaseWithRelations(id);

  if (isLoading) return <DetailLoading />;

  if (!data) return <DetailNotFound message="Release not found" />;

  const statusDef = RELEASE_STATUSES.find((s) => s.value === data.status);
  const items = data.items ?? [];
  const totalItems = items.length;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "items", label: "Items", count: totalItems },
  ];

  // Group items by type
  const groupedItems = RELEASE_ITEM_TYPES.map((type) => ({
    ...type,
    items: items.filter((i) => i.type === type.value),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
            v{data.version}
            {data.name && <span className="font-normal text-zinc-500 ml-2">{data.name}</span>}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            {statusDef && <StatusChip label={statusDef.label} color={statusDef.color} />}
            {data.release_date && (
              <span className="text-xs text-zinc-400">
                {new Date(data.release_date).toLocaleDateString()}
              </span>
            )}
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
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Features", value: data.featureCount ?? 0 },
                { label: "Bug Fixes", value: data.bugfixCount ?? 0 },
                { label: "Connectors", value: data.connectorCount ?? 0 },
                { label: "Improvements", value: data.improvementCount ?? 0 },
              ].map((stat) => (
                <div key={stat.label} className="rounded-md bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 px-3 py-2 text-center">
                  <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{stat.value}</div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">{stat.label}</div>
                </div>
              ))}
            </div>
            {data.notion_sync_path && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Notion Sync</h3>
                <p className="text-sm text-zinc-500 flex items-center gap-1">
                  <FileText size={12} />
                  {data.notion_sync_path}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "items" && (
          <div className="space-y-4">
            {groupedItems.length === 0 ? (
              <p className="text-sm text-zinc-500">No items in this release</p>
            ) : (
              groupedItems.map((group) => (
                <div key={group.value}>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <StatusChip label={group.label} color={group.color} />
                    <span>({group.items.length})</span>
                  </h4>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <div key={item.id} className="p-2 rounded border border-zinc-200 dark:border-zinc-800">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.title}</span>
                        {item.description && (
                          <p className="text-xs text-zinc-400 mt-0.5">{item.description}</p>
                        )}
                      </div>
                    ))}
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
