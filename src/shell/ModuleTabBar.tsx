// src/shell/ModuleTabBar.tsx
// Notion-style module tab bar — sits in the title bar region

import { useRef, useCallback, useState, useEffect } from "react";
import {
  X,
  Home,
  Library,
  FolderOpen,
  Mail,
  Globe,
  Boxes,
  Puzzle,
  Wrench,
  Clock,
  GitBranch,
  MailPlus,
  GalleryHorizontalEnd,
  FileText,
  Cloud,
  Database,
  CalendarDays,
  Target,
  SlidersHorizontal,
  Activity,
  Headset,
  ClipboardList,
  MessageSquare,
  Handshake,
  BookOpen,
  Inbox,
  Settings,
  LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn";
import { ModuleId } from "../stores/appStore";
import {
  useModuleTabStore,
  useActiveTab,
  useActiveTabs,
} from "../stores/moduleTabStore";

const moduleIcons: Record<ModuleId, LucideIcon> = {
  home: Home,
  library: Library,
  projects: FolderOpen,
  metadata: SlidersHorizontal,
  work: ClipboardList,
  inbox: Mail,
  calendar: CalendarDays,
  chat: MessageSquare,
  crm: MessageSquare,
  domains: Globe,
  analytics: Activity,
  product: Boxes,
  gallery: GalleryHorizontalEnd,
  skills: Puzzle,
  "mcp-tools": Wrench,
  portal: Headset,
  scheduler: Clock,
  repos: GitBranch,
  email: MailPlus,
  blog: FileText,
  guides: BookOpen,
  s3browser: Cloud,
  prospecting: Target,
  "public-data": Database,
  referrals: Handshake,
  investment: Target,
  finance: Target,
  "shared-inbox": Inbox,
  settings: Settings,
};

const moduleLabels: Record<ModuleId, string> = {
  home: "Home",
  library: "Library",
  projects: "Projects",
  metadata: "Metadata",
  work: "Tasks",
  inbox: "Inbox",
  calendar: "Calendar",
  chat: "Chat",
  crm: "CRM",
  domains: "Domains",
  analytics: "Analytics",
  product: "Product",
  gallery: "Gallery",
  skills: "Skills",
  "mcp-tools": "MCP Tools",
  portal: "Portal",
  scheduler: "Scheduler",
  repos: "Repos",
  email: "EDM",
  blog: "Blog",
  guides: "Guides",
  s3browser: "S3 Browser",
  prospecting: "Outbound",
  "public-data": "Public Data",
  referrals: "Referrals",
  investment: "Investment",
  finance: "Finance",
  "shared-inbox": "Shared Inboxes",
  settings: "Settings",
};

interface ContextMenuState {
  tabId: ModuleId;
  x: number;
  y: number;
}

export function ModuleTabBar() {
  // Tabs are per-mode — these hooks join moduleTabStore with modeStore so the
  // bar swaps its entire contents when the user switches mode.
  const tabs = useActiveTabs();
  const activeTab = useActiveTab();
  const setActiveTab = useModuleTabStore((s) => s.setActiveTab);
  const closeTab = useModuleTabStore((s) => s.closeTab);
  const closeOtherTabs = useModuleTabStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useModuleTabStore((s) => s.closeTabsToRight);
  const reorderTab = useModuleTabStore((s) => s.reorderTab);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Horizontal scroll with mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: ModuleId) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  // Drag-to-reorder via pointer events. HTML5 draggable is unreliable in
  // Tauri's macOS WKWebView, so we hand-roll drag detection with a movement
  // threshold and manual hit-testing against data-tab-index.
  const pointerStateRef = useRef<{
    startX: number;
    startIndex: number;
    pointerId: number;
    dragging: boolean;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number, tabId: ModuleId) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tabId);
        return;
      }
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button")) return;
      pointerStateRef.current = {
        startX: e.clientX,
        startIndex: index,
        pointerId: e.pointerId,
        dragging: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [closeTab]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const state = pointerStateRef.current;
    if (!state) return;
    if (!state.dragging) {
      if (Math.abs(e.clientX - state.startX) < 5) return;
      state.dragging = true;
      setDragIndex(state.startIndex);
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tabEl = el?.closest("[data-tab-index]") as HTMLElement | null;
    if (tabEl) setDragOverIndex(Number(tabEl.dataset.tabIndex));
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, tabId: ModuleId) => {
      const state = pointerStateRef.current;
      if (!state) return;
      const { dragging, startIndex, pointerId } = state;
      const over = dragOverIndex;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(pointerId);
      } catch {}
      pointerStateRef.current = null;
      setDragIndex(null);
      setDragOverIndex(null);
      if (dragging) {
        if (over !== null && over !== startIndex) reorderTab(startIndex, over);
      } else {
        setActiveTab(tabId);
      }
    },
    [dragOverIndex, reorderTab, setActiveTab]
  );

  const handlePointerCancel = useCallback(() => {
    pointerStateRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  if (tabs.length === 0) return null;

  return (
    <>
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex items-center overflow-x-auto scrollbar-hide"
        onMouseDown={(e) => e.stopPropagation()} // Don't drag window when clicking tabs
      >
        {tabs.map((tabId, index) => {
          const Icon = moduleIcons[tabId] || Home;
          const label = moduleLabels[tabId] || tabId;
          const isActive = tabId === activeTab;
          const isDragging = dragIndex === index;
          const isDragOver = dragOverIndex === index && dragIndex !== index;

          return (
            <div
              key={tabId}
              data-tab-index={index}
              onPointerDown={(e) => handlePointerDown(e, index, tabId)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, tabId)}
              onPointerCancel={handlePointerCancel}
              onContextMenu={(e) => handleContextMenu(e, tabId)}
              className={cn(
                "group flex items-center gap-1.5 pl-2.5 pr-1 h-7 text-[12px] cursor-pointer select-none flex-shrink-0 rounded-md mx-px transition-colors",
                isActive
                  ? "bg-surface-glass text-zinc-800 dark:text-zinc-100 ring-1 ring-[rgba(var(--workspace-accent-rgb),0.35)] shadow-[0_4px_16px_-8px_rgba(var(--workspace-accent-rgb),0.45)]"
                  : "text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-accent-soft",
                isDragging && "opacity-40",
                isDragOver && "ring-1 ring-teal-500/50"
              )}
            >
              <Icon size={13} className="flex-shrink-0" />
              <span className="truncate max-w-[120px]">{label}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tabId);
                  }}
                  className={cn(
                    "flex-shrink-0 rounded p-0.5 transition-colors ml-0.5",
                    isActive
                      ? "opacity-50 hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      : "opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  )}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <TabContextMenu
          menu={contextMenu}
          canClose={tabs.length > 1}
          onClose={() => {
            closeTab(contextMenu.tabId);
            setContextMenu(null);
          }}
          onCloseOthers={() => {
            closeOtherTabs(contextMenu.tabId);
            setContextMenu(null);
          }}
          onCloseRight={() => {
            closeTabsToRight(contextMenu.tabId);
            setContextMenu(null);
          }}
        />
      )}
    </>
  );
}

function TabContextMenu({
  menu,
  canClose,
  onClose,
  onCloseOthers,
  onCloseRight,
}: {
  menu: ContextMenuState;
  canClose: boolean;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 min-w-[160px]"
      style={{ left: menu.x, top: menu.y }}
    >
      {canClose && (
        <button
          onClick={onClose}
          className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          Close
        </button>
      )}
      <button
        onClick={onCloseOthers}
        className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        Close Others
      </button>
      <button
        onClick={onCloseRight}
        className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        Close to the Right
      </button>
    </div>
  );
}
