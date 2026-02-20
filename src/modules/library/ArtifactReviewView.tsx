// src/modules/library/ArtifactReviewView.tsx
// Generic split-view review mode for queries, dashboards, and workflows
// Same pattern as DataModelsReviewView but parameterized by artifact type

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ColumnState,
  ModuleRegistry,
  AllCommunityModule,
  CellValueChangedEvent,
  RowClickedEvent,
  GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { CheckCircle, AlertTriangle, Loader2, Search, Filter, RotateCcw, ChevronsLeftRight, Columns, Bookmark, X, Globe, Star, Save } from "lucide-react";
import { ArtifactDetailPreview } from "./ArtifactDetailPreview";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../stores/appStore";
import { useClassificationStore, type ClassificationField } from "../../stores/classificationStore";
import { buildDomainUrl } from "../../lib/domainUrl";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

export type ArtifactType = "query" | "dashboard" | "workflow";

/** Flat row for AG Grid — shared classification fields + type-specific read-only fields */
export interface ArtifactRow {
  // Identity
  id: string;
  name: string;
  folderName: string;
  folderPath: string;
  // Dates
  createdDate: string | null;
  updatedDate: string | null;
  // Classification (editable)
  dataType: string | null;
  dataCategory: string | null;
  dataSubCategory: string | null;
  usageStatus: string | null;
  action: string | null;
  dataSource: string | null;
  sourceSystem: string | null;
  tags: string | null;
  suggestedName: string | null;
  summaryShort: string | null;
  summaryFull: string | null;
  // Portal / sitemap fields
  includeSitemap: boolean;
  sitemapGroup1: string | null;
  sitemapGroup2: string | null;
  solution: string | null;
  resourceUrl: string | null;
  // Type-specific read-only
  category: string | null;        // queries & dashboards
  tableName: string | null;       // queries
  fieldCount: number | null;      // queries
  widgetCount: number | null;     // dashboards
  creatorName: string | null;     // dashboards
  isScheduled: boolean | null;    // workflows
  cronExpression: string | null;  // workflows
  pluginCount: number | null;     // workflows
  description: string | null;     // workflows
}

// Storage key for panel width
const PANEL_WIDTH_KEY = "tv-desktop-artifact-review-panel-width";

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

interface ArtifactReviewViewProps {
  artifactType: ArtifactType;
  folderPath: string;
  domainName: string;
  onItemSelect?: (path: string) => void;
}

// Classification fields that are editable
const EDITABLE_FIELDS = new Set([
  "dataType", "dataCategory", "dataSubCategory", "usageStatus",
  "action", "dataSource", "sourceSystem", "tags",
  "suggestedName", "summaryShort", "summaryFull",
  "includeSitemap", "sitemapGroup1", "sitemapGroup2", "solution", "resourceUrl",
]);

// Map grid field names to classification store fields
const FIELD_TO_STORE: Record<string, ClassificationField> = {
  dataCategory: "dataCategory",
  dataSubCategory: "dataSubCategory",
  usageStatus: "usageStatus",
  action: "action",
  dataSource: "dataSource",
  sourceSystem: "sourceSystem",
  tags: "tags",
  sitemapGroup1: "sitemapGroup1",
  sitemapGroup2: "sitemapGroup2",
  solution: "solution",
};

// Folder prefix for each artifact type
const FOLDER_PREFIX: Record<ArtifactType, string> = {
  query: "query_",
  dashboard: "dashboard_",
  workflow: "workflow_",
};

// Label for each artifact type
const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  query: "Queries",
  dashboard: "Dashboards",
  workflow: "Workflows",
};

