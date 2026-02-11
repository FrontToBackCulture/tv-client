// src/modules/library/viewers/ExcalidrawViewer.tsx

import { useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";

interface ExcalidrawViewerProps {
  content: string;
  filename: string;
}

export function ExcalidrawViewer({ content, filename }: ExcalidrawViewerProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderExcalidraw() {
      try {
        const data = JSON.parse(content);
        const { exportToSvg } = await import("@excalidraw/excalidraw");

        const svg = await exportToSvg({
          elements: data.elements || [],
          appState: {
            exportWithDarkMode: false,
            exportBackground: true,
            viewBackgroundColor: data.appState?.viewBackgroundColor || "#ffffff",
          },
          files: data.files || {},
        });

        if (cancelled) return;
        const svgString = new XMLSerializer().serializeToString(svg);
        setSvgContent(svgString);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to render Excalidraw:", err);
        setError("Failed to render Excalidraw drawing.");
        setLoading(false);
      }
    }

    renderExcalidraw();
    return () => { cancelled = true; };
  }, [content]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          <p className="text-xs text-zinc-400 mt-1">{filename}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Rendering drawing...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div
        ref={containerRef}
        className="bg-white dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700 p-4 overflow-auto"
        style={{ maxHeight: "calc(100vh - 120px)" }}
      >
        {svgContent && (
          <div
            className="flex items-center justify-center min-h-[200px] [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
}
