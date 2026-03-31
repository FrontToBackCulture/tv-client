// src/modules/work/TaskTipTapEditor.tsx
// TipTap-based task description editor with toggle/details block support.
// Renders description_json (TipTap JSON) with full editing, or falls back to
// markdown description via NotionContent for tasks not yet converted.

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, JSONContent } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, Code, Heading2, List, ListOrdered,
  Quote, Minus, ChevronDown as ToggleIcon, ImagePlus, Loader2,
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
import { ResizableImage, uploadImage } from "../../components/TipTapResizableImage";

// Shared extensions config — reusable for both read-only and editable modes
const getExtensions = (editable: boolean) => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Highlight,
  Link.configure({ openOnClick: !editable }),
  ResizableImage.configure({ inline: false, allowBase64: false }),
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
  .ProseMirror [data-node-view-wrapper] {
    margin: 8px 0;
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
  const [uploading, setUploading] = useState(false);

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

  const editorRef = useRef<any>(null);

  // Upload image files and insert into editor at cursor position
  const handleImageUpload = useCallback(
    async (files: File[], insertPos?: number) => {
      const ed = editorRef.current;
      if (!ed) return;
      setUploading(true);
      try {
        // Use provided position, or current cursor, or end of doc
        let pos = insertPos ?? ed.state.selection.anchor;
        for (const file of files) {
          const url = await uploadImage(file);
          ed.chain()
            .insertContentAt(pos, { type: "image", attrs: { src: url } })
            .run();
          // Move position past the inserted image node
          pos = ed.state.selection.anchor;
        }
        // Trigger save after inserting images
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
          handleSave(ed.getJSON());
        }, 500);
      } catch (err) {
        console.error("Image upload failed:", err);
      } finally {
        setUploading(false);
      }
    },
    [handleSave]
  );

  // Ref for handleImageUpload so editorProps callbacks can access latest version
  const handleImageUploadRef = useRef(handleImageUpload);
  handleImageUploadRef.current = handleImageUpload;

  const editor = useEditor({
    extensions: getExtensions(true),
    content: content || { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-table:my-2 prose-hr:my-3 focus:outline-none min-h-[100px] px-0 py-2",
      },
      handlePaste: (view, event) => {
        const imageFiles: File[] = [];

        // Try clipboardData.items first (Chrome/standard)
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) imageFiles.push(file);
            }
          }
        }

        // Fallback: check clipboardData.files (Tauri/WebKit)
        if (imageFiles.length === 0) {
          const files = event.clipboardData?.files;
          if (files) {
            for (const file of Array.from(files)) {
              if (file.type.startsWith("image/")) imageFiles.push(file);
            }
          }
        }

        if (imageFiles.length > 0) {
          event.preventDefault();
          const pos = view.state.selection.anchor;
          handleImageUploadRef.current(imageFiles, pos);
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
        if (imageFiles.length > 0) {
          event.preventDefault();
          // Insert at drop position
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          handleImageUploadRef.current(imageFiles, pos);
          return true;
        }
        return false;
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

  // Keep editor ref in sync
  editorRef.current = editor;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onFocus={() => setShowToolbar(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setShowToolbar(false); }}
    >
      <style>{detailsStyles}</style>
      {showToolbar && editor && (
        <EditorToolbar
          editor={editor}
          uploading={uploading}
          onImageClick={() => fileInputRef.current?.click()}
        />
      )}
      <EditorContent editor={editor} />
      {uploading && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1">
          <Loader2 size={12} className="animate-spin" />
          Uploading image...
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) handleImageUpload(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────

function EditorToolbar({ editor, uploading, onImageClick }: { editor: any; uploading?: boolean; onImageClick?: () => void }) {
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
      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
      <button
        onClick={onImageClick}
        className={btn(false)}
        title="Insert Image"
        disabled={uploading}
      >
        {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
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
