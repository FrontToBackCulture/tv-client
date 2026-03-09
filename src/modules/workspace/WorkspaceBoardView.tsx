// src/modules/workspace/WorkspaceBoardView.tsx
// Kanban board view — workspaces grouped by status
// Column reorder via pointer-based drag, card status change via HTML5 drag

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Clock, FolderOpen, GripVertical, MessageSquare, Paperclip } from "lucide-react";
import { cn } from "../../lib/cn";
import type { WorkspaceWithCounts } from "../../hooks/workspace/useWorkspaces";
import {
  WORKSPACE_STATUS_LABELS,
  WORKSPACE_STATUS_COLORS,
} from "../../lib/workspace/types";

interface Props {
  workspaces: WorkspaceWithCounts[];
  onSelect: (id: string) => void;
  onStatusChange: (id: string, newStatus: string) => void;
}

const DEFAULT_ORDER = ["active", "open", "in_progress", "done", "paused"];
const STORAGE_KEY = "workspace-board-column-order";

function loadColumnOrder(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      if (DEFAULT_ORDER.every((s) => parsed.includes(s)) && parsed.length === DEFAULT_ORDER.length) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return [...DEFAULT_ORDER];
}

function saveColumnOrder(order: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
}

export function WorkspaceBoardView({ workspaces, onSelect, onStatusChange }: Props) {
  const [columnOrder, setColumnOrder] = useState(loadColumnOrder);

  // ---- Card drag state (HTML5 drag) ----
  const [cardDropTarget, setCardDropTarget] = useState<string | null>(null);
  const cardDragRef = useRef<{ id: string; source: string } | null>(null);

  // ---- Column drag state (pointer-based) ----
  const [colDragging, setColDragging] = useState<string | null>(null);
  const [colDropTarget, setColDropTarget] = useState<string | null>(null);
  const colRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Group workspaces by status
  const grouped = useMemo(() => {
    const map: Record<string, WorkspaceWithCounts[]> = {};
    for (const s of columnOrder) map[s] = [];
    for (const ws of workspaces) {
      const key = columnOrder.includes(ws.status) ? ws.status : "open";
      map[key].push(ws);
    }
    return map;
  }, [workspaces, columnOrder]);

  // Persist column order
  useEffect(() => {
    saveColumnOrder(columnOrder);
  }, [columnOrder]);

  // ---- Column reorder via pointer events ----
  const colElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const setColRef = useCallback((status: string) => (el: HTMLDivElement | null) => {
    if (el) colElementsRef.current.set(status, el);
    else colElementsRef.current.delete(status);
  }, []);

  const onGripPointerDown = useCallback((e: React.PointerEvent, status: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Snapshot all column rects
    const rects = new Map<string, DOMRect>();
    for (const [s, el] of colElementsRef.current.entries()) {
      rects.set(s, el.getBoundingClientRect());
    }
    colRectsRef.current = rects;
    setColDragging(status);
  }, []);

  const onGripPointerMove = useCallback((e: React.PointerEvent) => {
    if (!colDragging) return;
    const x = e.clientX;
    // Find which column the pointer is over
    let target: string | null = null;
    for (const [s, rect] of colRectsRef.current.entries()) {
      if (s !== colDragging && x >= rect.left && x <= rect.right) {
        target = s;
        break;
      }
    }
    setColDropTarget(target);
  }, [colDragging]);

  const onGripPointerUp = useCallback(() => {
    if (colDragging && colDropTarget && colDragging !== colDropTarget) {
      setColumnOrder((prev) => {
        const next = [...prev];
        const fromIdx = next.indexOf(colDragging);
        const toIdx = next.indexOf(colDropTarget);
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, colDragging);
        return next;
      });
    }
    setColDragging(null);
    setColDropTarget(null);
  }, [colDragging, colDropTarget]);

  // ---- Card drag handlers (HTML5) ----
  const onCardDragStart = useCallback((e: React.DragEvent, wsId: string, sourceStatus: string) => {
    e.stopPropagation();
    cardDragRef.current = { id: wsId, source: sourceStatus };
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  }, []);

  const onCardDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    cardDragRef.current = null;
    setCardDropTarget(null);
  }, []);

  const onColumnDragOver = useCallback((e: React.DragEvent, status: string) => {
    if (!cardDragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setCardDropTarget(status);
  }, []);

  const onColumnDragLeave = useCallback((e: React.DragEvent, status: string) => {
    const related = e.relatedTarget as HTMLElement | null;
    const column = e.currentTarget as HTMLElement;
    if (!related || !column.contains(related)) {
      setCardDropTarget((prev) => (prev === status ? null : prev));
    }
  }, []);

  const onColumnDrop = useCallback(
    (e: React.DragEvent, targetStatus: string) => {
      e.preventDefault();
      setCardDropTarget(null);
      const card = cardDragRef.current;
      if (card && card.source !== targetStatus) {
        onStatusChange(card.id, targetStatus);
      }
      cardDragRef.current = null;
    },
    [onStatusChange]
  );

  if (workspaces.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-600">
        <div className="text-center">
          <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No workspaces yet</p>
          <p className="text-xs mt-1">
            Start a collaboration session in Claude Code to create one
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden p-4">
      <div className="flex gap-3 h-full min-w-0">
        {columnOrder.map((status) => {
          const items = grouped[status] || [];
          const color = WORKSPACE_STATUS_COLORS[status] || "#6B7280";
          const label = WORKSPACE_STATUS_LABELS[status] || status;
          const isCardTarget = cardDropTarget === status && cardDragRef.current?.source !== status;
          const isColTarget = colDropTarget === status;
          const isColSource = colDragging === status;

          return (
            <div
              key={status}
              ref={setColRef(status)}
              onDragOver={(e) => onColumnDragOver(e, status)}
              onDragLeave={(e) => onColumnDragLeave(e, status)}
              onDrop={(e) => onColumnDrop(e, status)}
              className={cn(
                "flex flex-col w-72 flex-shrink-0 rounded-lg border transition-colors",
                isCardTarget
                  ? "bg-teal-50/50 dark:bg-teal-950/20 border-teal-300 dark:border-teal-700"
                  : isColTarget
                    ? "border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/20"
                    : isColSource
                      ? "opacity-50 border-zinc-200 dark:border-zinc-700"
                      : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800/50"
              )}
            >
              {/* Column header */}
              <div className="flex items-center gap-1.5 px-2 py-2.5 flex-shrink-0">
                {/* Grip handle for column reorder */}
                <div
                  onPointerDown={(e) => onGripPointerDown(e, status)}
                  onPointerMove={onGripPointerMove}
                  onPointerUp={onGripPointerUp}
                  onPointerCancel={onGripPointerUp}
                  className="cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 touch-none"
                >
                  <GripVertical size={12} className="text-zinc-300 dark:text-zinc-600" />
                </div>
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {label}
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-600 ml-auto tabular-nums">
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-0">
                {items.map((ws) => (
                  <div
                    key={ws.id}
                    draggable
                    onDragStart={(e) => onCardDragStart(e, ws.id, status)}
                    onDragEnd={onCardDragEnd}
                    onClick={() => onSelect(ws.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-md border border-zinc-200 dark:border-zinc-800",
                      "bg-white dark:bg-zinc-950",
                      "hover:border-teal-300 dark:hover:border-teal-700",
                      "transition-colors cursor-grab active:cursor-grabbing"
                    )}
                  >
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug block">
                      {ws.title}
                    </span>
                    {ws.description && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                        {ws.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-zinc-400 dark:text-zinc-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDate(ws.updated_at)}
                      </span>
                      <span>{ws.owner}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {ws.session_count > 0 && (
                          <span className="flex items-center gap-0.5" title={`${ws.session_count} session${ws.session_count !== 1 ? "s" : ""}`}>
                            <MessageSquare size={10} />
                            {ws.session_count}
                          </span>
                        )}
                        {ws.artifact_count > 0 && (
                          <span className="flex items-center gap-0.5" title={`${ws.artifact_count} artifact${ws.artifact_count !== 1 ? "s" : ""}`}>
                            <Paperclip size={10} />
                            {ws.artifact_count}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
