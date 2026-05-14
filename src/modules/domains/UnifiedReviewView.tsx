// src/modules/library/UnifiedReviewView.tsx
// Unified split-view review mode for all resource types: tables, queries, dashboards, workflows
// Grid on left, detail preview on right. Tables get batch action buttons; artifacts don't.

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle, AlertTriangle, Loader2, FileText, Database, RefreshCw, Tags, Sparkles, Globe, ChevronDown, Layers, CheckCircle2, Trash2, Wrench, Tag, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { FacetCheckboxFilter } from "../../components/ui/FacetCheckboxFilter";
import { ReviewGrid, ReviewGridHandle } from "./ReviewGrid";
import { CrossDomainSidebar } from "./CrossDomainSidebar";
import { TableDetailPreview } from "./TableDetailPreview";
import { ArtifactDetailPreview } from "./ArtifactDetailPreview";
import { AddToDataModelDialog } from "./AddToDataModelDialog";
import { cn } from "../../lib/cn";
import { useJobsStore } from "../../stores/jobsStore";
import {
  useAddClassificationValue,
  useAddClassificationValues,
} from "../../hooks/useClassificationValues";
import type { ClassificationField } from "../../stores/classificationStore";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { fetchCrossDomainArtifacts, upsertArtifactFields } from "../../lib/domainArtifacts";
import {
  useArtifactDriftRefresh,
  useTableDeploymentTargets,
  indexTablesFromFiles,
  indexArtifactsFromFiles,
  type DriftArtifactType,
} from "../../hooks/useTableDriftRefresh";
import { TableDriftDiffModal } from "../../components/TableDriftDiffModal";

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
  folderPath?: string;
  domainName?: string;
  crossDomain?: boolean;
  /** When this domain is being viewed *as the master* (e.g., Lab), set to its
   *  slug. Triggers a deployments join so a "Deployed To" column can render. */
  masterDomain?: string | null;
  onItemSelect?: (path: string) => void;
  /** Navigate to the dedicated full-screen review route — surfaced in the grid toolbar */
  onOpenFullScreen?: () => void;
}

