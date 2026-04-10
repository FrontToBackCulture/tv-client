import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SolutionInstanceWithTemplate,
  InstanceData,
  TemplateTab,
} from "../../../lib/solutions/types";
import { useUpdateSolutionInstanceData, useAlignSolutionInstanceVersion, useUpdateSolutionTemplate } from "../../../hooks/solutions";
import { calculateProgress, getOutlets } from "./matrixHelpers";
import { downloadScopeTemplate, parseScopeSpreadsheet } from "./scopeSpreadsheet";
import EntitySidebar from "./EntitySidebar";
import MatrixScopeTab from "./MatrixScopeTab";
import MatrixAPScopeTab from "./MatrixAPScopeTab";
import MatrixConnectivityTab from "./MatrixConnectivityTab";
import MatrixCollectionTab from "./MatrixCollectionTab";
import MatrixAPCollectionTab from "./MatrixAPCollectionTab";
import MatrixMappingTab from "./MatrixMappingTab";
import MatrixAPMappingTab from "./MatrixAPMappingTab";
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
  const [uploadPreview, setUploadPreview] = useState<{
    scope: InstanceData["scope"];
    paymentMethods: InstanceData["paymentMethods"];
    banks: InstanceData["banks"];
    periods: InstanceData["periods"];
    warnings: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const updateMutation = useUpdateSolutionInstanceData();
  const alignMutation = useAlignSolutionInstanceVersion();
  const updateTemplateMutation = useUpdateSolutionTemplate();

  // Table roles for stub system creation
  const TABLE_ROLES_BY_TYPE: Record<string, string[]> = {
    POS: ["statementSource", "outletMap", "platformMap"],
    "Platform Delivery": ["statementSource", "outletMap", "platformMap"],
    "Platform In Store Payment": ["statementSource", "outletMap", "platformMap"],
    Bank: ["statementSource", "bankAcctMap", "bankCounterpartyMap"],
  };

  // Add a new system stub to the template's valConfig
  const handleAddSystem = useCallback((systemId: string, systemType: string) => {
    const valConfig = (template as any)?.valConfig;
    if (!valConfig) return;
    const systems: any[] = valConfig.systems || [];
    if (systems.some((s: any) => s.id === systemId)) return;
    const roles = TABLE_ROLES_BY_TYPE[systemType] || [];
    const tables: Record<string, string> = {};
    roles.forEach((r) => { tables[r] = ""; });
    const newSystem = { id: systemId, type: systemType, tables, workflows: {}, dashboards: [] };
    const newValConfig = { ...valConfig, systems: [...systems, newSystem] };
    const newTemplate = { ...template, valConfig: newValConfig };
    updateTemplateMutation.mutate({
      id: instance.template.id,
      updates: { template: newTemplate as any },
    });
  }, [template, instance.template.id, updateTemplateMutation]);

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

  const handleScopeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseScopeSpreadsheet(file);
      setUploadPreview(result);
    } catch (err: any) {
      alert(`Failed to parse spreadsheet: ${err.message || err}`);
    }
    // Reset input so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmUpload = (mode: "replace" | "merge") => {
    if (!uploadPreview) return;
    let newData: InstanceData;
    if (mode === "replace") {
      newData = {
        ...localData,
        scope: uploadPreview.scope,
        paymentMethods: uploadPreview.paymentMethods,
        banks: uploadPreview.banks,
        periods: uploadPreview.periods?.length ? uploadPreview.periods : localData.periods,
      };
    } else {
      // Merge: append new outlets, skip duplicate PMs, append new banks
      const existingOutletKeys = new Set((localData.scope || []).map((s) => `${s.entity}::${s.outlet}`));
      const newOutlets = (uploadPreview.scope || []).filter((s) => !existingOutletKeys.has(`${s.entity}::${s.outlet}`));
      const existingPMNames = new Set((localData.paymentMethods || []).map((p) => p.name));
      const newPMs = (uploadPreview.paymentMethods || []).filter((p) => !existingPMNames.has(p.name));
      const existingBankKeys = new Set((localData.banks || []).map((b) => `${b.bank}::${b.account}`));
      const newBanks = (uploadPreview.banks || []).filter((b) => !existingBankKeys.has(`${b.bank}::${b.account}`));
      const existingPeriods = new Set(localData.periods || []);
      const newPeriods = (uploadPreview.periods || []).filter((p) => !existingPeriods.has(p));

      newData = {
        ...localData,
        scope: [...(localData.scope || []), ...newOutlets],
        paymentMethods: [...(localData.paymentMethods || []), ...newPMs],
        banks: [...(localData.banks || []), ...newBanks],
        periods: [...(localData.periods || []), ...newPeriods],
      };
    }
    handleDataChange(newData);
    setUploadPreview(null);
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
  const domainSub = selectedEntity !== null
    ? `${instance.domain} — ${selectedEntity || "Unassigned"} (${outlets.filter((o) => (o.entity || "") === (selectedEntity || "")).length} outlets)`
    : `${instance.domain}${outletCount > 0 ? ` — ${outletCount} outlets · ${entityCount} entities` : ""}`;

  const templateSlug = instance.template?.slug || "";
  const isAP = templateSlug === "ap";

  const renderTab = (tabKey: string) => {
    const commonProps = { data: localData, onChange: handleDataChange, selectedEntity };
    switch (tabKey) {
      case "scope":
        return isAP ? <MatrixAPScopeTab {...commonProps} /> : <MatrixScopeTab {...commonProps} domain={instance.domain} instanceId={instance.id} template={template} onAddSystem={handleAddSystem} />;
      case "connectivity":
        return <MatrixConnectivityTab {...commonProps} template={template} />;
      case "collection":
        return isAP ? <MatrixAPCollectionTab {...commonProps} template={template} /> : <MatrixCollectionTab {...commonProps} template={template} domain={instance.domain} />;
      case "mapping":
        return isAP ? <MatrixAPMappingTab {...commonProps} /> : <MatrixMappingTab {...commonProps} />;
      case "implementation":
        return <MatrixImplementationTab {...commonProps} template={template} domain={instance.domain} instanceId={instance.id} />;
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
              {!isAP && (
                <>
                  <button onClick={() => downloadScopeTemplate(localData).catch((e) => alert(`Download failed: ${e.message || e}`))} className="text-[11px] font-semibold px-3 py-1.5 rounded border cursor-pointer transition-colors bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20">
                    Download Template
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="text-[11px] font-semibold px-3 py-1.5 rounded border cursor-pointer transition-colors bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20">
                    Upload Scope
                  </button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleScopeUpload} className="hidden" />
                  <span className="w-px h-4 bg-zinc-300 dark:bg-zinc-700" />
                </>
              )}
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
      {selectedEntity !== null && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-between">
          <div className="text-xs text-teal-700 dark:text-teal-400">Filtered to <span className="font-semibold">{selectedEntity || "Unassigned"}</span> — {outlets.filter((o) => (o.entity || "") === (selectedEntity || "")).length} outlets</div>
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

      {/* Upload preview modal */}
      {uploadPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 w-[560px] max-h-[80vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold">Import Scope from Spreadsheet</h3>
              <p className="text-xs text-zinc-500 mt-1">Review what will be imported</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-2">
                <PreviewStat label="Outlets" value={uploadPreview.scope?.length || 0} />
                <PreviewStat label="Payment Methods" value={uploadPreview.paymentMethods?.length || 0} />
                <PreviewStat label="Bank Accounts" value={uploadPreview.banks?.length || 0} />
                <PreviewStat label="Periods" value={uploadPreview.periods?.length || 0} />
              </div>

              {/* Outlets preview */}
              {(uploadPreview.scope?.length || 0) > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Outlets</p>
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase text-zinc-400">
                        <th className="text-left px-2 py-1.5">Entity</th><th className="text-left px-2 py-1.5">Outlet</th><th className="text-left px-2 py-1.5">POS</th>
                      </tr></thead>
                      <tbody>
                        {uploadPreview.scope!.slice(0, 8).map((s, i) => (
                          <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800/50">
                            <td className="px-2 py-1">{s.entity}</td><td className="px-2 py-1">{s.outlet}</td><td className="px-2 py-1 text-teal-600 dark:text-teal-400">{s.pos.join(", ") || "—"}</td>
                          </tr>
                        ))}
                        {(uploadPreview.scope!.length > 8) && (
                          <tr className="border-t border-zinc-100 dark:border-zinc-800/50"><td colSpan={3} className="px-2 py-1 text-zinc-400 text-center">+{uploadPreview.scope!.length - 8} more</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {uploadPreview.warnings.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400 mb-1">Warnings ({uploadPreview.warnings.length})</p>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
                    {uploadPreview.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                    {uploadPreview.warnings.length > 5 && <li>+{uploadPreview.warnings.length - 5} more...</li>}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <button onClick={() => setUploadPreview(null)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer bg-transparent border-none">Cancel</button>
              <div className="flex gap-2">
                {(localData.scope?.length || 0) > 0 && (
                  <button onClick={() => confirmUpload("merge")} className="text-[11px] font-semibold px-4 py-1.5 rounded border cursor-pointer transition-colors bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20">
                    Merge with Existing
                  </button>
                )}
                <button onClick={() => confirmUpload("replace")} className="text-[11px] font-semibold px-4 py-1.5 rounded border cursor-pointer transition-colors bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 hover:bg-teal-500/20">
                  {(localData.scope?.length || 0) > 0 ? "Replace All" : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-2.5 py-2 text-center">
      <div className="text-lg font-bold font-mono">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-400">{label}</div>
    </div>
  );
}
