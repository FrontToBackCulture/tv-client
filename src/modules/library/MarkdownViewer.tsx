// src/modules/library/MarkdownViewer.tsx
// Simple markdown renderer using react-markdown

import { ReactNode, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, Calendar, User, Tag, FileText } from "lucide-react";

interface MarkdownViewerProps {
  content: string;
  filename?: string;
}

interface ChildrenProps {
  children?: ReactNode;
}

interface AnchorProps extends ChildrenProps {
  href?: string;
}

interface CodeProps extends ChildrenProps {
  className?: string;
}

interface Frontmatter {
  title?: string;
  summary?: string;
  created?: string;
  updated?: string;
  author?: string;
  tags?: string[];
  status?: string;
  category?: string;
  ai_generated?: boolean;
  [key: string]: unknown;
}

/** Parse YAML frontmatter from markdown content */
function parseFrontmatter(content: string): { frontmatter: Frontmatter | null; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: content };

  const yamlStr = match[1];
  const body = match[2];

  // Simple YAML parser for flat key-value pairs
  const frontmatter: Frontmatter = {};
  const lines = yamlStr.split("\n");

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse arrays like [tag1, tag2]
    if (value.startsWith("[") && value.endsWith("]")) {
      const arrayContent = value.slice(1, -1);
      frontmatter[key] = arrayContent.split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else if (value === "true") {
      frontmatter[key] = true;
    } else if (value === "false") {
      frontmatter[key] = false;
    } else if (value === "" || value === '""' || value === "''") {
      frontmatter[key] = undefined;
    } else {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/** Metadata badge component */
function MetadataBadge({ frontmatter }: { frontmatter: Frontmatter }) {
  const [expanded, setExpanded] = useState(false);

  const hasMetadata = frontmatter.title || frontmatter.summary || frontmatter.author ||
    frontmatter.updated || (frontmatter.tags && frontmatter.tags.length > 0);

  if (!hasMetadata) return null;

  return (
    <div className="not-prose mb-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 overflow-hidden">
      {/* Collapsed view - just title/summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 p-3 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="mt-0.5 text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="mt-0.5 text-zinc-400 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {frontmatter.title && (
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
              {frontmatter.title}
            </h1>
          )}
          {frontmatter.summary && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
              {frontmatter.summary}
            </p>
          )}
        </div>
        {frontmatter.status && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
            frontmatter.status === "published"
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              : frontmatter.status === "draft"
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
              : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          }`}>
            {frontmatter.status}
          </span>
        )}
      </button>

      {/* Expanded metadata */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-200 dark:border-zinc-800">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {frontmatter.author && (
              <span className="flex items-center gap-1">
                <User size={11} />
                {frontmatter.author}
              </span>
            )}
            {frontmatter.updated && (
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                Updated {frontmatter.updated}
              </span>
            )}
            {frontmatter.category && (
              <span className="flex items-center gap-1">
                <FileText size={11} />
                {frontmatter.category}
              </span>
            )}
            {frontmatter.ai_generated && (
              <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                AI Generated
              </span>
            )}
          </div>
          {frontmatter.tags && frontmatter.tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Tag size={11} className="text-zinc-400" />
              {frontmatter.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MarkdownViewer({ content, filename }: MarkdownViewerProps) {
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content]);

  return (
    <div className="prose dark:prose-invert prose-zinc max-w-none">
      {/* Show filename only if no frontmatter title */}
      {filename && !frontmatter?.title && (
        <div className="not-prose mb-6 pb-4 border-b border-slate-200 dark:border-zinc-800">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{filename}</h1>
        </div>
      )}

      {/* Frontmatter metadata badge */}
      {frontmatter && <MetadataBadge frontmatter={frontmatter} />}

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }: ChildrenProps) => (
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-8 mb-4">{children}</h1>
          ),
          h2: ({ children }: ChildrenProps) => (
            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-200 mt-6 mb-3">{children}</h2>
          ),
          h3: ({ children }: ChildrenProps) => (
            <h3 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mt-5 mb-2">{children}</h3>
          ),
          h4: ({ children }: ChildrenProps) => (
            <h4 className="text-base font-bold text-zinc-700 dark:text-zinc-300 mt-4 mb-2">{children}</h4>
          ),

          // Paragraphs
          p: ({ children }: ChildrenProps) => (
            <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">{children}</p>
          ),

          // Links
          a: ({ href, children }: AnchorProps) => (
            <a
              href={href}
              className="text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),

          // Lists
          ul: ({ children }: ChildrenProps) => (
            <ul className="list-disc list-inside space-y-1 mb-4 text-zinc-600 dark:text-zinc-300">{children}</ul>
          ),
          ol: ({ children }: ChildrenProps) => (
            <ol className="list-decimal list-inside space-y-1 mb-4 text-zinc-600 dark:text-zinc-300">{children}</ol>
          ),
          li: ({ children }: ChildrenProps) => <li className="text-zinc-600 dark:text-zinc-300">{children}</li>,

          // Code
          code: ({ className, children }: CodeProps) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-slate-100 dark:bg-zinc-800 text-teal-600 dark:text-teal-300 px-1.5 py-0.5 rounded text-sm font-mono">
                  {children}
                </code>
              );
            }
            return (
              <code className="block bg-slate-100 dark:bg-zinc-800 p-4 rounded-lg text-sm font-mono text-zinc-600 dark:text-zinc-300 overflow-x-auto my-4">
                {children}
              </code>
            );
          },
          pre: ({ children }: ChildrenProps) => (
            <pre className="bg-slate-100 dark:bg-zinc-800 p-4 rounded-lg overflow-x-auto my-4">{children}</pre>
          ),

          // Blockquote
          blockquote: ({ children }: ChildrenProps) => (
            <blockquote className="border-l-4 border-slate-300 dark:border-zinc-700 pl-4 italic text-zinc-500 dark:text-zinc-400 my-4">
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }: ChildrenProps) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-slate-300 dark:border-zinc-700">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }: ChildrenProps) => (
            <thead className="bg-slate-100 dark:bg-zinc-800">{children}</thead>
          ),
          th: ({ children }: ChildrenProps) => (
            <th className="px-4 py-2 border border-slate-300 dark:border-zinc-700 text-left font-semibold text-zinc-800 dark:text-zinc-200">
              {children}
            </th>
          ),
          td: ({ children }: ChildrenProps) => (
            <td className="px-4 py-2 border border-slate-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
              {children}
            </td>
          ),

          // Horizontal rule
          hr: () => <hr className="border-slate-300 dark:border-zinc-700 my-6" />,

          // Strong and emphasis
          strong: ({ children }: ChildrenProps) => (
            <strong className="font-bold text-zinc-900 dark:text-zinc-100">{children}</strong>
          ),
          em: ({ children }: ChildrenProps) => (
            <em className="italic text-zinc-600 dark:text-zinc-300">{children}</em>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
