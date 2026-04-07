// Right-side sliding pane that shows entity detail when an EntityCard is clicked.
// Reuses the existing TaskDetailPanel and WorkspaceDetailView so the experience
// matches the Work / Projects modules — the only extras are a floating "Chat to
// update" button (bot-mel popup) and a left-edge drag handle to resize the pane.

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ExternalLink, Building2 } from "lucide-react";
import { useAppStore } from "../../../stores/appStore";
import { useNotificationNavStore } from "../../../stores/notificationNavStore";
import { TaskDetailPanel } from "../../work/TaskDetailPanel";
import { WorkspaceDetailView } from "../../workspace/WorkspaceDetailView";
import type { EntityRef } from "./parseEntityRefs";
import type { ResolvedEntities } from "./useEntityRefs";

const WIDTH_KEY = "tv-entity-pane-width";
const DEFAULT_WIDTH_PCT = 40; // % of parent container
const MIN_WIDTH_PX = 360;
const MAX_WIDTH_PCT = 75;

function loadSavedWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (raw) {
      const n = parseFloat(raw);
      if (!isNaN(n) && n >= MIN_WIDTH_PX) return n;
    }
  } catch {}
  return 0; // 0 means "use default percentage"
}

interface Props {
  entityRef: EntityRef | null;
  entities: ResolvedEntities | undefined;
  onClose: () => void;
}

export function EntityActionSheet({ entityRef, entities, onClose }: Props) {
  const [savedWidth, setSavedWidth] = useState<number>(() => loadSavedWidth());
  const [isResizing, setIsResizing] = useState(false);
  const paneRef = useRef<HTMLElement>(null);

  // Compute width in px — either saved value or default % of parent
  const [width, setWidth] = useState<number>(() => {
    if (savedWidth > 0) return savedWidth;
    if (typeof window !== "undefined") return Math.max(MIN_WIDTH_PX, window.innerWidth * (DEFAULT_WIDTH_PCT / 100));
    return 560;
  });

  // Recompute default on window resize when no saved value
  useEffect(() => {
    if (savedWidth > 0) return;
    function onResize() {
      setWidth(Math.max(MIN_WIDTH_PX, window.innerWidth * (DEFAULT_WIDTH_PCT / 100)));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [savedWidth]);

  // Resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    function onMouseMove(e: MouseEvent) {
      const parent = paneRef.current?.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const maxPx = parentRect.width * (MAX_WIDTH_PCT / 100);
      const newWidth = Math.min(maxPx, Math.max(MIN_WIDTH_PX, parentRect.right - e.clientX));
      setWidth(newWidth);
    }
    function onMouseUp() {
      setIsResizing(false);
      setSavedWidth(width);
      try {
        localStorage.setItem(WIDTH_KEY, String(width));
      } catch {}
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, width]);

  return (
    <AnimatePresence>
      {entityRef && (
        <motion.aside
          ref={paneRef as any}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          style={{ width: `${width}px` }}
          className="absolute right-0 top-0 bottom-0 z-50 bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Resize handle on the left edge */}
          <div
            onMouseDown={handleMouseDown}
            className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group z-10 ${
              isResizing ? "bg-teal-500" : "hover:bg-teal-500/40"
            } transition-colors`}
            title="Drag to resize"
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 group-hover:bg-teal-500 transition-colors" />
          </div>

          <PaneContent entityRef={entityRef} entities={entities} onClose={onClose} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function PaneContent({ entityRef, entities, onClose }: { entityRef: EntityRef; entities: ResolvedEntities | undefined; onClose: () => void }) {
  const [taskChatOpen, setTaskChatOpen] = useState(false);
  const [projectChatOpen, setProjectChatOpen] = useState(false);

  // Tasks — reuse the existing TaskDetailPanel (same as Work module)
  if (entityRef.type === "task") {
    return (
      <TaskPaneContent
        taskId={entityRef.id}
        entities={entities}
        onClose={onClose}
        chatOpen={taskChatOpen}
        onOpenChat={() => setTaskChatOpen(true)}
        onCloseChat={() => setTaskChatOpen(false)}
      />
    );
  }

  // Projects / Deals — reuse the existing WorkspaceDetailView (same as Projects module)
  if (entityRef.type === "project" || entityRef.type === "deal") {
    return (
      <ProjectPaneContent
        projectId={entityRef.id}
        projectType={entityRef.type}
        entities={entities}
        onClose={onClose}
        chatOpen={projectChatOpen}
        onOpenChat={() => setProjectChatOpen(true)}
        onCloseChat={() => setProjectChatOpen(false)}
      />
    );
  }

  if (entityRef.type === "company") {
    const company = entities?.companies.get(entityRef.id);
    return (
      <div className="flex flex-col h-full">
        <PaneHeader title="Company" onClose={onClose} />
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {company ? (
            <>
              <div>
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-indigo-500" />
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {company.display_name || company.name}
                  </h2>
                </div>
                {company.stage && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Stage: {company.stage}</p>
                )}
              </div>
              <OpenInModule module="crm" entityType="company" entityId={entityRef.id} onClose={onClose} />
            </>
          ) : (
            <LoadingState />
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Task wrapper — embeds TaskDetailPanel with a floating "Chat to update" FAB
// ---------------------------------------------------------------------------

function TaskPaneContent({
  taskId,
  onClose,
}: {
  taskId: string;
  entities: ResolvedEntities | undefined;
  onClose: () => void;
  chatOpen: boolean;
  onOpenChat: () => void;
  onCloseChat: () => void;
}) {
  // TaskDetailPanel now owns the bot chat popup via its sidebar "Bot Chat" section,
  // so no FAB or extra wiring is needed here.
  return <TaskDetailPanel key={taskId} taskId={taskId} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Project/Deal wrapper — embeds WorkspaceDetailView with floating chat button
// ---------------------------------------------------------------------------

function ProjectPaneContent({
  projectId,
  onClose,
}: {
  projectId: string;
  projectType: "project" | "deal";
  entities: ResolvedEntities | undefined;
  onClose: () => void;
  chatOpen: boolean;
  onOpenChat: () => void;
  onCloseChat: () => void;
}) {
  // WorkspaceDetailView now owns the "Chat to Update" popup via its sidebar
  // section, so this wrapper just renders the existing component.
  return (
    <WorkspaceDetailView
      key={projectId}
      workspaceId={projectId}
      onBack={onClose}
      onUpdated={() => {}}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function PaneHeader({ title, onClose, actionButton }: { title: string; onClose: () => void; actionButton?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</span>
      <div className="flex items-center gap-2">
        {actionButton}
        <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function OpenInModule({ module, entityType, entityId, onClose }: { module: string; entityType: string; entityId: string; onClose: () => void }) {
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const setNavTarget = useNotificationNavStore((s) => s.setTarget);

  function handleOpen() {
    setActiveModule(module as any);
    setNavTarget(entityType, entityId, true);
    onClose();
  }

  return (
    <button
      onClick={handleOpen}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
    >
      <ExternalLink size={11} />
      Open in {module}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-8">
      <span className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
    </div>
  );
}
