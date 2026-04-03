// src/modules/library/viewers/HTMLViewer.tsx

import { useState, useMemo } from "react";
import { Code, Eye } from "lucide-react";
import { cn } from "../../../lib/cn";

interface HTMLViewerProps {
  content: string;
  filename: string;
  refreshKey?: number;
}

export function HTMLViewer({ content, filename, refreshKey }: HTMLViewerProps) {
  const [mode, setMode] = useState<"preview" | "code">("preview");

  // Create a blob URL for the iframe preview — refreshKey forces re-creation
  const previewUrl = useMemo(() => {
    const blob = new Blob([content], { type: "text/html" });
    return URL.createObjectURL(blob);
  }, [content, refreshKey]);

  return (
    <div className="h-full flex flex-col">
      {/* Mode toggle */}
      <div className="flex items-center justify-center px-4 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center bg-zinc-200 dark:bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => setMode("preview")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
              mode === "preview"
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300"
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
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300"
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
            className="w-full h-full border-0 bg-white dark:bg-zinc-900"
            sandbox="allow-same-origin allow-scripts"
            title={`Preview of ${filename}`}
          />
        ) : (
          <div className="h-full overflow-auto p-4 bg-zinc-50 dark:bg-zinc-900">
            <pre className="text-sm font-mono text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap">
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
