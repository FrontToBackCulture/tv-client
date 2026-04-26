// src/modules/product/SolutionDetailPanel.tsx
// Detail panel — file-based. Shows overview.md or a selected subfolder file.
// Features/connectors navigation is in the sidebar tree, not tabs here.

import { useMemo, useState } from "react";
import { useReadFile } from "../../hooks/useFiles";
import { parseFrontmatter, MarkdownViewer } from "../library/MarkdownViewer";
import { X } from "lucide-react";
import { IconButton } from "../../components/ui";
import { SectionLoading } from "../../components/ui/DetailStates";
import { cn } from "../../lib/cn";
import SolutionOnboardingPanel from "./SolutionOnboardingPanel";

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

type DetailTab = "content" | "onboarding";

export function SolutionDetailPanel({ slug, solutionsBasePath, selectedFile, onClose }: SolutionDetailPanelProps) {
  const [detailTab, setDetailTab] = useState<DetailTab>("content");
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "px-1.5 py-0.5 text-xs font-medium rounded",
              status === "published"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
              {status === "published" ? "Published" : "Draft"}
            </span>
            <span className="text-xs text-zinc-400 truncate">{subtitle}</span>
          </div>
        </div>
        <IconButton onClick={onClose} icon={X} label="Close" className="flex-shrink-0" />
      </div>

      {/* Detail tabs */}
      <div className="flex gap-0 border-b border-zinc-200 dark:border-zinc-800 px-4">
        <button
          onClick={() => setDetailTab("content")}
          className={cn(
            "text-xs font-medium px-3 py-2 border-b-2 -mb-px cursor-pointer bg-transparent transition-colors",
            detailTab === "content"
              ? "border-teal-500 text-teal-600 dark:text-teal-400"
              : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          )}
        >
          Content
        </button>
        <button
          onClick={() => setDetailTab("onboarding")}
          className={cn(
            "text-xs font-medium px-3 py-2 border-b-2 -mb-px cursor-pointer bg-transparent transition-colors",
            detailTab === "onboarding"
              ? "border-teal-500 text-teal-600 dark:text-teal-400"
              : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          )}
        >
          Onboarding
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {detailTab === "onboarding" ? (
          <SolutionOnboardingPanel slug={slug} />
        ) : contentQuery.isLoading ? (
          <SectionLoading className="h-32" />
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
