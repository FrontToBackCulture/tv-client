// src/modules/skills/SkillReviewGrid.tsx
// AG Grid Enterprise review table for skill audit tracking
// Data source: Supabase `skills` table + `report_skill_library` table

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
  GetContextMenuItemsParams,
  MenuItemDef,
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
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";
import { useAppStore } from "../../stores/appStore";
import { toast } from "../../stores/toastStore";
import { groupRowStyles, themeStyles } from "../domains/reviewGridStyles";
import { invoke } from "@tauri-apps/api/core";
import { useSkillInit, useSkillRegistry, useSkillExamples } from "./useSkillRegistry";
import type { SkillCategory as RegistryCategory } from "./useSkillRegistry";
import { useQuery } from "@tanstack/react-query";
import { useSkills, useUpdateSkill, useBulkUpsertSkills } from "../../hooks/skills/useSkills";
import { supabase } from "../../lib/supabase";
import { useReportSkillMap, useUpsertReportSkill } from "../../hooks/gallery/useReportSkills";
import type { ReportSkill } from "../../lib/gallery/types";
import type { Skill } from "../../hooks/skills/types";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillReviewRow {
  slug: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  target: string;
  status: string;
  domain: string;
  command: string;
  verified: boolean;
  last_audited: string;
  rating: number | null;
  owner: string;
  hasDemo: boolean;
  hasExamples: boolean;
  hasDeck: boolean;
  hasGuide: boolean;
  demoUploaded: boolean;
  demoUrl: string;
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


const LAYOUT_STORAGE_KEY = "tv-desktop-skill-review-layouts";
const DEFAULT_LAYOUT_KEY = "tv-desktop-skill-review-default-layout";

interface SkillReviewGridProps {
  onSelectSkill?: (slug: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStale(lastAudited: string | undefined): boolean {
  if (!lastAudited) return true;
  const diff = Date.now() - new Date(lastAudited).getTime();
  return diff > 30 * 24 * 60 * 60 * 1000; // 30 days
}

// ─── Column Definitions ───────────────────────────────────────────────────────

const STATUS_VALUES = ["active", "test", "review", "draft", "inactive", "deprecated"];

function buildColumns(wrapNotes: boolean, userNames: string[]): (ColDef<SkillReviewRow> | ColGroupDef<SkillReviewRow>)[] {
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
      field: "description",
      headerName: "Description",
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
      field: "category",
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
      field: "rating",
      headerName: "Score",
      width: 75,
      filter: "agNumberColumnFilter",
      editable: true,
      cellRenderer: (params: { value: number | null }) => {
        if (params.value === undefined || params.value === null) return null;
        const score = params.value;
        const color = score >= 9 ? "text-emerald-500" : score >= 7 ? "text-amber-500" : "text-red-500";
        return <span className={`${color} text-xs font-medium`}>{score}/10</span>;
      },
    },
    {
      field: "owner",
      headerName: "Owner",
      width: 120,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["", ...userNames] },
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
      enableRowGroup: true,
    },
    {
      field: "hasDemo",
      headerName: "Demo",
      width: 75,
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
      field: "hasExamples",
      headerName: "Examples",
      width: 85,
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
      field: "hasDeck",
      headerName: "Deck",
      width: 75,
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
      field: "hasGuide",
      headerName: "Guide",
      width: 75,
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
      field: "demoUploaded",
      headerName: "S3",
      width: 65,
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
      field: "demoUrl",
      headerName: "Demo URL",
      width: 200,
      filter: "agTextColumnFilter",
      editable: true,
      cellClass: "text-xs font-mono text-zinc-500",
      hide: true,
    },
    // ── Website Library columns ──
    {
      headerName: "WEBSITE",
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

export function SkillReviewGrid({ onSelectSkill }: SkillReviewGridProps) {
  const theme = useAppStore((s) => s.theme);
  const gridRef = useRef<AgGridReact<SkillReviewRow>>(null);
  const skillInit = useSkillInit();
  const updateSkill = useUpdateSkill();
  const bulkUpsert = useBulkUpsertSkills();
  const { data: skills = [], isLoading } = useSkills();
  const { refetch: refetchRegistry } = useSkillRegistry();
  const { data: users } = useQuery({
    queryKey: ["users-for-skills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("name").order("name");
      if (error) throw error;
      return (data ?? []).map(u => u.name);
    },
    staleTime: 60_000,
  });
  const { data: reportSkillMap } = useReportSkillMap();
  const upsertReportSkill = useUpsertReportSkill();
  const { data: skillExamples } = useSkillExamples();

  const [quickFilter, setQuickFilter] = useState("");
  const [wrapNotes, setWrapNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const handleSkillInit = useCallback(async () => {
    try {
      // Step 1: Scan filesystem → update registry.json
      const result = await skillInit.mutateAsync(undefined);
      toast.info(`Filesystem scanned: ${result.skills_created} skills found. Pushing to database...`);

      // Step 2: Re-read registry.json to get updated data
      const { data: freshRegistry } = await refetchRegistry();
      if (!freshRegistry?.skills) {
        toast.error("Failed to read updated registry");
        return;
      }

      // Step 3: Resolve categories and push to Supabase
      const resolveCategory = (categoryId: string, categories: RegistryCategory[]) => {
        if (!categoryId) return { category: "Uncategorized", subcategory: null as string | null };
        const cat = categories.find(c => c.id === categoryId);
        if (!cat) return { category: categoryId, subcategory: null as string | null };
        if (cat.parent) {
          const parent = categories.find(c => c.id === cat.parent);
          return { category: parent?.label ?? cat.parent, subcategory: cat.label };
        }
        return { category: cat.label, subcategory: null as string | null };
      };

      const rows = Object.entries(freshRegistry.skills).map(([slug, skill]) => {
        const { category, subcategory } = resolveCategory(skill.category, freshRegistry.categories);
        return {
          slug,
          name: skill.name,
          description: skill.description || "",
          category,
          subcategory,
          target: skill.target || "platform",
          status: skill.status || "active",
          command: skill.command || null,
          domain: skill.domain || null,
          verified: skill.verified ?? false,
          owner: skill.owner || null,
          last_audited: skill.last_audited || null,
          has_demo: skill.has_demo ?? false,
          has_examples: skill.has_examples ?? false,
          has_deck: skill.has_deck ?? false,
          has_guide: skill.has_guide ?? false,
          distributions: skill.distributions || [],
        };
      });

      await bulkUpsert.mutateAsync(rows);

      // Step 4: Cross-reference report_skill_library for S3 demo URLs
      const { data: reports } = await supabase
        .from("report_skill_library")
        .select("skill_slug, report_url")
        .not("report_url", "is", null);

      if (reports?.length) {
        const urlBySlug: Record<string, string> = {};
        for (const r of reports) {
          if (!urlBySlug[r.skill_slug]) urlBySlug[r.skill_slug] = r.report_url!;
        }
        for (const [slug, url] of Object.entries(urlBySlug)) {
          await supabase
            .from("skills")
            .update({ demo_uploaded: true, demo_url: url })
            .eq("slug", slug);
        }
      }

      toast.success(`${rows.length} skills synced to database`);
    } catch (err) {
      toast.error(`Skill sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [skillInit, refetchRegistry, bulkUpsert]);

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

  // Build row data from Supabase skills + report_skill_library
  const webLookup = useMemo(() => {
    const map: Record<string, ReportSkill> = {};
    if (reportSkillMap) {
      for (const [, entry] of reportSkillMap) {
        if (!map[entry.skill_slug]) {
          map[entry.skill_slug] = entry;
        }
      }
    }
    return map;
  }, [reportSkillMap]);

  const rowData = useMemo(() => {
    return skills.map((skill: Skill) => {
      const web = webLookup[skill.slug];
      return {
        slug: skill.slug,
        name: skill.name,
        description: skill.description ?? "",
        category: skill.category ?? "",
        subcategory: skill.subcategory ?? "",
        target: skill.target,
        status: skill.status,
        domain: skill.domain ?? "",
        command: skill.command ?? "",
        verified: skill.verified,
        last_audited: skill.last_audited ?? "",
        rating: skill.rating,
        owner: skill.owner ?? "",
        hasDemo: skill.has_demo,
        hasExamples: skill.has_examples,
        hasDeck: skill.has_deck,
        hasGuide: skill.has_guide,
        demoUploaded: skill.demo_uploaded,
        demoUrl: skill.demo_url ?? "",
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
        _webSkillSlug: web?.skill_slug ?? skill.slug,
        _webFileName: web?.file_name ?? "",
      } satisfies SkillReviewRow;
    });
  }, [skills, webLookup]);

  const columnDefs = useMemo(() => buildColumns(wrapNotes, users ?? []), [wrapNotes, users]);

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

  // Persist edits — skill fields go to Supabase `skills`, web fields go to Supabase `report_skill_library`
  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<SkillReviewRow>) => {
      const { data, colDef } = event;
      if (!data || !colDef.field) return;

      const field = colDef.field as keyof SkillReviewRow;
      const slug = data.slug;

      // ── Website library fields → Supabase report_skill_library ──
      const webFields = ["webTitle", "webDescription", "webWriteup", "webSolution", "webCategory", "webSubcategory", "webMetrics", "webSources", "webPublished", "webFeatured"] as const;
      if ((webFields as readonly string[]).includes(field)) {
        const fileName = data._webFileName;
        if (!fileName) return;

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

      // ── Skill fields → Supabase skills table ──
      // Map camelCase row fields to snake_case DB columns
      const fieldMap: Record<string, string> = {
        hasDemo: "has_demo",
        hasExamples: "has_examples",
        hasDeck: "has_deck",
        hasGuide: "has_guide",
        demoUploaded: "demo_uploaded",
        demoUrl: "demo_url",
      };
      const dbField = fieldMap[field] ?? field;

      const editableFields = [
        "name", "description", "category", "subcategory", "target", "status",
        "domain", "command", "verified", "last_audited", "rating", "owner",
        "has_demo", "has_examples", "has_deck", "has_guide",
        "demo_uploaded", "demo_url",
      ];
      if (!editableFields.includes(dbField)) return;

      updateSkill.mutate({
        slug,
        updates: { [dbField]: data[field] },
      });
    },
    [updateSkill, upsertReportSkill],
  );

  // ─── Layout actions ─────────────────────────────────────────────────────────

  const applyFlatLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({
      state: [
        { colId: "category", hide: false, pinned: "left" as const, width: 140 },
        { colId: "subcategory", hide: false, pinned: "left" as const, width: 110 },
        { colId: "name", hide: false, pinned: "left" as const, width: 220 },
        { colId: "ag-Grid-AutoColumn", hide: true },
      ],
      applyOrder: false,
    });
    api.applyColumnState({
      state: [
        { colId: "category", sort: "asc", sortIndex: 0 },
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
    api.setRowGroupColumns(["category"]);
    setQuickFilter("");
    toast.info("Layout reset to default");
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
    toast.success(`Layout "${name.trim()}" saved`);
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
    toast.info(`Layout "${name}" applied`);
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
    toast.info(`Layout "${name}" deleted`);
  }, [savedLayouts, defaultLayoutName]);

  const toggleDefaultLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (defaultLayoutName === name) {
      setDefaultLayoutName(null);
      localStorage.removeItem(DEFAULT_LAYOUT_KEY);
      toast.info(`"${name}" removed as default`);
    } else {
      setDefaultLayoutName(name);
      localStorage.setItem(DEFAULT_LAYOUT_KEY, name);
      toast.info(`"${name}" set as default layout`);
    }
  }, [defaultLayoutName]);

  // Auto-apply default layout on first data render
  const hasAppliedDefault = useRef(false);
  const handleFirstDataRendered = useCallback(() => {
    if (hasAppliedDefault.current) return;
    hasAppliedDefault.current = true;

    const api = gridRef.current?.api;
    if (!api) return;

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

    api.setRowGroupColumns(["category"]);
  }, []);

  // Build lookup: slug → demo files (for S3 upload)
  // Note: useSkillExamples scans the `demo/` folder of each skill, not `examples/`
  const demosBySlug = useMemo(() => {
    const map: Record<string, { file_path: string; file_name: string }[]> = {};
    if (skillExamples) {
      for (const ex of skillExamples) {
        if (!map[ex.slug]) map[ex.slug] = [];
        map[ex.slug].push({ file_path: ex.file_path, file_name: ex.file_name });
      }
    }
    return map;
  }, [skillExamples]);

  const handleUploadToS3 = useCallback(async (slug: string, filePath: string, fileName: string) => {
    try {
      toast.info(`Uploading ${fileName} to S3...`);
      const result = await invoke<{ url: string; s3_key: string; size_bytes: number }>("gallery_upload_demo_report", {
        filePath,
        skillSlug: slug,
        fileName,
      });

      // Update skills table
      await supabase
        .from("skills")
        .update({ demo_uploaded: true, demo_url: result.url })
        .eq("slug", slug);

      // Update report_skill_library
      await supabase
        .from("report_skill_library")
        .upsert({
          skill_slug: slug,
          file_name: fileName,
          title: slug,
          report_url: result.url,
        }, { onConflict: "skill_slug,file_name" });

      // Refresh grid data
      updateSkill.mutate({ slug, updates: { demo_uploaded: true, demo_url: result.url } });

      toast.success(`Uploaded to S3 (${(result.size_bytes / 1024).toFixed(0)} KB)`);
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [updateSkill]);

  const getContextMenuItems = useCallback((params: GetContextMenuItemsParams<SkillReviewRow>) => {
    const items: ("copy" | "copyWithHeaders" | "paste" | "separator" | "export" | "autoSizeAll" | "resetColumns" | "expandAll" | "contractAll" | MenuItemDef<SkillReviewRow>)[] = [
      "copy",
      "copyWithHeaders",
      "paste",
      "separator",
    ];

    // Add S3 upload option if this skill has demo files
    const slug = params.node?.data?.slug;
    if (slug) {
      const demos = demosBySlug[slug];
      if (demos?.length === 1) {
        items.push({
          name: "Upload Demo to S3",
          action: () => handleUploadToS3(slug, demos[0].file_path, demos[0].file_name),
        });
      } else if (demos && demos.length > 1) {
        items.push({
          name: "Upload Demo to S3",
          subMenu: demos.map(d => ({
            name: d.file_name,
            action: () => handleUploadToS3(slug, d.file_path, d.file_name),
          })),
        });
      }
      items.push("separator");
    }

    items.push(
      "export",
      "separator",
      "autoSizeAll",
      "resetColumns",
      "separator",
      "expandAll",
      "contractAll",
    );

    return items;
  }, [demosBySlug, handleUploadToS3]);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading skills...
      </div>
    );
  }

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

          {/* Actions dropdown */}
          <div className="relative">
            <button
              onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw size={14} />
              Actions
              <ChevronDown size={12} className={cn("transition-transform", actionsMenuOpen && "rotate-180")} />
            </button>
            {actionsMenuOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 w-72 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1.5">
                <button
                  onClick={() => { handleSkillInit(); setActionsMenuOpen(false); }}
                  disabled={skillInit.isPending}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 disabled:opacity-50 flex items-start gap-2.5"
                >
                  <RefreshCw size={15} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Sync Skills</div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">Re-scan filesystem and update registry</div>
                  </div>
                </button>
                <button
                  onClick={() => { handleRevalidateWebsite(); setActionsMenuOpen(false); }}
                  disabled={isRevalidating}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 disabled:opacity-50 flex items-start gap-2.5"
                >
                  <Globe size={15} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Revalidate Website</div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">Purge thinkval.com cache</div>
                  </div>
                </button>
              </div>
            )}
          </div>

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
          getContextMenuItems={getContextMenuItems}
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

      {/* Click outside to close menus */}
      {showLayoutMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
      )}
      {actionsMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setActionsMenuOpen(false)} />
      )}
    </div>
  );
}
