// src/modules/skills/SkillReviewGrid.tsx
// AG Grid Enterprise review table for skill audit tracking
// Data source: Supabase `skills` table + `skill_library` table

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
  CloudUpload,
  Trash2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";
import { useAppStore } from "../../stores/appStore";
import { toast } from "../../stores/toastStore";
import { groupRowStyles, themeStyles } from "../domains/reviewGridStyles";
import { invoke } from "@tauri-apps/api/core";
import { useSkillInit, useSkillExamples } from "./useSkillRegistry";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSkills, useUpdateSkill } from "../../hooks/skills/useSkills";
import { useSkillActivitySummaries } from "../../hooks/skills/useSkillActivity";
import { supabase } from "../../lib/supabase";
import { useSkillLibraryMap } from "../../hooks/gallery/useSkillLibrary";
import type { Skill } from "../../hooks/skills/types";
import { useSkillTypesStore } from "../../stores/skillTypesStore";

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
  skillType: string;
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
  hasCards: boolean;
  // Website library summary (from Supabase skill_library)
  webEntries: number;
  webPublished: number;
  webFeatured: number;
  // Activity tracking (from skill_activity table)
  lastChanged: string;
  lastChangedBy: string;
  changeCount: number;
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

const STATUS_VALUES = ["active", "test", "review", "draft", "inactive", "deprecated", "deleted"];

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
      cellRenderer: (params: { value: string; data?: SkillReviewRow }) => {
        if (!params.value) return null;
        const isDeleted = params.data?.status === "deleted";
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            {isDeleted && (
              <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-500 text-white flex-shrink-0">Deleted</span>
            )}
            <span className="font-medium">{params.value}</span>
          </span>
        );
      },
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
      field: "skillType",
      headerName: "Skill Type",
      width: 110,
      filter: "agSetColumnFilter",
      editable: true,
      cellEditor: "agTextCellEditor",
      cellRenderer: (params: { value: string }) => {
        if (!params.value) return null;
        const types = useSkillTypesStore.getState().types;
        const match = types.find((t) => t.value === params.value);
        const color = match?.color ?? "bg-gray-500 text-white";
        return (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", color)}>
            {params.value}
          </span>
        );
      },
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
      field: "lastChanged",
      headerName: "Last Changed",
      width: 130,
      filter: "agTextColumnFilter",
      cellRenderer: (params: { value: string }) => {
        if (!params.value) return <span className="text-zinc-300 text-xs">—</span>;
        const d = new Date(params.value);
        const now = Date.now();
        const diffMs = now - d.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        let label: string;
        if (diffDays === 0) label = "today";
        else if (diffDays === 1) label = "yesterday";
        else if (diffDays < 7) label = `${diffDays}d ago`;
        else label = d.toISOString().slice(0, 10);
        const color = diffDays <= 1 ? "text-teal-600 dark:text-teal-400" : diffDays <= 7 ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-500";
        return <span className={`text-xs ${color}`}>{label}</span>;
      },
    },
    {
      field: "lastChangedBy",
      headerName: "Changed By",
      width: 110,
      filter: "agSetColumnFilter",
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
      enableRowGroup: true,
    },
    {
      field: "changeCount",
      headerName: "Changes",
      width: 80,
      filter: "agNumberColumnFilter",
      cellRenderer: (params: { value: number }) => {
        if (!params.value) return <span className="text-zinc-300 text-xs">—</span>;
        return <span className="text-xs text-zinc-500">{params.value}</span>;
      },
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
    {
      field: "hasCards",
      headerName: "Cards",
      width: 75,
      filter: "agSetColumnFilter",
      cellRenderer: (params: { value: boolean }) => {
        if (params.value === undefined || params.value === null) return null;
        return params.value
          ? <span className="text-emerald-500 text-xs">Yes</span>
          : <span className="text-zinc-400 text-xs">No</span>;
      },
    },
    // ── Website Library summary ──
    {
      headerName: "WEBSITE",
      children: [
        {
          field: "webEntries",
          headerName: "Entries",
          width: 80,
          filter: "agNumberColumnFilter",
          cellRenderer: (params: { value: number }) => {
            if (!params.value) return <span className="text-zinc-300 text-xs">—</span>;
            return <span className="text-xs font-medium">{params.value}</span>;
          },
        },
        {
          field: "webPublished",
          headerName: "Published",
          width: 90,
          filter: "agNumberColumnFilter",
          cellRenderer: (params: { value: number }) => {
            if (!params.value) return <span className="text-zinc-300 text-xs">—</span>;
            return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">{params.value} live</span>;
          },
        },
        {
          field: "webFeatured",
          headerName: "Featured",
          width: 90,
          filter: "agNumberColumnFilter",
          cellRenderer: (params: { value: number }) => {
            if (!params.value) return <span className="text-zinc-300 text-xs">—</span>;
            return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{params.value}</span>;
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
  const queryClient = useQueryClient();
  const skillInit = useSkillInit();
  const updateSkill = useUpdateSkill();

  const { data: skills = [], isLoading } = useSkills();
  const { data: users } = useQuery({
    queryKey: ["users-for-skills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("name").order("name");
      if (error) throw error;
      return (data ?? []).map(u => u.name);
    },
    staleTime: 60_000,
  });
  const { data: feedCardSlugs } = useQuery({
    queryKey: ["feed-card-skill-slugs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feed_cards")
        .select("source_ref")
        .like("source_ref", "skill:%");
      if (error) throw error;
      const slugs = new Set<string>();
      for (const row of data ?? []) {
        // source_ref is like "skill:generating-receipts-report" or "skill:slug:variant"
        const parts = row.source_ref.split(":");
        if (parts.length >= 2) slugs.add(parts[1]);
      }
      return slugs;
    },
    staleTime: 60_000,
  });
  const { data: reportSkillMap } = useSkillLibraryMap();
  const { data: skillExamples } = useSkillExamples();
  const { data: activitySummaries } = useSkillActivitySummaries();

  const [quickFilter, setQuickFilter] = useState("");
  const [hideDeleted, setHideDeleted] = useState(true);
  const [hideDraft, setHideDraft] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "report" | "diagnostic" | "chat">("all");
  const [wrapNotes, setWrapNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const handleSkillInit = useCallback(async () => {
    const syncId = toast.loading("Step 1/5 — Scanning filesystem...");
    try {
      // Step 1: Scan filesystem — returns skills data directly (no file write)
      const result = await skillInit.mutateAsync(undefined);
      toast.update(syncId, { message: `Step 2/5 — Pushing ${result.skills_created} skills to database...` });

      // Step 2: Push scanned skills to Supabase (only filesystem-derived fields)
      const rows = Object.entries(result.skills as Record<string, {
        name: string; description: string; target: string; status: string;
        command?: string; domain?: string; has_demo?: boolean; has_examples?: boolean;
        has_deck?: boolean; has_guide?: boolean; distributions?: unknown[];
      }>).map(([slug, skill]) => ({
        slug,
        name: skill.name,
        description: skill.description || "",
        has_demo: skill.has_demo ?? false,
        has_examples: skill.has_examples ?? false,
        has_deck: skill.has_deck ?? false,
        has_guide: skill.has_guide ?? false,
      }));

      // Upsert directly (bypass mutation hook to avoid premature query invalidation)
      const { error: upsertError } = await supabase
        .from("skills")
        .upsert(rows, { onConflict: "slug" });
      if (upsertError) throw new Error(`Failed to bulk upsert skills: ${upsertError.message}`);

      // Step 3: Mark DB skills not found on filesystem as "deleted", restore found ones
      toast.update(syncId, { message: "Step 3/5 — Cleaning up deleted skills..." });
      const filesystemSlugs = new Set(rows.map((r) => r.slug));
      const { data: allDbSkills } = await supabase
        .from("skills")
        .select("slug, status");

      if (allDbSkills?.length) {
        const toDelete = allDbSkills.filter((s) => !filesystemSlugs.has(s.slug) && s.status !== "deleted");
        const toRestore = allDbSkills.filter((s) => filesystemSlugs.has(s.slug) && s.status === "deleted");

        console.log("[Sync] Filesystem slugs:", [...filesystemSlugs]);
        console.log("[Sync] DB skills not on filesystem:", toDelete.map((s) => s.slug));
        console.log("[Sync] Skills to restore:", toRestore.map((s) => s.slug));

        for (const s of toDelete) {
          const { error } = await supabase.from("skills").update({ status: "deleted" }).eq("slug", s.slug);
          if (error) console.error(`[Sync] Failed to mark ${s.slug} as deleted:`, error);
          else console.log(`[Sync] Marked ${s.slug} as deleted`);
        }
        for (const s of toRestore) {
          const { error } = await supabase.from("skills").update({ status: "active" }).eq("slug", s.slug);
          if (error) console.error(`[Sync] Failed to restore ${s.slug}:`, error);
        }

        if (toDelete.length) console.log(`[Sync] ${toDelete.length} skill(s) marked as deleted`);
        if (toRestore.length) console.log(`[Sync] ${toRestore.length} skill(s) restored to active`);

        // Step 3b: Prune orphaned skill_library entries for deleted skills
        if (toDelete.length) {
          toast.update(syncId, { message: `Step 3/5 — Pruning ${toDelete.length} orphaned gallery items...` });
          const deletedSlugs = toDelete.map((s) => s.slug);
          const { data: orphanedLibrary } = await supabase
            .from("skill_library")
            .select("id, skill_slug")
            .in("skill_slug", deletedSlugs);

          if (orphanedLibrary?.length) {
            const orphanIds = orphanedLibrary.map((o) => o.id);
            const { error: pruneError } = await supabase
              .from("skill_library")
              .delete()
              .in("id", orphanIds);
            if (pruneError) console.error("[Sync] Failed to prune skill_library:", pruneError);
            else console.log(`[Sync] Pruned ${orphanedLibrary.length} orphaned skill_library entries`);
          }
        }
      }

      // Step 4: Cross-reference skill_library for S3 demo URLs
      toast.update(syncId, { message: "Step 4/5 — Linking demo URLs..." });
      const { data: reports } = await supabase
        .from("skill_library")
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

      // Step 5: Final refresh
      toast.update(syncId, { message: "Step 5/5 — Refreshing..." });
      await queryClient.refetchQueries({ queryKey: ["skills"] });

      toast.update(syncId, { type: "success", message: `Synced ${rows.length} skills`, duration: 3000 });
    } catch (err) {
      toast.update(syncId, { type: "error", message: `Sync failed: ${err instanceof Error ? err.message : String(err)}`, duration: 5000 });
    }
  }, [skillInit, queryClient]);

  const handleRevalidateWebsite = useCallback(async () => {
    setIsRevalidating(true);
    try {
      await fetch("https://www.thinkval.com/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: [
            "/solutions/analytics",
            "/solutions/analytics/ai-skills",
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

  // Build row data from Supabase skills + skill_library
  const webSummary = useMemo(() => {
    const map: Record<string, { entries: number; published: number; featured: number }> = {};
    if (reportSkillMap) {
      for (const [, entry] of reportSkillMap) {
        if (!map[entry.skill_slug]) {
          map[entry.skill_slug] = { entries: 0, published: 0, featured: 0 };
        }
        map[entry.skill_slug].entries++;
        if (entry.published) map[entry.skill_slug].published++;
        if (entry.featured) map[entry.skill_slug].featured++;
      }
    }
    return map;
  }, [reportSkillMap]);

  const rowData = useMemo(() => {
    return skills.map((skill: Skill) => {
      const web = webSummary[skill.slug];
      const activity = activitySummaries?.[skill.slug];
      return {
        slug: skill.slug,
        name: skill.name,
        description: skill.description ?? "",
        category: skill.category ?? "",
        subcategory: skill.subcategory ?? "",
        skillType: skill.skill_type ?? "report",
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
        hasCards: feedCardSlugs?.has(skill.slug) ?? false,
        lastChanged: activity?.lastChanged ?? "",
        lastChangedBy: activity?.lastActor ?? "",
        changeCount: activity?.changeCount ?? 0,
        webEntries: web?.entries ?? 0,
        webPublished: web?.published ?? 0,
        webFeatured: web?.featured ?? 0,
      } satisfies SkillReviewRow;
    });
  }, [skills, webSummary, feedCardSlugs, activitySummaries]);

  const filteredRowData = useMemo(() => {
    return rowData.filter((r) => {
      if (hideDeleted && r.status === "deleted") return false;
      if (hideDraft && (r.status === "draft" || r.status === "inactive")) return false;
      if (typeFilter !== "all" && r.skillType !== typeFilter) return false;
      return true;
    });
  }, [rowData, hideDeleted, hideDraft, typeFilter]);

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

  // Persist edits — skill fields go to Supabase `skills`, web fields go to Supabase `skill_library`
  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<SkillReviewRow>) => {
      const { data, colDef } = event;
      if (!data || !colDef.field) return;

      const field = colDef.field as keyof SkillReviewRow;
      const slug = data.slug;

      // ── Skill fields → Supabase skills table ──
      // Map camelCase row fields to snake_case DB columns
      const fieldMap: Record<string, string> = {
        hasDemo: "has_demo",
        hasExamples: "has_examples",
        hasDeck: "has_deck",
        hasGuide: "has_guide",
        demoUploaded: "demo_uploaded",
        demoUrl: "demo_url",
        skillType: "skill_type",
      };
      const dbField = fieldMap[field] ?? field;

      const editableFields = [
        "name", "description", "category", "subcategory", "skill_type", "target", "status",
        "domain", "command", "verified", "last_audited", "rating", "owner",
        "has_demo", "has_examples", "has_deck", "has_guide",
        "demo_uploaded", "demo_url",
      ];
      if (!editableFields.includes(dbField)) return;

      // Auto-register new skill types
      if (dbField === "skill_type" && data[field]) {
        const val = String(data[field]).trim().toLowerCase();
        const store = useSkillTypesStore.getState();
        if (val && !store.types.some((t) => t.value === val)) {
          // Rotate through a set of distinct colors for new types
          const palette = [
            "bg-emerald-600 text-white",
            "bg-rose-600 text-white",
            "bg-cyan-600 text-white",
            "bg-orange-600 text-white",
            "bg-indigo-600 text-white",
            "bg-pink-600 text-white",
            "bg-teal-600 text-white",
            "bg-lime-600 text-white",
          ];
          const colorIdx = store.types.length % palette.length;
          store.addType({ value: val, label: val, color: palette[colorIdx] });
        }
      }

      updateSkill.mutate({
        slug,
        updates: { [dbField]: data[field] },
      });
    },
    [updateSkill],
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

      // Update skill_library
      await supabase
        .from("skill_library")
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

  const [isBulkUploading, setIsBulkUploading] = useState(false);

  const handleBulkUploadToS3 = useCallback(async () => {
    if (!skillExamples?.length) {
      toast.info("No demo files found to upload");
      return;
    }
    setIsBulkUploading(true);
    let success = 0;
    let failed = 0;
    // Group by slug — upload first demo per skill
    const bySlug: Record<string, { file_path: string; file_name: string }> = {};
    for (const ex of skillExamples) {
      if (!bySlug[ex.slug]) bySlug[ex.slug] = { file_path: ex.file_path, file_name: ex.file_name };
    }
    const entries = Object.entries(bySlug);
    toast.info(`Uploading ${entries.length} demos to S3...`);

    for (const [slug, { file_path, file_name }] of entries) {
      try {
        const result = await invoke<{ url: string; s3_key: string; size_bytes: number }>("gallery_upload_demo_report", {
          filePath: file_path,
          skillSlug: slug,
          fileName: file_name,
        });
        await supabase.from("skills").update({ demo_uploaded: true, demo_url: result.url }).eq("slug", slug);
        await supabase.from("skill_library").upsert({
          skill_slug: slug,
          file_name: file_name,
          title: slug,
          report_url: result.url,
        }, { onConflict: "skill_slug,file_name" });
        success++;
      } catch {
        failed++;
      }
    }
    setIsBulkUploading(false);
    // Refresh grid
    updateSkill.mutate({ slug: entries[0]?.[0] ?? "", updates: {} }, { onError: () => {} });
    toast.success(`Bulk upload complete: ${success} uploaded, ${failed} failed`);
  }, [skillExamples, updateSkill]);

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

          <button
            onClick={() => setHideDeleted(!hideDeleted)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap",
              hideDeleted
                ? "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
            )}
            title={hideDeleted ? "Show deleted skills" : "Hide deleted skills"}
          >
            <Trash2 size={14} />
            {hideDeleted ? "Show Deleted" : "Showing Deleted"}
          </button>

          <button
            onClick={() => setHideDraft(!hideDraft)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap",
              hideDraft
                ? "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
            )}
            title={hideDraft ? "Show draft & inactive skills" : "Hide draft & inactive skills"}
          >
            <FileSpreadsheet size={14} />
            {hideDraft ? "Show Draft" : "Showing Draft"}
          </button>

          {/* Skill type filter */}
          <div className="flex items-center rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden">
            {(["all", "report", "diagnostic", "chat"] as const).map((type) => {
              const active = typeFilter === type;
              const colors: Record<string, string> = {
                all: active ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "",
                report: active ? "bg-blue-600 text-white" : "",
                diagnostic: active ? "bg-amber-600 text-white" : "",
                chat: active ? "bg-violet-600 text-white" : "",
              };
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap",
                    active
                      ? colors[type]
                      : "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  )}
                >
                  {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              );
            })}
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
                  onClick={() => { handleBulkUploadToS3(); setActionsMenuOpen(false); }}
                  disabled={isBulkUploading}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 disabled:opacity-50 flex items-start gap-2.5"
                >
                  <CloudUpload size={15} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Upload All Demos to S3</div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">Upload all demo files to S3 storage</div>
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
          rowData={filteredRowData}
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
