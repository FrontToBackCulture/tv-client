// Shared TipTap resizable image extension + upload helper
// Used by TaskTipTapEditor and MarkdownEditor

import { useCallback, useRef, useState } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import { supabase } from "../lib/supabase";

// ─── Upload helper ──────────────────────────────────────────────────────

export async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from("chat-attachments")
    .upload(path, file, { contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage
    .from("chat-attachments")
    .getPublicUrl(path);

  return data.publicUrl;
}

// ─── Resizable Image NodeView ───────────────────────────────────────────

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing(true);
      const startX = e.clientX;
      const startWidth = containerRef.current?.offsetWidth || 300;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(80, startWidth + delta);
        if (containerRef.current) {
          containerRef.current.style.width = `${newWidth}px`;
        }
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        setResizing(false);
        const delta = upEvent.clientX - startX;
        const newWidth = Math.max(80, startWidth + delta);
        updateAttributes({ width: newWidth });
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [updateAttributes]
  );

  return (
    <NodeViewWrapper className="relative inline-block" data-drag-handle>
      <div
        ref={containerRef}
        className={`relative group inline-block ${selected ? "ring-2 ring-teal-500/50 rounded-lg" : ""}`}
        style={{ width: node.attrs.width ? `${node.attrs.width}px` : undefined }}
      >
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ""}
          className="block max-w-full h-auto rounded-md"
          style={{ width: "100%" }}
          draggable={false}
        />
        {/* Right-edge resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute top-0 right-0 w-2 h-full cursor-col-resize
            ${resizing ? "bg-teal-500/30" : "bg-transparent group-hover:bg-teal-500/20"}
            rounded-r-md transition-colors`}
        />
      </div>
    </NodeViewWrapper>
  );
}

// ─── Extension ──────────────────────────────────────────────────────────

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
