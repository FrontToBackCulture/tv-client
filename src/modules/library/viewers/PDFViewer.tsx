// src/modules/library/viewers/PDFViewer.tsx

import { useMemo } from "react";
import { FileText } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface PDFViewerProps {
  path: string;
  filename: string;
}

export function PDFViewer({ path, filename }: PDFViewerProps) {
  // Convert file path to asset URL for Tauri
  const pdfUrl = useMemo(() => {
    return convertFileSrc(path);
  }, [path]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
        <FileText size={16} className="text-red-500 dark:text-red-400" />
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{filename}</span>
      </div>

      {/* PDF embed */}
      <div className="flex-1 overflow-hidden bg-slate-200 dark:bg-zinc-800">
        <iframe
          src={pdfUrl}
          className="w-full h-full border-0"
          title={`PDF: ${filename}`}
        />
      </div>
    </div>
  );
}