export function ArtifactReviewView({
  artifactType,
  folderPath,
  domainName,
  onItemSelect,
}: ArtifactReviewViewProps) {
  // Theme
  const theme = useAppStore((s) => s.theme);

  // Grid data
  const [rowData, setRowData] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected row for detail preview
  const [selectedRow, setSelectedRow] = useState<ArtifactRow | null>(null);

  // Modified rows tracking
  const [modifiedRows, setModifiedRows] = useState<Map<string, Partial<ArtifactRow>>>(new Map());

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Classification store
  const classificationStore = useClassificationStore();

  // Panel resizing
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(400);

  // Toolbar state
  const [quickFilterText, setQuickFilterText] = useState("");
  const [reviewFilter, setReviewFilter] = useState<"all" | "needs-review" | "modified">("all");

  // Layout state
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>({});
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [defaultLayoutName, setDefaultLayoutName] = useState<string | null>(null);
  const defaultAppliedRef = useRef(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Grid ref
  const gridRef = useRef<AgGridReact>(null);

  // Initialize panel width from localStorage
  useEffect(() => {
    setPanelWidth(getPanelWidth());
  }, []);

  // Load saved layouts and default from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("tv-desktop-artifact-review-layouts");
    if (stored) {
      try { setSavedLayouts(JSON.parse(stored)); } catch { /* ignore */ }
    }
    const defaultName = localStorage.getItem("tv-desktop-artifact-review-default-layout");
    if (defaultName) setDefaultLayoutName(defaultName);
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

  // Show toast
  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Portal sync state
  const [isSyncing, setIsSyncing] = useState(false);

  // Extract domain slug from folderPath (e.g. .../domains/production/mb/dashboards → mb)
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

    setIsSyncing(true);

    try {
      // Build resources from current grid data
      const resourcesToInclude = rowData
        .filter((r) => r.includeSitemap && r.sitemapGroup1)
        .map((r) => {
          return {
            domain: domainSlug,
            resource_id: r.folderName,
            name: r.name,
            description: r.summaryShort || null,
            resource_type: artifactType,
            resource_url: r.resourceUrl || null,
            sitemap_group1: r.sitemapGroup1,
            sitemap_group2: r.sitemapGroup2 || r.sitemapGroup1,
            solution: r.solution || null,
            include_sitemap: true,
          };
        });

      // Read portal-content.md for each included resource
      for (const resource of resourcesToInclude) {
        try {
          const contentPath = `${folderPath}/${resource.resource_id}/portal-content.md`;
          const portalContent = await invoke<string>("read_file", { path: contentPath });
          (resource as Record<string, unknown>).portal_content = portalContent;
        } catch {
          // No portal-content.md, skip
        }
      }

      // Get existing resources for this domain + type in Supabase
      const { data: existing, error: fetchErr } = await supabase
        .from("portal_resources")
        .select("resource_id")
        .eq("domain", domainSlug)
        .eq("resource_type", artifactType);
      if (fetchErr) throw new Error(fetchErr.message);

      const includedIds = new Set(resourcesToInclude.map((r) => r.resource_id));
      const toDelete = (existing || [])
        .map((e: { resource_id: string }) => e.resource_id)
        .filter((id: string) => !includedIds.has(id));

      // Upsert included resources
      if (resourcesToInclude.length > 0) {
        const { error: upsertErr } = await supabase
          .from("portal_resources")
          .upsert(resourcesToInclude, { onConflict: "domain,resource_id" });
        if (upsertErr) throw new Error(upsertErr.message);
      }

      // Delete removed resources
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("portal_resources")
          .delete()
          .eq("domain", domainSlug)
          .eq("resource_type", artifactType)
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
  }, [rowData, domainSlug, artifactType, folderPath, showToast]);

  // Load data from folders
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const entries = await invoke<Array<{ name: string; path: string; is_directory: boolean }>>(
          "list_directory",
          { path: folderPath }
        );

        const prefix = FOLDER_PREFIX[artifactType];
        const dirs = entries.filter((e) => e.is_directory && (prefix ? e.name.startsWith(prefix) : !e.name.startsWith(".")));

        const rows: ArtifactRow[] = await Promise.all(
          dirs.map(async (dir) => {
            const row: ArtifactRow = {
              id: dir.name,
              name: dir.name,
              folderName: dir.name,
              folderPath: dir.path,
              createdDate: null,
              updatedDate: null,
              dataType: null,
              dataCategory: null,
              dataSubCategory: null,
              usageStatus: null,
              action: null,
              dataSource: null,
              sourceSystem: null,
              tags: null,
              suggestedName: null,
              summaryShort: null,
              summaryFull: null,
              includeSitemap: false,
              sitemapGroup1: null,
              sitemapGroup2: null,
              solution: null,
              resourceUrl: null,
              category: null,
              tableName: null,
              fieldCount: null,
              widgetCount: null,
              creatorName: null,
              isScheduled: null,
              cronExpression: null,
              pluginCount: null,
              description: null,
            };

            // Read definition.json
            try {
              const defContent = await invoke<string>("read_file", {
                path: `${dir.path}/definition.json`,
              });
              const def = JSON.parse(defContent);

              row.name = def.name || def.displayName || dir.name;
              row.id = String(def.id ?? dir.name);
              row.createdDate = def.created_date || null;
              row.updatedDate = def.updated_date || null;

              // Type-specific fields
              if (artifactType === "query") {
                row.category = def.category || null;
                row.tableName = def.datasource?.queryInfo?.tableInfo?.name || null;
                row.fieldCount = def.datasource?.queryInfo?.tableInfo?.fields?.length ?? null;
              } else if (artifactType === "dashboard") {
                row.category = def.category || null;
                row.widgetCount = Array.isArray(def.widgets) ? def.widgets.length : null;
                row.creatorName = def.created_by || null;
              } else if (artifactType === "workflow") {
                row.isScheduled = !!def.cron_expression;
                row.cronExpression = def.cron_expression || null;
                row.pluginCount = def.data?.workflow?.plugins?.length ?? null;
                row.description = def.description || null;
              }
            } catch {
              // No definition.json
            }

            // Read definition_analysis.json for classification
            try {
              const analysisContent = await invoke<string>("read_file", {
                path: `${dir.path}/definition_analysis.json`,
              });
              const analysis = JSON.parse(analysisContent);

              row.dataType = analysis.classification?.dataType || analysis.dataType || null;
              row.dataCategory = analysis.dataCategory || null;
              row.dataSubCategory = analysis.dataSubCategory || null;
              row.usageStatus = analysis.usageStatus || null;
              row.action = analysis.action || null;
              row.dataSource = analysis.dataSource || null;
              row.sourceSystem = analysis.sourceSystem || null;
              row.tags = analysis.tags || null;
              row.suggestedName = analysis.suggestedName || null;
              row.summaryShort = analysis.summary?.short || null;
              row.summaryFull = analysis.summary?.full || null;
              row.includeSitemap = analysis.includeSitemap === true;
              row.sitemapGroup1 = analysis.sitemapGroup1 || null;
              row.sitemapGroup2 = analysis.sitemapGroup2 || null;
              row.solution = analysis.solution || null;
              row.resourceUrl = analysis.resourceUrl || null;
            } catch {
              // No analysis file
            }

            // Auto-populate resourceUrl from folder path if not set
            if (!row.resourceUrl) {
              row.resourceUrl = buildDomainUrl(dir.path) || null;
            }

            return row;
          })
        );

        if (!cancelled) {
          rows.sort((a, b) => a.name.localeCompare(b.name));
          setRowData(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [folderPath, artifactType]);

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
  const handleCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const { data, colDef, newValue } = event;
    const field = colDef.field;
    if (!field || !EDITABLE_FIELDS.has(field)) return;

    const folderName = data.folderName;

    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(folderName) || {};
      newMap.set(folderName, { ...existing, [field]: newValue });
      return newMap;
    });

    // Update selected row if it's the same
    if (selectedRow?.folderName === folderName) {
      setSelectedRow((prev) => prev ? { ...prev, [field]: newValue } : null);
    }

    syncEditToStore(field, newValue);
    setSaveSuccess(false);
  }, [selectedRow, syncEditToStore]);

  // Handle field change from detail panel
  const handleDetailFieldChange = useCallback((field: string, value: string | number | null) => {
    if (!selectedRow) return;

    setSelectedRow((prev) => prev ? { ...prev, [field]: value } : null);

    // Update grid row data
    setRowData((prev) =>
      prev.map((r) =>
        r.folderName === selectedRow.folderName ? { ...r, [field]: value } : r
      )
    );

    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(selectedRow.folderName) || {};
      newMap.set(selectedRow.folderName, { ...existing, [field]: value });
      return newMap;
    });

    syncEditToStore(field, value);
    setSaveSuccess(false);
  }, [selectedRow, syncEditToStore]);

  // Handle row click
  const handleRowClicked = useCallback((event: RowClickedEvent) => {
    const row = event.data as ArtifactRow;
    setSelectedRow(row);
  }, []);

  // Close detail panel
  const handleCloseDetail = useCallback(() => {
    setSelectedRow(null);
  }, []);

  // Auto-size all columns
  const autoSizeAllColumns = useCallback(() => {
    gridRef.current?.api?.autoSizeAllColumns();
  }, []);

  // Apply flat layout — pin category columns left, sort by category
  const applyFlatLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    const columnState = [
      { colId: "dataCategory", hide: false, pinned: "left" as const, width: 140 },
      { colId: "dataSubCategory", hide: false, pinned: "left" as const, width: 110 },
      { colId: "name", hide: false, pinned: null, width: 220 },
    ];

    api.applyColumnState({ state: columnState, applyOrder: false });
    api.applyColumnState({
      state: [
        { colId: "dataCategory", sort: "asc" as const, sortIndex: 0 },
        { colId: "dataSubCategory", sort: "asc" as const, sortIndex: 1 },
      ],
      defaultState: { sort: null },
    });
  }, []);

  // Reset layout + clear all filters
  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    setQuickFilterText("");
    setReviewFilter("all");
  }, []);

  // Save current layout
  const saveCurrentLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api || !name.trim()) return;

    const columnState = api.getColumnState();
    const filterModel = api.getFilterModel();
    const layout = { columnState, filterModel, savedAt: new Date().toISOString() };

    const newLayouts = { ...savedLayouts, [name.trim()]: layout };
    setSavedLayouts(newLayouts);
    localStorage.setItem("tv-desktop-artifact-review-layouts", JSON.stringify(newLayouts));
    setShowSaveDialog(false);
    setNewLayoutName("");
  }, [savedLayouts]);

  // Load a saved layout
  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;

    const layout = savedLayouts[name] as {
      columnState: ColumnState[];
      filterModel?: Record<string, unknown>;
    } | undefined;
    if (!layout) return;

    api.applyColumnState({ state: layout.columnState, applyOrder: true });
    if (layout.filterModel) {
      api.setFilterModel(layout.filterModel);
    } else {
      api.setFilterModel(null);
    }
    setShowLayoutMenu(false);
  }, [savedLayouts]);

  // Delete a saved layout
  const deleteLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLayouts = { ...savedLayouts };
    delete newLayouts[name];
    setSavedLayouts(newLayouts);
    localStorage.setItem("tv-desktop-artifact-review-layouts", JSON.stringify(newLayouts));
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem("tv-desktop-artifact-review-default-layout");
    }
  }, [savedLayouts, defaultLayoutName]);

  // Set/unset a layout as default
  const toggleDefaultLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem("tv-desktop-artifact-review-default-layout");
    } else {
      setDefaultLayoutName(name);
      localStorage.setItem("tv-desktop-artifact-review-default-layout", name);
    }
  }, [defaultLayoutName]);

  // Auto-apply default layout when grid data first renders
  useEffect(() => {
    if (defaultAppliedRef.current || !defaultLayoutName || !savedLayouts[defaultLayoutName]) return;
    const api = gridRef.current?.api;
    if (!api || rowData.length === 0) return;

    defaultAppliedRef.current = true;
    const layout = savedLayouts[defaultLayoutName] as { columnState: ColumnState[] };
    if (layout.columnState) {
      api.applyColumnState({ state: layout.columnState, applyOrder: true });
    }
  }, [defaultLayoutName, savedLayouts, rowData]);

  // Save changes to definition_analysis.json files
  const handleSave = useCallback(async () => {
    if (modifiedRows.size === 0) return;

    setIsSaving(true);
    setSaveError(null);

    const savedNames: string[] = [];

    try {
      for (const [folderName, changes] of modifiedRows.entries()) {
        const itemPath = `${folderPath}/${folderName}`;
        const analysisPath = `${itemPath}/definition_analysis.json`;

        // Read existing file or create new structure
        let analysis: Record<string, unknown> = {};
        try {
          const content = await invoke<string>("read_file", { path: analysisPath });
          analysis = JSON.parse(content);
        } catch {
          // File doesn't exist, will create new
        }

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

        savedNames.push(folderName);
      }

      setModifiedRows(new Map());
      setSaveSuccess(true);
      showToast(`Saved changes to ${savedNames.length} item(s)`, "success");
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to save changes";
      setSaveError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setIsSaving(false);
    }
  }, [modifiedRows, folderPath, showToast]);

  // Auto-save with debounce (2 seconds after last change)
  useEffect(() => {
    if (modifiedRows.size === 0) return;
    const timer = setTimeout(() => { handleSave(); }, 2000);
    return () => clearTimeout(timer);
  }, [modifiedRows, handleSave]);

  // Build column definitions based on artifact type
  const columnDefs = useMemo((): ColDef[] => {
    const classificationStore = useClassificationStore.getState();

    const baseCols: ColDef[] = [
      { field: "name", headerName: "Name", pinned: "left", width: 250, filter: "agTextColumnFilter" },
      { field: "id", headerName: "ID", width: 100, filter: "agTextColumnFilter" },
    ];

    // Type-specific columns
    const typeCols: ColDef[] = [];
    if (artifactType === "query") {
      typeCols.push(
        { field: "category", headerName: "Category", width: 110, filter: "agSetColumnFilter" },
        { field: "tableName", headerName: "Table", width: 180, filter: "agTextColumnFilter" },
        { field: "fieldCount", headerName: "Fields", width: 80, filter: "agNumberColumnFilter" },
      );
    } else if (artifactType === "dashboard") {
      typeCols.push(
        { field: "category", headerName: "Category", width: 110, filter: "agSetColumnFilter" },
        { field: "widgetCount", headerName: "Widgets", width: 90, filter: "agNumberColumnFilter" },
        { field: "creatorName", headerName: "Creator", width: 140, filter: "agTextColumnFilter" },
      );
    } else if (artifactType === "workflow") {
      typeCols.push(
        {
          field: "isScheduled",
          headerName: "Scheduled",
          width: 100,
          filter: "agSetColumnFilter",
          valueFormatter: (p) => p.value === true ? "Yes" : p.value === false ? "No" : "",
        },
        { field: "cronExpression", headerName: "Cron", width: 130, filter: "agTextColumnFilter" },
        { field: "pluginCount", headerName: "Plugins", width: 90, filter: "agNumberColumnFilter" },
        { field: "description", headerName: "Description", width: 200, filter: "agTextColumnFilter" },
      );
    }

    // Classification columns (editable)
    const classifCols: ColDef[] = [
      {
        field: "dataType",
        headerName: "Data Type",
        width: 130,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: classificationStore.getDropdownValues("dataType") },
        filter: "agSetColumnFilter",
      },
      {
        field: "dataCategory",
        headerName: "Category",
        width: 140,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: classificationStore.getDropdownValues("dataCategory") },
        filter: "agSetColumnFilter",
      },
      {
        field: "dataSubCategory",
        headerName: "Sub-Category",
        width: 150,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: classificationStore.getDropdownValues("dataSubCategory") },
        filter: "agSetColumnFilter",
      },
      {
        field: "usageStatus",
        headerName: "Usage",
        width: 120,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: classificationStore.getDropdownValues("usageStatus") },
        filter: "agSetColumnFilter",
      },
      {
        field: "action",
        headerName: "Action",
        width: 120,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: classificationStore.getDropdownValues("action") },
        filter: "agSetColumnFilter",
      },
      {
        field: "dataSource",
        headerName: "Data Source",
        width: 140,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: classificationStore.getDropdownValues("dataSource") },
        filter: "agSetColumnFilter",
      },
      {
        field: "sourceSystem",
        headerName: "Source System",
        width: 140,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: classificationStore.getDropdownValues("sourceSystem") },
        filter: "agSetColumnFilter",
      },
      {
        field: "includeSitemap",
        headerName: "Sitemap",
        width: 85,
        filter: "agSetColumnFilter",
        editable: true,
        cellRenderer: (params: { value: boolean }) =>
          params.value ? "Yes" : "",
        cellEditor: "agCheckboxCellEditor",
        headerTooltip: "Include on the client portal sitemap",
      },
      {
        field: "sitemapGroup1",
        headerName: "Sitemap Grp 1",
        width: 120,
        filter: "agSetColumnFilter",
        editable: true,
        cellEditor: "agTextCellEditor",
        headerTooltip: "Primary grouping on the portal sitemap",
      },
      {
        field: "sitemapGroup2",
        headerName: "Sitemap Grp 2",
        width: 120,
        filter: "agSetColumnFilter",
        editable: true,
        cellEditor: "agTextCellEditor",
        headerTooltip: "Secondary grouping on the portal sitemap",
      },
      {
        field: "solution",
        headerName: "Solution",
        width: 140,
        filter: "agSetColumnFilter",
        editable: true,
        cellEditor: "agTextCellEditor",
        headerTooltip: "Which VAL solution this resource belongs to",
      },
      {
        field: "resourceUrl",
        headerName: "URL",
        width: 250,
        editable: true,
        filter: "agTextColumnFilter",
        headerTooltip: "URL to access this resource in VAL",
      },
      {
        field: "tags",
        headerName: "Tags",
        width: 200,
        editable: true,
        filter: "agTextColumnFilter",
      },
      {
        field: "suggestedName",
        headerName: "Suggested Name",
        width: 180,
        editable: true,
        filter: "agTextColumnFilter",
      },
      {
        field: "summaryShort",
        headerName: "Summary",
        width: 250,
        editable: true,
        filter: "agTextColumnFilter",
      },
    ];

    // Date columns
    const dateCols: ColDef[] = [
      { field: "createdDate", headerName: "Created", width: 120, filter: "agDateColumnFilter" },
      { field: "updatedDate", headerName: "Updated", width: 120, filter: "agDateColumnFilter" },
    ];

    return [...baseCols, ...typeCols, ...classifCols, ...dateCols];
  }, [artifactType]);

  const defaultColDef = useMemo((): ColDef => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
  }), []);

  const getRowId = useCallback((params: GetRowIdParams) => params.data.folderName, []);

  const modifiedCount = modifiedRows.size;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
        <span className="ml-2 text-zinc-500">Loading {ARTIFACT_LABEL[artifactType].toLowerCase()}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <AlertTriangle size={20} className="text-red-400" />
        <span className="ml-2 text-red-400">{error}</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {ARTIFACT_LABEL[artifactType]} Review
          </h2>
          <p className="text-sm text-zinc-500">
            {domainName} • {rowData.length} items • Click row to preview, edit fields inline
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
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500">
              <Loader2 size={12} className="animate-spin" />
              Saving...
            </span>
          )}

          {/* Sync to Portal button */}
          {domainSlug && (
            <button
              onClick={handleSyncToPortal}
              disabled={isSyncing || modifiedCount > 0}
              title={modifiedCount > 0 ? "Save changes before syncing" : "Sync resources to portal"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                isSyncing
                  ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                  : "border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSyncing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Globe size={12} />
              )}
              {isSyncing ? "Syncing..." : "Sync to Portal"}
            </button>
          )}
        </div>
      </div>

      {/* Grid toolbar — matches DataModelsAgGrid review mode */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        {/* Left side: Search and filters */}
        <div className="flex items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Quick filter..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              className="w-full px-3 py-2 pl-9 text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Review filter buttons */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900 rounded-lg p-1">
            <button
              onClick={() => {
                setReviewFilter("all");
                gridRef.current?.api?.setFilterModel(null);
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
                reviewFilter === "all"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              All
            </button>
            <button
              onClick={() => {
                setReviewFilter("needs-review");
                gridRef.current?.api?.setFilterModel({
                  action: { filterType: "set", values: ["To Review"] },
                });
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
                reviewFilter === "needs-review"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              <Filter size={12} />
              Needs Review
            </button>
            <button
              onClick={() => {
                setReviewFilter("modified");
                gridRef.current?.api?.setFilterModel(null);
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
                reviewFilter === "modified"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              Modified ({modifiedCount})
            </button>
          </div>
        </div>

        {/* Right side: Layout actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={applyFlatLayout}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            title="Apply flat layout with Category pinned left"
          >
            <Columns size={14} />
            Flat
          </button>
          <button
            onClick={resetLayout}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            title="Reset to default layout"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            onClick={autoSizeAllColumns}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
            title="Auto-size all columns"
          >
            <ChevronsLeftRight size={14} />
            Fit
          </button>

          {/* Layouts dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
              title="Saved layouts"
            >
              <Bookmark size={14} />
              Layouts
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-slate-200 dark:border-zinc-700 z-50 py-1">
                <button
                  onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <span className="text-green-600 dark:text-green-400">+</span>
                  Save current layout...
                </button>
                {Object.keys(savedLayouts).length > 0 && (
                  <>
                    <div className="border-t border-slate-200 dark:border-zinc-700 my-1" />
                    <div className="px-3 py-1 text-xs font-medium text-zinc-500">Saved Layouts</div>
                    {Object.keys(savedLayouts).map((name) => (
                      <div
                        key={name}
                        onClick={() => loadLayout(name)}
                        className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 flex items-center justify-between cursor-pointer group"
                      >
                        <span className="truncate flex items-center gap-1.5">
                          {defaultLayoutName === name && <Star size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                          {name}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); saveCurrentLayout(name); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30"
                            title="Overwrite with current layout"
                          >
                            <Save size={12} />
                          </button>
                          <button
                            onClick={(e) => toggleDefaultLayout(name, e)}
                            className={cn(
                              "p-1 rounded",
                              defaultLayoutName === name
                                ? "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                            )}
                            title={defaultLayoutName === name ? "Remove as default" : "Set as default"}
                          >
                            <Star size={12} className={defaultLayoutName === name ? "fill-amber-500" : ""} />
                          </button>
                          <button
                            onClick={(e) => deleteLayout(name, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400"
                            title="Delete layout"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Split content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: AG Grid */}
        <div
          className={`${theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} flex-1 min-h-0 overflow-hidden`}
          style={{ width: "100%", height: "100%" }}
        >
          <style>{`
            .ag-theme-alpine {
              --ag-background-color: #ffffff;
              --ag-header-background-color: #f8fafc;
              --ag-odd-row-background-color: #f8fafc;
              --ag-row-hover-color: #f1f5f9;
              --ag-border-color: #e2e8f0;
              --ag-header-foreground-color: #475569;
              --ag-foreground-color: #1e293b;
              --ag-secondary-foreground-color: #64748b;
            }
            .ag-theme-alpine .ag-row { cursor: pointer; }
            .ag-theme-alpine .ag-header-cell-resize { pointer-events: auto !important; cursor: col-resize !important; z-index: 1 !important; }
            .ag-theme-alpine .ag-header { pointer-events: auto !important; }
            .ag-theme-alpine .ag-cell-editable { cursor: pointer; }
            .ag-theme-alpine .ag-cell-editable:hover { background-color: rgba(13, 148, 136, 0.1); }
            .ag-theme-alpine-dark {
              --ag-background-color: #09090b;
              --ag-header-background-color: #18181b;
              --ag-odd-row-background-color: #0f0f12;
              --ag-row-hover-color: #1c1c20;
              --ag-border-color: #27272a;
              --ag-header-foreground-color: #a1a1aa;
              --ag-foreground-color: #d4d4d8;
              --ag-secondary-foreground-color: #71717a;
              --ag-selected-row-background-color: rgba(20, 184, 166, 0.12);
              --ag-range-selection-background-color: rgba(20, 184, 166, 0.15);
              --ag-range-selection-border-color: #14b8a6;
              --ag-input-focus-border-color: #14b8a6;
              --ag-checkbox-checked-color: #14b8a6;
              --ag-row-border-color: #1e1e22;
              --ag-control-panel-background-color: #0f0f12;
              --ag-side-button-selected-background-color: #18181b;
              --ag-column-hover-color: rgba(20, 184, 166, 0.06);
              --ag-input-border-color: #3f3f46;
              --ag-invalid-color: #ef4444;
              --ag-chip-background-color: #27272a;
              --ag-modal-overlay-background-color: rgba(0, 0, 0, 0.5);
              --ag-popup-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            }
            .ag-theme-alpine-dark .ag-row { cursor: pointer; }
            .ag-theme-alpine-dark .ag-header-cell-resize { pointer-events: auto !important; cursor: col-resize !important; z-index: 1 !important; }
            .ag-theme-alpine-dark .ag-header { pointer-events: auto !important; }
            .ag-theme-alpine-dark .ag-cell-editable { cursor: pointer; }
            .ag-theme-alpine-dark .ag-cell-editable:hover { background-color: rgba(45, 212, 191, 0.08); }
            .ag-theme-alpine-dark .ag-popup,
            .ag-theme-alpine-dark .ag-menu { background-color: #18181b !important; border: 1px solid #27272a !important; }
            .ag-theme-alpine-dark .ag-filter-toolpanel,
            .ag-theme-alpine-dark .ag-filter { background-color: #18181b !important; }
            .ag-theme-alpine-dark .ag-text-field-input,
            .ag-theme-alpine-dark .ag-select .ag-picker-field-wrapper { background-color: #09090b !important; border-color: #3f3f46 !important; color: #d4d4d8 !important; }
            .ag-theme-alpine-dark .ag-text-field-input:focus { border-color: #14b8a6 !important; }
            .ag-theme-alpine-dark .ag-cell-edit-wrapper,
            .ag-theme-alpine-dark .ag-cell-editor { background-color: #18181b !important; }
            .ag-theme-alpine-dark .ag-cell-inline-editing { background-color: #18181b !important; border-color: #14b8a6 !important; }
            .ag-theme-alpine-dark .ag-rich-select { background-color: #18181b !important; }
            .ag-theme-alpine-dark .ag-rich-select-row { color: #d4d4d8 !important; }
            .ag-theme-alpine-dark .ag-rich-select-row-selected { background-color: rgba(20, 184, 166, 0.15) !important; }
            .ag-theme-alpine-dark .ag-rich-select-row:hover { background-color: #27272a !important; }
            .ag-theme-alpine-dark .ag-menu-option-active { background-color: #27272a !important; }
            .ag-theme-alpine-dark .ag-menu-separator { border-color: #27272a !important; }
            .ag-theme-alpine-dark .ag-status-bar { background-color: #18181b !important; border-top: 1px solid #27272a !important; color: #71717a !important; }
            .ag-theme-alpine-dark .ag-paging-panel { background-color: #18181b !important; color: #71717a !important; border-top: 1px solid #27272a !important; }
            /* Dark mode - sidebar panels */
            .ag-theme-alpine-dark .ag-side-bar { background-color: #0f0f12 !important; border-left: 1px solid #27272a !important; }
            .ag-theme-alpine-dark .ag-side-buttons { background-color: #0f0f12 !important; }
            .ag-theme-alpine-dark .ag-side-button-button { color: #71717a !important; }
            .ag-theme-alpine-dark .ag-side-button-button:hover { color: #a1a1aa !important; }
            .ag-theme-alpine-dark .ag-tool-panel-wrapper { background-color: #0f0f12 !important; border-right: 1px solid #27272a !important; }
            .ag-theme-alpine-dark .ag-column-select-header { border-bottom: 1px solid #27272a !important; }
            /* Dark mode - pagination */
            .ag-theme-alpine-dark .ag-paging-button { color: #a1a1aa !important; }
            /* Scrollbar */
            .ag-theme-alpine-dark ::-webkit-scrollbar { width: 8px; height: 8px; }
            .ag-theme-alpine-dark ::-webkit-scrollbar-track { background: #09090b; }
            .ag-theme-alpine-dark ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
            .ag-theme-alpine-dark ::-webkit-scrollbar-thumb:hover { background: #52525b; }
          `}</style>
          <AgGridReact
            ref={gridRef}
            theme="legacy"
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            rowSelection="single"
            onRowClicked={handleRowClicked}
            onCellValueChanged={handleCellValueChanged}
            animateRows={false}
            enableCellTextSelection={true}
            suppressCellFocus={false}
            singleClickEdit={true}
            stopEditingWhenCellsLoseFocus={true}
            headerHeight={32}
            rowHeight={32}
            quickFilterText={quickFilterText}
            enableRangeSelection={true}
            enableBrowserTooltips={true}
            getContextMenuItems={() => [
              "copy",
              "copyWithHeaders",
              "paste",
              "separator",
              "export",
              "separator",
              "autoSizeAll",
              "resetColumns",
            ]}
            sideBar={{
              toolPanels: [
                {
                  id: "columns",
                  labelDefault: "Columns",
                  labelKey: "columns",
                  iconKey: "columns",
                  toolPanel: "agColumnsToolPanel",
                },
                {
                  id: "filters",
                  labelDefault: "Filters",
                  labelKey: "filters",
                  iconKey: "filter",
                  toolPanel: "agFiltersToolPanel",
                },
              ],
              defaultToolPanel: "",
            }}
            statusBar={{
              statusPanels: [
                { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
                { statusPanel: "agSelectedRowCountComponent", align: "left" },
                { statusPanel: "agAggregationComponent", align: "right" },
              ],
            }}
            pagination={true}
            paginationPageSize={100}
            paginationPageSizeSelector={[50, 100, 200, 500]}
          />
        </div>

        {/* Resize handle */}
        {selectedRow && (
          <div
            onMouseDown={handleMouseDown}
            className="relative w-2 cursor-col-resize group flex-shrink-0 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
          >
            <div
              className={cn(
                "absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 transition-all",
                isResizing
                  ? "bg-teal-500"
                  : "bg-slate-300 dark:bg-zinc-700 group-hover:bg-teal-500"
              )}
            />
          </div>
        )}

        {/* Right: Detail panel */}
        {selectedRow && (
          <div
            className="flex-shrink-0 border-l border-slate-200 dark:border-zinc-800 overflow-hidden"
            style={{
              width: panelWidth,
              transition: isResizing ? "none" : "width 200ms",
            }}
          >
            <ArtifactDetailPreview
              artifactType={artifactType}
              row={selectedRow}
              onClose={handleCloseDetail}
              onFieldChange={handleDetailFieldChange}
              onNavigate={onItemSelect}
            />
          </div>
        )}
      </div>

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

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-96 max-w-[90vw] border border-slate-200 dark:border-zinc-700">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Save Layout
            </h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLayoutName.trim()) {
                  saveCurrentLayout(newLayoutName);
                } else if (e.key === "Escape") {
                  setShowSaveDialog(false);
                  setNewLayoutName("");
                }
              }}
              placeholder="Enter layout name..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={() => saveCurrentLayout(newLayoutName)}
                disabled={!newLayoutName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close layout menu */}
      {showLayoutMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowLayoutMenu(false)}
        />
      )}
    </div>
  );
}
