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
  defaultWidth = Math.round(window.innerWidth / 3),
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
      {/* Drag handle — invisible 2px hit area, hairline indicator on hover/drag */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          dragRef.current = { startX: e.clientX, startWidth: width };
          setDragging(true);
        }}
        title="Drag to resize"
        className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize z-20 group flex items-stretch justify-center"
      >
        <div className={`w-px transition-colors ${dragging ? "bg-teal-500" : "bg-transparent group-hover:bg-teal-500"}`} />
      </div>
      <div className="h-full overflow-auto">
        {children}
      </div>
    </div>
  );
}