export function UnifiedReviewView({
  resourceType,
  folderPath = "",
  domainName = "",
  crossDomain = false,
  masterDomain = null,
  onItemSelect,
  onOpenFullScreen,
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

  // Classification value writers — backed by lookup_values (Layer 2).
  // Wrap the React Query mutations in stable callbacks that match the old
  // (field, value) / (field, values) signature consumers expect.
  const addValueMutation = useAddClassificationValue();
  const addValuesMutation = useAddClassificationValues();
  const addClassificationValue = useCallback(
    (field: ClassificationField, value: string) => {
      addValueMutation.mutate({ field, value });
    },
    [addValueMutation],
  );
  const addClassificationValues = useCallback(
    (field: ClassificationField, values: string[]) => {
      addValuesMutation.mutate({ field, values });
    },
    [addValuesMutation],
  );

  // Refresh Drift = fast — recomputes drift_status from existing
  // val_<type>_definitions data. No VAL API calls. Picks the right RPC
  // based on the current resourceType.
  const driftRefresh = useArtifactDriftRefresh();
  // Sync Tables = three-step pipeline:
  //   1. val_sync_tables  → fetch admin tree to disk (fast)
  //   2. val_extract_tables → fetch every table definition to disk (slow,
  //      ~20 min for lab — local Rust, no edge function timeout)
  //   3. indexTablesFromFiles → walk on-disk JSON, hash, upsert into
  //      val_table_definitions (fast, ~30s)
  // We track the running state ourselves since this is no longer a single
  // mutation — it's three sequential Tauri/JS calls per domain.
  const [isTableSyncing, setIsTableSyncing] = useState(false);
  // List of distinct client target domains for the Sync/Index dropdowns.
  // Now scoped to the current resourceType so e.g. workflows-only deployment
  // targets show up under the Workflows tab, not table targets.
  const { data: deploymentTargets = [] } = useTableDeploymentTargets(
    masterDomain ? masterDomain : null,
    resourceType,
  );

  // Drift diff modal state. Opened by clicking a "Deployed To" chip on
  // any artifact type — the modal looks up the corresponding
  // val_<type>_definitions row server-side based on resourceType.
  const [driftDiff, setDriftDiff] = useState<
    { targetDomain: string; tableId: string; driftStatus: string } | null
  >(null);

  // Panel resizing
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(400);

  // Add to Data Model dialog state (tables only)
  const [addToDataModelRow, setAddToDataModelRow] = useState<ReviewRow | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Sidebar filter state (tables only — sidebar shown only for tables)
  const [sidebarView, setSidebarView] = useState<DomainsSidebarView>("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCategory, setSidebarCategory] = useState<string | null>(null);
  const [sidebarSubCategory, setSidebarSubCategory] = useState<string | null>(null);
  // Three multi-select facets — match the Skills sidebar UX so the user
  // can slice domain artifacts by deployed-to client, classification tag,
  // or data representation. Empty set = no filter.
  const [sidebarClientFilter, setSidebarClientFilter] = useState<Set<string>>(new Set());
  const [sidebarTagFilter, setSidebarTagFilter] = useState<Set<string>>(new Set());
  const [sidebarDataRepFilter, setSidebarDataRepFilter] = useState<Set<string>>(new Set());
  const [sidebarRows, setSidebarRows] = useState<ReviewRow[]>([]);
  const handleRowsLoaded = useCallback((rows: ReviewRow[]) => setSidebarRows(rows), []);

  // Stable callback identity — passing an inline arrow into ReviewGrid here
  // rebuilt columnDefs every render, which made AG Grid reset column state
  // and the saved layout snap back. Empty-deps useCallback gives a single
  // reference for the lifetime of the component.
  const handleDeploymentChipClick = useCallback(
    (targetDomain: string, resourceId: string, driftStatus: string) =>
      setDriftDiff({ targetDomain, tableId: resourceId, driftStatus }),
    [],
  );

  // Cross-domain sidebar filter state (per resource type, persisted)
  const crossDomainFilterKey = `tv-cross-domain-${resourceType}-domains`;
  const [crossDomainSelected, setCrossDomainSelected] = useState<string[]>(() => {
    if (typeof window === "undefined" || !crossDomain) return [];
    try {
      const stored = localStorage.getItem(crossDomainFilterKey);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const handleCrossDomainSelectedChange = useCallback((domains: string[]) => {
    setCrossDomainSelected(domains);
    if (typeof window !== "undefined") localStorage.setItem(crossDomainFilterKey, JSON.stringify(domains));
  }, [crossDomainFilterKey]);

  // Jobs store for background operations (tables only)
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const jobs = useJobsStore((s) => s.jobs);

  // Check if any batch operation is running
  const runningJobs = jobs.filter((j) => j.status === "running");
  const isBatchRunning = runningJobs.some((j) =>
    j.id.startsWith("fetch-samples-") || j.id.startsWith("fetch-categorical-") || j.id.startsWith("fetch-details-") || j.id.startsWith("analyze-all-") || j.id.startsWith("generate-overviews-")
  );

  // ─── Cross-domain data loading ──────────────────────────────────────────────

  const [crossDomainRows, setCrossDomainRows] = useState<ReviewRow[]>([]);
  const [crossDomainLoading, setCrossDomainLoading] = useState(false);
  const [crossDomainError, setCrossDomainError] = useState<string | null>(null);

  useEffect(() => {
    if (!crossDomain) return;
    setCrossDomainLoading(true);
    setCrossDomainError(null);
    fetchCrossDomainArtifacts(resourceType)
      .then(setCrossDomainRows)
      .catch((e) => setCrossDomainError(e instanceof Error ? e.message : "Failed to load data"))
      .finally(() => setCrossDomainLoading(false));
  }, [crossDomain, resourceType]);

  // Row lookup for cross-domain saves (key: "domain::resourceId")
  const crossDomainRowsByKey = useMemo(() => {
    if (!crossDomain) return new Map<string, ReviewRow>();
    const map = new Map<string, ReviewRow>();
    for (const row of crossDomainRows) {
      const base = isTable ? row.name : row.folderName;
      const key = row.domain ? `${row.domain}::${base}` : base;
      map.set(key, row);
    }
    return map;
  }, [crossDomain, crossDomainRows, isTable]);

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
      if (analysis.dataCategory) addClassificationValue("dataCategory", analysis.dataCategory);
      if (analysis.dataSubCategory) addClassificationValue("dataSubCategory", analysis.dataSubCategory);
      if (analysis.tags) {
        const tags = (analysis.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean);
        addClassificationValues("tags", tags);
      }
      if (analysis.classification?.dataType) addClassificationValue("dataType", analysis.classification.dataType);
      if (analysis.usageStatus) addClassificationValue("usageStatus", analysis.usageStatus);
    } catch { /* Non-critical */ }
  }, [addClassificationValue, addClassificationValues]);

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
      addClassificationValues("tags", tags);
    } else if (storeField === "dataType") {
      // Data Representation is canonically lowercase-hyphenated. If the user
      // types a brand-new value with capitals or spaces, normalize before
      // it lands in lookup_values so the vocabulary stays uniform.
      const normalized = value.trim().toLowerCase().replace(/\s+/g, "-").replace(/-?\/+-?/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
      if (normalized) addClassificationValue(storeField, normalized);
    } else {
      addClassificationValue(storeField, value);
    }
  }, [addClassificationValue, addClassificationValues]);

  // Handle cell edit from grid
  const handleCellEdited = useCallback((key: string, field: string, newValue: unknown) => {
    // Data Representation is canonically lowercase-hyphenated; normalize any
    // freely-typed value before it lands in modifiedRows / Supabase upsert.
    let value = newValue;
    if (field === "dataType" && typeof value === "string" && value) {
      value = value.trim().toLowerCase().replace(/\s+/g, "-").replace(/-?\/+-?/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    }

    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(key) || {};
      newMap.set(key, { ...existing, [field]: value });
      return newMap;
    });

    if (key === selectedName) {
      setSelectedRowData((prev) => prev ? { ...prev, [field]: value } as ReviewRow : null);
    }

    syncEditToStore(field, value);
    setSaveSuccess(false);
  }, [selectedName, syncEditToStore]);

  // Handle field change from detail panel. Accepts string[] for array-typed
  // columns (tags) introduced by the Layer 1 metadata alignment.
  const handleDetailFieldChange = useCallback((field: string, value: string | string[] | number | null) => {
    if (!selectedName || !selectedRowData) return;

    setSelectedRowData((prev) => prev ? { ...prev, [field]: value } as ReviewRow : null);

    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(selectedName) || {};
      newMap.set(selectedName, { ...existing, [field]: value });
      return newMap;
    });

    // syncEditToStore takes (field, value) where value is comma-string for
    // multi-value fields. Stringify arrays before forwarding.
    const storeValue: string | number | null = Array.isArray(value)
      ? value.join(", ")
      : value;
    syncEditToStore(field, storeValue);
    setSaveSuccess(false);
  }, [selectedName, selectedRowData, syncEditToStore]);

  // Show toast
  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Sync Artifacts — runs the file-based VAL sync per domain and then indexes
  // the resulting on-disk JSON into val_<type>_definitions in Supabase. Same
  // shape for all four artifact types (tables / queries / workflows /
  // dashboards). The Tauri commands run in local Rust with no timeout, so
  // even a fresh lab bootstrap with 1,300+ tables fits in one run.
  //
  // Per-domain steps (full mode):
  //   1. val_sync_<type>(domain)    — fetch admin tree / list (~1s)
  //   2. val_extract_<type>(domain) — fetch each item to disk
  //                                   (tables emit per-item progress events;
  //                                    queries/workflows/dashboards don't)
  //   3. indexer(...)               — read disk → upsert Supabase (~seconds)
  const runArtifactSync = useCallback(
    async (
      label: string,
      body: { domain?: string; domains?: string[] },
      mode: "full" | "index-only" = "full",
    ) => {
      const indexOnly = mode === "index-only";
      // Map resource type → Tauri command names + indexer + label.
      // Tables get the special "indexTablesFromFiles" indexer because they
      // also pull admin-tree metadata; the others use indexArtifactsFromFiles.
      // English plurals: query → queries (not "querys"), the rest just +s.
      const plural =
        resourceType === "table" ? "tables"
        : resourceType === "query" ? "queries"
        : resourceType === "workflow" ? "workflows"
        : resourceType === "dashboard" ? "dashboards"
        : `${resourceType}s`;
      const cmds = {
        sync: `val_sync_${plural}`,
        extract: `val_extract_${plural}`,
      };
      const noun = resourceType === "table" ? "table" : resourceType;
      // Proper English plural: "queries" not "querys".
      const nounPlural = plural;
      const NounPlural = nounPlural.charAt(0).toUpperCase() + nounPlural.slice(1);
      const jobId = `${indexOnly ? `index-${nounPlural}` : `sync-${nounPlural}`}-${Date.now()}`;

      // Resolve the domain list. Empty body = full graph; we fetch it now
      // so the loop knows the total and can show meaningful progress.
      let domains: string[];
      if (body.domain) {
        domains = [body.domain];
      } else if (body.domains?.length) {
        domains = body.domains;
      } else {
        const [{ data: meta }, { data: deps }] = await Promise.all([
          supabase.from("domain_metadata").select("domain").in("domain_type", ["production", "pilot", "lab", "template"]),
          supabase.from("artifact_deployments").select("master_domain, target_domain").eq("resource_type", resourceType),
        ]);
        const set = new Set<string>();
        for (const d of meta ?? []) set.add(d.domain);
        for (const d of deps ?? []) {
          if (d.master_domain) set.add(d.master_domain);
          if (d.target_domain) set.add(d.target_domain);
        }
        domains = Array.from(set);
      }

      setIsTableSyncing(true);
      addJob({
        id: jobId,
        name: `${indexOnly ? `Index ${NounPlural}` : `Sync ${NounPlural}`} · ${label}`,
        status: "running",
        progress: 0,
        message: `Starting · ${domains.length} domain(s) to ${indexOnly ? "index" : "sync"}`,
      });

      const tally: Array<{ domain: string; count: number; error?: string }> = [];
      let totalItems = 0;
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < domains.length; i++) {
        const domain = domains[i];
        const baseProgress = Math.round((i / domains.length) * 100);
        const stepLabel = indexOnly
          ? `${domain} (${i + 1}/${domains.length}) · indexing files into Supabase…`
          : `${domain} (${i + 1}/${domains.length}) · step 1/3 fetching admin tree…`;
        updateJob(jobId, { progress: baseProgress, message: stepLabel });

        try {
          if (!indexOnly) {
            // Step 1 — admin tree / list to disk. Tiny payload.
            await invoke(cmds.sync, { domain });

            // Step 2 — per-item definitions to disk. All four extractors
            // emit `val-extract-<type>s-progress` with {stage, domain, done,
            // total, ok}. We throttle the high-frequency "fetching" ticks
            // through a 250ms flush so React doesn't melt; "starting" and
            // "done" log immediately as milestones.
            const eventName =
              resourceType === "table" ? "val-extract-tables-progress"
              : resourceType === "query" ? "val-extract-queries-progress"
              : resourceType === "workflow" ? "val-extract-workflows-progress"
              : "val-extract-dashboards-progress";

            updateJob(jobId, { message: `${domain} · step 2/3 fetching ${noun} definitions (0/?)` });
            let stepStartedAt = 0;
            let latestProgress: { done: number; total: number; ok?: boolean } | null = null;
            const flushTimer = setInterval(() => {
              if (!latestProgress) return;
              const { done, total, ok } = latestProgress;
              const remaining = Math.max(0, total - done);
              let etaTail = ` · ${remaining} left`;
              if (stepStartedAt > 0 && done >= 5) {
                const elapsed = (Date.now() - stepStartedAt) / 1000;
                if (elapsed > 1) {
                  const rate = done / elapsed;
                  const etaSecs = remaining / rate;
                  const etaTxt = etaSecs >= 60 ? `${Math.round(etaSecs / 60)}m` : `${Math.round(etaSecs)}s`;
                  etaTail = ` · ${remaining} left · ETA ${etaTxt} · ${rate.toFixed(1)}/s`;
                }
              }
              updateJob(
                jobId,
                { message: `${domain} · step 2/3 ${done}/${total} fetched${etaTail}${ok === false ? " · last failed" : ""}` },
                { silent: true },
              );
            }, 250);
            const unlisten = await listen<{
              domain: string; stage: string; done?: number; total?: number; ok?: boolean;
            }>(eventName, (evt) => {
              const p = evt.payload;
              if (p.domain !== domain) return;
              if (p.stage === "starting") {
                stepStartedAt = Date.now();
                updateJob(jobId, { message: `${domain} · step 2/3 fetching ${p.total ?? 0} ${noun} definitions…` });
              } else if (p.stage === "fetching") {
                latestProgress = { done: p.done ?? 0, total: p.total ?? 0, ok: p.ok };
              } else if (p.stage === "done") {
                updateJob(jobId, { message: `${domain} · step 2/3 done · ${p.done ?? 0}/${p.total ?? 0} fetched` });
              }
            });
            try {
              await invoke<{ count?: number }>(cmds.extract, { domain });
            } finally {
              clearInterval(flushTimer);
              unlisten();
            }
          }

          // Step 3 — read on-disk JSON, hash, upsert to Supabase. Fast for
          // all types. Tables use their dedicated indexer (admin-tree
          // metadata + field counts); the rest share indexArtifactsFromFiles.
          updateJob(jobId, {
            message: indexOnly
              ? `${domain} · indexing files into Supabase…`
              : `${domain} · step 3/3 indexing files into Supabase…`,
          });
          const result = resourceType === "table"
            ? await indexTablesFromFiles(domain, (msg) => updateJob(jobId, { message: msg }, { silent: true }))
            : await indexArtifactsFromFiles(
                resourceType as DriftArtifactType,
                domain,
                (msg) => updateJob(jobId, { message: msg }, { silent: true }),
              );

          succeeded++;
          totalItems += result.count;
          tally.push({ domain, count: result.count });
          const errorsNote = result.errors > 0 ? ` · ${result.errors} read error(s)` : "";
          updateJob(jobId, {
            message: `✓ ${domain}: ${result.count} ${result.count === 1 ? noun : nounPlural} indexed in ${(result.duration_ms / 1000).toFixed(1)}s${errorsNote}`,
          });
        } catch (e) {
          failed++;
          const msg = (e as Error).message ?? String(e);
          tally.push({ domain, count: 0, error: msg });
          updateJob(jobId, {
            message: `✗ ${domain}: ${msg.slice(0, 200)}`,
          });
        }
      }

      const ok = failed === 0 && succeeded > 0;
      const message = succeeded > 0
        ? `Synced ${totalItems} ${totalItems === 1 ? noun : nounPlural} across ${succeeded} domain(s)` +
          (failed > 0 ? ` · ${failed} failed: ${tally.filter((t) => t.error).map((t) => t.domain).join(", ")}` : "")
        : `All ${failed} domain(s) failed`;

      updateJob(jobId, {
        status: ok ? "completed" : "failed",
        progress: 100,
        message,
        completedAt: new Date(),
      });
      setIsTableSyncing(false);
      showToast(message, ok ? "success" : "error");
    },
    [addJob, updateJob, showToast, resourceType],
  );

  // Same wrapper for Refresh Drift. It's near-instant but keeping it in
  // the jobs bar means the user sees confirmation it ran + the diff counts.
  const runDriftRefresh = useCallback(() => {
    if (!masterDomain) return;
    const jobId = `refresh-drift-${Date.now()}`;
    // English plurals (queries, not querys) — keep label tidy.
    const typePlural =
      resourceType === "query" ? "queries"
      : resourceType === "table" ? "tables"
      : resourceType === "workflow" ? "workflows"
      : resourceType === "dashboard" ? "dashboards"
      : `${resourceType}s`;
    addJob({ id: jobId, name: `Refresh Drift · ${masterDomain} · ${typePlural}`, status: "running", progress: 0, message: "Comparing hashes..." });
    driftRefresh.mutate(
      { resourceType: resourceType as DriftArtifactType | "table", masterDomain },
      {
        onSuccess: (s) => {
          const message = `Drift: ${s.in_sync_count} in sync · ${s.drifted_count} drifted · ${s.missing_count} missing`;
          const ok = s.drifted_count + s.missing_count === 0;
          updateJob(jobId, { status: ok ? "completed" : "failed", progress: 100, message, completedAt: new Date() });
          showToast(message, ok ? "success" : "error");
          gridRef.current?.reload();
        },
        onError: (e) => {
          const msg = (e as Error).message;
          updateJob(jobId, { status: "failed", progress: 100, message: msg, completedAt: new Date() });
          showToast(`Refresh drift failed: ${msg}`, "error");
        },
      },
    );
  }, [addJob, updateJob, driftRefresh, masterDomain, showToast, resourceType]);

  // Portal sync state
  const [isSyncing, setIsSyncing] = useState(false);

  // Domain slug for portal sync — use the prop directly
  const domainSlug = domainName || null;

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
        // Build the analysis path
        let analysisPath: string;
        if (crossDomain) {
          const row = crossDomainRowsByKey.get(key);
          if (!row?.folderPath) {
            console.warn(`Cannot save ${key}: no folderPath`);
            continue;
          }
          analysisPath = `${row.folderPath}/definition_analysis.json`;
        } else {
          const itemPath = isTable ? `${folderPath}/table_${key}` : `${folderPath}/${key}`;
          analysisPath = `${itemPath}/definition_analysis.json`;
        }

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

      // Regenerate overview.md for modified tables (single-domain only)
      if (isTable && !crossDomain) {
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

      // Sync edits to Supabase domain_artifacts (fire-and-forget — disk is authoritative)
      for (const [key, changes] of modifiedRows.entries()) {
        if (crossDomain) {
          const row = crossDomainRowsByKey.get(key);
          if (row?.domain) {
            const resourceId = isTable ? row.name : row.folderName;
            upsertArtifactFields(row.domain, resourceType, resourceId, changes as Partial<ReviewRow>).catch((e) => {
              console.warn(`Failed to sync ${key} to Supabase:`, e);
            });
          }
        } else {
          upsertArtifactFields(domainName, resourceType, key, changes as Partial<ReviewRow>).catch((e) => {
            console.warn(`Failed to sync ${key} to Supabase:`, e);
          });
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
  }, [modifiedRows, folderPath, domainName, resourceType, isTable, showToast, crossDomain, crossDomainRowsByKey]);

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

  // Cross-domain loading/error states
  if (crossDomain && crossDomainLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={24} className="mx-auto mb-3 text-teal-500 animate-spin" />
          <p className="text-sm text-zinc-500">Loading {RESOURCE_LABEL[resourceType]}...</p>
        </div>
      </div>
    );
  }

  if (crossDomain && crossDomainError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-400">{crossDomainError}</p>
        </div>
      </div>
    );
  }

  // Action buttons rendered inside the grid toolbar (Fetch / AI / Sync to
  // Portal + save-state indicators). Mirrors the Skills review grid where all
  // controls live inside the table frame instead of a separate page header.
  const toolbarActions = (
    <>
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

          {/* Table-only batch action dropdowns (single-domain only) */}
          {isTable && !crossDomain && (
            <>
              {/* Fetch dropdown */}
              <div className="relative group" data-help-id="review-fetch">
                <button
                  disabled={isBatchRunning}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Database size={13} /> Fetch <ChevronDown size={11} />
                </button>
                <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1 hidden group-hover:block">
                  <button onClick={handleFetchAllSamples} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50">
                    <div className="flex items-center gap-2"><Database size={13} /> Samples</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Pull sample rows from each table</div>
                  </button>
                  <button onClick={handleFetchAllCategorical} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50">
                    <div className="flex items-center gap-2"><Tags size={13} /> Categorical</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Fetch distinct values for categorical columns</div>
                  </button>
                  <button onClick={handleFetchAllDetails} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50">
                    <div className="flex items-center gap-2"><RefreshCw size={13} /> Details</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Load column metadata, calc fields, and dependencies</div>
                  </button>
                </div>
              </div>

              {/* AI dropdown */}
              <div className="relative group" data-help-id="review-ai">
                <button
                  disabled={isBatchRunning}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles size={13} /> AI <ChevronDown size={11} />
                </button>
                <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1 hidden group-hover:block">
                  <button onClick={handleDescribeAll} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50">
                    <div className="flex items-center gap-2"><Sparkles size={13} /> Describe All</div>
                    <div className="text-xs text-zinc-400 mt-0.5">AI-generate names and descriptions for each table</div>
                  </button>
                  <button onClick={handleClassifyAll} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50">
                    <div className="flex items-center gap-2"><Tags size={13} /> Classify All</div>
                    <div className="text-xs text-zinc-400 mt-0.5">AI-classify data type, category, and usage status</div>
                  </button>
                  <button onClick={handleGenerateAllOverviews} disabled={isBatchRunning} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50">
                    <div className="flex items-center gap-2"><FileText size={13} /> Generate Overviews</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Build markdown documentation for each table</div>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Refresh Drift = fast: recomputes drift_status from existing
              val_<type>_definitions data via the per-type Postgres RPC.
              Works for all four artifact types (table/query/workflow/dashboard). */}
          {masterDomain && !crossDomain && (
            <button
              onClick={runDriftRefresh}
              disabled={driftRefresh.isPending}
              title={`Recompute drift from already-synced ${resourceType} definitions in Supabase. Fast.`}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors",
                driftRefresh.isPending
                  ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <RefreshCw size={13} className={driftRefresh.isPending ? "animate-spin" : ""} />
              {driftRefresh.isPending ? "Checking..." : "Refresh Drift"}
            </button>
          )}

          {/* Sync Artifacts dropdown — picks scope: master only, master + targets,
              or full graph. Each option drives a per-domain pipeline:
              file sync (Tauri) → file index (TS+Tauri fs) → val_<type>_definitions
              upsert. No edge function involvement. Strictly separate from
              Refresh Drift — never auto-recomputes. Works for all artifact types. */}
          {masterDomain && !crossDomain && (
            <div className="relative group" data-help-id="review-sync-artifacts">
              <button
                disabled={isTableSyncing}
                title={`Refresh val_${resourceType === "table" ? "table" : resourceType}_definitions from VAL. Hover to pick scope.`}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors",
                  isTableSyncing
                    ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <Database size={13} className={isTableSyncing ? "animate-pulse" : ""} />
                {isTableSyncing
                  ? "Syncing..."
                  : `Sync ${
                      resourceType === "table" ? "Tables"
                      : resourceType === "query" ? "Queries"
                      : resourceType === "workflow" ? "Workflows"
                      : "Dashboards"
                    }`}
                <ChevronDown size={11} />
              </button>
              <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1 hidden group-hover:block max-h-[60vh] overflow-y-auto">
                {/* Master only */}
                <button
                  onClick={() => runArtifactSync(`${masterDomain} only`, { domain: masterDomain })}
                  disabled={isTableSyncing}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2"><Database size={13} /> Sync {masterDomain} only</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Pulls VAL → disk → Supabase. Tables take ~20 min for lab; queries/dashboards/workflows are faster.</div>
                </button>
                {/* Per-target domains: pick a single client to sync. Master
                    is synced via its own option above — these only sync the
                    chosen client domain so the user can re-pull a single
                    target without re-walking the master's tables. */}
                {deploymentTargets.length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wide font-medium text-zinc-400">
                      Sync one client
                    </div>
                    {deploymentTargets.map((target) => (
                      <button
                        key={target}
                        onClick={() => runArtifactSync(target, { domain: target })}
                        disabled={isTableSyncing}
                        className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50 flex items-center gap-2"
                      >
                        <Database size={11} className="text-zinc-400" />
                        <span className="font-mono text-xs">{target}</span>
                      </button>
                    ))}
                  </>
                )}
                {/* Full deployment graph */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                <button
                  onClick={() => runArtifactSync("all domains", {})}
                  disabled={isTableSyncing}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2"><Database size={13} /> Sync all domains</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Production + lab + every domain in artifact_deployments. Hours.</div>
                </button>
                <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                <div className="px-3 py-1 text-[11px] text-zinc-400">After sync, click Refresh Drift to recompute the diff.</div>
              </div>
            </div>
          )}

          {/* Index Artifacts — same scope picker as Sync, but skips
              steps 1+2 and only runs step 3 (read on-disk JSON → Supabase).
              Use after a prior file sync (or when files were synced via
              another path, like the existing val-sync flow) to reflect the
              current disk state in val_<type>_definitions without re-pulling
              from VAL. Works for all artifact types. */}
          {masterDomain && !crossDomain && (
            <div className="relative group" data-help-id="review-index-artifacts">
              <button
                disabled={isTableSyncing}
                title="Index existing on-disk JSON into Supabase. No VAL calls."
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors",
                  isTableSyncing
                    ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <FileText size={13} />
                Index <ChevronDown size={11} />
              </button>
              <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1 hidden group-hover:block max-h-[60vh] overflow-y-auto">
                <button
                  onClick={() => runArtifactSync(`${masterDomain} only`, { domain: masterDomain }, "index-only")}
                  disabled={isTableSyncing}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2"><FileText size={13} /> Index {masterDomain} from disk</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Skips VAL — reads existing on-disk JSON into val_{resourceType === "table" ? "table" : resourceType}_definitions. Fast.</div>
                </button>
                {deploymentTargets.length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wide font-medium text-zinc-400">
                      Index one client
                    </div>
                    {deploymentTargets.map((target) => (
                      <button
                        key={target}
                        onClick={() => runArtifactSync(target, { domain: target }, "index-only")}
                        disabled={isTableSyncing}
                        className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50 flex items-center gap-2"
                      >
                        <FileText size={11} className="text-zinc-400" />
                        <span className="font-mono text-xs">{target}</span>
                      </button>
                    ))}
                  </>
                )}
                <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                <button
                  onClick={() => runArtifactSync("all domains", {}, "index-only")}
                  disabled={isTableSyncing}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2"><FileText size={13} /> Index all domains</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Walks every domain's on-disk artifacts. Quick.</div>
                </button>
              </div>
            </div>
          )}

          {/* Sync to Portal (single-domain only) */}
          {domainSlug && !crossDomain && (
            <button
              onClick={handleSyncToPortal}
              disabled={isSyncing || modifiedCount > 0}
              data-help-id="review-sync-portal"
              title={modifiedCount > 0 ? "Save changes before syncing" : "Sync resources to portal"}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors",
                isSyncing
                  ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSyncing ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
              {isSyncing ? "Syncing..." : "Sync to Portal"}
            </button>
          )}
    </>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Split content */}
      <div className="flex-1 flex overflow-hidden px-4 py-4">
       <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
        {/* Sidebar — single-domain uses DomainsSidebar, cross-domain uses CrossDomainSidebar */}
        {!crossDomain && sidebarOpen && (
          <DomainsSidebar
            resourceType={resourceType}
            rows={sidebarRows}
            view={sidebarView}
            setView={(v) => { setSidebarView(v); setSidebarCategory(null); setSidebarSubCategory(null); }}
            category={sidebarCategory}
            setCategory={(c) => { setSidebarCategory(c); setSidebarSubCategory(null); }}
            subCategory={sidebarSubCategory}
            setSubCategory={setSidebarSubCategory}
            clientFilter={sidebarClientFilter}
            setClientFilter={setSidebarClientFilter}
            tagFilter={sidebarTagFilter}
            setTagFilter={setSidebarTagFilter}
            dataRepFilter={sidebarDataRepFilter}
            setDataRepFilter={setSidebarDataRepFilter}
          />
        )}
        {crossDomain && sidebarOpen && (
          <CrossDomainSidebar
            resourceType={resourceType}
            rows={crossDomainRows}
            selectedDomains={crossDomainSelected}
            onSelectedDomainsChange={handleCrossDomainSelectedChange}
            category={sidebarCategory}
            setCategory={(c) => { setSidebarCategory(c); setSidebarSubCategory(null); }}
            subCategory={sidebarSubCategory}
            setSubCategory={setSidebarSubCategory}
            tagFilter={sidebarTagFilter}
            setTagFilter={setSidebarTagFilter}
            dataRepFilter={sidebarDataRepFilter}
            setDataRepFilter={setSidebarDataRepFilter}
            storageKeyPrefix={`cross-domain-${resourceType}`}
          />
        )}

        {/* Left: AG Grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={cn(
                "flex items-center justify-center p-1.5 rounded-md border transition-colors flex-shrink-0",
                sidebarOpen
                  ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
              title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeftOpen size={12} />}
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReviewGrid
              ref={gridRef}
              resourceType={resourceType}
              folderPath={folderPath}
              domainName={domainName}
              domainSlug={domainSlug}
              masterDomain={masterDomain}
              onItemSelect={onItemSelect}
              reviewMode={true}
              onRowSelected={handleRowSelected}
              onCellEdited={handleCellEdited}
              modifiedRows={modifiedRows}
              onAddToDataModel={isTable && !crossDomain ? setAddToDataModelRow : undefined}
              externalRows={crossDomain ? crossDomainRows : undefined}
              crossDomain={crossDomain}
              sidebarFilter={!crossDomain ? {
                view: sidebarView,
                category: sidebarCategory,
                subCategory: sidebarSubCategory,
                clients: sidebarClientFilter,
                tags: sidebarTagFilter,
                dataReps: sidebarDataRepFilter,
              } : {
                // Cross-domain reuses the same filter state as single-domain
                // (one component instance) but the meaning differs:
                //   - `domains` filters by the row's home domain
                //   - `tags` / `dataReps` work the same way
                //   - `clients` is unused (deployment chips aren't shown
                //     in cross-domain rows; each row IS its own home)
                view: "all",
                category: sidebarCategory,
                subCategory: sidebarSubCategory,
                domains: crossDomainSelected,
                tags: sidebarTagFilter,
                dataReps: sidebarDataRepFilter,
              }}
              onRowsLoaded={!crossDomain ? handleRowsLoaded : undefined}
              onOpenFullScreen={onOpenFullScreen}
              toolbarActions={toolbarActions}
              onDeploymentChipClick={masterDomain ? handleDeploymentChipClick : undefined}
            />
          </div>
        </div>

        {/* Resize handle */}
        {selectedPath && (
          <div
            onMouseDown={handleMouseDown}
            className="relative w-2 cursor-col-resize group flex-shrink-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
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
      </div>

      {/* Add to Data Model dialog (tables only) */}
      {addToDataModelRow && (
        <AddToDataModelDialog
          table={addToDataModelRow}
          dataModelsPath={folderPath}
          onClose={() => setAddToDataModelRow(null)}
        />
      )}

      {/* Drift diff modal — opens for any artifact type from a master domain. */}
      {driftDiff && masterDomain && (
        <TableDriftDiffModal
          masterDomain={masterDomain}
          targetDomain={driftDiff.targetDomain}
          tableId={driftDiff.tableId}
          driftStatus={driftDiff.driftStatus}
          resourceType={resourceType as "table" | "query" | "workflow" | "dashboard"}
          onClose={() => setDriftDiff(null)}
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type DomainsSidebarView = "all" | "active" | "deleted" | "custom" | "configured" | "unconfigured";

function viewsForResourceType(resourceType: ReviewResourceType): { id: DomainsSidebarView; label: string; icon: typeof Layers }[] {
  if (resourceType === "table") {
    return [
      { id: "all",          label: "All",          icon: Layers },
      { id: "active",       label: "Active",       icon: CheckCircle2 },
      { id: "deleted",      label: "Deleted",      icon: Trash2 },
      { id: "custom",       label: "Custom tables", icon: Wrench },
      { id: "configured",   label: "Configured",   icon: Tag },
      { id: "unconfigured", label: "Unconfigured", icon: Tag },
    ];
  }
  // queries / dashboards / workflows
  return [
    { id: "all",          label: "All",           icon: Layers },
    { id: "active",       label: "Active",        icon: CheckCircle2 },
    { id: "deleted",      label: "Deleted",       icon: Trash2 },
    { id: "configured",   label: "Configured",    icon: Tag },
    { id: "unconfigured", label: "Unconfigured",  icon: Tag },
  ];
}

function rowMatchesView(r: ReviewRow, v: DomainsSidebarView): boolean {
  switch (v) {
    case "all":          return true;
    case "active":       return !r.isStale;
    case "deleted":      return !!r.isStale;
    case "custom":       return r.name?.startsWith("custom_tbl_") ?? false;
    case "configured":   return !!r.dataCategory;
    case "unconfigured": return !r.dataCategory;
  }
}

function DomainsSidebar({
  resourceType,
  rows,
  view,
  setView,
  category,
  setCategory,
  subCategory,
  setSubCategory,
  clientFilter,
  setClientFilter,
  tagFilter,
  setTagFilter,
  dataRepFilter,
  setDataRepFilter,
}: {
  resourceType: ReviewResourceType;
  rows: ReviewRow[];
  view: DomainsSidebarView;
  setView: (v: DomainsSidebarView) => void;
  category: string | null;
  setCategory: (c: string | null) => void;
  subCategory: string | null;
  setSubCategory: (s: string | null) => void;
  clientFilter: Set<string>;
  setClientFilter: (next: Set<string>) => void;
  tagFilter: Set<string>;
  setTagFilter: (next: Set<string>) => void;
  dataRepFilter: Set<string>;
  setDataRepFilter: (next: Set<string>) => void;
}) {
  const sidebarViews = useMemo(() => viewsForResourceType(resourceType), [resourceType]);

  // Counts per view (against full rows)
  const viewCounts = useMemo<Record<DomainsSidebarView, number>>(() => {
    const counts: Record<DomainsSidebarView, number> = {
      all: 0, active: 0, deleted: 0, custom: 0, configured: 0, unconfigured: 0,
    };
    for (const r of rows) for (const v of sidebarViews) if (rowMatchesView(r, v.id)) counts[v.id]++;
    return counts;
  }, [rows, sidebarViews]);

  // Rows narrowed by the current view — drives the category dropdown options
  // and the facet counts so picking "Active" (say) immediately re-counts.
  const viewScopedRows = useMemo(() => rows.filter((r) => rowMatchesView(r, view)), [rows, view]);

  // Category field varies per resource type:
  //   tables → dataCategory / dataSubCategory
  //   queries → category (no sub) — VAL's saved-query category
  //   dashboards / workflows → dataCategory / dataSubCategory (classification fields)
  const categoryOf = useCallback((r: ReviewRow): { cat: string; sub: string } => {
    if (resourceType === "query") {
      return { cat: r.category || r.dataCategory || "Uncategorized", sub: r.dataSubCategory || "—" };
    }
    return { cat: r.dataCategory || "Uncategorized", sub: r.dataSubCategory || "—" };
  }, [resourceType]);

  const categoryGroups = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of viewScopedRows) {
      const { cat, sub } = categoryOf(r);
      if (!map.has(cat)) map.set(cat, new Map());
      map.get(cat)!.set(sub, (map.get(cat)!.get(sub) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([cat, subMap]) => ({
        category: cat,
        total: Array.from(subMap.values()).reduce((a, b) => a + b, 0),
        subcategories: Array.from(subMap.entries())
          .map(([sub, count]) => ({ subcategory: sub, count }))
          .sort((a, b) => a.subcategory.localeCompare(b.subcategory)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [viewScopedRows, categoryOf]);

  // Subcategory list for the currently-selected category — only shown if
  // the category has more than one meaningful subcategory.
  const activeSubcategories = useMemo(() => {
    if (!category) return [];
    return categoryGroups.find((g) => g.category === category)?.subcategories ?? [];
  }, [categoryGroups, category]);

  // Three facet option lists, all derived from view-scoped rows so the
  // counts reflect what the user can actually narrow to. Clients come from
  // the deployments[] join (master view), tags from row.tags, dataReps
  // from row.dataType.
  const clientOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of viewScopedRows) for (const d of r.deployments ?? []) counts.set(d.target_domain, (counts.get(d.target_domain) ?? 0) + 1);
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [viewScopedRows]);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of viewScopedRows) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [viewScopedRows]);

  const dataRepOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of viewScopedRows) {
      if (r.dataType) counts.set(r.dataType, (counts.get(r.dataType) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [viewScopedRows]);

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
      {/* View section — same as Skills sidebar */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <CollapsibleSection title="View" storageKey="domains-review:view">
          {sidebarViews.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[13px]",
                  active
                    ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon size={13} />
                  {v.label}
                </span>
                <span className="text-[11px] text-zinc-500">{viewCounts[v.id]}</span>
              </button>
            );
          })}
        </CollapsibleSection>
      </div>

      {/* Category + Subcategory — dropdowns instead of an expanded tree
          so the sidebar stays short and leaves room for the facet filters. */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
            Category
          </label>
          <select
            value={category ?? "all"}
            onChange={(e) => {
              const v = e.target.value;
              setCategory(v === "all" ? null : v);
              setSubCategory(null);
            }}
            className="w-full px-2 py-1 text-[12.5px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">All categories ({viewScopedRows.length})</option>
            {categoryGroups.map(({ category: cat, total }) => (
              <option key={cat} value={cat}>{cat} ({total})</option>
            ))}
          </select>
        </div>

        {category && activeSubcategories.length > 0 && (
          activeSubcategories.length > 1 || activeSubcategories[0]?.subcategory !== "—"
        ) && (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              Subcategory
            </label>
            <select
              value={subCategory ?? "all"}
              onChange={(e) => {
                const v = e.target.value;
                setSubCategory(v === "all" ? null : v);
              }}
              className="w-full px-2 py-1 text-[12.5px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">All subcategories</option>
              {activeSubcategories.map(({ subcategory, count }) => (
                <option key={subcategory} value={subcategory}>
                  {subcategory === "—" ? "(no subcategory)" : subcategory} ({count})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Three multi-select facets — Client (deployed-to), Data Representation
          (dataType), Tags. All share the FacetCheckboxFilter component so the
          UX matches Skills. They share vertical space below the fixed sections. */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 flex-1 min-h-0 flex flex-col">
        <FacetCheckboxFilter
          label="Client"
          options={clientOptions}
          selected={clientFilter}
          onChange={setClientFilter}
          searchPlaceholder="Search clients…"
          emptyText="No clients deployed"
          containerClassName="flex-1 min-h-0 border-b border-zinc-200 dark:border-zinc-800"
        />
        <FacetCheckboxFilter
          label="Data Representation"
          options={dataRepOptions}
          selected={dataRepFilter}
          onChange={setDataRepFilter}
          searchPlaceholder="Search data types…"
          emptyText="No data types yet"
          containerClassName="flex-1 min-h-0 border-b border-zinc-200 dark:border-zinc-800"
        />
        <FacetCheckboxFilter
          label="Tags"
          options={tagOptions}
          selected={tagFilter}
          onChange={setTagFilter}
          searchPlaceholder="Search tags…"
          emptyText="No tags yet — add some inline"
          containerClassName="flex-1 min-h-0"
        />
      </div>
    </aside>
  );
}
