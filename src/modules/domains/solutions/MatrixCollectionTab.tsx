import { useCallback, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { InstanceData, TemplateDefinition, StatusEntry } from "../../../lib/solutions/types";
import { getOutlets, getOutletNames, getSettlementPMs, isPMApplicable, getStatus, filterScope } from "./matrixHelpers";
import { CollapsibleSection, StatusSelect, OwnerTag, EditableInput, AddButton } from "./matrixComponents";
import { useFileScanner } from "../../../hooks/solutions";

import { useValDomains } from "../../../hooks/val-sync";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
  domain?: string;
}

export default function MatrixCollectionTab({ data, template, onChange, selectedEntity, domain }: Props) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const scope = filterScope(data.scope || [], selectedEntity);
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
  const periods = data.periods || [];
  const docStatus = data.docStatus || {};
  const outlets = getOutlets(scope);
  const outletNames = getOutletNames(scope);

  const updateDoc = (key: string, field: keyof StatusEntry, value: string) => {
    const st = getStatus(docStatus, key);
    onChange({ ...data, docStatus: { ...docStatus, [key]: { ...st, [field]: value } } });
  };

  const addPeriod = (period: string) => {
    if (!period.trim() || periods.includes(period.trim())) return;
    onChange({ ...data, periods: [...periods, period.trim()] });
  };

  const removePeriod = (idx: number) => {
    onChange({ ...data, periods: periods.filter((_, i) => i !== idx) });
  };

  // Progress helpers
  const countDone = (keys: string[]) => keys.filter((k) => { const s = getStatus(docStatus, k).status; return s === "done" || s === "na"; }).length;

  // File scanner — derive fingerprint path from domain's global_path
  const { data: domains } = useValDomains();
  const domainGlobalPath = domains?.find((d) => d.domain === domain)?.global_path;
  const fingerprintPath = domainGlobalPath
    ? domainGlobalPath.replace(/\/domains\/[^/]+$/, "/connectors/_fingerprints.json")
    : null;
  const { scan: rawScan, scanning, result: liveScanResult } = useFileScanner(fingerprintPath);

  // Reconcile docStatus for uploaded files — sync settlement rows to "done" for any uploaded+matched file
  const reconcileDocStatus = useCallback((currentData: InstanceData, files: typeof displayFiles) => {
    const uploaded = currentData.uploadedFiles || [];
    if (uploaded.length === 0 || files.length === 0) return currentData.docStatus;
    const uploadedSet = new Set(uploaded.map((u) => u.name));
    const currentPeriods = currentData.periods || [];
    if (currentPeriods.length === 0) return currentData.docStatus;
    let changed = false;
    const updatedDocStatus = { ...(currentData.docStatus || {}) };
    for (const file of files) {
      if (!file.match || !uploadedSet.has(file.name)) continue;
      for (const period of currentPeriods) {
        const key = `settl::${file.match.platform}::${period}`;
        const current = updatedDocStatus[key];
        if (!current || current.status === "pending") {
          updatedDocStatus[key] = { status: "done", detail: `Uploaded ${file.name}` };
          changed = true;
        }
      }
    }
    return changed ? updatedDocStatus : currentData.docStatus;
  }, []);

  // Persist scan results after scanning
  const handleScan = useCallback(async (folder: string) => {
    const result = await rawScan(folder);
    if (result && result.files.length > 0) {
      const latestData = dataRef.current;
      const scanFiles = result.files.map((f) => ({
        name: f.name, path: f.path, size: f.size, format: f.format,
        headers: f.headers,
        match: f.match,
        dateRange: f.dateRange,
        outlets: f.outlets || [],
        outletDetails: f.outletDetails || [],
      }));
      const reconciledDocStatus = reconcileDocStatus(latestData, scanFiles);
      onChange({
        ...latestData,
        lastScan: { files: scanFiles, scannedAt: new Date().toISOString() },
        docStatus: reconciledDocStatus,
      });
    }
    return result;
  }, [rawScan, onChange, reconcileDocStatus]);

  // Use persisted scan or live scan
  const displayFiles = liveScanResult?.files || data.lastScan?.files || [];
  const hasFiles = displayFiles.length > 0;

  // Upload tracking
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ total: number; uploaded: number; failed: number; files: { name: string; status: string; error?: string }[] } | null>(null);

  const valConfig = (template as any).valConfig;
  const systems: any[] = valConfig?.systems || [];
  const uploadedFiles = data.uploadedFiles || [];
  const uploadedNames = new Set(uploadedFiles.map((f) => f.name));

  const handleUploadToDrive = useCallback(async (onlyNew: boolean) => {
    if (!domain || displayFiles.length === 0) return;
    const matchedFiles = displayFiles.filter((f) => f.match && (!onlyNew || !uploadedNames.has(f.name)));
    if (matchedFiles.length === 0) return;

    // Group files by their drive folder based on platform match
    const byFolder: Record<string, { paths: string[]; files: typeof matchedFiles }> = {};
    for (const file of matchedFiles) {
      const platform = file.match!.platform;
      const sys = systems.find((s: any) => s.id.toLowerCase() === platform.toLowerCase());
      const folder = sys?.driveFolder || "";
      if (!folder) continue;
      if (!byFolder[folder]) byFolder[folder] = { paths: [], files: [] };
      byFolder[folder].paths.push(file.path);
      byFolder[folder].files.push(file);
    }

    const folders = Object.keys(byFolder);
    if (folders.length === 0) return;

    setUploading(true);
    setUploadResult(null);

    try {
      let totalUploaded = 0;
      let totalFailed = 0;
      const allResults: { name: string; status: string; error?: string }[] = [];
      const newUploaded: typeof uploadedFiles = [];

      for (const folder of folders) {
        const { paths, files } = byFolder[folder];
        const result = await invoke<{ total: number; uploaded: number; failed: number; files: { name: string; status: string; error?: string }[] }>(
          "val_drive_upload_files",
          { domain, folderPath: folder, filePaths: paths }
        );
        totalUploaded += result.uploaded;
        totalFailed += result.failed;
        allResults.push(...result.files.map((f) => ({ ...f, error: f.error || undefined })));

        // Track successful uploads
        for (const r of result.files) {
          if (r.status === "uploaded") {
            const srcFile = files.find((f) => f.name === r.name);
            if (srcFile?.match) {
              newUploaded.push({
                name: r.name,
                platform: srcFile.match.platform,
                driveFolder: folder,
                uploadedAt: new Date().toISOString(),
              });
            }
          }
        }
      }

      // Persist uploaded files
      const latestData = dataRef.current;
      const existingUploaded = latestData.uploadedFiles || [];
      const mergedUploaded = [...existingUploaded.filter((f) => !newUploaded.some((n) => n.name === f.name)), ...newUploaded];

      // Auto-update docStatus for ALL uploaded files (not just this batch)
      const updatedDocStatus = { ...(latestData.docStatus || {}) };
      const latestPeriods = latestData.periods || [];
      const allUploadedNames = new Set(mergedUploaded.map((u) => u.name));
      for (const file of displayFiles) {
        if (!file.match || !allUploadedNames.has(file.name)) continue;
        const platform = file.match.platform;
        for (const period of latestPeriods) {
          const key = `settl::${platform}::${period}`;
          const current = updatedDocStatus[key];
          if (!current || current.status === "pending") {
            updatedDocStatus[key] = { status: "done", detail: `Uploaded ${file.name}` };
          }
        }
      }

      onChange({ ...latestData, uploadedFiles: mergedUploaded, docStatus: updatedDocStatus });

      setUploadResult({
        total: allResults.length,
        uploaded: totalUploaded,
        failed: totalFailed,
        files: allResults,
      });
    } catch (err: any) {
      setUploadResult({
        total: 0,
        uploaded: 0,
        failed: 1,
        files: [{ name: "Upload", status: "error", error: err?.message || String(err) }],
      });
    } finally {
      setUploading(false);
    }
  }, [displayFiles, domain, systems, uploadedNames, onChange]);

  // AI outlet matching
  const [matching, setMatching] = useState(false);
  const outletMapping = data.outletMapping || {};

  const handleMatchOutlets = useCallback(async () => {
    const scopeOutlets = (dataRef.current.scope || []).map((s) => ({ entity: s.entity, outlet: s.outlet }));
    const allDataOutlets = displayFiles.flatMap((f) => f.outlets || []);
    const uniqueDataOutlets = [...new Set(allDataOutlets)];
    if (scopeOutlets.length === 0 || uniqueDataOutlets.length === 0) return;

    setMatching(true);
    try {
      const matches = await invoke<{ data_name: string; scope_code: string; confidence: string }[]>(
        "ai_match_outlets",
        { scopeOutlets, dataOutlets: uniqueDataOutlets }
      );
      const latestData = dataRef.current;
      const mapping: Record<string, string> = { ...latestData.outletMapping };
      const updatedOutletMap: Record<string, string> = { ...(latestData.outletMap || {}) };

      // Build reverse: for each matched file, figure out which platform it came from
      const outletToPlatform: Record<string, Set<string>> = {};
      for (const file of displayFiles) {
        if (!file.match || !file.outlets?.length) continue;
        for (const o of file.outlets) {
          if (!outletToPlatform[o]) outletToPlatform[o] = new Set();
          outletToPlatform[o].add(file.match.platform);
        }
      }

      // Build a lookup from lowercase platform to the actual PM name
      const pmsByLower: Record<string, string> = {};
      for (const pm of (latestData.paymentMethods || [])) {
        pmsByLower[pm.name.toLowerCase()] = pm.name;
      }

      for (const m of matches) {
        if (m.scope_code) {
          mapping[m.data_name] = m.scope_code;
          // Also populate outletMap for the Mapping Matrix tab
          const platforms = outletToPlatform[m.data_name];
          if (platforms) {
            for (const platform of platforms) {
              // Use the canonical PM name (capitalized) to match what Mapping Matrix expects
              const canonicalPM = pmsByLower[platform.toLowerCase()] || platform;
              const key = `${m.scope_code}::${canonicalPM}`;
              if (!updatedOutletMap[key]) {
                updatedOutletMap[key] = m.data_name;
              }
            }
          }
        }
      }
      onChange({ ...latestData, outletMapping: mapping, outletMap: updatedOutletMap });
    } catch (err) {
      console.error("AI outlet matching failed:", err);
    } finally {
      setMatching(false);
    }
  }, [displayFiles, outletMapping, onChange]);

  const handleBrowseFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select data drop folder",
        defaultPath: data.dropFolder || undefined,
      });
      if (selected && typeof selected === "string") {
        onChange({ ...data, dropFolder: selected });
      }
    } catch {
      // User cancelled
    }
  }, [data, onChange]);

  const glKeys = pms.map((pm) => `gl::${pm.name}`);
  const posDataKeys = outlets.flatMap((o) => periods.map((p) => `pos::${o.key}::${p}`));
  const settlPMs = getSettlementPMs(pms, template);
  const settlKeys = settlPMs.flatMap((pm) => periods.map((p) => `settl::${pm.name}::${p}`));
  const filteredBanks = selectedEntity ? banks.filter((b) => b.outlets.length === 0 || b.outlets.some((o) => outletNames.includes(o))) : banks;
  const bankKeys = filteredBanks.flatMap((b) => periods.map((p) => `bank::${b.bank}::${b.account}::${p}`));

  return (
    <div className="space-y-8">
      {/* Drop Folder */}
      <CollapsibleSection badge="Folder" badgeColor="teal" title="Data Drop Folder" description="Where client data files are stored in tv-knowledge for this onboarding.">
        <div className="flex items-center gap-2">
          {data.dropFolder ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate flex-1" title={data.dropFolder}>
                {data.dropFolder}
              </span>
              <button
                onClick={() => handleScan(data.dropFolder!)}
                disabled={scanning}
                className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 cursor-pointer border-none shrink-0 disabled:opacity-40"
              >
                {scanning ? "Scanning..." : "Scan Files"}
              </button>
              <button
                onClick={handleBrowseFolder}
                className="text-[10px] font-semibold px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-blue-500 cursor-pointer border-none shrink-0"
              >
                Change
              </button>
              <button
                onClick={() => onChange({ ...data, dropFolder: undefined })}
                className="text-[10px] font-semibold px-2 py-1 rounded text-red-400 hover:text-red-500 cursor-pointer bg-transparent border-none shrink-0"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              onClick={handleBrowseFolder}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 cursor-pointer border-none"
            >
              Select Folder
            </button>
          )}
        </div>

        {/* Scan Results */}
        {hasFiles && (
          <div className="mt-4">
            <div className="text-[10px] text-zinc-400 mb-2">
              {displayFiles.length} files scanned · {displayFiles.filter((f) => f.match).length} identified
              {uploadedFiles.length > 0 && <> · <span className="text-emerald-400">{uploadedFiles.length} uploaded</span></>}
              {data.lastScan?.scannedAt && !liveScanResult && (
                <> · last scan {new Date(data.lastScan.scannedAt).toLocaleDateString()}</>
              )}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">File</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[120px]">System</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[140px]">Connector</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[80px]">Confidence</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[140px]">Date Range</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[140px]">Outlets</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[160px]">Drive Folder</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayFiles.map((file) => {
                  const sys = file.match ? systems.find((s: any) => s.id.toLowerCase() === file.match!.platform.toLowerCase()) : null;
                  const driveFolder = sys?.driveFolder || "";
                  const isUploaded = uploadedNames.has(file.name);
                  return (
                  <tr key={file.path} className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 ${isUploaded ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 uppercase">{file.format}</span>
                        <span className="truncate" title={file.name}>{file.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">
                      {file.match ? (
                        <span className="font-medium text-zinc-700 dark:text-zinc-300 capitalize">{file.match.platform}</span>
                      ) : (
                        <span className="text-zinc-400 italic">Unknown</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] font-mono text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate" title={file.match?.connector}>
                      {file.match?.connector || "—"}
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      {file.match ? (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          file.match.confidence >= 0.9 ? "bg-emerald-500/10 text-emerald-400" :
                          file.match.confidence >= 0.7 ? "bg-amber-500/10 text-amber-400" :
                          "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                        }`}>
                          {Math.round(file.match.confidence * 100)}%
                        </span>
                      ) : (
                        <span className="text-[9px] text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      {file.dateRange ? `${file.dateRange.from} → ${file.dateRange.to}` : "—"}
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      {file.outlets && file.outlets.length > 0 ? (
                        <div className="flex flex-wrap gap-0.5">
                          {file.outlets.map((o) => (
                            <span key={o} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 truncate max-w-[180px]" title={o}>{o}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] font-mono text-zinc-400 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate" title={driveFolder}>
                      {driveFolder || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      {isUploaded ? (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Uploaded</span>
                      ) : file.match ? (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Pending</span>
                      ) : (
                        <span className="text-[9px] text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Match Outlets + Upload to VAL Drive */}
        {hasFiles && displayFiles.some((f) => f.match) && domain && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {(() => {
              const newCount = displayFiles.filter((f) => f.match && !uploadedNames.has(f.name)).length;
              const allCount = displayFiles.filter((f) => f.match).length;
              return (
                <>
                  {newCount > 0 && (
                    <button
                      onClick={() => handleUploadToDrive(true)}
                      disabled={uploading}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 cursor-pointer border-none disabled:opacity-40"
                    >
                      {uploading ? "Uploading..." : `Upload ${newCount} New File${newCount !== 1 ? "s" : ""} to VAL Drive`}
                    </button>
                  )}
                  {uploadedFiles.length > 0 && allCount > 0 && (
                    <button
                      onClick={() => handleUploadToDrive(false)}
                      disabled={uploading}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-blue-500 cursor-pointer border-none disabled:opacity-40"
                    >
                      Re-upload All ({allCount})
                    </button>
                  )}
                  {newCount === 0 && uploadedFiles.length > 0 && !uploading && (
                    <span className="text-[10px] text-emerald-400 font-medium">All files uploaded</span>
                  )}
                  {displayFiles.some((f) => f.outlets && f.outlets.length > 0) && (
                    <button
                      onClick={handleMatchOutlets}
                      disabled={matching}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 cursor-pointer border-none disabled:opacity-40"
                    >
                      {matching ? "Matching..." : Object.keys(outletMapping).length > 0 ? "Re-match Outlets" : "Match Outlets (AI)"}
                    </button>
                  )}
                </>
              );
            })()}
            {uploadResult && (
              <div className="flex flex-col gap-0.5">
                <span className={`text-[10px] font-medium ${uploadResult.failed > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {uploadResult.uploaded} uploaded{uploadResult.failed > 0 ? `, ${uploadResult.failed} failed` : ""}
                </span>
                {uploadResult.files.filter((f) => f.error).map((f, i) => (
                  <span key={i} className="text-[9px] text-red-400 font-mono truncate max-w-lg" title={f.error}>{f.name}: {f.error}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {data.dropFolder && !hasFiles && !scanning && (
          <div className="mt-3 text-xs text-zinc-400">No files scanned yet. Click "Scan Files" to analyze the drop folder.</div>
        )}
      </CollapsibleSection>

      {/* Periods */}
      <CollapsibleSection badge="Periods" badgeColor="teal" title="Data Periods Required" description="Which months of historical data do we need? These generate rows below.">
        <div className="flex gap-1.5 flex-wrap mb-3">
          {periods.map((p, i) => (
            <span key={p} className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1 text-[11px]">
              {p}
              <button onClick={() => removePeriod(i)} className="text-red-400 opacity-50 hover:opacity-100 text-sm bg-transparent border-none cursor-pointer">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5 items-center">
          <select
            id="periodMonth"
            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            id="periodYear"
            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y} selected={y === new Date().getFullYear()}>{y}</option>
            ))}
          </select>
          <AddButton label="+ Add" onClick={() => {
            const m = (document.getElementById("periodMonth") as HTMLSelectElement)?.value;
            const y = (document.getElementById("periodYear") as HTMLSelectElement)?.value;
            if (m && y) addPeriod(`${m} ${y}`);
          }} />
        </div>
      </CollapsibleSection>

      {/* GL Posting */}
      <CollapsibleSection badge="GL" badgeColor="teal" title="GL Posting Method & Template" progress={`${countDone(glKeys)} / ${glKeys.length}`} description="One row per payment method — need the posting rules/template for each.">
        <StatusTable
          rows={pms.map((pm) => {
            const key = `gl::${pm.name}`;
            const st = getStatus(docStatus, key);
            const applicable = outletNames.filter((o) => isPMApplicable(pm, o));
            return { key, label: pm.name, chips: applicable, st, owner: "client" };
          })}
          columns={["Payment Method", "Outlets"]}
          onStatusChange={(key, v) => updateDoc(key, "status", v)}
          onDetailChange={(key, v) => updateDoc(key, "detail", v)}
        />
      </CollapsibleSection>

      {/* POS Data */}
      <CollapsibleSection badge="POS Data" badgeColor="teal" title="POS Reports (Historical)" progress={`${countDone(posDataKeys)} / ${posDataKeys.length}`} description="One row per outlet per period.">
        {outlets.length === 0 || periods.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add outlets and periods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[18%]">Outlet</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">POS</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Period</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[90px]">Status</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Owner</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return outlets.flatMap((o) => {
                  const posRaw = (scope.find((r) => r.outlet === o.key) || { pos: [] }).pos;
                  const posType = Array.isArray(posRaw) ? posRaw.join(", ") : String(posRaw || "");
                  return periods.map((period) => {
                    n++;
                    const key = `pos::${o.key}::${period}`;
                    const st = getStatus(docStatus, key);
                    return (
                      <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{o.label}</td>
                        <td className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{posType}</td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{period}</td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateDoc(key, "status", v)} /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="client" /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateDoc(key, "detail", v)} placeholder="Notes..." /></td>
                      </tr>
                    );
                  });
                });
              })()}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Settlement Reports */}
      <CollapsibleSection badge="Settlement" badgeColor="teal" title="Settlement Reports" progress={`${countDone(settlKeys)} / ${settlKeys.length}`} description="One row per payment method (excl. Cash) per period.">
        <StatusTable
          rows={settlPMs.flatMap((pm) => {
            const applicable = outletNames.filter((o) => isPMApplicable(pm, o));
            // Find scanned outlets for this platform, resolved via AI mapping
            const rawDataOutlets = displayFiles
              .filter((f) => f.match && f.match.platform.toLowerCase() === pm.name.toLowerCase() && f.outlets?.length)
              .flatMap((f) => f.outlets || []);
            const uniqueDataOutlets = [...new Set(rawDataOutlets)].sort();
            // Resolve to scope codes if mapping exists
            const resolvedOutlets = uniqueDataOutlets.map((o) => ({
              raw: o,
              code: outletMapping[o] || null,
            }));
            return periods.map((period) => {
              const key = `settl::${pm.name}::${period}`;
              const st = getStatus(docStatus, key);
              return { key, label: pm.name, chips: applicable, period, st, owner: "client", dataOutlets: uniqueDataOutlets, resolvedOutlets };
            });
          })}
          columns={["Payment Method", "Outlets"]}
          showPeriod
          onStatusChange={(key, v) => updateDoc(key, "status", v)}
          onDetailChange={(key, v) => updateDoc(key, "detail", v)}
        />
      </CollapsibleSection>

      {/* Bank Statements */}
      <CollapsibleSection badge="Bank" badgeColor="teal" title="Bank Statements" progress={`${countDone(bankKeys)} / ${bankKeys.length}`} description="One row per bank account per period.">
        {filteredBanks.length === 0 || periods.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add bank accounts and periods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">Bank</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">Account</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Period</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[90px]">Status</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Owner</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return filteredBanks.flatMap((b) =>
                  periods.map((period) => {
                    n++;
                    const key = `bank::${b.bank}::${b.account}::${period}`;
                    const st = getStatus(docStatus, key);
                    return (
                      <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{b.bank}</td>
                        <td className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{b.account}</td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{period}</td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateDoc(key, "status", v)} /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="client" /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateDoc(key, "detail", v)} placeholder="Notes..." /></td>
                      </tr>
                    );
                  })
                );
              })()}
            </tbody>
          </table>
        )}
      </CollapsibleSection>
    </div>
  );
}

// Reusable status table for GL and Settlement sections
function StatusTable({
  rows,
  columns,
  showPeriod,
  onStatusChange,
  onDetailChange,
}: {
  rows: Array<{ key: string; label: string; chips: string[]; period?: string; st: { status: string; detail: string }; owner: string; dataOutlets?: string[]; resolvedOutlets?: { raw: string; code: string | null }[] }>;
  columns: [string, string];
  showPeriod?: boolean;
  onStatusChange: (key: string, v: string) => void;
  onDetailChange: (key: string, v: string) => void;
}) {
  if (rows.length === 0) return <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add scope items first.</p>;
  const hasDataOutlets = rows.some((r) => r.dataOutlets && r.dataOutlets.length > 0);
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">{columns[0]}</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">{columns[1]}</th>
          {showPeriod && <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Period</th>}
          {hasDataOutlets && <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[20%]">Data Coverage</th>}
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[90px]">Status</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Owner</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const resolved = row.resolvedOutlets || [];
          const hasMapping = resolved.some((r) => r.code);
          const expected = row.chips;
          // Use AI mapping if available, otherwise fuzzy substring
          const matchedCodes = hasMapping
            ? new Set(resolved.filter((r) => r.code).map((r) => r.code!))
            : new Set<string>();
          const missing = hasMapping
            ? expected.filter((o) => !matchedCodes.has(o))
            : expected.filter((o) => !(row.dataOutlets || []).some((d) => d.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(d.toLowerCase())));
          const extra = hasMapping
            ? resolved.filter((r) => !r.code).map((r) => r.raw)
            : (row.dataOutlets || []).filter((d) => !expected.some((o) => d.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(d.toLowerCase())));
          const matched = expected.length - missing.length;
          return (
          <tr key={row.key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
            <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
            <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{row.label}</td>
            <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400">{row.chips.length} outlets</span>
              </div>
            </td>
            {showPeriod && <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{row.period}</td>}
            {hasDataOutlets && (
              <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                {resolved.length > 0 ? (
                  <div className="space-y-1">
                    <span className={`text-[9px] font-bold ${matched === expected.length ? "text-emerald-400" : "text-amber-400"}`}>
                      {matched}/{expected.length} matched
                      {extra.length > 0 && ` · +${extra.length} unmatched`}
                    </span>
                    <table className="w-full text-[9px]">
                      <thead>
                        <tr className="text-[8px] uppercase text-zinc-400">
                          <th className="text-left font-semibold pr-2 pb-0.5">Scope</th>
                          <th className="text-left font-semibold pb-0.5">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expected.map((code) => {
                          const isCovered = !missing.includes(code);
                          const dataName = hasMapping ? resolved.find((r) => r.code === code)?.raw : null;
                          return (
                            <tr key={code}>
                              <td className={`pr-2 py-0.5 font-medium ${isCovered ? "text-emerald-500" : "text-red-400"}`}>{code}</td>
                              <td className="py-0.5 text-zinc-500 truncate max-w-[180px]" title={dataName || ""}>
                                {dataName || <span className="text-red-400 italic">missing</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {extra.map((o) => (
                          <tr key={`extra-${o}`}>
                            <td className="pr-2 py-0.5 text-amber-400 italic">?</td>
                            <td className="py-0.5 text-amber-500 truncate max-w-[180px]" title={o}>{o}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <span className="text-[9px] text-zinc-300 dark:text-zinc-600">No data</span>
                )}
              </td>
            )}
            <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
              <StatusSelect value={row.st.status as any} onChange={(v) => onStatusChange(row.key, v)} />
            </td>
            <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner={row.owner} /></td>
            <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
              <EditableInput value={row.st.detail} onChange={(v) => onDetailChange(row.key, v)} placeholder="Notes..." />
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}
