// src/modules/gallery/ImageEditor.tsx
// Image viewer with annotation canvas + AI editing via Nanobanana (Gemini)

import { useState, useRef, useCallback, useEffect } from "react";
import {
  ChevronRight, Save, Send, Loader2, Undo2, Trash2,
  Square, Circle, ArrowRight, Type, Pen, MousePointer,
} from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Button, IconButton } from "../../components/ui";
import { useGeminiKey } from "../../hooks/useSettings";
import { cn } from "../../lib/cn";
import type { GalleryItem } from "./useGallery";

// ─── Types ──────────────────────────────────────────────────────────────────

type Tool = "select" | "rect" | "circle" | "arrow" | "text" | "freehand";

interface Annotation {
  id: string;
  tool: Tool;
  color: string;
  strokeWidth: number;
  // rect/circle
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  // arrow
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  // freehand
  points?: { x: number; y: number }[];
  // text
  text?: string;
}

interface AIResult {
  imageData: string; // base64
  mimeType: string;
}

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#000000"];
const TOOLS: { id: Tool; icon: typeof Square; label: string }[] = [
  { id: "select", icon: MousePointer, label: "Select" },
  { id: "rect", icon: Square, label: "Rectangle" },
  { id: "circle", icon: Circle, label: "Circle" },
  { id: "arrow", icon: ArrowRight, label: "Arrow" },
  { id: "freehand", icon: Pen, label: "Draw" },
  { id: "text", icon: Type, label: "Text" },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export function ImageEditor({ item, onBack }: { item: GalleryItem; onBack: () => void }) {
  const { key: geminiKey } = useGeminiKey();

  // Canvas state
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ w: 0, h: 0, scale: 1, offsetX: 0, offsetY: 0 });

  // Tool state
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [activeColor, setActiveColor] = useState("#ef4444");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const drawingRef = useRef(false);
  const currentAnnotation = useRef<Annotation | null>(null);

  // AI state
  const [prompt, setPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // ─── Load Image ─────────────────────────────────────────────────────────

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = convertFileSrc(item.file_path);
  }, [item.file_path]);

  // ─── Fit image + setup canvas ───────────────────────────────────────────

  const setupCanvas = useCallback(() => {
    if (!imageLoaded || !containerRef.current || !canvasRef.current || !imageRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    const img = imageRef.current;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;

    canvas.width = cw;
    canvas.height = ch;

    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight, 1);
    const sw = img.naturalWidth * scale;
    const sh = img.naturalHeight * scale;
    const offsetX = (cw - sw) / 2;
    const offsetY = (ch - sh) / 2;

    setImageDimensions({ w: sw, h: sh, scale, offsetX, offsetY });
  }, [imageLoaded]);

  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  // Resize observer to handle container size changes
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(() => setupCanvas());
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [setupCanvas]);

  // ─── Render ─────────────────────────────────────────────────────────────

  // Store latest annotations in a ref so render() always sees current state
  const annotationsRef = useRef<Annotation[]>([]);
  annotationsRef.current = annotations;
  const dimsRef = useRef(imageDimensions);
  dimsRef.current = imageDimensions;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h, offsetX, offsetY } = dimsRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = "#f4f4f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(img, offsetX, offsetY, w, h);

    // Draw saved annotations
    for (const ann of annotationsRef.current) {
      if (ann) drawAnnotation(ctx, ann);
    }

    // Draw current in-progress annotation
    const cur = currentAnnotation.current;
    if (cur) drawAnnotation(ctx, cur);
  }, []);

  // Re-render when annotations or dimensions change
  useEffect(() => {
    render();
  }, [annotations, imageDimensions, render]);

  // ─── Draw annotation helper ─────────────────────────────────────────────

  function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
    if (!ann || !ann.color) return;
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (ann.tool === "rect" && ann.x != null && ann.y != null && ann.w != null && ann.h != null) {
      ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);
    } else if (ann.tool === "circle" && ann.x != null && ann.y != null && ann.w != null && ann.h != null) {
      ctx.beginPath();
      const rx = Math.abs(ann.w) / 2;
      const ry = Math.abs(ann.h) / 2;
      ctx.ellipse(ann.x + ann.w / 2, ann.y + ann.h / 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ann.tool === "arrow" && ann.x1 != null && ann.y1 != null && ann.x2 != null && ann.y2 != null) {
      ctx.beginPath();
      ctx.moveTo(ann.x1, ann.y1);
      ctx.lineTo(ann.x2, ann.y2);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
      const headLen = 12;
      ctx.beginPath();
      ctx.moveTo(ann.x2, ann.y2);
      ctx.lineTo(ann.x2 - headLen * Math.cos(angle - Math.PI / 6), ann.y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(ann.x2, ann.y2);
      ctx.lineTo(ann.x2 - headLen * Math.cos(angle + Math.PI / 6), ann.y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    } else if (ann.tool === "freehand" && ann.points && ann.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x, ann.points[i].y);
      }
      ctx.stroke();
    } else if (ann.tool === "text" && ann.text && ann.x != null && ann.y != null) {
      ctx.font = "bold 16px Inter, system-ui, sans-serif";
      ctx.fillStyle = ann.color;
      ctx.fillText(ann.text, ann.x, ann.y);
    }
  }

  // ─── Mouse handlers ────────────────────────────────────────────────────

  function getCanvasPos(e: React.MouseEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (activeTool === "select") return;
    const pos = getCanvasPos(e);
    drawingRef.current = true;

    const ann: Annotation = {
      id: crypto.randomUUID(),
      tool: activeTool,
      color: activeColor,
      strokeWidth: 3,
    };

    if (activeTool === "rect" || activeTool === "circle") {
      ann.x = pos.x; ann.y = pos.y; ann.w = 0; ann.h = 0;
    } else if (activeTool === "arrow") {
      ann.x1 = pos.x; ann.y1 = pos.y; ann.x2 = pos.x; ann.y2 = pos.y;
    } else if (activeTool === "freehand") {
      ann.points = [pos];
    } else if (activeTool === "text") {
      const text = window.prompt("Enter text:");
      if (text) {
        setAnnotations(prev => [...prev, { ...ann, x: pos.x, y: pos.y, text }]);
        render();
      }
      drawingRef.current = false;
      return;
    }

    currentAnnotation.current = ann;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!drawingRef.current || !currentAnnotation.current) return;
    const pos = getCanvasPos(e);
    const ann = currentAnnotation.current;

    if (ann.tool === "rect" || ann.tool === "circle") {
      ann.w = pos.x - (ann.x ?? 0);
      ann.h = pos.y - (ann.y ?? 0);
    } else if (ann.tool === "arrow") {
      ann.x2 = pos.x;
      ann.y2 = pos.y;
    } else if (ann.tool === "freehand") {
      ann.points?.push(pos);
    }

    render();
  }

  function handleMouseUp() {
    if (!drawingRef.current || !currentAnnotation.current) return;
    const ann = currentAnnotation.current;
    currentAnnotation.current = null;
    drawingRef.current = false;
    setAnnotations(prev => [...prev, ann]);
  }

  // ─── Undo / Clear ──────────────────────────────────────────────────────

  function handleUndo() {
    setAnnotations(prev => prev.slice(0, -1));
  }

  function handleClear() {
    setAnnotations([]);
  }

  // ─── Get canvas as base64 ─────────────────────────────────────────────

  function getCanvasBase64(): string {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    // Get only the image area (crop out the grey background)
    const { w, h, offsetX, offsetY } = imageDimensions;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(canvas, offsetX, offsetY, w, h, 0, 0, w, h);
    return tempCanvas.toDataURL("image/png").split(",")[1];
  }

  // ─── AI Generate ──────────────────────────────────────────────────────

  async function handleAiGenerate() {
    if (!prompt.trim() || !geminiKey) return;

    setAiLoading(true);
    setAiResult(null);

    try {
      const imageBase64 = getCanvasBase64();

      const result = await invoke<{ image_data: string; mime_type: string }>("nanobanana_generate", {
        apiKey: geminiKey,
        prompt: prompt.trim(),
        options: {
          reference_images: [{
            data: imageBase64,
            mime_type: "image/png",
          }],
        },
      });

      setAiResult({ imageData: result.image_data, mimeType: result.mime_type });
    } catch (err) {
      console.error("AI generation failed:", err);
      alert(`AI generation failed: ${typeof err === "string" ? err : JSON.stringify(err)}`);
    } finally {
      setAiLoading(false);
    }
  }

  // ─── Accept AI result ─────────────────────────────────────────────────

  async function handleAcceptAiResult() {
    if (!aiResult) return;
    setSaving(true);
    try {
      await invoke("write_file_base64", {
        path: item.file_path,
        data: aiResult.imageData,
      });
      setLastSaved(new Date().toLocaleTimeString());
      setAiResult(null);
      setAnnotations([]);
      setPrompt("");
      // Reload image with saved AI result
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        imageRef.current = img;
        render();
      };
      img.src = convertFileSrc(item.file_path) + "?t=" + Date.now();
    } catch (err) {
      console.error("Failed to save:", err);
      alert(`Failed to save: ${typeof err === "string" ? err : JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // ─── Save annotated image (flatten annotations onto image) ────────────

  async function handleSaveAnnotated() {
    setSaving(true);
    try {
      const base64 = getCanvasBase64();
      await invoke("write_file_base64", {
        path: item.file_path,
        data: base64,
      });
      setLastSaved(new Date().toLocaleTimeString());
      // Reload image with annotations baked in, then clear overlay
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        imageRef.current = img;
        setAnnotations([]);
        render();
      };
      img.src = convertFileSrc(item.file_path) + "?t=" + Date.now();
    } catch (err) {
      console.error("Failed to save:", err);
      alert(`Failed to save: ${typeof err === "string" ? err : JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        e.stopPropagation();
        handleSaveAnnotated();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [imageDimensions, annotations]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" icon={ChevronRight} onClick={onBack} className="[&_svg:first-child]:rotate-180">
            Back
          </Button>
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{item.file_name}</h2>
            <p className="text-xs text-zinc-400">{item.folder}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastSaved && <span className="text-xs text-zinc-400">Saved {lastSaved}</span>}
          {annotations.length > 0 && (
            <Button size="md" icon={Save} onClick={handleSaveAnnotated} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      {aiResult ? (
        /* ─── Full-screen AI comparison view ─────────────────────────────── */
        <>
          {/* Comparison body — side by side */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Original */}
            <div className="flex-1 flex flex-col border-r border-zinc-200 dark:border-zinc-800">
              <div className="flex-shrink-0 px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-medium text-zinc-500">Original</span>
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-zinc-100 dark:bg-zinc-900 overflow-auto">
                <img
                  src={convertFileSrc(item.file_path)}
                  alt="Original"
                  className="max-w-full max-h-full object-contain rounded shadow-sm"
                />
              </div>
            </div>

            {/* AI Generated */}
            <div className="flex-1 flex flex-col">
              <div className="flex-shrink-0 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">AI Generated</span>
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-zinc-100 dark:bg-zinc-900 overflow-auto">
                <img
                  src={`data:${aiResult.mimeType};base64,${aiResult.imageData}`}
                  alt="AI result"
                  className="max-w-full max-h-full object-contain rounded shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Comparison footer */}
          <div className="flex-shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center justify-between bg-white dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }}
                  placeholder="Try again with a different prompt..."
                  disabled={aiLoading}
                  className="w-80 px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
                />
              </div>
              <Button
                size="md"
                icon={aiLoading ? Loader2 : Send}
                onClick={handleAiGenerate}
                disabled={!prompt.trim() || !geminiKey || aiLoading}
                className={cn(aiLoading && "[&_svg]:animate-spin")}
              >
                {aiLoading ? "Generating..." : "Retry"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="md" variant="ghost" onClick={() => setAiResult(null)}>
                Discard
              </Button>
              <Button size="md" onClick={handleAcceptAiResult} disabled={saving}>
                {saving ? "Saving..." : "Accept & Save"}
              </Button>
            </div>
          </div>
        </>
      ) : (
        /* ─── Normal editor view (toolbar + canvas + prompt) ────────────── */
        <>
          {/* Toolbar */}
          <div className="flex-shrink-0 px-4 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-1">
            {TOOLS.map(t => (
              <IconButton
                key={t.id}
                icon={t.icon}
                label={t.label}
                size={16}
                onClick={() => setActiveTool(t.id)}
                className={cn(
                  "p-1.5 rounded",
                  activeTool === t.id ? "bg-teal-100 dark:bg-teal-900 text-teal-600 dark:text-teal-400" : "text-zinc-500 hover:text-zinc-700"
                )}
              />
            ))}

            <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                className={cn(
                  "w-5 h-5 rounded-full border-2 transition-transform",
                  activeColor === c ? "border-zinc-800 dark:border-zinc-200 scale-110" : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: c }}
              />
            ))}

            <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

            <IconButton icon={Undo2} label="Undo (⌘Z)" size={16} onClick={handleUndo} className="p-1.5 text-zinc-500 hover:text-zinc-700" />
            <IconButton icon={Trash2} label="Clear all" size={16} onClick={handleClear} className="p-1.5 text-zinc-500 hover:text-zinc-700" />
          </div>

          {/* Canvas area */}
          <div ref={containerRef} className="flex-1 min-h-0 relative bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
            {!imageLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-zinc-400" />
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className={cn("absolute inset-0 w-full h-full", activeTool !== "select" ? "cursor-crosshair" : "cursor-default")}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            )}
          </div>

          {/* AI Prompt bar */}
          <div className="flex-shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }}
                placeholder={geminiKey ? "Describe what to change... (e.g. remove background, make grayscale)" : "Set Gemini API key in Settings to use AI editing"}
                disabled={!geminiKey || aiLoading}
                className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              />
            </div>
            <Button
              size="md"
              icon={aiLoading ? Loader2 : Send}
              onClick={handleAiGenerate}
              disabled={!prompt.trim() || !geminiKey || aiLoading}
              className={cn(aiLoading && "[&_svg]:animate-spin")}
            >
              {aiLoading ? "Generating..." : "Generate"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
