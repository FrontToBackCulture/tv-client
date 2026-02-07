// src/components/FloatingTerminal.tsx
// Chat-bubble-style floating terminal with per-module sessions

import { useState, useCallback, useRef, useEffect } from "react";
import { Terminal as TerminalIcon, X, Minus } from "lucide-react";
import { Terminal } from "../modules/console/Terminal";
import { ModuleId } from "../stores/appStore";
import { useTerminalSettingsStore } from "../stores/terminalSettingsStore";
import { useRepository } from "../stores/repositoryStore";
import { cn } from "../lib/cn";

type ResizeAxis = "y" | "x" | "xy";

interface FloatingTerminalProps {
  activeModule: ModuleId;
}

export function FloatingTerminal({ activeModule }: FloatingTerminalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sessions, setSessions] = useState<Set<ModuleId>>(new Set());
  const [width, setWidth] = useState(720);
  const [height, setHeight] = useState(440);

  const paths = useTerminalSettingsStore((s) => s.paths);
  const { activeRepository } = useRepository();

  // Library terminal follows the active repository; other modules use static paths
  const getModuleCwd = (moduleId: ModuleId): string | undefined => {
    if (moduleId === "library") return activeRepository?.path;
    return paths[moduleId];
  };

  // Auto-create session when switching modules while panel is open
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setSessions((prev) => {
        if (prev.has(activeModule)) return prev;
        return new Set(prev).add(activeModule);
      });
    }
  }, [activeModule, isOpen, isMinimized]);

  // FAB click: open/minimize/restore
  const handleOpen = useCallback(() => {
    if (isOpen && isMinimized) {
      setIsMinimized(false);
    } else if (isOpen) {
      setIsMinimized(true);
    } else {
      setIsOpen(true);
      setIsMinimized(false);
      setSessions((prev) => new Set(prev).add(activeModule));
    }
  }, [isOpen, isMinimized, activeModule]);

  // Close current module's session
  const handleClose = useCallback(() => {
    setSessions((prev) => {
      const next = new Set(prev);
      next.delete(activeModule);
      if (next.size === 0) {
        setIsOpen(false);
        setIsMinimized(false);
      }
      return next;
    });
  }, [activeModule]);

  // Resize drag state
  const [isResizing, setIsResizing] = useState(false);
  const axisRef = useRef<ResizeAxis>("y");
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startWidthRef = useRef(720);
  const startHeightRef = useRef(440);

  const startResize = useCallback(
    (e: React.MouseEvent, axis: ResizeAxis) => {
      e.preventDefault();
      axisRef.current = axis;
      setIsResizing(true);
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      startWidthRef.current = width;
      startHeightRef.current = height;
    },
    [width, height]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const axis = axisRef.current;
      if (axis === "y" || axis === "xy") {
        const dy = startYRef.current - e.clientY;
        setHeight(Math.max(200, Math.min(900, startHeightRef.current + dy)));
      }
      if (axis === "x" || axis === "xy") {
        const dx = startXRef.current - e.clientX;
        setWidth(Math.max(360, Math.min(1200, startWidthRef.current + dx)));
      }
    };
    const handleMouseUp = () => setIsResizing(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor =
      axisRef.current === "xy"
        ? "nwse-resize"
        : axisRef.current === "x"
          ? "col-resize"
          : "row-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  // Module label for header
  const moduleLabel: Record<string, string> = {
    library: "Library",
    work: "Work",
    crm: "CRM",
    inbox: "Inbox",
    bot: "Bots",
    settings: "Settings",
  };

  return (
    <>
      {/* Terminal panel */}
      {isOpen && sessions.size > 0 && (
        <div
          className={cn(
            "absolute bottom-14 right-4 z-40 rounded-lg shadow-2xl border border-zinc-700 overflow-hidden flex flex-col",
            isMinimized && "hidden"
          )}
          style={{ width, height }}
        >
          {/* Corner resize handle (top-left) */}
          <div
            onMouseDown={(e) => startResize(e, "xy")}
            className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-10"
          />

          {/* Top edge resize */}
          <div
            onMouseDown={(e) => startResize(e, "y")}
            className="h-1.5 cursor-row-resize bg-zinc-800 hover:bg-teal-600/40 transition-colors flex-shrink-0"
          />

          {/* Left edge resize */}
          <div
            onMouseDown={(e) => startResize(e, "x")}
            className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-teal-600/40 transition-colors z-10"
          />

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700 flex-shrink-0">
            <div className="flex items-center gap-2">
              <TerminalIcon size={13} className="text-teal-400" />
              <span className="text-xs font-medium text-zinc-300">
                Terminal — {moduleLabel[activeModule] || activeModule}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                title="Minimize"
              >
                <Minus size={12} />
              </button>
              <button
                onClick={handleClose}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                title="Close this session"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Terminal sessions — one per module, only active is visible */}
          <div className="flex-1 overflow-hidden relative">
            {Array.from(sessions).map((moduleId) => (
              <div
                key={moduleId}
                className={cn(
                  "absolute inset-0",
                  moduleId === activeModule ? "z-10" : "z-0 invisible"
                )}
              >
                <Terminal
                  id={`floating-${moduleId}`}
                  cwd={getModuleCwd(moduleId)}
                  isActive={moduleId === activeModule && !isMinimized}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating action button */}
      <button
        onClick={handleOpen}
        className={cn(
          "absolute bottom-4 right-4 z-40 w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all",
          isOpen && !isMinimized
            ? "bg-teal-600 text-white hover:bg-teal-700"
            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
        )}
        title="Toggle Terminal"
      >
        <TerminalIcon size={18} />
      </button>
    </>
  );
}
