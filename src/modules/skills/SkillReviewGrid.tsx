// src/modules/skills/SkillReviewGrid.tsx
// AG Grid Enterprise review table for skill audit tracking
// Follows the same pattern as library/ReviewGrid.tsx

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ColGroupDef,
  ColumnState,
  ModuleRegistry,
  AllCommunityModule,
  CellValueChangedEvent,
  GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  Search,
  Download,
  FileSpreadsheet,
  Maximize2,
  X,
  RotateCcw,
  Columns,
  ChevronsLeftRight,
  Bookmark,
  Star,
  Save,
  WrapText,
  Globe,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";
import { useAppStore } from "../../stores/appStore";
import { groupRowStyles, themeStyles } from "../library/reviewGridStyles";
import type { SkillRegistry, SkillCategory } from "./useSkillRegistry";
import { useSkillRegistryUpdate, useSkillSummary } from "./useSkillRegistry";
import { useReportSkillMap, useUpsertReportSkill } from "../../hooks/gallery/useReportSkills";
import type { ReportSkill } from "../../lib/gallery/types";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillReviewRow {
  slug: string;
  folder: string;
  name: string;
  category: string;
  parentCategory: string;
  subcategory: string;
  target: string;
  status: string;
  domain: string;
  command: string;
  verified: boolean;
  last_audited: string;
  needs_work: string;
  work_notes: string;
  action: string;
  outcome: string;
  last_modified: string;
  // Website library fields (from Supabase report_skill_library)
  webTitle: string;
  webDescription: string;
  webWriteup: string;
  webSolution: string;
  webCategory: string;
  webSubcategory: string;
  webMetrics: string;
  webSources: string;
  webPublished: boolean;
  webFeatured: boolean;
  // Internal: Supabase entry ref
  _webSkillSlug: string;
  _webFileName: string;
}

type ReviewFilter = "all" | "needs-work" | "stale" | "modified";

const LAYOUT_STORAGE_KEY = "tv-desktop-skill-review-layouts";
const DEFAULT_LAYOUT_KEY = "tv-desktop-skill-review-default-layout";

