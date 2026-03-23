// src/modules/blog/BlogEditor.tsx

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  Star,
  ExternalLink,
} from "lucide-react";
import { cn } from "../../lib/cn";
import type { BlogArticle } from "./types";

interface BlogEditorProps {
  article: BlogArticle;
  onBack: () => void;
  onSave: (updates: Partial<BlogArticle>) => Promise<void>;
}

export function BlogEditor({ article, onBack, onSave }: BlogEditorProps) {
  const [title, setTitle] = useState(article.title);
  const [slug, setSlug] = useState(article.slug);
  const [description, setDescription] = useState(article.description ?? "");
  const [content, setContent] = useState(article.content ?? "");
  const [category, setCategory] = useState(article.category ?? "");
  const [author, setAuthor] = useState(article.author ?? "ThinkVAL Team");
  const [readTime, setReadTime] = useState(article.read_time ?? "");
  const [color, setColor] = useState(article.color ?? "#EEF8F9");
  const [illustration, setIllustration] = useState(article.illustration ?? "");
  const [featured, setFeatured] = useState(article.featured);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Track changes
  useEffect(() => {
    const changed =
      title !== article.title ||
      slug !== article.slug ||
      description !== (article.description ?? "") ||
      content !== (article.content ?? "") ||
      category !== (article.category ?? "") ||
      author !== (article.author ?? "ThinkVAL Team") ||
      readTime !== (article.read_time ?? "") ||
      color !== (article.color ?? "#EEF8F9") ||
      illustration !== (article.illustration ?? "") ||
      featured !== article.featured;
    setDirty(changed);
  }, [title, slug, description, content, category, author, readTime, color, illustration, featured, article]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        title,
        slug,
        description: description || null,
        content: content || null,
        category: category || null,
        author: author || null,
        read_time: readTime || null,
        color: color || null,
        illustration: illustration || null,
        featured,
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    setSaving(true);
    try {
      await onSave({
        status: article.status === "published" ? "draft" : "published",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-md">
            {article.title}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
              article.status === "published"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            )}
          >
            {article.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {article.status === "published" && (
            <a
              href={`https://thinkval.co/news/${article.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-blue-600 transition-colors"
            >
              <ExternalLink size={12} />
              View
            </a>
          )}
          <button
            onClick={handleTogglePublish}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50",
              article.status === "published"
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                : "bg-green-600 text-white hover:bg-green-700"
            )}
          >
            {article.status === "published" ? (
              <>
                <EyeOff size={12} /> Unpublish
              </>
            ) : (
              <>
                <Eye size={12} /> Publish
              </>
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            <Save size={12} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title" span={2}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label="Slug">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="input-field font-mono text-xs"
              />
            </Field>
            <Field label="Category">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Product, Company"
                className="input-field"
              />
            </Field>
            <Field label="Author">
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label="Read Time">
              <input
                value={readTime}
                onChange={(e) => setReadTime(e.target.value)}
                placeholder="e.g. 5 min read"
                className="input-field"
              />
            </Field>
            <Field label="Illustration Path">
              <input
                value={illustration}
                onChange={(e) => setIllustration(e.target.value)}
                placeholder="/images/article-illustrations/..."
                className="input-field font-mono text-xs"
              />
            </Field>
            <Field label="Card Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="input-field font-mono text-xs flex-1"
                />
              </div>
            </Field>
            <Field label="Featured" span={2}>
              <button
                onClick={() => setFeatured(!featured)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  featured
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                )}
              >
                <Star size={12} className={featured ? "fill-amber-500" : ""} />
                {featured ? "Featured" : "Not featured"}
              </button>
            </Field>
          </div>

          {/* Description */}
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Short description for cards and SEO..."
              className="input-field resize-y"
            />
          </Field>

          {/* Content */}
          <Field label="Content (Markdown)">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={24}
              placeholder="Write your article in Markdown..."
              className="input-field resize-y font-mono text-xs leading-relaxed"
            />
          </Field>
        </div>
      </div>

      {/* Inline styles for input fields */}
      <style>{`
        .input-field {
          width: 100%;
          padding: 6px 10px;
          font-size: 13px;
          background: rgb(244 244 245);
          border: 1px solid rgb(228 228 231);
          border-radius: 6px;
          color: rgb(39 39 42);
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: rgb(20 184 166);
          box-shadow: 0 0 0 1px rgb(20 184 166 / 0.2);
        }
        .dark .input-field {
          background: rgb(39 39 42);
          border-color: rgb(63 63 70);
          color: rgb(228 228 231);
        }
        .dark .input-field:focus {
          border-color: rgb(20 184 166);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  span = 1,
}: {
  label: string;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
