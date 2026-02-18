// src/modules/product/DemoPlayer.tsx
// Interactive step-through demo player — Navattic-style clickable walkthrough

import { useState, useRef, useCallback, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useReadFile } from "../../hooks/useFiles";
import { cn } from "../../lib/cn";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────

interface Hotspot {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface DemoStep {
  id: number;
  title: string;
  description: string;
  screenshot: string; // relative path like "media/01-workspace-home.png"
  hotspot: Hotspot;
}

interface DemoData {
  title: string;
  description: string;
  viewport: { width: number; height: number };
  steps: DemoStep[];
}

interface DemoPlayerProps {
  demoPath: string; // absolute path to demo.json
  basePath: string; // absolute path to feature folder (for resolving media)
}

// ─── Component ───────────────────────────────────────────────────────

export function DemoPlayer({ demoPath, basePath }: DemoPlayerProps) {
  const { data: rawJson, isLoading } = useReadFile(demoPath);
  const [currentStep, setCurrentStep] = useState(0);
  const [started, setStarted] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Parse demo data
  const demo: DemoData | null = rawJson ? (() => {
    try { return JSON.parse(rawJson); }
    catch { return null; }
  })() : null;

  // Compute scale whenever image loads or container resizes
  const updateScale = useCallback(() => {
    if (!imgRef.current || !demo) return;
    const displayedWidth = imgRef.current.clientWidth;
    setScale(displayedWidth / demo.viewport.width);
  }, [demo]);

  // ResizeObserver for container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateScale]);

  // Keyboard navigation
  useEffect(() => {
    if (!demo || !started) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setCurrentStep((s) => Math.min(s + 1, demo.steps.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentStep((s) => Math.max(s - 1, 0));
      } else if (e.key === "Escape") {
        setStarted(false);
        setCurrentStep(0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [demo, started]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
        Loading demo...
      </div>
    );
  }

  if (!demo) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
        Could not load demo data.
      </div>
    );
  }

  const step = demo.steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === demo.steps.length - 1;

  const resolveMedia = (relativePath: string) => {
    return convertFileSrc(`${basePath}/${relativePath}`);
  };

  // ─── Start Screen ──────────────────────────────────────────

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            {demo.title}
          </h3>
          <p className="mt-2 text-sm text-zinc-500 max-w-md">
            {demo.description}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {demo.steps.length} steps
          </p>
        </div>
        <button
          onClick={() => setStarted(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
        >
          <Play size={16} fill="currentColor" />
          Start Demo
        </button>
      </div>
    );
  }

  // ─── Player ────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-teal-600 dark:text-teal-400 tabular-nums">
            Step {currentStep + 1} of {demo.steps.length}
          </span>
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {step.title}
          </span>
        </div>
        <button
          onClick={() => { setStarted(false); setCurrentStep(0); }}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          Exit
        </button>
      </div>

      {/* Screenshot area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-zinc-100 dark:bg-zinc-900 min-h-0"
      >
        {/* Screenshot */}
        <img
          ref={imgRef}
          src={resolveMedia(step.screenshot)}
          alt={step.title}
          onLoad={updateScale}
          className="w-full h-full object-contain"
          draggable={false}
        />

        {/* Dark overlay with spotlight cutout */}
        {scale > 0 && (
          <Spotlight hotspot={step.hotspot} scale={scale} imgRef={imgRef} />
        )}

        {/* Pulsing hotspot ring — clickable, no tooltip (screenshots already have labels) */}
        {scale > 0 && (
          <HotspotRing
            hotspot={step.hotspot}
            scale={scale}
            imgRef={imgRef}
            onClick={() => !isLast && setCurrentStep((s) => s + 1)}
          />
        )}
      </div>

      {/* Navigation bar */}
      <div className="shrink-0 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        {/* Description */}
        <div className="px-4 py-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {step.description}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 pb-3">
          <button
            onClick={() => setCurrentStep((s) => Math.max(s - 1, 0))}
            disabled={isFirst}
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors",
              isFirst
                ? "text-zinc-300 dark:text-zinc-700 cursor-not-allowed"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            <ChevronLeft size={16} />
            Back
          </button>

          {/* Step dots */}
          <div className="flex gap-1.5">
            {demo.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === currentStep
                    ? "bg-teal-500 scale-125"
                    : i < currentStep
                      ? "bg-teal-300 dark:bg-teal-700"
                      : "bg-zinc-300 dark:bg-zinc-600"
                )}
              />
            ))}
          </div>

          <button
            onClick={() =>
              isLast
                ? (() => { setStarted(false); setCurrentStep(0); })()
                : setCurrentStep((s) => s + 1)
            }
            className="flex items-center gap-1 text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
          >
            {isLast ? "Done" : "Next"}
            {!isLast && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

/** Get the offset of the image within its container (for object-contain centering) */
function getImageOffset(imgEl: HTMLImageElement | null) {
  if (!imgEl) return { offsetX: 0, offsetY: 0 };
  const containerW = imgEl.clientWidth;
  const containerH = imgEl.clientHeight;
  const naturalW = imgEl.naturalWidth;
  const naturalH = imgEl.naturalHeight;
  if (!naturalW || !naturalH) return { offsetX: 0, offsetY: 0 };

  const scaleX = containerW / naturalW;
  const scaleY = containerH / naturalH;
  const actualScale = Math.min(scaleX, scaleY);
  const renderedW = naturalW * actualScale;
  const renderedH = naturalH * actualScale;

  return {
    offsetX: (containerW - renderedW) / 2,
    offsetY: (containerH - renderedH) / 2,
    actualScale,
  };
}

function Spotlight({
  hotspot,
  scale,
  imgRef,
}: {
  hotspot: Hotspot;
  scale: number;
  imgRef: React.RefObject<HTMLImageElement | null>;
}) {
  const { offsetX = 0, offsetY = 0, actualScale } = getImageOffset(imgRef.current);
  const s = actualScale ?? scale;
  const pad = 8;
  const x = offsetX + hotspot.x * s - pad;
  const y = offsetY + hotspot.y * s - pad;
  const w = hotspot.width * s + pad * 2;
  const h = hotspot.height * s + pad * 2;
  const r = 8;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
      <defs>
        <mask id="spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.3)"
        mask="url(#spotlight-mask)"
      />
    </svg>
  );
}

function HotspotRing({
  hotspot,
  scale,
  imgRef,
  onClick,
}: {
  hotspot: Hotspot;
  scale: number;
  imgRef: React.RefObject<HTMLImageElement | null>;
  onClick: () => void;
}) {
  const { offsetX = 0, offsetY = 0, actualScale } = getImageOffset(imgRef.current);
  const s = actualScale ?? scale;
  const pad = 8;

  return (
    <button
      onClick={onClick}
      className="absolute cursor-pointer demo-hotspot-ring"
      style={{
        left: offsetX + hotspot.x * s - pad,
        top: offsetY + hotspot.y * s - pad,
        width: hotspot.width * s + pad * 2,
        height: hotspot.height * s + pad * 2,
        borderRadius: 8,
        border: "2px solid rgb(20 184 166)",
        boxShadow: "0 0 0 0 rgba(20, 184, 166, 0.5)",
        zIndex: 20,
        background: "transparent",
      }}
    />
  );
}

