// src/modules/library/viewers/HTMLViewer.tsx

import { useState, useMemo } from "react";
import { Code, Eye, FileCode } from "lucide-react";
import { cn } from "../../../lib/cn";

interface HTMLViewerProps {
  content: string;
  filename: string;
}

export function HTMLViewer({ content, filename }: HTMLViewerProps) {
  const [mode, setMode] = useState<"preview" | "code">("preview");

  // Create a blob URL for the iframe preview
  const previewUrl = useMemo(() => {
    const blob = new Blob([content], { type: "text/html" });
    return URL.createObjectURL(blob);
  }, [content]);

  return (
    <div className="h-full flex flex-col">
      {/* Header with toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <FileCode size={16} className="text-orange-400" />
          <span className="text-sm text-zinc-400">{filename}</span>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => setMode("preview")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
              mode === "preview"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-300"
            )}
          >
            <Eye size={12} />
            Preview
          </button>
          <button
            onClick={() => setMode("code")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
              mode === "code"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-300"
            )}
          >
            <Code size={12} />
            Code
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === "preview" ? (
          <iframe
            src={previewUrl}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-same-origin"
            title={`Preview of ${filename}`}
          />
        ) : (
          <div className="h-full overflow-auto p-4">
            <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap">
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
