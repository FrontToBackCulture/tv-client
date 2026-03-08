// src/modules/library/viewers/ImageViewer.tsx
// Image viewer with info display

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ZoomIn, ZoomOut, Maximize2, Minimize2, Image } from "lucide-react";
import { DetailLoading } from "../../../components/ui/DetailStates";


interface ImageViewerProps {
  path: string;
  filename: string;
  refreshKey?: number;
}

// Get MIME type from extension
function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    bmp: "image/bmp",
  };
  return mimeTypes[ext] || "image/png";
}

export function ImageViewer({ path, filename, refreshKey }: ImageViewerProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState<"contain" | "actual">("contain");
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  // Load image as base64
  useEffect(() => {
    async function loadImage() {
      setIsLoading(true);
      setError(null);
      try {
        const base64 = await invoke<string>("read_file_binary", { path });
        const mimeType = getMimeType(filename);
        setImageData(`data:${mimeType};base64,${base64}`);
      } catch (err) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    }
    loadImage();
  }, [path, filename, refreshKey]);

  // Get image dimensions when loaded
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const handleZoomIn = () => { setFitMode("actual"); setZoom((z) => Math.min(z + 25, 400)); };
  const handleZoomOut = () => { setFitMode("actual"); setZoom((z) => Math.max(z - 25, 25)); };
  const handleFitToggle = () => {
    if (fitMode === "contain") {
      setFitMode("actual");
      setZoom(100);
    } else {
      setFitMode("contain");
      setZoom(100);
    }
  };

  if (isLoading) {
    return <DetailLoading />;
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Image size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-400">Failed to load image</p>
          <p className="text-xs text-zinc-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-1 px-4 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={16} className="text-zinc-500 dark:text-zinc-400" />
        </button>
        <span className="text-xs text-zinc-500 w-12 text-center">{zoom}%</span>
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={16} className="text-zinc-500 dark:text-zinc-400" />
        </button>
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1" />
        <button
          onClick={handleFitToggle}
          className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          title={fitMode === "contain" ? "Actual size" : "Fit to window"}
        >
          {fitMode === "contain" ? (
            <Maximize2 size={16} className="text-zinc-500 dark:text-zinc-400" />
          ) : (
            <Minimize2 size={16} className="text-zinc-500 dark:text-zinc-400" />
          )}
        </button>
      </div>

      {/* Image container */}
      <div className="flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center p-4">
        {/* Checkerboard background for transparency */}
        <div
          className="relative"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #27272a 25%, transparent 25%),
              linear-gradient(-45deg, #27272a 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #27272a 75%),
              linear-gradient(-45deg, transparent 75%, #27272a 75%)
            `,
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
          }}
        >
          {imageData && (
            <img
              src={imageData}
              alt={filename}
              onLoad={handleImageLoad}
              className="block"
              style={{
                maxWidth: fitMode === "contain" ? "100%" : "none",
                maxHeight: fitMode === "contain" ? "calc(100vh - 200px)" : "none",
                transform: fitMode === "actual" ? `scale(${zoom / 100})` : undefined,
                transformOrigin: "center center",
                height: "auto",
              }}
            />
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="px-4 py-1.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {getMimeType(filename)}
            {dimensions && ` · ${dimensions.width} × ${dimensions.height}`}
          </span>
          <span>{path}</span>
        </div>
      </div>
    </div>
  );
}
