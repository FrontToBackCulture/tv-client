import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SolutionInstanceWithTemplate,
  InstanceData,
  TemplateTab,
} from "../../../lib/solutions/types";
import { useUpdateSolutionInstanceData, useAlignSolutionInstanceVersion } from "../../../hooks/solutions";
import { calculateProgress, getOutlets } from "./matrixHelpers";
import EntitySidebar from "./EntitySidebar";
import MatrixScopeTab from "./MatrixScopeTab";
import MatrixConnectivityTab from "./MatrixConnectivityTab";
import MatrixCollectionTab from "./MatrixCollectionTab";
import MatrixMappingTab from "./MatrixMappingTab";
import MatrixImplementationTab from "./MatrixImplementationTab";

const TAB_COLORS: Record<string, string> = {
  purple: "border-purple-500 text-purple-400",
  cyan: "border-cyan-500 text-cyan-400",
  teal: "border-teal-500 text-teal-400",
  amber: "border-amber-500 text-amber-400",
  green: "border-emerald-500 text-emerald-400",
};

interface Props {
  instance: SolutionInstanceWithTemplate;
  onBack: () => void;
}

export default function SolutionMatrixView({ instance, onBack }: Props) {
  const template = instance.template.template;
  const tabs = template.tabs || [];
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || "scope");
  const [localData, setLocalData] = useState<InstanceData>(instance.data || {});
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const updateMutation = useUpdateSolutionInstanceData();
  const alignMutation = useAlignSolutionInstanceVersion();

  const handleSyncFromDomain = async (action: "scope" | "mapping") => {
    setIsSyncing(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const [supabaseUrl, anonKey] = await invoke<[string | null, string | null]>("settings_get_supabase_credentials");
      if (!supabaseUrl || !anonKey) throw new Error("Supabase credentials not configured");
      const res = await fetch(`${supabaseUrl}/functions/v1/solution-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": anonKey },
        body: JSON.stringify({ instance_id: instance.id, action }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Sync failed (${res.status})`);
      if (result.data) setLocalData(result.data);
      window.location.reload();
    } catch (e: any) {
      console.error("Sync failed:", e);
      alert(`Sync failed: ${e.message || e}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const templateVersion = instance.template.version;
  const instanceVersion = instance.template_version;
  const hasVersionMismatch = templateVersion !== instanceVersion;

  const saveToDb = useCallback(
    (newData: InstanceData) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        const progress = calculateProgress(newData, template);
        updateMutation.mutate({
          id: instance.id, data: newData,
          totalItems: progress.total, completedItems: progress.done, progressPct: progress.progress,
        });
      }, 2000);
    },
    [instance.id, template, updateMutation]
  );

  const handleDataChange = useCallback(
    (newData: InstanceData) => { setLocalData(newData); saveToDb(newData); },
    [saveToDb]
  );

  const localDataRef = useRef(localData);
  localDataRef.current = localData;
  useEffect(() => {
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        const progress = calculateProgress(localDataRef.current, template);
        updateMutation.mutate({
          id: instance.id, data: localDataRef.current,
          totalItems: progress.total, completedItems: progress.done, progressPct: progress.progress,
        });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = calculateProgress(localData, template);
  const outlets = getOutlets(localData.scope || []);
  const outletCount = outlets.length;
  const entityCount = new Set(outlets.map((o) => o.entity)).size;
  const hasSidebar = outletCount > 0;

  // Domain subtitle
  const domainSub = selectedEntity
    ? `${instance.domain} — ${selectedEntity} (${outlets.filter((o) => o.entity === selectedEntity).length} outlets)`
    : `${instance.domain}${outletCount > 0 ? ` — ${outletCount} outlets · ${entityCount} entities` : ""}`;

  const renderTab = (tabKey: string) => {
    const commonProps = { data: localData, onChange: handleDataChange, selectedEntity };
    switch (tabKey) {
      case "scope":
        return <MatrixScopeTab {...commonProps} />;
      case "connectivity":
        return <MatrixConnectivityTab {...commonProps} template={template} />;
      case "collection":
        return <MatrixCollectionTab {...commonProps} template={template} />;
      case "mapping":
        return <MatrixMappingTab {...commonProps} />;
      case "implementation":
        return <MatrixImplementationTab {...commonProps} template={template} />;
      default:
        return <p className="text-xs text-zinc-500 py-4">Tab "{tabKey}" not implemented yet.</p>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer bg-transparent border-none">&larr; Back</button>
          <div>
            <h2 className="text-base font-bold">{instance.template.name}</h2>
            <p className="text-xs text-zinc-500">{domainSub}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {instance.id !== "preview" && (
            <>
              <button onClick={() => handleSyncFromDomain("scope")} disabled={isSyncing} className="text-[11px] font-semibold px-3 py-1.5 rounded border cursor-pointer transition-colors bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20 disabled:opacity-50">
                {isSyncing ? "..." : "Pre-populate Scope"}
              </button>
              <button onClick={() => handleSyncFromDomain("mapping")} disabled={isSyncing} className="text-[11px] font-semibold px-3 py-1.5 rounded border cursor-pointer transition-colors bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 hover:bg-teal-500/20 disabled:opacity-50">
                {isSyncing ? "..." : "Sync from Domain"}
              </button>
            </>
          )}
          <span className="text-xs font-mono text-zinc-500">{progress.done} / {progress.total} ({progress.progress}%)</span>
          {updateMutation.isPending && <span className="text-[10px] text-zinc-500">Saving...</span>}
        </div>
      </div>

      {/* Version mismatch */}
      {hasVersionMismatch && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
          <div className="text-xs text-amber-600 dark:text-amber-400">Template v{templateVersion} available — instance on v{instanceVersion}.</div>
          <button onClick={() => alignMutation.mutate({ id: instance.id, templateVersion })} disabled={alignMutation.isPending} className="text-[11px] font-semibold px-3 py-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 disabled:opacity-50 flex-shrink-0 ml-3">
            {alignMutation.isPending ? "..." : `Align to v${templateVersion}`}
          </button>
        </div>
      )}

      {/* Entity filter banner */}
      {selectedEntity && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-between">
          <div className="text-xs text-teal-700 dark:text-teal-400">Filtered to <span className="font-semibold">{selectedEntity}</span> — {outlets.filter((o) => o.entity === selectedEntity).length} outlets</div>
          <button onClick={() => setSelectedEntity(null)} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-500/20 text-teal-700 dark:text-teal-400 cursor-pointer hover:bg-teal-500/30 border-none">Clear Filter</button>
        </div>
      )}

      {/* Progress bar */}
      <div className="px-4 py-2">
        <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-blue-400 transition-[width] duration-300" style={{ width: `${progress.progress}%` }} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-zinc-200 dark:border-zinc-800 px-4">
        {tabs.map((tab: TemplateTab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`text-xs font-medium px-4 py-2.5 border-b-2 -mb-px cursor-pointer bg-transparent transition-colors ${
              activeTab === tab.key ? TAB_COLORS[tab.color] || "border-blue-500 text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content: sidebar + tab */}
      <div className="flex-1 flex overflow-hidden">
        {hasSidebar && (
          <EntitySidebar data={localData} selectedEntity={selectedEntity} onSelectEntity={setSelectedEntity} />
        )}
        <div className="flex-1 overflow-auto p-4">
          {renderTab(activeTab)}
        </div>
      </div>
    </div>
  );
}
