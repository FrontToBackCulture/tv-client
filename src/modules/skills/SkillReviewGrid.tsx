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
import { formatError } from "../../lib/formatError";
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
  ChevronRight,
  RefreshCw,
  CloudUpload,
  Trash2,
  Layers,
  CheckCircle2,
  CircleDashed,
  Archive,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { toSGTDateString } from "../../lib/date";
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
import {
  useGridLayouts,
  useSaveGridLayout,
  useDeleteGridLayout,
  useSetDefaultGridLayout,
  type GridLayout,
} from "../../hooks/useGridLayouts";

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


const GRID_KEY = "skill-review";

// Module-scoped flag so the Name column's `editable` function can refuse
// edit-on-click when the user just clicked the master-detail chevron.
let lastChevronMouseDownAt = 0;

interface SkillReviewGridProps {
  onSelectSkill?: (slug: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStale(lastAudited: string | undefined): boolean {
  if (!lastAudited) return true;
  const diff = Date.now() - new Date(lastAudited).getTime();
  return diff > 30 * 24 * 60 * 60 * 1000; // 30 days
}

// Sidebar view modes — top section of the left rail
type SkillViewMode = "all" | "active" | "draft" | "deprecated" | "deleted" | "stale" | "unverified";

function matchesView(r: SkillReviewRow, v: SkillViewMode): boolean {
  switch (v) {
    case "all":         return true;
    case "active":      return r.status === "active";
    case "draft":       return r.status === "draft" || r.status === "inactive";
    case "deprecated":  return r.status === "deprecated";
    case "deleted":     return r.status === "deleted";
    case "stale":       return r.status === "active" && isStale(r.last_audited);
    case "unverified":  return r.status === "active" && !r.verified;
  }
}

// ─── Column Definitions ───────────────────────────────────────────────────────

const STATUS_VALUES = ["active", "test", "review", "draft", "inactive", "deprecated", "deleted"];

function buildColumns(wrapNotes: boolean, userNames: string[]): (ColDef<SkillReviewRow> | ColGroupDef<SkillReviewRow>)[] {
  return [
    {
      field: "name",
      headerName: "Name",
      minWidth: 220,
      flex: 2,
      filter: "agTextColumnFilter",
      pinned: "left",
      editable: () => Date.now() - lastChevronMouseDownAt > 250,
      enableRowGroup: false,
      headerClass: "skill-name-header",
      cellRenderer: (params: { value: string; data?: SkillReviewRow; node: { expanded: boolean; setExpanded: (v: boolean) => void } }) => {
        if (!params.value) return null;
        const isDeleted = params.data?.status === "deleted";
        const expanded = params.node.expanded;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", width: "100%" }}>
            <button
              type="button"
              onMouseDown={(e) => { lastChevronMouseDownAt = Date.now(); e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); params.node.setExpanded(!expanded); }}
              className="flex-shrink-0 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
              title={expanded ? "Collapse details" : "Show details"}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
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
      hide: true,
    },
    {
      field: "category",
      headerName: "Category",
      filter: "agSetColumnFilter",
      editable: true,
    },
    {
      field: "subcategory",
      headerName: "Subcategory",
      filter: "agSetColumnFilter",
      editable: true,
    },
    {
      field: "skillType",
      headerName: "Skill Type",
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
        else label = toSGTDateString(d);
        const color = diffDays <= 1 ? "text-teal-600 dark:text-teal-400" : diffDays <= 7 ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-500";
        return <span className={`text-xs ${color}`}>{label}</span>;
      },
    },
    {
      field: "lastChangedBy",
      headerName: "Changed By",
      filter: "agSetColumnFilter",
      cellClass: "text-xs text-zinc-600 dark:text-zinc-400",
      enableRowGroup: true,
    },
    {
      field: "changeCount",
      headerName: "Changes",
      filter: "agNumberColumnFilter",
      cellRenderer: (params: { value: number }) => {
        if (!params.value) return <span className="text-zinc-300 text-xs">—</span>;
        return <span className="text-xs text-zinc-500">{params.value}</span>;
      },
    },
    {
      field: "hasDemo",
      headerName: "Demo",
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
          filter: "agNumberColumnFilter",
          cellRenderer: (params: { value: number }) => {
            if (!params.value) return <span className="text-zinc-300 text-xs">—</span>;
            return <span className="text-xs font-medium">{params.value}</span>;
          },
        },
        {
          field: "webPublished",
          headerName: "Published",
          filter: "agNumberColumnFilter",
          cellRenderer: (params: { value: number }) => {
            if (!params.value) return <span className="text-zinc-300 text-xs">—</span>;
            return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">{params.value} live</span>;
          },
        },
        {
          field: "webFeatured",
          headerName: "Featured",
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

// ─── Detail Row ───────────────────────────────────────────────────────────────
// Rendered as a full-width row when the user expands a skill. Shows the
// long-form fields that don't belong in dense columns (description, path,
// command, demo URL, asset flags, recent activity).

function SkillDetailRow(params: { data?: SkillReviewRow }) {
  const d = params.data;
  if (!d) return null;

  const path = `_skills/${d.slug}/SKILL.md`;
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 1500);
  };

  const Flag = ({ label, on, url }: { label: string; on: boolean; url?: string }) => {
    const base = "px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1";
    if (on && url) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className={cn(base, "bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400 dark:hover:bg-teal-900/50")}>
          {label} ↗
        </a>
      );
    }
    return (
      <span className={cn(base, on ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500")}>
        {label}
      </span>
    );
  };

  return (
    <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/40 border-y border-zinc-200 dark:border-zinc-800">
      <div className="grid grid-cols-12 gap-6">
        {/* Description — takes most of the space */}
        <div className="col-span-8">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Description</div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {d.description || <span className="italic text-zinc-400">No description</span>}
          </div>
        </div>

        {/* Meta sidebar */}
        <div className="col-span-4 space-y-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Path</div>
            <button
              onClick={() => copy(path, setCopiedPath)}
              className={cn("text-xs font-mono w-full text-left truncate transition-colors", copiedPath ? "text-teal-500" : "text-zinc-600 dark:text-zinc-400 hover:text-teal-500")}
              title="Click to copy"
            >
              {copiedPath ? "Copied!" : path}
            </button>
          </div>

          {d.command && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Command</div>
              <button
                onClick={() => copy(d.command, setCopiedCmd)}
                className={cn("text-xs font-mono transition-colors", copiedCmd ? "text-teal-500" : "text-zinc-600 dark:text-zinc-400 hover:text-teal-500")}
                title="Click to copy"
              >
                {copiedCmd ? "Copied!" : d.command}
              </button>
            </div>
          )}

          {d.demoUrl && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Demo URL</div>
              <a href={d.demoUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-600 dark:text-teal-400 hover:underline break-all">
                {d.demoUrl} ↗
              </a>
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Assets</div>
            <div className="flex flex-wrap gap-1.5">
              <Flag label="Demo" on={d.hasDemo} />
              <Flag label="Examples" on={d.hasExamples} />
              <Flag label="Deck" on={d.hasDeck} />
              <Flag label="Guide" on={d.hasGuide} />
              <Flag label="S3" on={d.demoUploaded} />
              <Flag label="Cards" on={d.hasCards} />
            </div>
          </div>

          {(d.lastChanged || d.lastChangedBy) && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Activity</div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {d.lastChangedBy && <span className="font-medium">{d.lastChangedBy}</span>}
                {d.lastChanged && <span> · {new Date(d.lastChanged).toLocaleString()}</span>}
                {d.changeCount > 0 && <span className="text-zinc-400"> · {d.changeCount} change{d.changeCount === 1 ? "" : "s"}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
  const [view, setView] = useState<SkillViewMode>("active");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | "all">("all");
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
      toast.update(syncId, { type: "error", message: `Sync failed: ${formatError(err)}`, duration: 5000 });
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

  // Layout management — shared workspace-wide via Supabase grid_layouts
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [activeLayoutName, setActiveLayoutName] = useState<string | null>(null);
  const [layoutModified, setLayoutModified] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const { data: layouts = [], isFetched: layoutsFetched } = useGridLayouts(GRID_KEY);
  const saveLayoutMutation = useSaveGridLayout(GRID_KEY);
  const deleteLayoutMutation = useDeleteGridLayout(GRID_KEY);
  const setDefaultMutation = useSetDefaultGridLayout(GRID_KEY);
  const layoutsByName = useMemo(() => {
    const m: Record<string, GridLayout> = {};
    for (const l of layouts) m[l.name] = l;
    return m;
  }, [layouts]);
  const defaultLayout = useMemo(() => layouts.find((l) => l.is_default) ?? null, [layouts]);

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
    return rowData.filter((r) => matchesView(r, view))
      .filter((r) => {
        if (typeFilter !== "all" && r.skillType !== typeFilter) return false;
        if (categoryFilter !== "all" && (r.category || "Uncategorized") !== categoryFilter) return false;
        if (subcategoryFilter !== "all" && (r.subcategory || "—") !== subcategoryFilter) return false;
        return true;
      });
  }, [rowData, view, typeFilter, categoryFilter, subcategoryFilter]);

  // Counts per view (computed from rowData with current type + category filters NOT applied,
  // so the sidebar reflects the universe of skills)
  const viewCounts = useMemo<Record<SkillViewMode, number>>(() => {
    const counts: Record<SkillViewMode, number> = {
      all: 0, active: 0, draft: 0, deprecated: 0, deleted: 0,
      stale: 0, unverified: 0,
    };
    for (const r of rowData) {
      counts.all++;
      if (matchesView(r, "active")) counts.active++;
      if (matchesView(r, "draft")) counts.draft++;
      if (matchesView(r, "deprecated")) counts.deprecated++;
      if (matchesView(r, "deleted")) counts.deleted++;
      if (matchesView(r, "stale")) counts.stale++;
      if (matchesView(r, "unverified")) counts.unverified++;
    }
    return counts;
  }, [rowData]);

  // Rows visible at the "view" level — used to compute category counts,
  // so categories reflect the selected view but not the typeFilter chip.
  const viewScopedRows = useMemo(() => rowData.filter((r) => matchesView(r, view)), [rowData, view]);

  const columnDefs = useMemo(() => buildColumns(wrapNotes, users ?? []), [wrapNotes, users]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
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
    api.setRowGroupColumns([]);
    setQuickFilter("");
    toast.info("Layout reset to default");
  }, []);

  const autoSizeAllColumns = useCallback(() => {
    gridRef.current?.api.autoSizeAllColumns();
  }, []);

  const exportToExcel = useCallback(() => {
    gridRef.current?.api.exportDataAsExcel({
      fileName: `skill-review-${toSGTDateString()}.xlsx`,
      sheetName: "Skills Review",
      allColumns: true,
      skipRowGroups: true,
    });
  }, []);

  const exportToCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `skill-review-${toSGTDateString()}.csv`,
      allColumns: true,
      skipRowGroups: true,
    });
  }, []);

  const saveCurrentLayout = useCallback(async (name: string) => {
    const api = gridRef.current?.api;
    const trimmed = name.trim();
    if (!api || !trimmed) return;
    try {
      await saveLayoutMutation.mutateAsync({
        name: trimmed,
        payload: {
          column_state: api.getColumnState() as unknown[],
          filter_model: (api.getFilterModel() ?? {}) as Record<string, unknown>,
          row_group_columns: api.getRowGroupColumns().map(col => col.getColId()),
        },
      });
      setActiveLayoutName(trimmed);
      setLayoutModified(false);
      setShowSaveDialog(false);
      setNewLayoutName("");
      toast.success(`Layout "${trimmed}" saved`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [saveLayoutMutation]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = layoutsByName[name];
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.column_state as ColumnState[], applyOrder: true });
    if (layout.row_group_columns?.length) {
      api.setRowGroupColumns(layout.row_group_columns);
    }
    if (layout.filter_model && Object.keys(layout.filter_model).length) {
      api.setFilterModel(layout.filter_model);
    } else {
      api.setFilterModel(null);
    }
    setActiveLayoutName(name);
    setLayoutModified(false);
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [layoutsByName]);

  const deleteLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await deleteLayoutMutation.mutateAsync(layout.id);
      if (activeLayoutName === name) {
        setActiveLayoutName(null);
        setLayoutModified(false);
      }
      toast.info(`Layout "${name}" deleted`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [layoutsByName, deleteLayoutMutation, activeLayoutName]);

  const toggleDefaultLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await setDefaultMutation.mutateAsync({ id: layout.id, makeDefault: !layout.is_default });
      toast.info(layout.is_default ? `"${name}" removed as default` : `"${name}" set as default layout`);
    } catch (err) {
      toast.error(formatError(err));
    }
  }, [layoutsByName, setDefaultMutation]);

  // Auto-apply default layout once: needs BOTH grid rendered AND layout query
  // resolved. We only mark hasAppliedDefault once we've actually committed the
  // final state — otherwise a late Supabase response would be ignored.
  const hasAppliedDefault = useRef(false);
  const isFirstDataRendered = useRef(false);

  const applyDefaultIfReady = useCallback(() => {
    if (hasAppliedDefault.current) return;
    if (!isFirstDataRendered.current) return;
    if (!layoutsFetched) return; // wait for Supabase before deciding
    const api = gridRef.current?.api;
    if (!api) return;

    if (defaultLayout) {
      api.applyColumnState({ state: defaultLayout.column_state as ColumnState[], applyOrder: true });
      if (defaultLayout.row_group_columns?.length) api.setRowGroupColumns(defaultLayout.row_group_columns);
      if (defaultLayout.filter_model && Object.keys(defaultLayout.filter_model).length) {
        api.setFilterModel(defaultLayout.filter_model);
      }
      setActiveLayoutName(defaultLayout.name);
      setLayoutModified(false);
    } else {
      // No default layout saved — size columns to header + content width.
      api.autoSizeAllColumns(false);
    }
    hasAppliedDefault.current = true;
  }, [defaultLayout, layoutsFetched]);

  const handleFirstDataRendered = useCallback(() => {
    isFirstDataRendered.current = true;
    applyDefaultIfReady();
  }, [applyDefaultIfReady]);

  // Re-run when layouts finish loading after first render (refresh case).
  useEffect(() => {
    applyDefaultIfReady();
  }, [applyDefaultIfReady]);

  // Track filter + layout-dirty state. Skip the first render's "apply layout"
  // events — only real user edits should flip layoutModified.
  const handleFilterChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const model = api.getFilterModel() ?? {};
    setActiveFilterCount(Object.keys(model).length);
    if (hasAppliedDefault.current && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName]);

  const handleLayoutDirty = useCallback(() => {
    if (hasAppliedDefault.current && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName]);

  const clearAllFilters = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    setQuickFilter("");
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
      toast.error(`Upload failed: ${formatError(err)}`);
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
        /* Indent the Name header to line up with cell content (past the chevron) */
        .ag-theme-alpine .ag-header-cell.skill-name-header .ag-header-cell-label,
        .ag-theme-alpine-dark .ag-header-cell.skill-name-header .ag-header-cell-label {
          padding-left: 24px !important;
        }
      `}</style>

      <div className="flex-1 min-h-0 flex overflow-hidden px-4 py-4">
       <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
        <SkillReviewSidebar
          rows={viewScopedRows}
          view={view}
          setView={(v) => { setView(v); setCategoryFilter("all"); setSubcategoryFilter("all"); }}
          viewCounts={viewCounts}
          categoryFilter={categoryFilter}
          setCategoryFilter={(c) => { setCategoryFilter(c); setSubcategoryFilter("all"); }}
          subcategoryFilter={subcategoryFilter}
          setSubcategoryFilter={setSubcategoryFilter}
        />

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
        {/* Left: search + filter buttons */}
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Quick filter..."
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {(activeFilterCount > 0 || quickFilter.trim().length > 0) && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors whitespace-nowrap"
              title="Clear all filters"
            >
              <span>
                {activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0)} filter{activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0) === 1 ? "" : "s"} active
              </span>
              <X size={12} />
            </button>
          )}

          {/* Skill type filter */}
          <div className="flex items-center rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
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
                    "px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap",
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
        <div className="flex items-center gap-1.5">
          {/* Layouts dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              title={activeLayoutName ? `Current layout: ${activeLayoutName}${layoutModified ? " (modified)" : ""}` : "Layouts & view options"}
            >
              <Bookmark size={13} />
              {activeLayoutName ? (
                <span className="flex items-center gap-1">
                  <span className="max-w-[120px] truncate">{activeLayoutName}</span>
                  {layoutModified && <span className="text-amber-500" title="Layout has unsaved changes">•</span>}
                </span>
              ) : (
                <span>Layouts</span>
              )}
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
                <button
                  onClick={() => { applyFlatLayout(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <Columns size={13} /> Flat View
                </button>
                <button
                  onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <ChevronsLeftRight size={13} /> Auto-fit Columns
                </button>
                <button
                  onClick={() => { resetLayout(); setShowLayoutMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <RotateCcw size={13} /> Reset to Default
                </button>

                <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />

                <button
                  onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"
                >
                  <span className="text-green-600 dark:text-green-400">+</span>
                  Save current layout...
                </button>
                {layouts.length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    <div className="px-3 py-1 text-xs font-medium text-zinc-500">Shared Layouts</div>
                    {layouts.map((layout) => (
                      <div
                        key={layout.id}
                        onClick={() => loadLayout(layout.name)}
                        className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group"
                      >
                        <span className="truncate flex items-center gap-1.5">
                          {layout.is_default && <Star size={11} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
                          {layout.name}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(layout.name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500 hover:bg-teal-100 dark:hover:bg-teal-900/30" title="Overwrite with current layout">
                            <Save size={12} />
                          </button>
                          <button
                            onClick={(e) => toggleDefaultLayout(layout.name, e)}
                            className={cn(
                              "p-1 rounded",
                              layout.is_default
                                ? "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                            )}
                            title={layout.is_default ? "Remove as default" : "Set as default"}
                          >
                            <Star size={12} className={layout.is_default ? "fill-amber-500" : ""} />
                          </button>
                          <button onClick={(e) => deleteLayout(layout.name, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400" title="Delete layout">
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
            className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              wrapNotes
                ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            }`}
            title={wrapNotes ? "Click to truncate text" : "Click to wrap text"}
          >
            <WrapText size={13} />
          </button>

          {/* Actions dropdown */}
          <div className="relative">
            <button
              onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw size={13} />
              Actions
              <ChevronDown size={11} className={cn("transition-transform", actionsMenuOpen && "rotate-180")} />
            </button>
            {actionsMenuOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 w-72 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1.5">
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

          <Button variant="secondary" size="sm" icon={Download} onClick={exportToCsv} title="Export to CSV">
            CSV
          </Button>
          <Button size="sm" icon={FileSpreadsheet} onClick={exportToExcel} title="Export to Excel">
            Excel
          </Button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              isFullscreen
                ? "border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            }`}
            title={isFullscreen ? "Exit fullscreen (ESC)" : "Enter fullscreen"}
          >
            {isFullscreen ? <X size={13} /> : <Maximize2 size={13} />}
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
          onFilterChanged={handleFilterChanged}
          onColumnMoved={handleLayoutDirty}
          onColumnResized={handleLayoutDirty}
          onColumnVisible={handleLayoutDirty}
          onColumnPinned={handleLayoutDirty}
          onColumnRowGroupChanged={handleLayoutDirty}
          onSortChanged={handleLayoutDirty}
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
          masterDetail
          detailCellRenderer={SkillDetailRow}
          detailRowAutoHeight
          headerHeight={32}
          floatingFiltersHeight={28}
          autoSizeStrategy={{ type: "fitCellContents", skipHeader: false }}
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

        </div>
       </div>
      </div>

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-800 animate-modal-in">
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
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-4"
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const VIEW_DEFS: { id: SkillViewMode; label: string; icon: typeof Layers }[] = [
  { id: "all",         label: "All",          icon: Layers },
  { id: "active",      label: "Active",       icon: CheckCircle2 },
  { id: "draft",       label: "Draft / Inactive", icon: CircleDashed },
  { id: "deprecated",  label: "Deprecated",   icon: Archive },
  { id: "deleted",     label: "Deleted",      icon: Trash2 },
  { id: "stale",       label: "Needs audit",  icon: Clock },
  { id: "unverified",  label: "Unverified",   icon: ShieldAlert },
];

function SkillReviewSidebar({
  rows,
  view,
  setView,
  viewCounts,
  categoryFilter,
  setCategoryFilter,
  subcategoryFilter,
  setSubcategoryFilter,
}: {
  rows: SkillReviewRow[];
  view: SkillViewMode;
  setView: (v: SkillViewMode) => void;
  viewCounts: Record<SkillViewMode, number>;
  categoryFilter: string | "all";
  setCategoryFilter: (v: string | "all") => void;
  subcategoryFilter: string | "all";
  setSubcategoryFilter: (v: string | "all") => void;
}) {
  // Group rows by category → subcategory
  const categoryGroups = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const cat = r.category || "Uncategorized";
      const sub = r.subcategory || "—";
      if (!map.has(cat)) map.set(cat, new Map());
      const subMap = map.get(cat)!;
      subMap.set(sub, (subMap.get(sub) ?? 0) + 1);
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
  }, [rows]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCat = (c: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
      {/* View section */}
      <div className="px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">View</div>
        <div className="space-y-0.5">
          {VIEW_DEFS.map((v) => {
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
        </div>
      </div>

      {/* Category tree */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <button
          onClick={() => { setCategoryFilter("all"); setSubcategoryFilter("all"); }}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[12.5px] mb-1",
            categoryFilter === "all"
              ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
          )}
        >
          <span className="font-medium">All categories</span>
          <span className="text-[11px] text-zinc-500">{rows.length}</span>
        </button>

        {categoryGroups.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-zinc-400 italic">No categories</div>
        )}

        {categoryGroups.map(({ category, total, subcategories }) => {
          const isOpen = !collapsed.has(category);
          const isActiveCat = categoryFilter === category;
          const hasMultipleSubs = subcategories.length > 1 || subcategories[0]?.subcategory !== "—";
          return (
            <div key={category} className="mt-1">
              <div className="flex items-center group">
                <button
                  onClick={() => hasMultipleSubs && toggleCat(category)}
                  className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  aria-label="Toggle"
                >
                  {hasMultipleSubs ? (
                    isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />
                  ) : (
                    <span className="inline-block w-[11px]" />
                  )}
                </button>
                <button
                  onClick={() => setCategoryFilter(category)}
                  className={cn(
                    "flex-1 flex items-center justify-between gap-2 pr-2 py-1 rounded text-[12px] text-left truncate",
                    isActiveCat
                      ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
                  )}
                  title={category}
                >
                  <span className="truncate">{category}</span>
                  <span className="text-[11px] text-zinc-500 shrink-0">{total}</span>
                </button>
              </div>

              {isOpen && hasMultipleSubs && subcategories.map(({ subcategory, count }) => {
                const isActiveSub = isActiveCat && subcategoryFilter === subcategory;
                return (
                  <button
                    key={subcategory}
                    onClick={() => { setCategoryFilter(category); setSubcategoryFilter(subcategory); }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 pl-7 pr-2 py-0.5 rounded text-[11.5px] text-left",
                      isActiveSub
                        ? "bg-teal-100 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
                    )}
                    title={subcategory}
                  >
                    <span className="truncate">{subcategory === "—" ? <span className="italic text-zinc-400">no subcategory</span> : subcategory}</span>
                    <span className="text-[11px] text-zinc-500 shrink-0">{count}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
