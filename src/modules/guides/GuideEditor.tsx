// src/modules/guides/GuideEditor.tsx

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  ExternalLink,
  Pencil,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";
import type { Guide } from "./types";

interface GuideEditorProps {
  guide: Guide;
  onBack: () => void;
  onSave: (updates: Partial<Guide>) => Promise<void>;
}

export function GuideEditor({ guide, onBack, onSave }: GuideEditorProps) {
  const [title, setTitle] = useState(guide.title);
  const [slug, setSlug] = useState(guide.slug);
  const [description, setDescription] = useState(guide.description);
  const [content, setContent] = useState(guide.content ?? "");
  const [category, setCategory] = useState(guide.category);
  const [author, setAuthor] = useState(guide.author);
  const [coverImage, setCoverImage] = useState(guide.cover_image ?? "");
  const [tags, setTags] = useState(guide.tags.join(", "));
  const [order, setOrder] = useState(guide.order);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const changed =
      title !== guide.title ||
      slug !== guide.slug ||
      description !== guide.description ||
      content !== (guide.content ?? "") ||
      category !== guide.category ||
      author !== guide.author ||
      coverImage !== (guide.cover_image ?? "") ||
      tags !== guide.tags.join(", ") ||
      order !== guide.order;
    setDirty(changed);
  }, [title, slug, description, content, category, author, coverImage, tags, order, guide]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        title,
        slug,
        description,
        content: content || null,
        category,
        author,
        cover_image: coverImage || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        order,
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    setSaving(true);
    try {
      const updates: Partial<Guide> = {
        status: guide.status === "published" ? "draft" : "published",
      };
      if (guide.status !== "published") {
        updates.published_at = new Date().toISOString();
      }
      await onSave(updates);
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
            {guide.title}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
              guide.status === "published"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            )}
          >
            {guide.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewing(!previewing)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
              previewing
                ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            )}
          >
            {previewing ? <><Pencil size={12} /> Edit</> : <><Eye size={12} /> Preview</>}
          </button>
          {guide.status === "published" && (
            <a
              href={`https://thinkval.com/guides/${guide.slug}`}
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
              guide.status === "published"
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                : "bg-green-600 text-white hover:bg-green-700"
            )}
          >
            {guide.status === "published" ? (
              <><EyeOff size={12} /> Unpublish</>
            ) : (
              <><Eye size={12} /> Publish</>
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
        {previewing ? (
          /* Preview mode — mirrors tv-website guide layout */
          <div className="bg-white dark:bg-zinc-950">
            <div className="py-16 md:py-20">
              <div className="max-w-5xl mx-auto px-6 mb-12 text-center">
                {category && (
                  <div className="mb-6 flex justify-center">
                    <span className="inline-block px-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-sm font-semibold rounded-full uppercase tracking-wide">
                      {category}
                    </span>
                  </div>
                )}
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 text-zinc-900 dark:text-zinc-100">
                  {title}
                </h1>
                <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">
                  {description}
                </p>

                {coverImage && (
                  <div className="mt-12 relative w-full aspect-[2/1] rounded-3xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    <img src={coverImage} alt={title} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="max-w-3xl mx-auto px-6">
                <div className="prose prose-lg max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ node, ...props }) => <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mt-16 mb-6" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-12 mb-4" {...props} />,
                      p: ({ node, ...props }) => <p className="text-lg text-zinc-800 dark:text-zinc-200 leading-[1.7] mb-6" {...props} />,
                      ul: ({ node, ...props }) => <ul className="space-y-2 mb-6 ml-6 list-disc marker:text-zinc-400" {...props} />,
                      ol: ({ node, ...props }) => <ol className="space-y-2 mb-6 ml-6 list-decimal marker:text-zinc-400" {...props} />,
                      li: ({ node, ...props }) => <li className="text-lg text-zinc-800 dark:text-zinc-200 leading-[1.7] pl-2" {...props} />,
                      strong: ({ node, ...props }) => <strong className="font-bold text-zinc-900 dark:text-zinc-100" {...props} />,
                      a: ({ node, href, children, ...props }) => (
                        <a href={href} className="text-teal-600 hover:text-teal-700 underline" target="_blank" rel="noopener noreferrer" {...props}>
                          {children}
                        </a>
                      ),
                      blockquote: ({ node, ...props }) => (
                        <div className="my-10 pl-6 border-l-4 border-zinc-300 dark:border-zinc-600">
                          <blockquote className="text-xl text-zinc-500 dark:text-zinc-400 leading-[1.7] italic" {...props} />
                        </div>
                      ),
                      code: (props) => {
                        const { node, className, children, ...rest } = props as React.ComponentPropsWithoutRef<"code"> & { node?: unknown };
                        const isInline = !className;
                        return isInline ? (
                          <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-zinc-800 dark:text-zinc-200" {...rest}>{children}</code>
                        ) : (
                          <code className="block bg-zinc-100 dark:bg-zinc-800 p-4 rounded-lg text-sm overflow-x-auto font-mono text-zinc-800 dark:text-zinc-200" {...rest}>{children}</code>
                        );
                      },
                      hr: () => <hr className="my-10 border-zinc-200 dark:border-zinc-700" />,
                      img: (props) => {
                        const { src, alt } = props as { node?: unknown; src?: string; alt?: string };
                        return (
                          <span className="block relative w-full my-8">
                            <img src={src || ""} alt={alt || ""} className="rounded-lg w-full h-auto" />
                          </span>
                        );
                      },
                      table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-8">
                          <table className="min-w-full text-sm border-collapse" {...props} />
                        </div>
                      ),
                      thead: ({ node, ...props }) => <thead className="bg-zinc-100 dark:bg-zinc-800" {...props} />,
                      th: ({ node, ...props }) => <th className="px-4 py-3 text-left font-semibold text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-700" {...props} />,
                      td: ({ node, ...props }) => <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-700" {...props} />,
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Edit mode */
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
                  placeholder="e.g. Getting Started, Features, Integrations"
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
              <Field label="Order">
                <input
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
                  className="input-field w-24"
                />
              </Field>
              <Field label="Cover Image URL" span={2}>
                <input
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="https://... or /images/guides/..."
                  className="input-field font-mono text-xs"
                />
              </Field>
              <Field label="Tags" span={2}>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="comma-separated, e.g. chat, onboarding, ai"
                  className="input-field"
                />
              </Field>
            </div>

            {/* Description */}
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Short description shown on guide cards and in SEO..."
                className="input-field resize-y"
              />
            </Field>

            {/* Content */}
            <Field label="Content (Markdown)">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={28}
                placeholder="Write your guide in Markdown..."
                className="input-field resize-y font-mono text-xs leading-relaxed"
              />
            </Field>
          </div>
        )}
      </div>

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
