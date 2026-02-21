// src/modules/product/SolutionsTabView.tsx
// Solutions tab: tree sidebar (solutions + features/connectors subfolders) + detail panel
// Sources data from 2_Solutions/{ar,ap,analytics}/ folders

import { useState, useMemo } from "react";
import { Search, X, Package, Loader2, ChevronRight, ChevronDown, Folder, FileText } from "lucide-react";
import { useReadFile, useListDirectory, FileEntry } from "../../hooks/useFiles";
import { parseFrontmatter } from "../library/MarkdownViewer";
import { SolutionCardView } from "./SolutionCardView";
import { SolutionDetailPanel } from "./SolutionDetailPanel";

export interface SolutionInfo {
  slug: string;
  title: string;
  summary: string;
  status: string;
}

// What's selected in the sidebar
export interface SidebarSelection {
  slug: string;                     // solution folder (ar, ap, analytics)
  subfolder?: "features" | "connectors"; // if browsing a subfolder
  file?: string;                    // full path to a specific .md file
}

interface SolutionsTabViewProps {
  onSelect: (slug: string | null) => void;
  solutionsPath: string | undefined;
  detailPanelWidth: number;
  isResizingDetail: boolean;
  onDetailMouseDown: (e: React.MouseEvent) => void;
}

/** Hook to load a single solution's overview frontmatter */
function useSolutionOverview(solutionsPath: string | undefined, slug: string) {
  const overviewPath = solutionsPath ? `${solutionsPath}/${slug}/overview.md` : undefined;
  return useReadFile(overviewPath);
}

/** Strip common suffixes like " - Solution Overview" from frontmatter titles */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*[-–—]\s*Solution Overview$/i, "")
    .replace(/\s*[-–—]\s*Overview$/i, "")
    .trim();
}

