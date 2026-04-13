import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { InstanceData, TemplateDefinition, StatusEntry, ScanBinding } from "../../../lib/solutions/types";
import { getOutlets, getOutletNames, getSettlementPMs, isPMApplicable, getStatus, filterScope } from "./matrixHelpers";
import { CollapsibleSection, StatusSelect, OwnerTag, EditableInput, AddButton, TypeBadge, OutletScope } from "./matrixComponents";
import OutletMapChip from "./OutletMapChip";
import {
  THead,
  COL_NUM, COL_TYPE, COL_NAME, COL_SCOPE, COL_PERIOD,
  COL_STATUS, COL_OWNER, COL_NOTES,
} from "./matrixImplHelpers";
import { useFileScanner, type ScanBindings } from "../../../hooks/solutions";

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

  // Merge template-level defaults with instance-level overrides.
  // Instance wins field-by-field so a user can override just outlet or just date
  // without losing the template's pick for the other.
  const mergeBindings = useCallback((instanceBindings?: Record<string, ScanBinding>): ScanBindings => {
    const templateBindings = (template as any).scanBindings as Record<string, ScanBinding> | undefined;
    const merged: ScanBindings = {};
    const keys = new Set<string>([
      ...Object.keys(templateBindings || {}),
      ...Object.keys(instanceBindings || {}),
    ]);
    for (const k of keys) {
      const t = templateBindings?.[k] || {};
      const i = instanceBindings?.[k] || {};
      const entry: ScanBinding = {};
      if (i.outlet || t.outlet) entry.outlet = i.outlet || t.outlet;
      if (i.date || t.date) entry.date = i.date || t.date;
      if (entry.outlet || entry.date) merged[k] = entry;
    }
    return merged;
  }, [template]);

  // Persist scan results after scanning. `overrideBindings` lets callers
  // (e.g. the column-override popover) pass the post-update instance bindings
  // directly so we don't rescan with stale state. Template defaults are always
  // merged in at scan time.
  const handleScan = useCallback(async (folder: string, overrideBindings?: ScanBindings) => {
    const instanceBindings = overrideBindings ?? dataRef.current.scanBindings;
    const bindings = mergeBindings(instanceBindings);
    const result = await rawScan(folder, bindings);
    if (result && result.files.length > 0) {
      const latestData = dataRef.current;
      const scanFiles = result.files.map((f) => ({
        name: f.name, path: f.path, size: f.size, format: f.format,
        headers: f.headers,
        match: f.match,
        dateRange: f.dateRange,
        outlets: f.outlets || [],
        outletDetails: f.outletDetails || [],
        usedOutletColumn: f.usedOutletColumn ?? null,
        usedDateColumn: f.usedDateColumn ?? null,
        candidateOutletColumns: f.candidateOutletColumns || [],
        candidateDateColumns: f.candidateDateColumns || [],
      }));
      const reconciledDocStatus = reconcileDocStatus(latestData, scanFiles);
      onChange({
        ...latestData,
        lastScan: { files: scanFiles, scannedAt: new Date().toISOString() },
        docStatus: reconciledDocStatus,
      });
    }
    return result;
  }, [rawScan, onChange, reconcileDocStatus, mergeBindings]);

  // Override a column binding for a given connector. Writes to data.scanBindings
  // and immediately rescans with the new bindings so the file list reflects the
  // user's choice. Passing `null` clears the binding for that field.
  const updateScanBinding = useCallback(
    (connectorId: string, field: "outlet" | "date", value: string | null) => {
      const latestData = dataRef.current;
      const existing = latestData.scanBindings || {};
      const current = existing[connectorId] || {};
      const nextEntry: ScanBinding = { ...current };
      if (value) nextEntry[field] = value;
      else delete nextEntry[field];

      const nextBindings: Record<string, ScanBinding> = { ...existing };
      if (!nextEntry.outlet && !nextEntry.date) delete nextBindings[connectorId];
      else nextBindings[connectorId] = nextEntry;

      onChange({ ...latestData, scanBindings: nextBindings });
      if (latestData.dropFolder) handleScan(latestData.dropFolder, nextBindings);
    },
    [onChange, handleScan],
  );

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
      {/* Periods — first: everything downstream renders `outlet × period`, so define the window before anything else */}
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
                      {file.match && (() => {
                        const cid = file.match.connector;
                        const tplBindings = (template as any).scanBindings as Record<string, ScanBinding> | undefined;
                        const outletSource: BadgeSource =
                          data.scanBindings?.[cid]?.outlet ? "instance"
                          : tplBindings?.[cid]?.outlet ? "template"
                          : file.usedOutletColumn ? "auto" : "none";
                        const dateSource: BadgeSource =
                          data.scanBindings?.[cid]?.date ? "instance"
                          : tplBindings?.[cid]?.date ? "template"
                          : file.usedDateColumn ? "auto" : "none";
                        return (
                          <div className="flex items-center gap-1 mt-1 ml-[30px]">
                            <ColumnBadge
                              label="outlet"
                              value={file.usedOutletColumn ?? null}
                              headers={file.headers}
                              likely={file.candidateOutletColumns || []}
                              source={outletSource}
                              onSelect={(col) => updateScanBinding(cid, "outlet", col)}
                            />
                            <ColumnBadge
                              label="date"
                              value={file.usedDateColumn ?? null}
                              headers={file.headers}
                              likely={file.candidateDateColumns || []}
                              source={dateSource}
                              onSelect={(col) => updateScanBinding(cid, "date", col)}
                            />
                          </div>
                        );
                      })()}
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
                            <OutletMapChip
                              key={o}
                              dataOutletName={o}
                              mappedScopeCode={outletMapping[o] ?? null}
                              scopeOutlets={outlets}
                              onMap={(code) => {
                                const next = { ...(dataRef.current.outletMapping || {}) };
                                if (code) next[o] = code;
                                else delete next[o];
                                onChange({ ...dataRef.current, outletMapping: next });
                              }}
                            />
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

      {/* POS Data */}
      <CollapsibleSection badge="POS Data" badgeColor="teal" title="POS Reports" progress={`${countDone(posDataKeys)} / ${posDataKeys.length}`} description="One row per outlet per period.">
        {outlets.length === 0 || periods.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add outlets and periods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Type", className: COL_TYPE },
              { label: "Name", className: COL_NAME },
              { label: "Scope", className: COL_SCOPE },
              { label: "Period", className: COL_PERIOD },
              { label: "Status", className: COL_STATUS },
              { label: "Owner", className: COL_OWNER },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {(() => {
                let n = 0;
                return outlets.flatMap((o) => {
                  const posRaw = (scope.find((r) => r.outlet === o.key) || { pos: [] }).pos;
                  const posName = Array.isArray(posRaw) ? posRaw.join(", ") : String(posRaw || "");
                  return periods.map((period) => {
                    n++;
                    const key = `pos::${o.key}::${period}`;
                    const st = getStatus(docStatus, key);
                    return (
                      <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className={`px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{n}</td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_TYPE}`}><TypeBadge type="POS" /></td>
                        <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NAME}`}>{posName || <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}</td>
                        <td className={`px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SCOPE}`}>{o.key}</td>
                        <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_PERIOD}`}>{period}</td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateDoc(key, "status", v)} /></td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_OWNER}`}><OwnerTag owner="client" /></td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateDoc(key, "detail", v)} placeholder="Notes..." /></td>
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
        {settlPMs.length === 0 || periods.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add payment methods and periods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Type", className: COL_TYPE },
              { label: "Name", className: COL_NAME },
              { label: "Scope", className: COL_SCOPE },
              { label: "Period", className: COL_PERIOD },
              { label: "Status", className: COL_STATUS },
              { label: "Owner", className: COL_OWNER },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {(() => {
                let n = 0;
                return settlPMs.flatMap((pm) => {
                  const applicable = outletNames.filter((o) => isPMApplicable(pm, o));
                  // Coverage from scanned files: which scope outlet codes are present
                  // in any scan file matching this payment method's platform.
                  const rawDataOutlets = displayFiles
                    .filter((f) => f.match && f.match.platform.toLowerCase() === pm.name.toLowerCase() && f.outlets?.length)
                    .flatMap((f) => f.outlets || []);
                  const covered = new Set(
                    rawDataOutlets
                      .map((o) => outletMapping[o])
                      .filter((x): x is string => Boolean(x))
                  );
                  return periods.map((period) => {
                    n++;
                    const key = `settl::${pm.name}::${period}`;
                    const st = getStatus(docStatus, key);
                    return (
                      <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className={`px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{n}</td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_TYPE}`}><TypeBadge type="Payment" /></td>
                        <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NAME}`}>{pm.name}</td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SCOPE}`}><OutletScope outlets={applicable} covered={covered.size > 0 ? covered : undefined} /></td>
                        <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_PERIOD}`}>{period}</td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateDoc(key, "status", v)} /></td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_OWNER}`}><OwnerTag owner="client" /></td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateDoc(key, "detail", v)} placeholder="Notes..." /></td>
                      </tr>
                    );
                  });
                });
              })()}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Bank Statements */}
      <CollapsibleSection badge="Bank" badgeColor="teal" title="Bank Statements" progress={`${countDone(bankKeys)} / ${bankKeys.length}`} description="One row per bank account per period.">
        {filteredBanks.length === 0 || periods.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add bank accounts and periods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Type", className: COL_TYPE },
              { label: "Name", className: COL_NAME },
              { label: "Scope", className: COL_SCOPE },
              { label: "Period", className: COL_PERIOD },
              { label: "Status", className: COL_STATUS },
              { label: "Owner", className: COL_OWNER },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {(() => {
                let n = 0;
                return filteredBanks.flatMap((b) => {
                  // Bank rows show "{account} · {outlets}" in scope; if no specific outlets, treat as all
                  const bankOutlets = b.outlets && b.outlets.length > 0 ? b.outlets : outletNames;
                  return periods.map((period) => {
                    n++;
                    const key = `bank::${b.bank}::${b.account}::${period}`;
                    const st = getStatus(docStatus, key);
                    return (
                      <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className={`px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{n}</td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_TYPE}`}><TypeBadge type="Bank" /></td>
                        <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NAME}`}>
                          <div>{b.bank}</div>
                          <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{b.account}</div>
                        </td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SCOPE}`}><OutletScope outlets={bankOutlets} /></td>
                        <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_PERIOD}`}>{period}</td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateDoc(key, "status", v)} /></td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_OWNER}`}><OwnerTag owner="client" /></td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateDoc(key, "detail", v)} placeholder="Notes..." /></td>
                      </tr>
                    );
                  });
                });
              })()}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* GL Posting — kept last: posting rules/template come after the data is collected */}
      <CollapsibleSection badge="GL" badgeColor="teal" title="GL Posting Method & Template" progress={`${countDone(glKeys)} / ${glKeys.length}`} description="One row per payment method — need the posting rules/template for each.">
        {pms.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add payment methods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Type", className: COL_TYPE },
              { label: "Name", className: COL_NAME },
              { label: "Scope", className: COL_SCOPE },
              { label: "Period", className: COL_PERIOD },
              { label: "Status", className: COL_STATUS },
              { label: "Owner", className: COL_OWNER },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {pms.map((pm, i) => {
                const key = `gl::${pm.name}`;
                const st = getStatus(docStatus, key);
                const applicable = outletNames.filter((o) => isPMApplicable(pm, o));
                return (
                  <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className={`px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_TYPE}`}><TypeBadge type="Payment" /></td>
                    <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NAME}`}>{pm.name}</td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SCOPE}`}><OutletScope outlets={applicable} /></td>
                    <td className={`px-3 py-1.5 text-xs text-zinc-300 dark:text-zinc-600 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_PERIOD}`}>&mdash;</td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateDoc(key, "status", v)} /></td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_OWNER}`}><OwnerTag owner="client" /></td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateDoc(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CollapsibleSection>
    </div>
  );
}

