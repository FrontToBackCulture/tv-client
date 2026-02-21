// src/modules/product/SolutionDetailPanel.tsx
// Detail panel — file-based. Shows overview.md or a selected subfolder file.
// Features/connectors navigation is in the sidebar tree, not tabs here.

import { useMemo } from "react";
import { useReadFile } from "../../hooks/useFiles";
import { parseFrontmatter, MarkdownViewer } from "../library/MarkdownViewer";
import { X, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

interface SolutionDetailPanelProps {
  slug: string;
  solutionsBasePath: string;
  selectedFile: string | null;  // full path to a feature/connector .md, or null for overview
  onClose: () => void;
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

export function SolutionDetailPanel({ slug, solutionsBasePath, selectedFile, onClose }: SolutionDetailPanelProps) {
  const solutionPath = `${solutionsBasePath}/${slug}`;

  // Load overview.md (always, for the header)
  const overviewQuery = useReadFile(`${solutionPath}/overview.md`);

  // Load selected file if one is chosen
  const selectedFileQuery = useReadFile(selectedFile || undefined);

  // Determine what to render
  const showingFile = selectedFile !== null;
  const contentQuery = showingFile ? selectedFileQuery : overviewQuery;

  // Parse title from overview frontmatter
  const title = useMemo(() => {
    if (!overviewQuery.data) return slug.toUpperCase();
    const { frontmatter } = parseFrontmatter(overviewQuery.data);
    return cleanTitle(frontmatter?.title || frontmatter?.name || slug.toUpperCase());
  }, [overviewQuery.data, slug]);

  const status = useMemo(() => {
    if (!overviewQuery.data) return "draft";
    const { frontmatter } = parseFrontmatter(overviewQuery.data);
    return frontmatter?.status || "draft";
  }, [overviewQuery.data]);

  // Subtitle: show which file is being viewed
  const subtitle = showingFile
    ? displayName(selectedFile!.split("/").pop() || "")
    : "Overview";

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium rounded",
              status === "published"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
              {status === "published" ? "Published" : "Draft"}
            </span>
            <span className="text-xs text-zinc-400 truncate">{subtitle}</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {contentQuery.isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={18} className="text-zinc-400 animate-spin" />
          </div>
        ) : contentQuery.data ? (
          <div className="p-4">
            <MarkdownViewer
              content={contentQuery.data}
              filename={showingFile ? selectedFile!.split("/").pop() : "overview.md"}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-zinc-400">
              {showingFile ? "Could not load file." : "No overview.md found in this solution folder."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