/** Prettify filename → display name */
function displayName(name: string): string {
  return name.replace(/\.md$/, "").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SolutionsTabView({
  onSelect,
  solutionsPath,
  detailPanelWidth,
  isResizingDetail,
  onDetailMouseDown,
}: SolutionsTabViewProps) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<SidebarSelection | null>(null);
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());

  // Load overview.md for each solution folder
  const arOverview = useSolutionOverview(solutionsPath, "ar");
  const apOverview = useSolutionOverview(solutionsPath, "ap");
  const analyticsOverview = useSolutionOverview(solutionsPath, "analytics");

  // Load subfolder listings for each solution
  const arFeatures = useListDirectory(solutionsPath ? `${solutionsPath}/ar/features` : undefined);
  const apFeatures = useListDirectory(solutionsPath ? `${solutionsPath}/ap/features` : undefined);
  const analyticsFeatures = useListDirectory(solutionsPath ? `${solutionsPath}/analytics/features` : undefined);
  const arConnectors = useListDirectory(solutionsPath ? `${solutionsPath}/ar/connectors` : undefined);
  const apConnectors = useListDirectory(solutionsPath ? `${solutionsPath}/ap/connectors` : undefined);
  const analyticsConnectors = useListDirectory(solutionsPath ? `${solutionsPath}/analytics/connectors` : undefined);

  const isLoading = arOverview.isLoading || apOverview.isLoading || analyticsOverview.isLoading;

  // Filter to .md files
  const mdFiles = (entries: FileEntry[] | undefined) =>
    (entries ?? []).filter((f) => !f.is_directory && f.name.endsWith(".md"));

  const subfolderData: Record<string, { features: FileEntry[]; connectors: FileEntry[] }> = useMemo(() => ({
    ar: { features: mdFiles(arFeatures.data), connectors: mdFiles(arConnectors.data) },
    ap: { features: mdFiles(apFeatures.data), connectors: mdFiles(apConnectors.data) },
    analytics: { features: mdFiles(analyticsFeatures.data), connectors: mdFiles(analyticsConnectors.data) },
  }), [arFeatures.data, apFeatures.data, analyticsFeatures.data, arConnectors.data, apConnectors.data, analyticsConnectors.data]);

  // Parse frontmatter from each overview
  const solutions: SolutionInfo[] = useMemo(() => {
    const overviews = [
      { slug: "ar", data: arOverview.data },
      { slug: "ap", data: apOverview.data },
      { slug: "analytics", data: analyticsOverview.data },
    ];

    return overviews.map(({ slug, data }) => {
      if (!data) {
        return { slug, title: slug.toUpperCase(), summary: "No overview available", status: "draft" };
      }
      const { frontmatter } = parseFrontmatter(data);
      return {
        slug,
        title: cleanTitle(frontmatter?.title || frontmatter?.name || slug.toUpperCase()),
        summary: frontmatter?.summary || frontmatter?.description || "",
        status: frontmatter?.status || "draft",
      };
    });
  }, [arOverview.data, apOverview.data, analyticsOverview.data]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return solutions;
    const q = search.toLowerCase();
    return solutions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q)
    );
  }, [solutions, search]);

  // Toggle expand/collapse
  const toggleExpand = (slug: string) => {
    setExpandedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  // Handle selecting a solution (overview)
  const handleSelectSolution = (slug: string) => {
    setSelection({ slug });
    onSelect(slug);
    // Auto-expand on click
    setExpandedSlugs((prev) => new Set(prev).add(slug));
  };

  // Handle selecting a subfolder file
  const handleSelectFile = (slug: string, subfolder: "features" | "connectors", filePath: string) => {
    setSelection({ slug, subfolder, file: filePath });
    onSelect(slug);
  };

  const hasSelection = selection !== null;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-[220px] flex-shrink-0 h-full border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col">
        {/* Search */}
        <div className="p-2.5 pb-1.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:border-teal-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Solution tree */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-2.5 mb-1 flex items-center gap-1.5">
            <Package size={10} />
            Solutions
            <span className="text-zinc-300 dark:text-zinc-600 ml-auto tabular-nums">{filtered.length}</span>
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={14} className="text-zinc-400 animate-spin" />
            </div>
          ) : (
            filtered.map((solution) => {
              const expanded = expandedSlugs.has(solution.slug);
              const sub = subfolderData[solution.slug];
              const hasChildren = sub.features.length > 0 || sub.connectors.length > 0;
              const isSelectedSolution = selection?.slug === solution.slug && !selection.file;

              return (
                <div key={solution.slug} className="mb-0.5">
                  {/* Solution root */}
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleExpand(solution.slug)}
                      className="p-0.5 text-zinc-400 hover:text-zinc-600 flex-shrink-0"
                    >
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <button
                      onClick={() => handleSelectSolution(solution.slug)}
                      className={`flex-1 text-left flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs transition-colors ${
                        isSelectedSolution
                          ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <span className="truncate font-medium">{solution.title}</span>
                      {solution.status === "draft" && (
                        <span className="flex-shrink-0 ml-auto px-1 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                          Draft
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Expanded children: features + connectors folders */}
                  {expanded && (
                    <div className="ml-4 mt-0.5">
                      {/* Features folder */}
                      {sub.features.length > 0 && (
                        <SubfolderTree
                          label="Features"
                          files={sub.features}
                          selectedFile={selection?.slug === solution.slug ? selection.file ?? null : null}
                          onSelectFile={(path) => handleSelectFile(solution.slug, "features", path)}
                        />
                      )}
                      {/* Connectors folder */}
                      {sub.connectors.length > 0 && (
                        <SubfolderTree
                          label="Connectors"
                          files={sub.connectors}
                          selectedFile={selection?.slug === solution.slug ? selection.file ?? null : null}
                          onSelectFile={(path) => handleSelectFile(solution.slug, "connectors", path)}
                        />
                      )}
                      {!hasChildren && (
                        <p className="text-[10px] text-zinc-400 px-2 py-1">No subfolders</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main list view */}
      <div
        className="overflow-hidden flex flex-col"
        style={{
          flex: hasSelection ? `0 0 ${100 - detailPanelWidth}%` : "1 1 auto",
          transition: isResizingDetail ? "none" : "flex 200ms",
        }}
      >
        <SolutionCardView
          solutions={filtered}
          isLoading={isLoading}
          selectedSlug={selection?.slug ?? null}
          onSelect={(slug) => handleSelectSolution(slug)}
        />
      </div>

      {/* Detail panel */}
      {hasSelection && solutionsPath && (
        <div
          className="relative overflow-hidden border-l border-zinc-200 dark:border-zinc-800"
          style={{
            flex: `0 0 ${detailPanelWidth}%`,
            transition: isResizingDetail ? "none" : "flex 200ms",
          }}
        >
          {/* Resize handle */}
          <div onMouseDown={onDetailMouseDown} className="absolute top-0 -left-1 w-3 h-full cursor-col-resize group z-50">
            <div className={`absolute right-1 w-0.5 h-full transition-all ${isResizingDetail ? "bg-teal-500 w-1" : "bg-transparent group-hover:bg-teal-500/60"}`} />
          </div>
          <SolutionDetailPanel
            slug={selection!.slug}
            solutionsBasePath={solutionsPath}
            selectedFile={selection!.file ?? null}
            onClose={() => { setSelection(null); onSelect(null); }}
          />
        </div>
      )}
    </div>
  );
}

// ── Subfolder tree node ──

function SubfolderTree({
  label,
  files,
  selectedFile,
  onSelectFile,
}: {
  label: string;
  files: FileEntry[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <Folder size={11} className="text-zinc-400" />
        <span>{label}</span>
        <span className="ml-auto text-zinc-300 dark:text-zinc-600 tabular-nums">{files.length}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              className={`w-full text-left flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                selectedFile === file.path
                  ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              }`}
            >
              <FileText size={10} className="flex-shrink-0 text-zinc-400" />
              <span className="truncate">{displayName(file.name)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