// ─── ColumnBadge ───
// Clickable badge showing which column the scanner used for a given field.
// Four visual states via `source`:
//   - "instance" (blue)   — this domain overrode the column
//   - "template" (teal)   — solution template declared a default
//   - "auto"     (zinc)   — regex auto-detected
//   - "none"     (amber)  — nothing resolved

type BadgeSource = "instance" | "template" | "auto" | "none";

function ColumnBadge({
  label,
  value,
  headers,
  likely,
  source,
  onSelect,
}: {
  label: string;
  value: string | null;
  headers: string[];
  likely: string[];
  source: BadgeSource;
  onSelect: (col: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const tone =
    source === "instance" ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
    : source === "template" ? "bg-teal-500/10 text-teal-500 border-teal-500/30"
    : source === "auto" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700"
    : "bg-amber-500/10 text-amber-400 border-amber-500/30";

  const overridden = source === "instance";

  const likelySet = new Set(likely);
  const otherHeaders = headers.filter((h) => !likelySet.has(h));

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border cursor-pointer hover:brightness-110 ${tone}`}
        title={
          source === "instance" ? `${label} column (domain override)`
          : source === "template" ? `${label} column (template default)`
          : source === "auto" ? `${label} column (auto-detected)`
          : `${label} column (unresolved)`
        }
      >
        {label}: {value || "—"}
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 min-w-[200px] max-w-[280px] max-h-[260px] overflow-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-lg py-1">
          {likely.length > 0 && (
            <>
              <div className="text-[9px] uppercase tracking-wide text-zinc-400 px-2 py-1">Likely</div>
              {likely.map((h) => (
                <button
                  key={`likely-${h}`}
                  type="button"
                  onClick={() => { onSelect(h); setOpen(false); }}
                  className={`block w-full text-left text-[10px] font-mono px-2 py-1 hover:bg-blue-500/10 ${h === value ? "bg-blue-500/5 text-blue-500 font-semibold" : "text-zinc-600 dark:text-zinc-400"}`}
                >
                  {h}
                </button>
              ))}
            </>
          )}
          {otherHeaders.length > 0 && (
            <>
              {likely.length > 0 && <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />}
              <div className="text-[9px] uppercase tracking-wide text-zinc-400 px-2 py-1">All Headers</div>
              {otherHeaders.map((h) => (
                <button
                  key={`all-${h}`}
                  type="button"
                  onClick={() => { onSelect(h); setOpen(false); }}
                  className={`block w-full text-left text-[10px] font-mono px-2 py-1 hover:bg-blue-500/10 ${h === value ? "bg-blue-500/5 text-blue-500 font-semibold" : "text-zinc-600 dark:text-zinc-400"}`}
                >
                  {h}
                </button>
              ))}
            </>
          )}
          {overridden && (
            <>
              <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
              <button
                type="button"
                onClick={() => { onSelect(null); setOpen(false); }}
                className="block w-full text-left text-[10px] px-2 py-1 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
              >
                Clear domain override
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

