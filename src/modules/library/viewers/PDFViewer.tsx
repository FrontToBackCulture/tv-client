// src/modules/library/viewers/PDFViewer.tsx

import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface PDFViewerProps {
  path: string;
  filename: string;
  refreshKey?: number;
}

export function PDFViewer({ path, filename, refreshKey }: PDFViewerProps) {
  // Convert file path to asset URL for Tauri, bust cache on refresh
  const pdfUrl = useMemo(() => {
    return convertFileSrc(path) + (refreshKey ? `?r=${refreshKey}` : "");
  }, [path, refreshKey]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden bg-zinc-200 dark:bg-zinc-800">
        <iframe
          src={pdfUrl}
          className="w-full h-full border-0"
          title={`PDF: ${filename}`}
        />
      </div>
    </div>
  );
}
