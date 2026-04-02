// src/modules/guides/GuidesModule.tsx

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  BookOpen,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useGuides, useCreateGuide, useUpdateGuide, useDeleteGuide } from "./useGuides";
import { GuideEditor } from "./GuideEditor";
import { ScreenshotsPanel } from "./ScreenshotsPanel";
import { ScriptsPanel } from "./ScriptsPanel";
import type { Guide } from "./types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function GuidesModule() {
  const { data: guides = [], isLoading } = useGuides();
  const createGuide = useCreateGuide();
  const updateGuide = useUpdateGuide();
  const deleteGuide = useDeleteGuide();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"guides" | "screenshots" | "scripts">("guides");

  const categories = useMemo(() => {
    const cats = new Set<string>();
    guides.forEach((g) => cats.add(g.category));
    return Array.from(cats).sort();
  }, [guides]);

  const filtered = useMemo(() => {
    return guides.filter((g) => {
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (categoryFilter !== "all" && g.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !g.title.toLowerCase().includes(q) &&
          !g.description.toLowerCase().includes(q) &&
          !g.category.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [guides, search, statusFilter, categoryFilter]);

  const selectedGuide = guides.find((g) => g.id === selectedId) ?? null;

  const handleCreate = async () => {
    const slug = `new-guide-${Date.now()}`;
    const result = await createGuide.mutateAsync({
      slug,
      title: "Untitled Guide",
      description: "Guide description",
      category: "Getting Started",
      status: "draft",
    });
    setSelectedId(result.id);
  };

  const handleTogglePublish = async (guide: Guide) => {
    const updates: Partial<Guide> & { id: string } = {
      id: guide.id,
      status: guide.status === "published" ? "draft" : "published",
    };
    if (guide.status !== "published") {
      updates.published_at = new Date().toISOString();
    }
    await updateGuide.mutateAsync(updates);
  };

  const handleDelete = async (guide: Guide) => {
    if (selectedId === guide.id) setSelectedId(null);
    await deleteGuide.mutateAsync(guide.id);
  };

  if (selectedGuide) {
    return (
      <GuideEditor
        guide={selectedGuide}
        onBack={() => setSelectedId(null)}
        onSave={async (updates) => {
          await updateGuide.mutateAsync({ id: selectedGuide.id, ...updates });
        }}
      />
    );
  }

  if (tab === "screenshots" || tab === "scripts") {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-4">
            {(["guides", "screenshots", "scripts"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "text-sm font-medium pb-1 transition-colors capitalize",
                  tab === t
                    ? "text-zinc-800 dark:text-zinc-200 border-b-2 border-teal-500"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === "screenshots" ? <ScreenshotsPanel /> : <ScriptsPanel />}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4">
              {(["guides", "screenshots", "scripts"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "text-sm font-medium pb-1 transition-colors capitalize",
                    tab === t
                      ? "text-zinc-800 dark:text-zinc-200 border-b-2 border-teal-500"
                      : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="text-xs text-zinc-400">({guides.length})</span>
          </div>
          <button
            onClick={handleCreate}
            disabled={createGuide.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
            New Guide
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guides..."
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["all", "published", "draft"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  statusFilter === s
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {categories.length > 1 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Guide List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-400 text-sm">
            No guides found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium w-32">Category</th>
                <th className="text-left px-4 py-2 font-medium w-16">Order</th>
                <th className="text-left px-4 py-2 font-medium w-24">Status</th>
                <th className="text-left px-4 py-2 font-medium w-28">Published</th>
                <th className="text-right px-4 py-2 font-medium w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guide) => (
                <tr
                  key={guide.id}
                  onClick={() => setSelectedId(guide.id)}
                  className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate block">
                      {guide.title}
                    </span>
                    {guide.description && (
                      <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-lg">
                        {guide.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{guide.category}</td>
                  <td className="px-4 py-2.5 text-zinc-400 text-center">{guide.order}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
                        guide.status === "published"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      )}
                    >
                      {guide.status === "published" ? <Eye size={10} /> : <EyeOff size={10} />}
                      {guide.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {formatDate(guide.published_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleTogglePublish(guide)}
                        title={guide.status === "published" ? "Unpublish" : "Publish"}
                        className="p-1.5 text-zinc-400 hover:text-teal-600 transition-colors rounded"
                      >
                        {guide.status === "published" ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      {guide.status === "published" && (
                        <a
                          href={`https://thinkval.com/guides/${guide.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-zinc-400 hover:text-blue-600 transition-colors rounded"
                          title="View on website"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(guide)}
                        title="Delete"
                        className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
