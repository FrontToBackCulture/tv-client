// src/modules/product/SolutionsTabView.tsx
// Solutions tab — DB-backed. Shows solution templates from solution_templates table.

import { useState } from "react";
import { Package } from "lucide-react";
import { useSolutionTemplates } from "../../hooks/solutions";
import type { TemplateTab } from "../../lib/solutions/types";
import SolutionOnboardingPanel from "./SolutionOnboardingPanel";

const TAB_DOT_COLORS: Record<string, string> = {
  purple: "bg-purple-400",
  cyan: "bg-cyan-400",
  teal: "bg-teal-400",
  amber: "bg-amber-400",
  green: "bg-emerald-400",
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  published: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" },
  draft: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  archived: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500" },
};

interface SolutionsTabViewProps {
  onSelect: (slug: string | null) => void;
  solutionsPath: string | undefined;
  detailPanelWidth: number;
  isResizingDetail: boolean;
  onDetailMouseDown: (e: React.MouseEvent) => void;
}

export function SolutionsTabView({
  onSelect: _onSelect,
  solutionsPath: _solutionsPath,
  detailPanelWidth: _detailPanelWidth,
  isResizingDetail: _isResizingDetail,
  onDetailMouseDown: _onDetailMouseDown,
}: SolutionsTabViewProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { data: templates, isLoading } = useSolutionTemplates();

  const selectedTemplate = templates?.find((t) => t.slug === selectedSlug);

  return (
    <div className="flex h-full">
      {/* Sidebar — template list */}
      <div className="w-[240px] flex-shrink-0 h-full border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Package size={11} />
            Solution Templates
            {templates && <span className="text-zinc-300 dark:text-zinc-600 ml-auto tabular-nums">{templates.length}</span>}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <p className="text-xs text-zinc-400 px-4 py-4">Loading...</p>
          ) : (
            (templates || []).map((t) => {
              const isActive = selectedSlug === t.slug;
              const statusStyle = STATUS_STYLES[t.status] || STATUS_STYLES.draft;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedSlug(t.slug)}
                  className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                    isActive
                      ? "bg-teal-50 dark:bg-teal-950/20 border-teal-500"
                      : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-sm font-medium ${isActive ? "text-teal-700 dark:text-teal-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {t.name}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}>
                      {t.status === "published" ? "Published" : t.status === "archived" ? "Archived" : "Draft"}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 line-clamp-1">
                    {t.description || "No description"}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {(t.template.tabs || []).map((tab: TemplateTab) => (
                      <span key={tab.key} className={`w-1.5 h-1.5 rounded-full ${TAB_DOT_COLORS[tab.color] || "bg-blue-400"}`} />
                    ))}
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 ml-1">
                      {(t.template.tabs || []).length} tabs &middot; v{t.version}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-auto">
        {selectedTemplate ? (
          <SolutionOnboardingPanel slug={selectedTemplate.slug} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-zinc-400">
            Select a template from the sidebar
          </div>
        )}
      </div>
    </div>
  );
}
