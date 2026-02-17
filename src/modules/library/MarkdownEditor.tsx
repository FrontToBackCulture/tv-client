// src/modules/library/MarkdownEditor.tsx

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { marked } from "marked";
import TurndownService from "turndown";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link as LinkIcon,
  Undo,
  Redo,
  Table as TableIcon,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Calendar, User, Tag, FileText } from "lucide-react";

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
function parseFrontmatter(content: string): { frontmatterRaw: string | null; frontmatter: Frontmatter | null; body: string } {
  const match = content.match(/^(---\s*\n)([\s\S]*?)(\n---\s*\n)([\s\S]*)$/);
  if (!match) return { frontmatterRaw: null, frontmatter: null, body: content };

  const frontmatterRaw = match[1] + match[2] + match[3];
  const yamlStr = match[2];
  const body = match[4];

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

  return { frontmatterRaw, frontmatter, body };
}

/** Metadata badge component for editor */
function MetadataBadge({ frontmatter }: { frontmatter: Frontmatter }) {
  const [expanded, setExpanded] = useState(false);

  // Support Claude Code skill frontmatter: name/description as aliases for title/summary
  const displayTitle = frontmatter.title || (frontmatter.name as string | undefined);
  const displaySummary = frontmatter.summary || (frontmatter.description as string | undefined);

  const hasMetadata = displayTitle || displaySummary || frontmatter.author ||
    frontmatter.updated || (frontmatter.tags && frontmatter.tags.length > 0);

  if (!hasMetadata) return null;

  return (
    <div className="mx-4 mt-3 mb-1 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 overflow-hidden">
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
          {displayTitle && (
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
              {displayTitle}
            </h1>
          )}
          {displaySummary && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
              {displaySummary}
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

interface MarkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  filename?: string;
}

// Configure turndown for markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Add table support to turndown
turndownService.addRule("table", {
  filter: "table",
  replacement: function (_content, node) {
    // Simple table conversion
    const rows = node.querySelectorAll("tr");
    let markdown = "\n";
    rows.forEach((row, i) => {
      const cells = row.querySelectorAll("td, th");
      const cellContents: string[] = [];
      cells.forEach((cell) => {
        cellContents.push(cell.textContent?.trim() || "");
      });
      markdown += "| " + cellContents.join(" | ") + " |\n";
      if (i === 0) {
        markdown += "| " + cellContents.map(() => "---").join(" | ") + " |\n";
      }
    });
    return markdown + "\n";
  },
});

export function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
  // Parse frontmatter and store it separately (preserved during edits)
  const { frontmatterRaw, frontmatter, body } = useMemo(() => parseFrontmatter(content), []);
  const frontmatterRef = useRef(frontmatterRaw);

  // Convert markdown body (without frontmatter) to HTML for TipTap
  const initialHtml = useMemo(() => {
    try {
      return marked.parse(body) as string;
    } catch {
      return body;
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Highlight,
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      Typography,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: "prose dark:prose-invert prose-zinc max-w-none focus:outline-none min-h-[300px] px-6 py-4",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const markdown = turndownService.turndown(html);
      // Re-add frontmatter if it existed
      const fullMarkdown = frontmatterRef.current ? frontmatterRef.current + markdown : markdown;
      onChange(fullMarkdown);
    },
  });

  // Toolbar button component
  const ToolbarButton = ({
    onClick,
    isActive = false,
    disabled = false,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        isActive
          ? "bg-teal-600 text-white"
          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const addTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 markdown-editor-container">
      {/* Custom styles for light mode tables and code */}
      <style>{`
        .markdown-editor-container .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
        }
        .markdown-editor-container .ProseMirror th,
        .markdown-editor-container .ProseMirror td {
          border: 1px solid #d1d5db;
          padding: 0.5rem 1rem;
          text-align: left;
        }
        .markdown-editor-container .ProseMirror th {
          background-color: #f3f4f6;
          font-weight: 600;
          color: #374151;
        }
        .dark .markdown-editor-container .ProseMirror th {
          background-color: #27272a;
          color: #e4e4e7;
          border-color: #3f3f46;
        }
        .dark .markdown-editor-container .ProseMirror td {
          border-color: #3f3f46;
        }
        .markdown-editor-container .ProseMirror code {
          background-color: #f1f5f9;
          color: #0d9488;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
        }
        .dark .markdown-editor-container .ProseMirror code {
          background-color: #27272a;
          color: #5eead4;
        }
        .markdown-editor-container .ProseMirror pre {
          background-color: #f1f5f9;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
        }
        .dark .markdown-editor-container .ProseMirror pre {
          background-color: #27272a;
        }
        .markdown-editor-container .ProseMirror pre code {
          background-color: transparent;
          padding: 0;
          color: #374151;
        }
        .dark .markdown-editor-container .ProseMirror pre code {
          color: #d4d4d8;
        }
      `}</style>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 flex-wrap">
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            title="Bold (Cmd+B)"
          >
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            title="Italic (Cmd+I)"
          >
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive("strike")}
            title="Strikethrough"
          >
            <Strikethrough size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
            title="Inline Code"
          >
            <Code size={16} />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-slate-300 dark:bg-zinc-700 mx-1" />

        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive("heading", { level: 1 })}
            title="Heading 1"
          >
            <Heading1 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <Heading2 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive("heading", { level: 3 })}
            title="Heading 3"
          >
            <Heading3 size={16} />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-slate-300 dark:bg-zinc-700 mx-1" />

        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            title="Bullet List"
          >
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            title="Numbered List"
          >
            <ListOrdered size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            title="Quote"
          >
            <Quote size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
          >
            <Minus size={16} />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-slate-300 dark:bg-zinc-700 mx-1" />

        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={addLink}
            isActive={editor.isActive("link")}
            title="Add Link"
          >
            <LinkIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={addTable}
            title="Insert Table"
          >
            <TableIcon size={16} />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-slate-300 dark:bg-zinc-700 mx-1" />

        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo (Cmd+Z)"
          >
            <Undo size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo size={16} />
          </ToolbarButton>
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-y-auto">
        {/* Frontmatter metadata badge */}
        {frontmatter && <MetadataBadge frontmatter={frontmatter} />}
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
