// src/modules/blog/BlogModule.tsx

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Eye,
  EyeOff,
  Star,
  Trash2,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/PageHeader";
import { useBlogArticles, useCreateArticle, useUpdateArticle, useDeleteArticle } from "./useBlogArticles";
import { BlogEditor } from "./BlogEditor";
import type { BlogArticle } from "./types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BlogModule() {
  const { data: articles = [], isLoading } = useBlogArticles();
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle();
  const deleteArticle = useDeleteArticle();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !a.title.toLowerCase().includes(q) &&
          !(a.description ?? "").toLowerCase().includes(q) &&
          !(a.category ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [articles, search, statusFilter]);

  const selectedArticle = articles.find((a) => a.id === selectedId) ?? null;

  const handleCreate = async () => {
    const slug = `new-article-${Date.now()}`;
    const result = await createArticle.mutateAsync({
      slug,
      title: "Untitled Article",
      status: "draft",
    });
    setSelectedId(result.id);
  };

  const handleTogglePublish = async (article: BlogArticle) => {
    await updateArticle.mutateAsync({
      id: article.id,
      status: article.status === "published" ? "draft" : "published",
    });
  };

  const handleDelete = async (article: BlogArticle) => {
    if (selectedId === article.id) setSelectedId(null);
    await deleteArticle.mutateAsync(article.id);
  };

  if (selectedArticle) {
    return (
      <BlogEditor
        article={selectedArticle}
        onBack={() => setSelectedId(null)}
        onSave={async (updates) => {
          await updateArticle.mutateAsync({ id: selectedArticle.id, ...updates });
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader description="Create, edit, and publish blog articles for the website." />
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-zinc-500" />
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Blog Articles
            </h1>
            <span className="text-xs text-zinc-400">({articles.length})</span>
          </div>
          <button
            onClick={handleCreate}
            disabled={createArticle.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
            New Article
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
              placeholder="Search articles..."
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
        </div>
      </div>

      {/* Article List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-400 text-sm">
            No articles found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium w-28">Category</th>
                <th className="text-left px-4 py-2 font-medium w-24">Status</th>
                <th className="text-left px-4 py-2 font-medium w-28">Published</th>
                <th className="text-right px-4 py-2 font-medium w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((article) => (
                <tr
                  key={article.id}
                  onClick={() => setSelectedId(article.id)}
                  className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {article.featured && (
                        <Star size={12} className="text-amber-500 fill-amber-500 flex-shrink-0" />
                      )}
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {article.title}
                      </span>
                    </div>
                    {article.description && (
                      <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-lg">
                        {article.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{article.category ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
                        article.status === "published"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      )}
                    >
                      {article.status === "published" ? (
                        <Eye size={10} />
                      ) : (
                        <EyeOff size={10} />
                      )}
                      {article.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {formatDate(article.published_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleTogglePublish(article)}
                        title={article.status === "published" ? "Unpublish" : "Publish"}
                        className="p-1.5 text-zinc-400 hover:text-teal-600 transition-colors rounded"
                      >
                        {article.status === "published" ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                      {article.status === "published" && (
                        <a
                          href={`https://thinkval.com/news/${article.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-zinc-400 hover:text-blue-600 transition-colors rounded"
                          title="View on website"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(article)}
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
