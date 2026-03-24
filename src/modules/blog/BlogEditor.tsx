// src/modules/blog/BlogEditor.tsx

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  Star,
  ExternalLink,
  Pencil,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import type { BlogArticle } from "./types";

/** Cache for SVG data URLs */
const svgCache = new Map<string, string>();

/** Component that renders website images — uses inline data URL for SVGs, asset protocol for others */
function WebsiteImage({ src, alt, className, websitePublicPath }: { src: string; alt: string; className?: string; websitePublicPath: string }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!src || !src.startsWith("/") || !websitePublicPath) { setUrl(src); return; }

    const fullPath = `${websitePublicPath}${src}`;
    const isSvg = src.toLowerCase().endsWith(".svg");

    if (isSvg) {
      // SVGs: read as text and create data URL (avoids asset protocol scope issues)
      if (svgCache.has(fullPath)) { setUrl(svgCache.get(fullPath)!); return; }
      readTextFile(fullPath).then((text) => {
        const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
        svgCache.set(fullPath, dataUrl);
        setUrl(dataUrl);
      }).catch(() => setUrl(src));
    } else {
      // Binary images: use Tauri asset protocol (with cache-bust)
      setUrl(convertFileSrc(fullPath) + "?t=" + Date.now());
    }
  }, [src, websitePublicPath]);

  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}

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
  const [previewing, setPreviewing] = useState(false);
  const [websitePublicPath, setWebsitePublicPath] = useState("");

  useEffect(() => {
    homeDir().then((home) => {
      const base = home.endsWith("/") ? home : `${home}/`;
      setWebsitePublicPath(`${base}Code/SkyNet/tv-website/public`);
    });
  }, []);

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
        {previewing ? (
          /* Preview mode — mirrors tv-website article layout */
          <div className="bg-white dark:bg-zinc-950">
            <div className="py-16 md:py-20">
              {/* Header */}
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
                <div className="flex items-center justify-center gap-2 mb-12">
                  <span className="text-base text-zinc-500 dark:text-zinc-400">{author}</span>
                  {readTime && (
                    <>
                      <span className="text-base text-zinc-400 dark:text-zinc-500">·</span>
                      <span className="text-base text-zinc-500 dark:text-zinc-400">{readTime}</span>
                    </>
                  )}
                </div>

                {/* Illustration */}
                {illustration && (
                  <div
                    className="relative w-full aspect-[2/1] rounded-3xl overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: color }}
                  >
                    <WebsiteImage
                      src={illustration}
                      alt={title}
                      className="object-contain w-full h-full"
                      websitePublicPath={websitePublicPath}
                    />
                  </div>
                )}
              </div>

              {/* Article content */}
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
                            <WebsiteImage src={src || ""} alt={alt || ""} className="rounded-lg w-full h-auto" websitePublicPath={websitePublicPath} />
                          </span>
                        );
                      },
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
        )}
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