interface SkillReviewGridProps {
  registry: SkillRegistry;
  onSelectSkill?: (slug: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveCategory(
  categoryId: string,
  categories: SkillCategory[],
): { parentCategory: string; subcategory: string } {
  if (!categoryId) return { parentCategory: "Uncategorized", subcategory: "" };

  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return { parentCategory: "Uncategorized", subcategory: "" };

  if (cat.parent) {
    const parent = categories.find((c) => c.id === cat.parent);
    return {
      parentCategory: parent?.label ?? cat.parent,
      subcategory: cat.label,
    };
  }

  return { parentCategory: cat.label, subcategory: "" };
}

function isStale(lastAudited: string | undefined): boolean {
  if (!lastAudited) return true;
  const diff = Date.now() - new Date(lastAudited).getTime();
  return diff > 30 * 24 * 60 * 60 * 1000; // 30 days
}

// ─── Column Definitions ───────────────────────────────────────────────────────

const STATUS_VALUES = ["active", "test", "review", "draft", "inactive", "deprecated"];
const NEEDS_WORK_VALUES = ["", "audit", "schema update", "finish", "refactor", "rewrite"];

function buildColumns(wrapNotes: boolean): (ColDef<SkillReviewRow> | ColGroupDef<SkillReviewRow>)[] {
  return [
    {
      field: "name",
      headerName: "Name",
      minWidth: 200,
      flex: 2,
      filter: "agTextColumnFilter",
      pinned: "left",
      editable: true,
      enableRowGroup: false,
    },
    {
      field: "folder",
      headerName: "Folder",
      width: 180,
      filter: "agTextColumnFilter",
      cellClass: "text-xs font-mono text-zinc-500",
      enableRowGroup: false,
    },
    {
      field: "slug",
      headerName: "Slug",
      width: 260,
      filter: "agTextColumnFilter",
      cellClass: "text-xs font-mono text-zinc-500 cursor-pointer",
      enableRowGroup: false,
      cellRenderer: (params: { value: string }) => {
        if (!params.value) return null;
        const path = `_skills/${params.value}/SKILL.md`;
        const [copied, setCopied] = useState(false);
        return (
          <span
            title="Click to copy path"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(path);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className={`transition-colors ${copied ? "text-teal-500" : "hover:text-teal-500"}`}
          >
            {copied ? "Copied!" : params.value}
          </span>
        );
      },
    },
    {
      field: "parentCategory",
      headerName: "Category",
      width: 130,
      filter: "agSetColumnFilter",
      editable: true,
    },
    {
      field: "subcategory",
      headerName: "Subcategory",
      width: 130,
      filter: "agSetColumnFilter",
      editable: true,
    },
    {
      field: "target",
      headerName: "Target",
      width: 90,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["bot", "platform", "both"] },
      cellRenderer: (params: { value: string }) => {
        if (!params.value) return null;
        const colors: Record<string, string> = {
          bot: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          platform: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
          both: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        };
        return (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[params.value] ?? "")}>
            {params.value}
          </span>
        );
      },
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: STATUS_VALUES },
      cellRenderer: (params: { value: string }) => {
        if (!params.value) return null;
        const colors: Record<string, string> = {
          active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
          test: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
          review: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
          inactive: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
          deprecated: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
        };
        return (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[params.value] ?? "")}>
            {params.value}
          </span>
        );
      },
    },
    {
      field: "domain",
      headerName: "Platform/Domain",
      width: 130,
      filter: "agSetColumnFilter",
      editable: true,
      cellClass: "text-xs text-zinc-500",
    },
    {
      field: "command",
      headerName: "Command",
      width: 110,
      filter: "agTextColumnFilter",
      editable: true,
      cellClass: "text-xs font-mono text-zinc-500",
      hide: true,
    },
    {
      field: "verified",
      headerName: "Verified",
      width: 80,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: [true, false] },
      cellRenderer: (params: { value: boolean }) => {
        if (params.value === undefined || params.value === null) return null;
        return params.value
          ? <span className="text-emerald-500 text-xs">Yes</span>
          : <span className="text-zinc-400 text-xs">No</span>;
      },
    },
    {
      field: "last_audited",
      headerName: "Last Audited",
      width: 120,
      filter: "agTextColumnFilter",
      editable: true,
      cellClass: (params) => {
        if (!params.value || isStale(params.value)) {
          return "text-xs text-amber-600 dark:text-amber-400";
        }
        return "text-xs text-zinc-600 dark:text-zinc-400";
      },
    },
    {
      field: "needs_work",
      headerName: "Needs Work",
      width: 130,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: NEEDS_WORK_VALUES },
      cellRenderer: (params: { value: string }) => {
        if (!params.value) return <span className="text-zinc-300 dark:text-zinc-600 text-xs">—</span>;
        const colors: Record<string, string> = {
          audit: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
          "schema update": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          finish: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
          refactor: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
          rewrite: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        };
        return (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[params.value] ?? "bg-zinc-100 text-zinc-600")}>
            {params.value}
          </span>
        );
      },
    },
    {
      field: "work_notes",
      headerName: "Notes",
      minWidth: 150,
      flex: 1,
      filter: "agTextColumnFilter",
      editable: true,
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
      enableRowGroup: false,
      wrapText: wrapNotes,
      autoHeight: wrapNotes,
    },
    {
      field: "action",
      headerName: "Action",
      width: 140,
      filter: "agTextColumnFilter",
      editable: true,
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
      enableRowGroup: false,
    },
    {
      field: "outcome",
      headerName: "Outcome",
      width: 140,
      filter: "agTextColumnFilter",
      editable: true,
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
      enableRowGroup: false,
    },
    {
      field: "last_modified",
      headerName: "Modified",
      width: 100,
      filter: "agTextColumnFilter",
      cellClass: "text-xs text-zinc-500",
      valueFormatter: (params) => {
        if (!params.value) return "—";
        return params.value.slice(0, 10);
      },
      sort: "desc",
    },
    // ── Website Library columns ──
    {
      headerName: "📄 WEBSITE",
      children: [
        {
          field: "webTitle",
          headerName: "Web Title",
          width: 180,
          filter: "agTextColumnFilter",
          editable: true,
          cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
          enableRowGroup: false,
        },
        {
          field: "webDescription",
          headerName: "Web Description",
          minWidth: 200,
          flex: 1,
          filter: "agTextColumnFilter",
          editable: true,
          cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
          enableRowGroup: false,
          wrapText: wrapNotes,
          autoHeight: wrapNotes,
        },
        {
          field: "webWriteup",
          headerName: "Web Writeup",
          minWidth: 200,
          flex: 1,
          filter: "agTextColumnFilter",
          editable: true,
          cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
          enableRowGroup: false,
          wrapText: wrapNotes,
          autoHeight: wrapNotes,
        },
        {
          field: "webSolution",
          headerName: "Solution",
          width: 130,
          filter: "agSetColumnFilter",
          editable: true,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: ["analytics", "ar-automation", "ap-automation"] },
          cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
        },
        {
          field: "webCategory",
          headerName: "Web Category",
          width: 120,
          filter: "agSetColumnFilter",
          editable: true,
          cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
        },
        {
          field: "webSubcategory",
          headerName: "Web Subcategory",
          width: 120,
          filter: "agSetColumnFilter",
          editable: true,
          cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
        },
        {
          field: "webMetrics",
          headerName: "Metrics",
          width: 200,
          filter: "agTextColumnFilter",
          editable: true,
          cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
          enableRowGroup: false,
        },
        {
          field: "webSources",
          headerName: "Sources",
          width: 200,
          filter: "agTextColumnFilter",
          editable: true,
          cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
          enableRowGroup: false,
        },
        {
          field: "webPublished",
          headerName: "Published",
          width: 90,
          filter: "agSetColumnFilter",
          editable: true,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: [true, false] },
          cellRenderer: (params: { value: boolean }) => {
            if (params.value === undefined || params.value === null) return <span className="text-zinc-300 text-xs">—</span>;
            return params.value
              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">Live</span>
              : <span className="text-zinc-400 text-xs">No</span>;
          },
        },
        {
          field: "webFeatured",
          headerName: "Featured",
          width: 90,
          filter: "agSetColumnFilter",
          editable: true,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: [true, false] },
          cellRenderer: (params: { value: boolean }) => {
            if (params.value === undefined || params.value === null) return <span className="text-zinc-300 text-xs">—</span>;
            return params.value
              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Yes</span>
              : <span className="text-zinc-400 text-xs">No</span>;
          },
        },
      ],
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SkillReviewGrid({ registry, onSelectSkill }: SkillReviewGridProps) {
  const theme = useAppStore((s) => s.theme);
  const gridRef = useRef<AgGridReact<SkillReviewRow>>(null);
  const registryUpdate = useSkillRegistryUpdate();
  const { data: modInfos } = useSkillSummary();
  const { data: reportSkillMap } = useReportSkillMap();
  const upsertReportSkill = useUpsertReportSkill();

  const [quickFilter, setQuickFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [wrapNotes, setWrapNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);

  const handleRevalidateWebsite = useCallback(async () => {
    setIsRevalidating(true);
    try {
      await fetch("https://www.thinkval.com/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: [
            "/solutions/analytics",
            "/solutions/analytics/report-skills",
            "/solutions/analytics/questions",
            "/solutions/ar-automation",
            "/solutions/ap-automation",
          ],
        }),
      });
    } catch {
      // Best-effort
    } finally {
      setIsRevalidating(false);
    }
  }, []);

  // Layout management
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>(() => {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch { /* ignore */ }
    }
    return {};
  });
  const [defaultLayoutName, setDefaultLayoutName] = useState<string | null>(() =>
    localStorage.getItem(DEFAULT_LAYOUT_KEY)
  );

  // ESC to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Build modification info lookup
  const modLookup = useMemo(() => {
    const map: Record<string, string> = {};
    if (modInfos) {
      for (const m of modInfos) {
        map[m.slug] = m.last_modified;
      }
    }
    return map;
  }, [modInfos]);

  // Build row data from registry — only recalculate when skill count or modInfos change
  // Use a ref to track the last registry version we built from
  const lastBuiltVersion = useRef<string>("");
  const [rowData, setRowData] = useState<SkillReviewRow[]>([]);

  // Rebuild rows when registry changes externally (not from our own edits)
  // Build slug -> first ReportSkill lookup from Supabase map
  const webLookup = useMemo(() => {
    const map: Record<string, ReportSkill> = {};
    if (reportSkillMap) {
      for (const [, entry] of reportSkillMap) {
        // Keep first entry per slug (if multiple demo files exist)
        if (!map[entry.skill_slug]) {
          map[entry.skill_slug] = entry;
        }
      }
    }
    return map;
  }, [reportSkillMap]);

  const registryVersion = `${Object.keys(registry.skills).length}-${registry.updated}-${modInfos?.length ?? 0}-${reportSkillMap?.size ?? 0}`;
  useEffect(() => {
    if (lastBuiltVersion.current === registryVersion) return;
    lastBuiltVersion.current = registryVersion;

    const rows: SkillReviewRow[] = [];
    for (const [slug, skill] of Object.entries(registry.skills)) {
      const { parentCategory, subcategory } = resolveCategory(skill.category, registry.categories);
      const web = webLookup[slug];
      rows.push({
        slug,
        folder: slug,
        name: skill.name,
        category: skill.category,
        parentCategory,
        subcategory,
        target: skill.target,
        status: skill.status,
        domain: skill.domain ?? "",
        command: skill.command ?? "",
        verified: skill.verified ?? false,
        last_audited: skill.last_audited ?? "",
        needs_work: skill.needs_work ?? "",
        work_notes: skill.work_notes ?? "",
        action: skill.action ?? "",
        outcome: skill.outcome ?? "",
        last_modified: modLookup[slug] ?? "",
        webTitle: web?.title ?? "",
        webDescription: web?.description ?? "",
        webWriteup: web?.writeup ?? "",
        webSolution: web?.solution ?? "analytics",
        webCategory: web?.category ?? "",
        webSubcategory: web?.subcategory ?? "",
        webMetrics: (web?.metrics ?? []).join(", "),
        webSources: (web?.sources ?? []).join(", "),
        webPublished: web?.published ?? false,
        webFeatured: web?.featured ?? false,
        _webSkillSlug: web?.skill_slug ?? slug,
        _webFileName: web?.file_name ?? "",
      });
    }
    setRowData(rows);
  }, [registryVersion, registry, modLookup, webLookup]);

  // External filter via filter buttons
  const isExternalFilterPresent = useCallback(() => reviewFilter !== "all", [reviewFilter]);

  const doesExternalFilterPass = useCallback((node: { data?: SkillReviewRow }) => {
    if (!node.data) return true;
    switch (reviewFilter) {
      case "needs-work":
        return node.data.needs_work !== "";
      case "stale":
        return isStale(node.data.last_audited);
      case "modified": {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return !!node.data.last_modified && new Date(node.data.last_modified).getTime() > cutoff;
      }
      default:
        return true;
    }
  }, [reviewFilter]);

  // Re-run external filter when reviewFilter changes
  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [reviewFilter]);

  const columnDefs = useMemo(() => buildColumns(wrapNotes), [wrapNotes]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    tooltipShowDelay: 500,
    enableRowGroup: true,
    cellClass: "text-xs",
  }), []);

  const autoGroupColumnDef = useMemo<ColDef<SkillReviewRow>>(() => ({
    headerName: "Category",
    minWidth: 280,
    flex: 1,
    cellRendererParams: { suppressCount: false },
  }), []);

  const getRowId = useCallback((params: GetRowIdParams<SkillReviewRow>) => params.data.slug, []);

  const getRowClass = useCallback((params: { node: { group?: boolean } }) => {
    if (params.node.group) return "ag-group-row-custom";
    return undefined;
  }, []);

  const getRowHeight = useCallback((params: { node: { group?: boolean } }) => {
    return params.node.group ? 44 : 36;
  }, []);

  // Resolve category labels to ID, auto-creating new categories as needed
  const resolveAndUpdateCategory = useCallback((
    parentLabel: string,
    subLabel: string,
    currentCategories: SkillCategory[],
  ): { categoryId: string; categories: SkillCategory[] } => {
    let categories = [...currentCategories];

    if (parentLabel === "Uncategorized" || !parentLabel) {
      return { categoryId: "", categories };
    }

    // Find or create parent (case-insensitive match)
    let parentCat = categories.find(c => !c.parent && c.label.toLowerCase() === parentLabel.toLowerCase());
    if (!parentCat) {
      const id = parentLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      // Check for ID collision
      const existingWithId = categories.find(c => c.id === id);
      const finalId = existingWithId ? `${id}-${Date.now()}` : id;
      parentCat = { id: finalId, label: parentLabel, order: categories.length };
      categories = [...categories, parentCat];
    }

    if (!subLabel) {
      return { categoryId: parentCat.id, categories };
    }

    // Find or create child (case-insensitive match)
    let childCat = categories.find(c => c.parent === parentCat!.id && c.label.toLowerCase() === subLabel.toLowerCase());
    if (!childCat) {
      const id = `${parentCat.id}-${subLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      childCat = { id, label: subLabel, order: categories.length, parent: parentCat.id };
      categories = [...categories, childCat];
    }

    return { categoryId: childCat.id, categories };
  }, []);

  // Persist edits — registry fields go to registry.json, web fields go to Supabase
  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<SkillReviewRow>) => {
      const { data, colDef } = event;
      if (!data || !colDef.field) return;

      const field = colDef.field as keyof SkillReviewRow;
      const slug = data.slug;

      // ── Website library fields → Supabase ──
      const webFields = ["webTitle", "webDescription", "webWriteup", "webSolution", "webCategory", "webSubcategory", "webMetrics", "webSources", "webPublished", "webFeatured"] as const;
      if ((webFields as readonly string[]).includes(field)) {
        // Need a file_name to upsert — use existing or skip
        const fileName = data._webFileName;
        if (!fileName) return; // No demo file associated, can't create entry

        upsertReportSkill.mutate({
          skill_slug: data._webSkillSlug || slug,
          file_name: fileName,
          title: data.webTitle || data.name,
          description: data.webDescription || null,
          writeup: data.webWriteup || null,
          solution: data.webSolution || "analytics",
          category: data.webCategory || "uncategorized",
          subcategory: data.webSubcategory || null,
          metrics: data.webMetrics ? data.webMetrics.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          sources: data.webSources ? data.webSources.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          published: data.webPublished,
          featured: data.webFeatured,
        });
        return;
      }

      // ── Registry fields → registry.json ──
      const skill = registry.skills[slug];
      if (!skill) return;

      let updatedSkill = { ...skill };
      let updatedCategories = registry.categories;

      if (field === "parentCategory" || field === "subcategory") {
        const newParent = data.parentCategory;
        const newSub = field === "parentCategory" ? "" : data.subcategory;
        const result = resolveAndUpdateCategory(newParent, newSub, registry.categories);
        updatedSkill.category = result.categoryId;
        updatedCategories = result.categories;
      } else {
        const editableFields = ["name", "target", "status", "domain", "command", "verified", "last_audited", "needs_work", "work_notes", "action", "outcome"] as const;
        if (!editableFields.includes(field as typeof editableFields[number])) return;
        updatedSkill = { ...skill, [field]: data[field] };
      }

      const newTimestamp = new Date().toISOString();
      const updated: SkillRegistry = {
        ...registry,
        updated: newTimestamp,
        categories: updatedCategories,
        skills: {
          ...registry.skills,
          [slug]: updatedSkill,
        },
      };

      // Pre-set the version so the rebuild effect skips this mutation's invalidation
      lastBuiltVersion.current = `${Object.keys(updated.skills).length}-${newTimestamp}-${modInfos?.length ?? 0}-${reportSkillMap?.size ?? 0}`;

      registryUpdate.mutate(updated);
    },
    [registry, registryUpdate, resolveAndUpdateCategory, modInfos, reportSkillMap, upsertReportSkill],
  );

  // ─── Layout actions ─────────────────────────────────────────────────────────

  const applyFlatLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({
      state: [
        { colId: "parentCategory", hide: false, pinned: "left" as const, width: 140 },
        { colId: "subcategory", hide: false, pinned: "left" as const, width: 110 },
        { colId: "name", hide: false, pinned: "left" as const, width: 220 },
        { colId: "ag-Grid-AutoColumn", hide: true },
      ],
      applyOrder: false,
    });
    api.applyColumnState({
      state: [
        { colId: "parentCategory", sort: "asc", sortIndex: 0 },
        { colId: "subcategory", sort: "asc", sortIndex: 1 },
      ],
      defaultState: { sort: null },
    });
  }, []);

  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    api.setRowGroupColumns(["parentCategory"]);
    setQuickFilter("");
    setReviewFilter("all");
  }, []);

  const autoSizeAllColumns = useCallback(() => {
    gridRef.current?.api.autoSizeAllColumns();
  }, []);

  const exportToExcel = useCallback(() => {
    gridRef.current?.api.exportDataAsExcel({
      fileName: `skill-review-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: "Skills Review",
      allColumns: true,
      skipRowGroups: true,
    });
  }, []);

  const exportToCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `skill-review-${new Date().toISOString().slice(0, 10)}.csv`,
      allColumns: true,
      skipRowGroups: true,
    });
  }, []);

  const saveCurrentLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api || !name.trim()) return;
    const layout: Record<string, unknown> = {
      columnState: api.getColumnState(),
      filterModel: api.getFilterModel(),
      rowGroupColumns: api.getRowGroupColumns().map(col => col.getColId()),
      savedAt: new Date().toISOString(),
    };
    const newLayouts = { ...savedLayouts, [name.trim()]: layout };
    setSavedLayouts(newLayouts);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayouts));
    setShowSaveDialog(false);
    setNewLayoutName("");
  }, [savedLayouts]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = savedLayouts[name] as {
      columnState: ColumnState[];
      rowGroupColumns?: string[];
      filterModel?: Record<string, unknown>;
    } | undefined;
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.columnState, applyOrder: true });
    if (layout.rowGroupColumns?.length) {
      api.setRowGroupColumns(layout.rowGroupColumns);
    }
    if (layout.filterModel) {
      api.setFilterModel(layout.filterModel);
    } else {
      api.setFilterModel(null);
    }
    setShowLayoutMenu(false);
  }, [savedLayouts]);

  const deleteLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newLayouts = { ...savedLayouts };
    delete newLayouts[name];
    setSavedLayouts(newLayouts);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayouts));
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem(DEFAULT_LAYOUT_KEY);
    }
  }, [savedLayouts, defaultLayoutName]);

  const toggleDefaultLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem(DEFAULT_LAYOUT_KEY);
    } else {
      setDefaultLayoutName(name);
      localStorage.setItem(DEFAULT_LAYOUT_KEY, name);
    }
  }, [defaultLayoutName]);

  // Auto-apply default layout on first data render
  const hasAppliedDefault = useRef(false);
  const handleFirstDataRendered = useCallback(() => {
    if (hasAppliedDefault.current) return;
    hasAppliedDefault.current = true;

    const api = gridRef.current?.api;
    if (!api) return;

    // Apply saved default layout if one exists
    const defaultName = localStorage.getItem(DEFAULT_LAYOUT_KEY);
    if (defaultName) {
      try {
        const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (stored) {
          const layouts = JSON.parse(stored);
          const layout = layouts[defaultName] as {
            columnState?: ColumnState[];
            filterModel?: Record<string, unknown>;
            rowGroupColumns?: string[];
          } | undefined;
          if (layout?.columnState) {
            api.applyColumnState({ state: layout.columnState, applyOrder: true });
            if (layout.rowGroupColumns?.length) api.setRowGroupColumns(layout.rowGroupColumns);
            if (layout.filterModel) api.setFilterModel(layout.filterModel);
            return;
          }
        }
      } catch { /* ignore */ }
    }

    // No saved default — apply initial grouping by parentCategory programmatically
    api.setRowGroupColumns(["parentCategory"]);
  }, []);

  // ─── Filter counts ──────────────────────────────────────────────────────────

  const filterCounts = useMemo(() => {
    const needsWork = rowData.filter((r) => r.needs_work !== "").length;
    const stale = rowData.filter((r) => isStale(r.last_audited)).length;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const modified = rowData.filter((r) => r.last_modified && new Date(r.last_modified).getTime() > cutoff).length;
    return { needsWork, stale, modified };
  }, [rowData]);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex flex-col" : "h-full flex flex-col"}>
      <style>{groupRowStyles}{themeStyles}{`
        /* Vertically center cell content */
        .ag-theme-alpine .ag-cell,
        .ag-theme-alpine-dark .ag-cell {
          display: flex;
          align-items: center;
        }
      `}</style>

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        {/* Left: search + filter buttons */}
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Quick filter..."
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              className="w-full px-3 py-2 pl-9 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1">
            {([
              ["all", `All (${rowData.length})`],
              ["needs-work", `Needs Work (${filterCounts.needsWork})`],
              ["stale", `Stale (${filterCounts.stale})`],
              ["modified", `Modified (${filterCounts.modified})`],
            ] as [ReviewFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setReviewFilter(key)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
                  reviewFilter === key
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {/* Layouts dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              title="Layouts & view options"
            >
              <Bookmark size={14} /> Layouts
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 py-1">
                <button
                  onClick={() => { applyFlatLayout(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <Columns size={13} /> Flat View
                </button>
                <button
                  onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <ChevronsLeftRight size={13} /> Auto-fit Columns
                </button>
                <button
                  onClick={() => { resetLayout(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <RotateCcw size={13} /> Reset to Default
                </button>

                <div className="border-t border-zinc-200 dark:border-zinc-700 my-1" />

                <button
                  onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  <span className="text-green-600 dark:text-green-400">+</span>
                  Save current layout...
                </button>
                {Object.keys(savedLayouts).length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-700 my-1" />
                    <div className="px-3 py-1 text-xs font-medium text-zinc-500">Saved Layouts</div>
                    {Object.keys(savedLayouts).map((name) => (
                      <div
                        key={name}
                        onClick={() => loadLayout(name)}
                        className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center justify-between cursor-pointer group"
                      >
                        <span className="truncate flex items-center gap-1.5">
                          {defaultLayoutName === name && <Star size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                          {name}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30" title="Overwrite with current layout">
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
                          <button onClick={(e) => deleteLayout(name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400" title="Delete layout">
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

          <button
            onClick={() => setWrapNotes(!wrapNotes)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              wrapNotes
                ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            }`}
            title={wrapNotes ? "Click to truncate text" : "Click to wrap text"}
          >
            <WrapText size={14} />
          </button>

          <button
            onClick={handleRevalidateWebsite}
            disabled={isRevalidating}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
            title="Revalidate website cache"
          >
            {isRevalidating ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            Revalidate
          </button>

          <Button variant="secondary" size="md" icon={Download} onClick={exportToCsv} title="Export to CSV">
            CSV
          </Button>
          <Button size="md" icon={FileSpreadsheet} onClick={exportToExcel} title="Export to Excel">
            Excel
          </Button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              isFullscreen
                ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            }`}
            title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
          >
            {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* AG Grid */}
      <div
        className={cn(themeClass, "flex-1 min-h-0 overflow-hidden")}
        style={{ width: "100%" }}
      >
        <AgGridReact<SkillReviewRow>
          ref={gridRef}
          theme="legacy"
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          autoGroupColumnDef={autoGroupColumnDef}
          getRowId={getRowId}
          getRowClass={getRowClass}
          getRowHeight={getRowHeight}
          quickFilterText={quickFilter}
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
          onCellValueChanged={handleCellValueChanged}
          onFirstDataRendered={handleFirstDataRendered}
          onRowDoubleClicked={(e) => {
            if (e.data?.slug && onSelectSkill) onSelectSkill(e.data.slug);
          }}
          animateRows
          enableRangeSelection
          enableBrowserTooltips
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          groupDisplayType="singleColumn"
          groupDefaultExpanded={0}
          rowGroupPanelShow="never"
          rowSelection="single"
          suppressRowClickSelection
          getContextMenuItems={() => [
            "copy" as const,
            "copyWithHeaders" as const,
            "paste" as const,
            "separator" as const,
            "export" as const,
            "separator" as const,
            "autoSizeAll" as const,
            "resetColumns" as const,
            "separator" as const,
            "expandAll" as const,
            "contractAll" as const,
          ]}
          sideBar={{
            toolPanels: [
              { id: "columns", labelDefault: "Columns", labelKey: "columns", iconKey: "columns", toolPanel: "agColumnsToolPanel" },
              { id: "filters", labelDefault: "Filters", labelKey: "filters", iconKey: "filter", toolPanel: "agFiltersToolPanel" },
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
          pagination
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200, 500]}
        />
      </div>

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-700 animate-modal-in">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input
              type="text"
              value={newLayoutName}
              onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName);
                else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); }
              }}
              placeholder="Enter layout name..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-teal-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }}>
                Cancel
              </Button>
              <Button size="md" onClick={() => saveCurrentLayout(newLayoutName)} disabled={!newLayoutName.trim()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close layout menu */}
      {showLayoutMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
      )}
    </div>
  );
}
