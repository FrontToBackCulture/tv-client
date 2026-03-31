// src/modules/work/TaskTipTapEditor.tsx
// TipTap-based task description editor with toggle/details block support.
// Renders description_json (TipTap JSON) with full editing, or falls back to
// markdown description via NotionContent for tasks not yet converted.

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, JSONContent } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, Code, Heading2, List, ListOrdered,
  Quote, Minus, ChevronDown as ToggleIcon,
} from "lucide-react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Details, DetailsSummary, DetailsContent } from "@tiptap/extension-details";
import { supabase } from "../../lib/supabase";

// Shared extensions config — reusable for both read-only and editable modes
const getExtensions = (editable: boolean) => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Highlight,
  Link.configure({ openOnClick: !editable }),
  ...(editable
    ? [Placeholder.configure({ placeholder: "Add a description..." })]
    : []),
  Typography,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Details.configure({ persist: true }),
  DetailsSummary,
  DetailsContent,
];

// ─── Styles for details/toggle blocks ────────────────────────────────────

const detailsStyles = `
  [data-type="details"] {
    padding-left: 20px;
    margin: 8px 0;
  }
  [data-type="details"] > button[type="button"] {
    display: none !important;
  }
  [data-type="details"] summary {
    font-weight: 600;
    padding: 2px 0;
  }
  [data-type="detailsContent"] {
    padding: 4px 0;
    display: block !important;
  }
`;

// ─── Read-only renderer ──────────────────────────────────────────────────

export function TaskContentViewer({ content }: { content: JSONContent }) {
  const editor = useEditor({
    extensions: getExtensions(false),
    content,
    editable: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-table:my-2 prose-hr:my-3",
      },
    },
  });

  // Update content when it changes externally
  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  // Open all toggles on mount + attach manual click handlers
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;

    const handleToggleClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest('[data-type="details"] > button[type="button"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const details = btn.parentElement;
      if (!details) return;
      details.classList.toggle("is-open");
      const content = details.querySelector<HTMLElement>('[data-type="detailsContent"]');
      if (content) {
        if (content.hasAttribute("hidden")) content.removeAttribute("hidden");
        else content.setAttribute("hidden", "hidden");
      }
    };

    const timer = setTimeout(() => {
      el.querySelectorAll<HTMLElement>('[data-type="details"]').forEach(d => {
        d.classList.add("is-open");
        const content = d.querySelector<HTMLElement>('[data-type="detailsContent"]');
        if (content) content.removeAttribute("hidden");
      });
    }, 100);

    el.addEventListener("click", handleToggleClick, true);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("click", handleToggleClick, true);
    };
  }, [editor, content]);

  return (
    <>
      <style>{detailsStyles}</style>
      <EditorContent editor={editor} />
    </>
  );
}

// ─── Editable editor ─────────────────────────────────────────────────────

export function TaskContentEditor({
  taskId,
  content,
  onUpdated,
}: {
  taskId: string;
  content: JSONContent | null;
  onUpdated?: () => void;
}) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(
    async (json: JSONContent) => {
      await supabase
        .from("tasks")
        .update({ description_json: json, updated_at: new Date().toISOString() })
        .eq("id", taskId);
      onUpdated?.();
    },
    [taskId, onUpdated]
  );

  const editor = useEditor({
    extensions: getExtensions(true),
    content: content || { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-table:my-2 prose-hr:my-3 focus:outline-none min-h-[100px] px-0 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      // Debounced auto-save
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        handleSave(editor.getJSON());
      }, 1500);
    },
  });

  // Update content when taskId changes
  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content);
    }
  }, [editor, taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);


  const [showToolbar, setShowToolbar] = useState(false);

  return (
    <div
      onFocus={() => setShowToolbar(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setShowToolbar(false); }}
    >
      <style>{detailsStyles}</style>
      {showToolbar && editor && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: any }) {
  const btn = (active: boolean) =>
    `w-7 h-7 flex items-center justify-center rounded transition-colors ${
      active
        ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
        : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="flex items-center gap-0.5 pb-1.5 mb-1.5 border-b border-zinc-100 dark:border-zinc-800">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} title="Bold"><Bold size={13} /></button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} title="Italic"><Italic size={13} /></button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive("strike"))} title="Strikethrough"><Strikethrough size={13} /></button>
      <button onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive("code"))} title="Inline Code"><Code size={13} /></button>
      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} title="Heading"><Heading2 size={13} /></button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} title="Bullet List"><List size={13} /></button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} title="Numbered List"><ListOrdered size={13} /></button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive("blockquote"))} title="Quote"><Quote size={13} /></button>
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Divider"><Minus size={13} /></button>
      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
      <button
        onClick={() => editor.chain().focus().setDetails().run()}
        className={btn(editor.isActive("details"))}
        title="Toggle Block"
      >
        <ToggleIcon size={13} />
      </button>
    </div>
  );
}

// ─── Helper: convert markdown to TipTap JSON (one-time migration) ────────

export function markdownToTipTapJson(_markdown: string): JSONContent {
  // TODO: implement proper markdown-to-TipTap conversion using marked + generateJSON
  // For now returns a placeholder — the real conversion will happen in Rust (blocks_to_tiptap_json)
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Content migrated from markdown. Edit to reformat." }],
      },
    ],
  };
}
