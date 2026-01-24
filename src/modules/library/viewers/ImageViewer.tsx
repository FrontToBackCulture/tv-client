// src/modules/library/viewers/ImageViewer.tsx
// Image viewer with zoom, fit, and info display

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ZoomIn, ZoomOut, Maximize2, RotateCw, Image, Loader2 } from "lucide-react";
import { cn } from "../../../lib/cn";

interface ImageViewerProps {
  path: string;
  filename: string;
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

export function ImageViewer({ path, filename }: ImageViewerProps) {
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
  }, [path, filename]);

  // Get image dimensions when loaded
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 400));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 25));
  const handleFitToggle = () => {
    setFitMode((m) => (m === "contain" ? "actual" : "contain"));
    if (fitMode === "actual") setZoom(100);
  };
  const handleResetZoom = () => setZoom(100);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-zinc-600 animate-spin" />
          <p className="text-sm text-zinc-500">Loading image...</p>
        </div>
      </div>
    );
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
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">{filename}</span>
          {dimensions && (
            <span className="text-xs text-zinc-600">
              {dimensions.width} × {dimensions.height}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={16} className="text-zinc-400" />
          </button>
          <span className="text-xs text-zinc-500 w-12 text-center">{zoom}%</span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} className="text-zinc-400" />
          </button>
          <div className="w-px h-4 bg-zinc-700 mx-1" />
          <button
            onClick={handleFitToggle}
            className={cn(
              "p-1.5 rounded hover:bg-zinc-800 transition-colors",
              fitMode === "contain" && "bg-zinc-800"
            )}
            title={fitMode === "contain" ? "Show actual size" : "Fit to window"}
          >
            <Maximize2 size={16} className="text-zinc-400" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
            title="Reset zoom"
          >
            <RotateCw size={16} className="text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div className="flex-1 overflow-auto bg-zinc-950 flex items-center justify-center p-4">
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
                width: fitMode === "actual" ? `${zoom}%` : "auto",
                height: "auto",
                imageRendering: zoom > 100 ? "pixelated" : "auto",
              }}
            />
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="px-4 py-1.5 border-t border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{getMimeType(filename)}</span>
          <span>{path}</span>
        </div>
      </div>
    </div>
  );
}
