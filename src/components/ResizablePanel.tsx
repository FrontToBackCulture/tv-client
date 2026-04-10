import { useState, useEffect, useRef } from "react";

interface ResizablePanelProps {
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  storageKey?: string;
}

export function ResizablePanel({
  children,
  minWidth = 380,
  maxWidth = Math.round(window.innerWidth * 0.75),
  defaultWidth = Math.round(window.innerWidth * 0.5),
  storageKey = "tv-work-detail-panel-width",
}: ResizablePanelProps) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? Math.max(minWidth, Math.min(maxWidth, parseInt(saved, 10))) : defaultWidth;
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startWidth: 0 });

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = dragRef.current.startX - e.clientX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, dragRef.current.startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, minWidth, maxWidth]);

  // Persist width
  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
  }, [width, storageKey]);

  return (
    <div className="flex-shrink-0 relative" style={{ width }}>
      {/* Drag handle — wide hit area with visible border */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          dragRef.current = { startX: e.clientX, startWidth: width };
          setDragging(true);
        }}
        className="absolute -left-2 top-0 bottom-0 w-5 cursor-col-resize z-20 flex items-center justify-center"
      >
        {/* Visible drag indicator — always shows a subtle line, highlights on hover/drag */}
        <div className={`h-full w-[3px] rounded-full transition-colors ${dragging ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-600 hover:bg-teal-500"}`} />
      </div>
      <div className="h-full overflow-auto">
        {children}
      </div>
    </div>
  );
}
