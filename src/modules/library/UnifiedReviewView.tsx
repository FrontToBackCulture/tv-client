// src/modules/library/UnifiedReviewView.tsx
// Unified split-view review mode for all resource types: tables, queries, dashboards, workflows
// Grid on left, detail preview on right. Tables get batch action buttons; artifacts don't.

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle, AlertTriangle, Loader2, FileText, Database, RefreshCw, Tags, Sparkles, Globe, ChevronDown } from "lucide-react";
import { ReviewGrid, ReviewGridHandle } from "./ReviewGrid";
import { TableDetailPreview } from "./TableDetailPreview";
import { ArtifactDetailPreview } from "./ArtifactDetailPreview";
import { AddToDataModelDialog } from "./AddToDataModelDialog";
import { cn } from "../../lib/cn";
import { useJobsStore } from "../../stores/jobsStore";
import { useClassificationStore } from "../../stores/classificationStore";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

import type { ReviewResourceType, ReviewRow } from "./reviewTypes";
import { EDITABLE_FIELDS, FIELD_TO_STORE, RESOURCE_LABEL } from "./reviewTypes";

// Storage key for panel width
const PANEL_WIDTH_KEY = "tv-desktop-review-panel-width";

function getPanelWidth(): number {
  if (typeof window === "undefined") return 400;
  const stored = localStorage.getItem(PANEL_WIDTH_KEY);
  return stored ? parseInt(stored, 10) : 400;
}

function savePanelWidth(width: number): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(PANEL_WIDTH_KEY, String(width));
  }
}

interface UnifiedReviewViewProps {
  resourceType: ReviewResourceType;
  folderPath: string;
  domainName: string;
  onItemSelect?: (path: string) => void;
}

