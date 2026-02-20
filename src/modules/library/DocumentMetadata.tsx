// src/modules/library/DocumentMetadata.tsx

import { useState, useMemo } from "react";
import matter from "gray-matter";
import {
  ChevronDown,
  ChevronRight,
  Calendar,
  User,
  Tag,
  FileText,
  Clock,
  Bot,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDateFull as formatDate } from "../../lib/date";

interface DocumentMetadataProps {
  content: string;
  defaultExpanded?: boolean;
}

interface Frontmatter {
  title?: string;
  summary?: string;
  name?: string;
  description?: string;
  created?: string;
  updated?: string;
  author?: string;
  tags?: string[];
  status?: string;
  category?: string;
  ai_generated?: boolean;
  last_reviewed?: string;
  reviewed_by?: string;
}

export function DocumentMetadata({ content, defaultExpanded = false }: DocumentMetadataProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Parse frontmatter
  const { data, hasMetadata } = useMemo(() => {
    try {
      const parsed = matter(content);
      const data = parsed.data as Frontmatter;

      // Check if there's any meaningful metadata
      // Support Claude Code skill frontmatter: name/description as aliases for title/summary
      const hasMetadata = Boolean(
        data.title || data.name ||
        data.summary || data.description ||
        data.created ||
        data.updated ||
        data.author ||
        (data.tags && data.tags.length > 0) ||
        data.status ||
        data.category
      );

      return { data, hasMetadata };
    } catch {
      return { data: {} as Frontmatter, hasMetadata: false };
    }
  }, [content]);

  if (!hasMetadata) {
    return null;
  }

  // Get status color
  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "published":
        return "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-300 dark:border-green-700";
      case "draft":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700";
      case "review":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700";
      case "archived":
        return "bg-zinc-100 dark:bg-zinc-900/30 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700";
      default:
        return "bg-zinc-100 dark:bg-zinc-900/30 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700";
    }
  };

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-lg mb-4 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2 bg-slate-50/50 dark:bg-zinc-900/50 hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          )}
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Metadata</span>
          {data.status && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded border",
                getStatusColor(data.status)
              )}
            >
              {data.status}
            </span>
          )}
          {data.ai_generated && (
            <span className="flex items-center gap-1 text-xs text-purple-400">
              <Bot className="w-3 h-3" />
              AI
            </span>
          )}
        </div>
        {!isExpanded && data.updated && (
          <span className="text-xs text-zinc-500">
            Updated {formatDate(data.updated)}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 border-t border-slate-200 dark:border-zinc-800">
          {/* Title (supports name as alias) */}
          {(data.title || data.name) && (
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-zinc-500 mb-0.5">{data.name && !data.title ? "Name" : "Title"}</div>
                <div className="text-sm text-zinc-800 dark:text-zinc-200">{data.title || data.name}</div>
              </div>
            </div>
          )}

          {/* Summary (supports description as alias) */}
          {(data.summary || data.description) && (
            <div>
              <div className="text-xs text-zinc-500 mb-1">{data.description && !data.summary ? "Description" : "Summary"}</div>
              <div className="text-sm text-zinc-700 dark:text-zinc-300">{data.summary || data.description}</div>
            </div>
          )}

          {/* Dates row */}
          <div className="flex flex-wrap gap-4">
            {data.created && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <div>
                  <div className="text-xs text-zinc-500">Created</div>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300">{formatDate(data.created)}</div>
                </div>
              </div>
            )}
            {data.updated && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500" />
                <div>
                  <div className="text-xs text-zinc-500">Updated</div>
                  <div className="text-sm text-zinc-700 dark:text-zinc-300">{formatDate(data.updated)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Author */}
          {data.author && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-zinc-500" />
              <div>
                <div className="text-xs text-zinc-500">Author</div>
                <div className="text-sm text-zinc-700 dark:text-zinc-300">{data.author}</div>
              </div>
            </div>
          )}

          {/* Category */}
          {data.category && (
            <div>
              <div className="text-xs text-zinc-500 mb-1">Category</div>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {data.category}
              </span>
            </div>
          )}

          {/* Tags */}
          {data.tags && data.tags.length > 0 && (
            <div className="flex items-start gap-2">
              <Tag className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-zinc-500 mb-1">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {data.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border border-teal-300 dark:border-teal-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Review info */}
          {(data.last_reviewed || data.reviewed_by) && (
            <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 mb-1">Review</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {data.reviewed_by && <span>By {data.reviewed_by}</span>}
                {data.reviewed_by && data.last_reviewed && <span> on </span>}
                {data.last_reviewed && <span>{formatDate(data.last_reviewed)}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper to extract content without frontmatter
export function getContentWithoutFrontmatter(content: string): string {
  try {
    const parsed = matter(content);
    return parsed.content;
  } catch {
    return content;
  }
}