export function UnifiedReviewView({
  resourceType,
  folderPath,
  domainName,
  onItemSelect,
}: UnifiedReviewViewProps) {
  const isTable = resourceType === "table";

  // Selected row for detail preview
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedRowData, setSelectedRowData] = useState<ReviewRow | null>(null);

  // Modified rows tracking — Map<key, modifiedFields>
  // For tables: key = table name; for artifacts: key = folderName
  const [modifiedRows, setModifiedRows] = useState<Map<string, Partial<ReviewRow>>>(new Map());

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Grid ref for accessing filtered rows
  const gridRef = useRef<ReviewGridHandle>(null);

  // Classification store for auto-adding new values
  const classificationStore = useClassificationStore();

  // Panel resizing
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(400);

  // Add to Data Model dialog state (tables only)
  const [addToDataModelRow, setAddToDataModelRow] = useState<ReviewRow | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Jobs store for background operations (tables only)
  const { addJob, updateJob, jobs } = useJobsStore();

  // Check if any batch operation is running
  const runningJobs = jobs.filter((j) => j.status === "running");
  const isBatchRunning = runningJobs.some((j) =>
    j.id.startsWith("fetch-samples-") || j.id.startsWith("fetch-categorical-") || j.id.startsWith("fetch-details-") || j.id.startsWith("analyze-all-") || j.id.startsWith("generate-overviews-")
  );

  // Get item names from grid's current filter state
  const getTargetNames = useCallback((): string[] => {
    return gridRef.current?.getFilteredNames() ?? [];
  }, []);

  // Initialize panel width from localStorage
  useEffect(() => {
    setPanelWidth(getPanelWidth());
  }, []);

  // Handle panel resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = startXRef.current - e.clientX;
      const newWidth = startWidthRef.current + deltaX;
      const maxWidth = Math.min(900, window.innerWidth * 0.6);
      const clamped = Math.max(300, Math.min(maxWidth, newWidth));
      setPanelWidth(clamped);
      savePanelWidth(clamped);
    };
    const handleMouseUp = () => {
      if (isResizing) setIsResizing(false);
    };
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // Sync new classification values from an analysis result file into the store (tables only)
  const syncAnalysisToStore = useCallback(async (filePath: string) => {
    try {
      const content = await invoke<string>("read_file", { path: filePath });
      const analysis = JSON.parse(content);
      if (analysis.dataCategory) classificationStore.addValue("dataCategory", analysis.dataCategory);
      if (analysis.dataSubCategory) classificationStore.addValue("dataSubCategory", analysis.dataSubCategory);
      if (analysis.tags) {
        const tags = (analysis.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean);
        classificationStore.addValues("tags", tags);
      }
      if (analysis.classification?.dataType) classificationStore.addValue("dataType", analysis.classification.dataType);
      if (analysis.usageStatus) classificationStore.addValue("usageStatus", analysis.usageStatus);
    } catch { /* Non-critical */ }
  }, [classificationStore]);

  // Handle row selection
  const handleRowSelected = useCallback((path: string | null, name: string | null, rowData: ReviewRow | null) => {
    setSelectedPath(path);
    setSelectedName(name);
    setSelectedRowData(rowData);
  }, []);

  // Auto-add new values from edits to the classification store
  const syncEditToStore = useCallback((field: string, value: unknown) => {
    const storeField = FIELD_TO_STORE[field];
    if (!storeField || !value || typeof value !== "string") return;
    if (storeField === "tags") {
      const tags = value.split(",").map((t: string) => t.trim()).filter(Boolean);
      classificationStore.addValues("tags", tags);
    } else {
      classificationStore.addValue(storeField, value);
    }
  }, [classificationStore]);

  // Handle cell edit from grid
  const handleCellEdited = useCallback((key: string, field: string, newValue: unknown) => {
    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(key) || {};
      newMap.set(key, { ...existing, [field]: newValue });
      return newMap;
    });

    if (key === selectedName) {
      setSelectedRowData((prev) => prev ? { ...prev, [field]: newValue } as ReviewRow : null);
    }

    syncEditToStore(field, newValue);
    setSaveSuccess(false);
  }, [selectedName, syncEditToStore]);

  // Handle field change from detail panel
  const handleDetailFieldChange = useCallback((field: string, value: string | number | null) => {
    if (!selectedName || !selectedRowData) return;

    setSelectedRowData((prev) => prev ? { ...prev, [field]: value } : null);

    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(selectedName) || {};
      newMap.set(selectedName, { ...existing, [field]: value });
      return newMap;
    });

    syncEditToStore(field, value);
    setSaveSuccess(false);
  }, [selectedName, selectedRowData, syncEditToStore]);

  // Show toast
  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Portal sync state
  const [isSyncing, setIsSyncing] = useState(false);

  // Extract domain slug from folderPath
  const domainSlug = useMemo(() => {
    const parts = folderPath.split("/");
    const prodIdx = parts.indexOf("production");
    return prodIdx !== -1 && prodIdx + 1 < parts.length ? parts[prodIdx + 1] : null;
  }, [folderPath]);

  // Sync portal resources to Supabase
  const handleSyncToPortal = useCallback(async () => {
    if (!isSupabaseConfigured || !domainSlug) {
      showToast("Supabase not configured or domain not detected", "error");
      return;
    }

    const allRows = gridRef.current?.getAllRows() ?? [];
    if (allRows.length === 0) {
      showToast("No data to sync", "error");
      return;
    }

    setIsSyncing(true);

    try {
      const portalResourceType = isTable ? "table" : resourceType;
      const resourcesToInclude = allRows
        .filter((r) => r.includeSitemap && r.sitemapGroup1)
        .map((r) => {
          const resourceId = isTable ? r.name : r.folderName;
          return {
            domain: domainSlug,
            resource_id: resourceId,
            name: r.displayName || r.name,
            description: r.summaryShort || null,
            resource_type: portalResourceType,
            resource_url: r.resourceUrl || null,
            sitemap_group1: r.sitemapGroup1,
            sitemap_group2: r.sitemapGroup2 || r.sitemapGroup1,
            solution: r.solution || null,
            include_sitemap: true,
          };
        });

      // For artifacts, read portal-content.md
      if (!isTable) {
        for (const resource of resourcesToInclude) {
          try {
            const contentPath = `${folderPath}/${resource.resource_id}/portal-content.md`;
            const portalContent = await invoke<string>("read_file", { path: contentPath });
            (resource as Record<string, unknown>).portal_content = portalContent;
          } catch { /* No portal-content.md */ }
        }
      }

      // Get existing resources for this domain + type in Supabase
      const { data: existing, error: fetchErr } = await supabase
        .from("portal_resources")
        .select("resource_id")
        .eq("domain", domainSlug)
        .eq("resource_type", portalResourceType);
      if (fetchErr) throw new Error(fetchErr.message);

      const includedIds = new Set(resourcesToInclude.map((r) => r.resource_id));
      const toDelete = (existing || [])
        .map((e: { resource_id: string }) => e.resource_id)
        .filter((id: string) => !includedIds.has(id));

      if (resourcesToInclude.length > 0) {
        const { error: upsertErr } = await supabase
          .from("portal_resources")
          .upsert(resourcesToInclude, { onConflict: "domain,resource_id" });
        if (upsertErr) throw new Error(upsertErr.message);
      }

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("portal_resources")
          .delete()
          .eq("domain", domainSlug)
          .eq("resource_type", portalResourceType)
          .in("resource_id", toDelete);
        if (delErr) throw new Error(delErr.message);
      }

      const msg = [];
      if (resourcesToInclude.length > 0) msg.push(`${resourcesToInclude.length} synced`);
      if (toDelete.length > 0) msg.push(`${toDelete.length} removed`);
      showToast(`Portal: ${msg.join(", ") || "no changes"}`, "success");
    } catch (err) {
      showToast(`Sync failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setIsSyncing(false);
    }
  }, [domainSlug, isTable, resourceType, folderPath, showToast]);

  // Save changes to definition_analysis.json files
  const handleSave = useCallback(async () => {
    if (modifiedRows.size === 0) return;

    setIsSaving(true);
    setSaveError(null);

    const savedKeys: string[] = [];

    try {
      for (const [key, changes] of modifiedRows.entries()) {
        // Build the item path
        const itemPath = isTable
          ? `${folderPath}/table_${key}`
          : `${folderPath}/${key}`;
        const analysisPath = `${itemPath}/definition_analysis.json`;

        // Read existing file or create new structure
        let analysis: Record<string, unknown> = {};
        try {
          const content = await invoke<string>("read_file", { path: analysisPath });
          analysis = JSON.parse(content);
        } catch { /* File doesn't exist, will create new */ }

        // Merge changes
        for (const [field, value] of Object.entries(changes)) {
          if (field === "dataType") {
            if (!analysis.classification) analysis.classification = {};
            (analysis.classification as Record<string, unknown>).dataType = value;
          } else if (field === "summaryShort") {
            if (!analysis.summary) analysis.summary = {};
            (analysis.summary as Record<string, unknown>).short = value;
          } else if (field === "summaryFull") {
            if (!analysis.summary) analysis.summary = {};
            (analysis.summary as Record<string, unknown>).full = value;
          } else if (field === "includeSitemap") {
            analysis.includeSitemap = value === true || value === "true";
          } else if (EDITABLE_FIELDS.has(field)) {
            analysis[field] = value;
          }
        }

        await invoke("write_file", {
          path: analysisPath,
          content: JSON.stringify(analysis, null, 2),
        });

        savedKeys.push(key);
      }

      // Regenerate overview.md for modified tables
      if (isTable) {
        for (const tableName of savedKeys) {
          try {
            await invoke("val_generate_table_overview_md", {
              domain: domainName,
              tableName,
              overwrite: true,
            });
          } catch (e) {
            console.warn(`Failed to regenerate overview.md for ${tableName}:`, e);
          }
        }
      }

      setModifiedRows(new Map());
      setSaveSuccess(true);
      showToast(`Saved changes to ${savedKeys.length} item(s)`, "success");
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to save changes";
      setSaveError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setIsSaving(false);
    }
  }, [modifiedRows, folderPath, domainName, isTable, showToast]);

  // Auto-save with debounce (2 seconds after last change)
  useEffect(() => {
    if (modifiedRows.size === 0) return;
    const timer = setTimeout(() => { handleSave(); }, 2000);
    return () => clearTimeout(timer);
  }, [modifiedRows, handleSave]);

  // Sync to grid — save immediately
  const handleSyncToGrid = useCallback(async () => {
    if (modifiedRows.size === 0) {
      showToast("Already synced", "success");
      return;
    }
    await handleSave();
  }, [modifiedRows.size, handleSave, showToast]);

  // Close detail panel
  const handleCloseDetail = useCallback(() => {
    setSelectedPath(null);
    setSelectedName(null);
    setSelectedRowData(null);
  }, []);

  // ─── Table-only batch operations ──────────────────────────────────────────

  const handleGenerateAllOverviews = useCallback(async () => {
    if (isBatchRunning) return;
    const names = getTargetNames();
    if (names.length === 0) return;
    const jobId = `generate-overviews-${Date.now()}`;
    addJob({ id: jobId, name: `Generate Overviews (${names.length} tables)`, status: "running", progress: 0, message: "Starting..." });
    try {
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < names.length; i++) {
        updateJob(jobId, { progress: Math.round(((i + 1) / names.length) * 100), message: `${i + 1}/${names.length}: ${names[i]}` });
        try { await invoke("val_generate_table_overview_md", { domain: domainName, tableName: names[i], overwrite: true }); successCount++; }
        catch { errorCount++; }
      }
      updateJob(jobId, { status: errorCount > 0 ? "failed" : "completed", progress: 100, message: `Generated ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}` });
    } catch (e) { updateJob(jobId, { status: "failed", message: e instanceof Error ? e.message : "Failed" }); }
  }, [isBatchRunning, getTargetNames, domainName, addJob, updateJob]);

  const handleFetchAllSamples = useCallback(async () => {
    if (isBatchRunning) return;
    const names = getTargetNames();
    if (names.length === 0) return;
    const jobId = `fetch-samples-${Date.now()}`;
    addJob({ id: jobId, name: `Fetch Samples (${names.length} tables)`, status: "running", progress: 0, message: "Starting..." });
    try {
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < names.length; i++) {
        updateJob(jobId, { progress: Math.round(((i + 1) / names.length) * 100), message: `${i + 1}/${names.length}: ${names[i]}` });
        try { await invoke("val_sample_table_data", { domain: domainName, tableName: names[i], overwrite: true, rowCount: 20, orderBy: null }); successCount++; }
        catch { errorCount++; }
      }
      updateJob(jobId, { status: errorCount > 0 ? "failed" : "completed", progress: 100, message: `Fetched ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}` });
    } catch (e) { updateJob(jobId, { status: "failed", message: e instanceof Error ? e.message : "Failed" }); }
  }, [isBatchRunning, getTargetNames, domainName, addJob, updateJob]);

  const handleFetchAllCategorical = useCallback(async () => {
    if (isBatchRunning) return;
    const names = getTargetNames();
    if (names.length === 0) return;
    const jobId = `fetch-categorical-${Date.now()}`;
    addJob({ id: jobId, name: `Fetch Categorical (${names.length} tables)`, status: "running", progress: 0, message: "Starting..." });
    try {
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < names.length; i++) {
        updateJob(jobId, { progress: Math.round(((i + 1) / names.length) * 100), message: `${i + 1}/${names.length}: ${names[i]}` });
        try { await invoke("val_fetch_categorical_values", { domain: domainName, tableName: names[i], overwrite: true, schemaPath: null }); successCount++; }
        catch { errorCount++; }
      }
      updateJob(jobId, { status: errorCount > 0 ? "failed" : "completed", progress: 100, message: `Fetched ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}` });
    } catch (e) { updateJob(jobId, { status: "failed", message: e instanceof Error ? e.message : "Failed" }); }
  }, [isBatchRunning, getTargetNames, domainName, addJob, updateJob]);

  const handleFetchAllDetails = useCallback(async () => {
    if (isBatchRunning) return;
    const names = getTargetNames();
    if (names.length === 0) return;
    const jobId = `fetch-details-${Date.now()}`;
    addJob({ id: jobId, name: `Fetch Details (${names.length} tables)`, status: "running", progress: 0, message: "Starting..." });
    try {
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < names.length; i++) {
        updateJob(jobId, { progress: Math.round(((i + 1) / names.length) * 100), message: `${i + 1}/${names.length}: ${names[i]}` });
        try { await invoke("val_prepare_table_overview", { domain: domainName, tableName: names[i], overwrite: true, skipSql: false, freshnessColumn: null }); successCount++; }
        catch { errorCount++; }
      }
      updateJob(jobId, { status: errorCount > 0 ? "failed" : "completed", progress: 100, message: `Fetched ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}` });
    } catch (e) { updateJob(jobId, { status: "failed", message: e instanceof Error ? e.message : "Failed" }); }
  }, [isBatchRunning, getTargetNames, domainName, addJob, updateJob]);

  const handleDescribeAll = useCallback(async () => {
    if (isBatchRunning) return;
    const names = getTargetNames();
    if (names.length === 0) return;
    const jobId = `describe-all-${Date.now()}`;
    addJob({ id: jobId, name: `AI Describe (${names.length} tables)`, status: "running", progress: 0, message: "Starting..." });
    try {
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < names.length; i++) {
        updateJob(jobId, { progress: Math.round(((i + 1) / names.length) * 100), message: `${i + 1}/${names.length}: ${names[i]}` });
        try { await invoke<{ file_path?: string }>("val_describe_table_data", { domain: domainName, tableName: names[i], overwrite: true }); successCount++; }
        catch { errorCount++; }
      }
      updateJob(jobId, { status: errorCount > 0 ? "failed" : "completed", progress: 100, message: `Described ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}` });
    } catch (e) { updateJob(jobId, { status: "failed", message: e instanceof Error ? e.message : "Failed" }); }
  }, [isBatchRunning, getTargetNames, domainName, addJob, updateJob]);

  const handleClassifyAll = useCallback(async () => {
    if (isBatchRunning) return;
    const names = getTargetNames();
    if (names.length === 0) return;
    const jobId = `classify-all-${Date.now()}`;
    addJob({ id: jobId, name: `AI Classify (${names.length} tables)`, status: "running", progress: 0, message: "Starting..." });
    try {
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < names.length; i++) {
        updateJob(jobId, { progress: Math.round(((i + 1) / names.length) * 100), message: `${i + 1}/${names.length}: ${names[i]}` });
        try {
          const result = await invoke<{ file_path?: string }>("val_classify_table_data", { domain: domainName, tableName: names[i], overwrite: true });
          successCount++;
          if (result.file_path) await syncAnalysisToStore(result.file_path);
        } catch { errorCount++; }
      }
      updateJob(jobId, { status: errorCount > 0 ? "failed" : "completed", progress: 100, message: `Classified ${successCount}${errorCount > 0 ? `, ${errorCount} errors` : ""}` });
    } catch (e) { updateJob(jobId, { status: "failed", message: e instanceof Error ? e.message : "Failed" }); }
  }, [isBatchRunning, getTargetNames, domainName, addJob, updateJob, syncAnalysisToStore]);

  const modifiedCount = modifiedRows.size;

  return (
    <div className="h-full flex flex-col">
      {/* Header toolbar */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {isTable ? "Review Mode" : `${RESOURCE_LABEL[resourceType]} Review`}
          </h2>
          <p className="text-sm text-zinc-500">
            {domainName} • Click row to preview, edit fields inline
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Modified count indicator */}
          {modifiedCount > 0 && !isSaving && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              {modifiedCount} unsaved
            </span>
          )}

          {/* Save success indicator */}
          {saveSuccess && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              <CheckCircle size={12} />
              Saved
            </span>
          )}

          {/* Save error indicator */}
          {saveError && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
              <AlertTriangle size={12} />
              Error
            </span>
          )}

          {/* Auto-saving indicator */}
          {isSaving && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              <Loader2 size={12} className="animate-spin" />
              Saving...
            </span>
          )}

          {/* Table-only batch action dropdowns */}
          {isTable && (
            <>
              {/* Fetch dropdown */}
              <div className="relative group" data-help-id="review-fetch">
                <button
                  disabled={isBatchRunning}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Database size={14} /> Fetch <ChevronDown size={12} />
                </button>
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 py-1 hidden group-hover:block">
                  <button onClick={handleFetchAllSamples} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-50">
                    <Database size={13} /> Samples
                  </button>
                  <button onClick={handleFetchAllCategorical} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-50">
                    <Tags size={13} /> Categorical
                  </button>
                  <button onClick={handleFetchAllDetails} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-50">
                    <RefreshCw size={13} /> Details
                  </button>
                </div>
              </div>

              {/* AI dropdown */}
              <div className="relative group" data-help-id="review-ai">
                <button
                  disabled={isBatchRunning}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles size={14} /> AI <ChevronDown size={12} />
                </button>
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 py-1 hidden group-hover:block">
                  <button onClick={handleDescribeAll} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-50">
                    <Sparkles size={13} /> Describe All
                  </button>
                  <button onClick={handleClassifyAll} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-50">
                    <Tags size={13} /> Classify All
                  </button>
                  <button onClick={handleGenerateAllOverviews} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-50">
                    <FileText size={13} /> Generate Overviews
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Sync to Portal */}
          {domainSlug && (
            <button
              onClick={handleSyncToPortal}
              disabled={isSyncing || modifiedCount > 0}
              data-help-id="review-sync-portal"
              title={modifiedCount > 0 ? "Save changes before syncing" : "Sync resources to portal"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                isSyncing
                  ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                  : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
              {isSyncing ? "Syncing..." : "Sync to Portal"}
            </button>
          )}

        </div>
      </div>

      {/* Split content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: AG Grid */}
        <div className="flex-1 overflow-hidden">
          <ReviewGrid
            ref={gridRef}
            resourceType={resourceType}
            folderPath={folderPath}
            domainName={domainName}
            domainSlug={domainSlug}
            onItemSelect={onItemSelect}
            reviewMode={true}
            onRowSelected={handleRowSelected}
            onCellEdited={handleCellEdited}
            modifiedRows={modifiedRows}
            onAddToDataModel={isTable ? setAddToDataModelRow : undefined}
          />
        </div>

        {/* Resize handle */}
        {selectedPath && (
          <div
            onMouseDown={handleMouseDown}
            className="relative w-2 cursor-col-resize group flex-shrink-0 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
          >
            <div
              className={cn(
                "absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 transition-all",
                isResizing
                  ? "bg-teal-500"
                  : "bg-zinc-300 dark:bg-zinc-700 group-hover:bg-teal-500"
              )}
            />
          </div>
        )}

        {/* Right: Detail panel */}
        {selectedPath && selectedName && selectedRowData && (
          <div
            className="flex-shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-hidden"
            style={{
              width: panelWidth,
              transition: isResizing ? "none" : "width 200ms",
            }}
          >
            {isTable ? (
              <TableDetailPreview
                tablePath={selectedPath}
                tableName={selectedName}
                rowData={selectedRowData}
                onClose={handleCloseDetail}
                onNavigate={onItemSelect}
                onFieldChange={handleDetailFieldChange}
                onSaveBeforeGenerate={handleSave}
                onSyncToGrid={handleSyncToGrid}
              />
            ) : (
              <ArtifactDetailPreview
                artifactType={resourceType as "query" | "dashboard" | "workflow"}
                row={selectedRowData}
                onClose={handleCloseDetail}
                onFieldChange={handleDetailFieldChange}
                onNavigate={onItemSelect}
              />
            )}
          </div>
        )}
      </div>

      {/* Add to Data Model dialog (tables only) */}
      {addToDataModelRow && (
        <AddToDataModelDialog
          table={addToDataModelRow}
          dataModelsPath={folderPath}
          onClose={() => setAddToDataModelRow(null)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity",
            toast.type === "success"
              ? "bg-teal-600 dark:bg-teal-900 text-white dark:text-teal-100"
              : "bg-red-600 dark:bg-red-900 text-white dark:text-red-100"
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
