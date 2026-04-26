// src/shell/ActivityBar.tsx

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Home,
  Library,
  FolderOpen,
  Mail,
  Globe,
  Boxes,
  ExternalLink,
  Plus,
  LucideIcon,
  Headset,
  Clock,
  Puzzle,
  Wrench,
  GitBranch,
  MailPlus,
  GalleryHorizontalEnd,
  FileText,
  ChevronRight,
  ChevronDown,
  Cloud,
  Database,
  CalendarDays,
  Target,
  SlidersHorizontal,
  Activity,
  Search,
  ClipboardList,
  CalendarClock,
  MessageSquare,
  Handshake,
  BookOpen,
  LineChart,
  Inbox,
  Wallet,
  ListChecks,
  Building2,
} from "lucide-react";
import { cn } from "../lib/cn";
import { ModuleId } from "../stores/appStore";
import { useActivityBarStore } from "../stores/activityBarStore";
import { openModuleInNewWindow } from "../lib/windowManager";
import { UserProfile } from "../components/UserProfile";
import { useModuleVisibilityStore } from "../stores/moduleVisibilityStore";
import { useTeamConfigStore } from "../stores/teamConfigStore";
import { useModeStore } from "../stores/modeStore";
import { useSidebarLayoutStore, syncSidebarLayoutFromCloud, clearSidebarLayoutSync } from "../stores/sidebarLayoutStore";
import { EyeOff, RotateCcw, Pencil, Trash2, FolderPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useCurrentUserId } from "../hooks/work/useUsers";
import { prefetchModule } from "../lib/modulePrefetch";

interface ActivityBarProps {
  activeModule: ModuleId;
  onModuleChange: (module: ModuleId) => void;
}

interface NavItem {
  id: ModuleId;
  icon: LucideIcon;
  label: string;
  shortcut: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: "Work",
    items: [
      { id: "projects", icon: FolderOpen, label: "Projects", shortcut: "\u23181" },
      { id: "work", icon: ListChecks, label: "Tasks", shortcut: "" },
      { id: "crm", icon: Building2, label: "CRM", shortcut: "" },
      { id: "library", icon: Library, label: "Library", shortcut: "\u23182" },
      { id: "metadata", icon: SlidersHorizontal, label: "Metadata", shortcut: "\u23185" },
      { id: "analytics", icon: Activity, label: "Analytics", shortcut: "" },
    ],
  },
  {
    label: "Comms",
    items: [
      { id: "inbox", icon: Mail, label: "Inbox", shortcut: "" },
      { id: "shared-inbox", icon: Inbox, label: "Shared Inboxes", shortcut: "" },
      { id: "chat", icon: MessageSquare, label: "Chat", shortcut: "" },
      { id: "calendar", icon: CalendarDays, label: "Calendar", shortcut: "" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { id: "prospecting", icon: Target, label: "Outbound", shortcut: "" },
      { id: "email", icon: MailPlus, label: "EDM", shortcut: "" },
      { id: "blog", icon: FileText, label: "Blog", shortcut: "" },
      { id: "guides", icon: BookOpen, label: "Guides", shortcut: "" },
      { id: "gallery", icon: GalleryHorizontalEnd, label: "Gallery", shortcut: "\u23186" },
      { id: "portal", icon: Headset, label: "Portal", shortcut: "" },
      { id: "referrals", icon: Handshake, label: "Referrals", shortcut: "" },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "domains", icon: Globe, label: "Domains", shortcut: "\u23183" },
      { id: "public-data", icon: Database, label: "Public Data", shortcut: "" },
      { id: "skills", icon: Puzzle, label: "Skills", shortcut: "\u23188" },
      { id: "mcp-tools", icon: Wrench, label: "MCP Tools", shortcut: "" },
      { id: "product", icon: Boxes, label: "Product", shortcut: "\u23184" },
      { id: "scheduler", icon: Clock, label: "Scheduler", shortcut: "\u23189" },
      { id: "repos", icon: GitBranch, label: "Repos", shortcut: "" },
      { id: "s3browser", icon: Cloud, label: "S3 Browser", shortcut: "" },
    ],
  },
  // Personal section — only rendered in workspaces that have personal
  // modules enabled (see moduleVisibilityStore). Currently only Melly.
  {
    label: "Personal",
    items: [
      { id: "investment", icon: LineChart, label: "Investment", shortcut: "" },
    ],
  },
  // Mgmt section — only rendered in the mgmt workspace (hard-gated in
  // moduleVisibilityStore).
  {
    label: "Mgmt",
    items: [
      { id: "finance", icon: Wallet, label: "Finance", shortcut: "" },
    ],
  },
];

interface ContextMenuState {
  moduleId: ModuleId;
  label: string;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Tooltip — positioned right of the icon in collapsed mode
// ---------------------------------------------------------------------------

function Tooltip({ children, label, shortcut, show }: {
  children: React.ReactNode;
  label: string;
  shortcut?: string;
  show: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  if (!show) return <>{children}</>;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 pointer-events-none">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 shadow-lg whitespace-nowrap">
            <span className="text-[12px] font-medium text-white">{label}</span>
            {shortcut && (
              <span className="text-[10px] font-mono text-slate-400">{shortcut}</span>
            )}
          </div>
          {/* Arrow */}
          <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 bg-slate-800 dark:bg-slate-700 rotate-45" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function ActivityBarContextMenu({
  menu,
  onClose,
  onModuleChange,
  onHide,
  onResetLayout,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onModuleChange: (module: ModuleId) => void;
  onHide: (module: ModuleId) => void;
  onResetLayout: () => void;
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
      className="fixed z-50 min-w-[200px] bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg py-1"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        onClick={() => {
          onModuleChange(menu.moduleId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Plus size={14} />
        Open in New Tab
      </button>
      <button
        onClick={() => {
          openModuleInNewWindow(menu.moduleId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <ExternalLink size={14} />
        Open in New Window
      </button>
      <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
      <button
        onClick={() => {
          onHide(menu.moduleId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <EyeOff size={14} />
        Hide from Sidebar
      </button>
      <button
        onClick={() => {
          onResetLayout();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <RotateCcw size={14} />
        Reset Sidebar Layout
      </button>
    </div>
  );
}

interface SectionMenuState {
  sectionKey: string;
  x: number;
  y: number;
}

function SectionContextMenu({
  menu,
  isCustom,
  onClose,
  onRename,
  onAddSection,
  onDeleteSection,
  onResetLayout,
}: {
  menu: SectionMenuState;
  isCustom: boolean;
  onClose: () => void;
  onRename: () => void;
  onAddSection: () => void;
  onDeleteSection: () => void;
  onResetLayout: () => void;
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
      className="fixed z-50 min-w-[200px] bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg py-1"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Pencil size={14} />
        Rename Section
      </button>
      <button
        onClick={() => {
          onAddSection();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <FolderPlus size={14} />
        New Section
      </button>
      {isCustom && (
        <button
          onClick={() => {
            onDeleteSection();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20"
        >
          <Trash2 size={14} />
          Delete Section
        </button>
      )}
      <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
      <button
        onClick={() => {
          onResetLayout();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <RotateCcw size={14} />
        Reset Sidebar Layout
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header (expanded mode)
// ---------------------------------------------------------------------------

function SectionHeader({
  label,
  collapsed,
  isRenaming,
  isDragging,
  isDragOver,
  onCommitRename,
  onCancelRename,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  label: string;
  collapsed: boolean;
  isRenaming: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onCommitRename: (next: string) => void;
  onCancelRename: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}) {
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setDraft(label);
      // Defer focus so React has rendered the input.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, label]);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      className={cn(
        "w-full px-3 pt-3 pb-1 flex items-center gap-1.5 group cursor-pointer select-none",
        isDragging && "opacity-40",
        isDragOver && "ring-1 ring-teal-500/40 rounded"
      )}
    >
      <ChevronRight
        size={10}
        className={cn(
          "text-slate-400 dark:text-slate-500 transition-transform duration-150 shrink-0",
          !collapsed && "rotate-90"
        )}
      />
      {isRenaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitRename(draft)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommitRename(draft);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelRename();
            }
          }}
          className="flex-1 min-w-0 bg-transparent border border-slate-300 dark:border-slate-600 rounded px-1 py-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300 outline-none focus:border-teal-500"
        />
      ) : (
        <span className="flex-1 min-w-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors truncate">
          {label}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav button
// ---------------------------------------------------------------------------

function NavButton({
  item,
  isActive,
  isExpanded,
  badge,
  isDragging,
  isDragOver,
  onModuleChange,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  item: NavItem;
  isActive: boolean;
  isExpanded: boolean;
  badge?: number;
  isDragging?: boolean;
  isDragOver?: boolean;
  onModuleChange: (id: ModuleId) => void;
  onContextMenu: (e: React.MouseEvent, item: NavItem) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
}) {
  const Icon = item.icon;

  if (!isExpanded) {
    return (
      <Tooltip label={item.label} shortcut={item.shortcut} show>
        <div
          className="relative"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerEnter={() => prefetchModule(item.id)}
        >
          <div
            data-help-id={`activity-bar-${item.id}`}
            onClick={() => onModuleChange(item.id)}
            onContextMenu={(e) => onContextMenu(e, item)}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer select-none",
              isActive
                ? "bg-teal-600 dark:bg-teal-600 text-white shadow-sm shadow-teal-600/20 dark:shadow-teal-500/15"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60",
              isDragging && "opacity-40",
              isDragOver && !isDragging && "ring-1 ring-teal-500/50"
            )}
          >
            <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
          </div>
          {badge !== undefined && badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1 pointer-events-none">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </div>
      </Tooltip>
    );
  }

  return (
    <div
      data-help-id={`activity-bar-${item.id}`}
      onClick={() => onModuleChange(item.id)}
      onContextMenu={(e) => onContextMenu(e, item)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerEnter={() => prefetchModule(item.id)}
      className={cn(
        "w-full h-8 flex items-center gap-2.5 px-2.5 rounded-lg transition-all duration-150 cursor-pointer select-none",
        isActive
          ? "bg-accent-gradient text-white"
          : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-accent-soft",
        isDragging && "opacity-40",
        isDragOver && !isDragging && "ring-1 ring-teal-500/50"
      )}
    >
      <Icon size={16} strokeWidth={isActive ? 2.25 : 1.75} className="shrink-0" />
      <span className="text-[13px] truncate flex-1 text-left">{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1 shrink-0">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      {!badge && item.shortcut && (
        <span className={cn(
          "text-[10px] font-mono shrink-0",
          isActive ? "text-white/70" : "text-slate-400 dark:text-slate-600"
        )}>
          {item.shortcut}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityBar
// ---------------------------------------------------------------------------

export function ActivityBar({ activeModule, onModuleChange }: ActivityBarProps) {
  const isExpanded = useActivityBarStore((s) => s.isExpanded);
  const mode = useActivityBarStore((s) => s.mode);
  const activeTab = useActivityBarStore((s) => s.activeTab);
  const sidebarWidth = useActivityBarStore((s) => s.width);
  const setWidth = useActivityBarStore((s) => s.setWidth);
  const isModuleVisible = useModuleVisibilityStore((s) => s.isModuleVisible);
  const resizing = useRef(false);
  const hiddenModules = useModuleVisibilityStore((s) => s.hiddenModules);
  const teamConfig = useTeamConfigStore((s) => s.config);
  // Subscribe so the sidebar re-filters whenever the user switches mode —
  // isModuleVisible reads modeStore internally and the memos below depend
  // on this value to recompute.
  const activeMode = useModeStore((s) => s.activeMode);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sectionMenu, setSectionMenu] = useState<SectionMenuState | null>(null);
  const [renamingSection, setRenamingSection] = useState<string | null>(null);

  const layoutSectionOrder = useSidebarLayoutStore((s) => s.sectionOrder);
  const layoutItemOrder = useSidebarLayoutStore((s) => s.itemOrder);
  const customSectionLabels = useSidebarLayoutStore((s) => s.customSectionLabels);
  const itemSectionOverride = useSidebarLayoutStore((s) => s.itemSection);
  const customSections = useSidebarLayoutStore((s) => s.customSections);
  const reorderSection = useSidebarLayoutStore((s) => s.reorderSection);
  const moveItem = useSidebarLayoutStore((s) => s.moveItem);
  const renameSection = useSidebarLayoutStore((s) => s.renameSection);
  const addSection = useSidebarLayoutStore((s) => s.addSection);
  const removeSection = useSidebarLayoutStore((s) => s.removeSection);
  const resetLayout = useSidebarLayoutStore((s) => s.resetLayout);
  const toggleModule = useModuleVisibilityStore((s) => s.toggleModule);

  // Drag state — sections and items use independent state buckets so a drag
  // in one doesn't visually bleed into the other.
  const [sectionDragIndex, setSectionDragIndex] = useState<number | null>(null);
  const [sectionDragOverIndex, setSectionDragOverIndex] = useState<number | null>(null);
  const [itemDrag, setItemDrag] = useState<{ section: string; from: number; over: number | null } | null>(null);
  const sectionPointerRef = useRef<{ startX: number; startY: number; startIndex: number; pointerId: number; dragging: boolean } | null>(null);
  const itemPointerRef = useRef<{ startX: number; startY: number; sectionKey: string; startIndex: number; pointerId: number; dragging: boolean } | null>(null);

  // Chat unread badge — count conversations with activity after user's last read position
  const currentUserId = useCurrentUserId();

  // Cloud sync — pull the user's saved layout from Supabase once we know who
  // they are. Subsequent local changes are auto-pushed (debounced) by the
  // store's subscribe handler. On user switch / sign-out, stop pushing.
  useEffect(() => {
    if (!currentUserId) {
      clearSidebarLayoutSync();
      return;
    }
    syncSidebarLayoutFromCloud(currentUserId);
    return () => {
      clearSidebarLayoutSync();
    };
  }, [currentUserId]);

  const { data: chatUnreadCount = 0 } = useQuery({
    queryKey: ["chat", "unread-badge", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return 0;
      const { data: user } = await supabase.from("users").select("name").eq("id", currentUserId).single();
      if (!user) return 0;
      const userName = user.name;

      // Get all messages to determine participants per thread
      const { data: allMessages } = await supabase
        .from("discussions")
        .select("id, entity_type, entity_id, author, body, parent_id, last_activity_at")
        .limit(2000);
      if (!allMessages || allMessages.length === 0) return 0;

      // Build per-entity: root ID (oldest, parent_id=null), latest activity, and participants
      const entities = new Map<string, { rootId: string; lastActivity: string; participants: Set<string> }>();
      const userLower = userName.toLowerCase();

      for (const m of allMessages) {
        const key = `${m.entity_type}:${m.entity_id}`;
        let entry = entities.get(key);
        if (!entry) {
          entry = { rootId: "", lastActivity: "", participants: new Set() };
          entities.set(key, entry);
        }
        // Track root ID (first message with no parent)
        if (!m.parent_id && (!entry.rootId || new Date(m.last_activity_at) < new Date(entry.lastActivity) || !entry.lastActivity)) {
          if (!entry.rootId) entry.rootId = m.id;
        }
        // Track latest activity
        if (!entry.lastActivity || new Date(m.last_activity_at) > new Date(entry.lastActivity)) {
          entry.lastActivity = m.last_activity_at;
        }
        // Track participants (authors + @mentions)
        entry.participants.add(m.author.toLowerCase());
        const mentions = m.body.match(/@([\w-]+)/g);
        if (mentions) mentions.forEach((mention: string) => entry!.participants.add(mention.slice(1).toLowerCase()));
      }

      // Fix root IDs: ensure we use the actual oldest root message per entity
      for (const m of allMessages) {
        if (m.parent_id) continue;
        const key = `${m.entity_type}:${m.entity_id}`;
        const entry = entities.get(key);
        if (!entry) continue;
        // Use earliest root message
        const existingRoot = allMessages.find(msg => msg.id === entry.rootId);
        if (!existingRoot || new Date(m.last_activity_at) < new Date(existingRoot.last_activity_at)) {
          entry.rootId = m.id;
        }
      }

      // Get read positions
      const { data: positions } = await supabase
        .from("chat_read_positions")
        .select("thread_id, last_read_at")
        .eq("user_id", userName);

      const readMap = new Map((positions ?? []).map(p => [p.thread_id, p.last_read_at]));

      let unread = 0;
      for (const [, entry] of entities) {
        // Only count threads the user is a participant in
        if (!entry.participants.has(userLower)) continue;
        if (!entry.rootId) continue;
        const readAt = readMap.get(entry.rootId);
        if (!readAt || new Date(entry.lastActivity) > new Date(readAt)) {
          unread++;
        }
      }
      return unread;
    },
    enabled: !!currentUserId,
    refetchInterval: 30000,
  });

  // Collapsible section state — persisted to localStorage
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("tv-client-collapsed-sections");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Build the rendered section list by walking ALL known sections (canonical
  // + user-created custom) in user-defined order. For each module, decide
  // its home section: explicit override (`itemSection`) wins, otherwise it
  // lives in its canonical section. Within a section, ordering follows
  // `itemOrder[sectionKey]`, with anything missing appended at the end.
  // Custom sections render even when empty (so the user has a drop target),
  // canonical sections drop when empty so the sidebar doesn't grow ghost
  // headers for sections like "Mgmt" in non-mgmt workspaces.
  const filteredSections = useMemo(() => {
    type Entry = { key: string; label: string; isCustom: boolean; items: NavItem[] };

    // Canonical section index for fallback assignment.
    const canonicalByKey = new Map<string, NavSection>();
    for (const s of navSections) canonicalByKey.set(s.label, s);

    // Build a master item lookup so overridden items can render in any section.
    const itemById = new Map<ModuleId, NavItem>();
    for (const s of navSections) for (const it of s.items) itemById.set(it.id, it);

    // Group items by their effective section key.
    const itemsBySection = new Map<string, NavItem[]>();
    for (const s of navSections) {
      for (const it of s.items) {
        const target = itemSectionOverride[it.id] ?? s.label;
        if (!itemsBySection.has(target)) itemsBySection.set(target, []);
        itemsBySection.get(target)!.push(it);
      }
    }

    // Build ordered key list: saved order first, then any sections not yet
    // saved (canonical, then custom).
    const allKeys: string[] = [];
    for (const k of layoutSectionOrder) {
      if (!allKeys.includes(k) && (canonicalByKey.has(k) || customSections.some((c) => c.key === k))) {
        allKeys.push(k);
      }
    }
    for (const s of navSections) if (!allKeys.includes(s.label)) allKeys.push(s.label);
    for (const c of customSections) if (!allKeys.includes(c.key)) allKeys.push(c.key);

    const result: Entry[] = [];
    for (const key of allKeys) {
      const isCustom = customSections.some((c) => c.key === key);
      const canonical = canonicalByKey.get(key);
      const label = isCustom
        ? (customSections.find((c) => c.key === key)?.label ?? "Section")
        : (customSectionLabels[key] ?? canonical?.label ?? key);

      const groupItems = itemsBySection.get(key) ?? [];
      // Order within the section: saved order, then any new items appended.
      const savedOrder = layoutItemOrder[key] ?? [];
      const groupSet = new Set(groupItems.map((it) => it.id));
      const ordered: NavItem[] = [];
      for (const id of savedOrder) {
        if (!groupSet.has(id)) continue;
        const it = itemById.get(id);
        if (it && !ordered.some((o) => o.id === id)) ordered.push(it);
      }
      for (const it of groupItems) {
        if (!ordered.some((o) => o.id === it.id)) ordered.push(it);
      }
      const visible = ordered.filter((item) => isModuleVisible(item.id));
      // Drop empty canonical sections (e.g. Mgmt outside mgmt workspace),
      // keep empty custom sections so the user can drop into them.
      if (!isCustom && visible.length === 0) continue;
      result.push({ key, label, isCustom, items: visible });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isModuleVisible,
    hiddenModules,
    teamConfig,
    activeMode,
    layoutSectionOrder,
    layoutItemOrder,
    customSectionLabels,
    itemSectionOverride,
    customSections,
  ]);

  const handleContextMenu = (e: React.MouseEvent, item: NavItem) => {
    e.preventDefault();
    setContextMenu({ moduleId: item.id, label: item.label, x: e.clientX, y: e.clientY });
  };

  const handleSectionContextMenu = (e: React.MouseEvent, sectionKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSectionMenu({ sectionKey, x: e.clientX, y: e.clientY });
  };

  // Section drag handlers
  const handleSectionPointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("input, button")) return;
    sectionPointerRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startIndex: index,
      pointerId: e.pointerId,
      dragging: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleSectionPointerMove = useCallback((e: React.PointerEvent) => {
    const state = sectionPointerRef.current;
    if (!state) return;
    if (!state.dragging) {
      if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 6) return;
      state.dragging = true;
      setSectionDragIndex(state.startIndex);
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sectionEl = el?.closest("[data-section-index]") as HTMLElement | null;
    if (sectionEl) setSectionDragOverIndex(Number(sectionEl.dataset.sectionIndex));
  }, []);

  const handleSectionPointerUp = useCallback((e: React.PointerEvent, sectionKey: string) => {
    const state = sectionPointerRef.current;
    if (!state) return;
    const { dragging, startIndex, pointerId } = state;
    const over = sectionDragOverIndex;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(pointerId);
    } catch {}
    sectionPointerRef.current = null;
    setSectionDragIndex(null);
    setSectionDragOverIndex(null);
    if (!dragging) {
      // Don't toggle while inline-renaming this section.
      if (renamingSection !== sectionKey) {
        setCollapsedSections((prev) => {
          const next = { ...prev, [sectionKey]: !prev[sectionKey] };
          localStorage.setItem("tv-client-collapsed-sections", JSON.stringify(next));
          return next;
        });
      }
      return;
    }
    if (dragging && over !== null && over !== startIndex) {
      // Persist the *full* current order so future codebase additions
      // don't reset the user's customization.
      const currentKeys = filteredSections.map((s) => s.key);
      // Build a complete key list that preserves user order: start with
      // currently-rendered ordered keys, then append any sections that
      // were filtered out (no visible items).
      const allKeys = [...currentKeys];
      for (const s of navSections) if (!allKeys.includes(s.label)) allKeys.push(s.label);
      // Translate the visible-only swap onto allKeys positions.
      const fromKey = currentKeys[startIndex];
      const toKey = currentKeys[over];
      const fromAll = allKeys.indexOf(fromKey);
      const toAll = allKeys.indexOf(toKey);
      if (fromAll !== -1 && toAll !== -1) {
        const next = [...allKeys];
        const [moved] = next.splice(fromAll, 1);
        next.splice(toAll, 0, moved);
        // Replace the persisted order wholesale.
        useSidebarLayoutStore.setState({ sectionOrder: next });
      } else {
        reorderSection(startIndex, over);
      }
    }
  }, [sectionDragOverIndex, filteredSections, reorderSection, renamingSection]);

  const handleSectionPointerCancel = useCallback(() => {
    sectionPointerRef.current = null;
    setSectionDragIndex(null);
    setSectionDragOverIndex(null);
  }, []);

  // Item drag handlers (per section)
  const handleItemPointerDown = useCallback((e: React.PointerEvent, sectionKey: string, index: number) => {
    if (e.button !== 0) return;
    itemPointerRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      sectionKey,
      startIndex: index,
      pointerId: e.pointerId,
      dragging: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleItemPointerMove = useCallback((e: React.PointerEvent) => {
    const state = itemPointerRef.current;
    if (!state) return;
    if (!state.dragging) {
      if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 6) return;
      state.dragging = true;
      setItemDrag({ section: state.sectionKey, from: state.startIndex, over: null });
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    // Hit-test items in any section first (most specific drop target).
    const itemEl = el?.closest("[data-item-section]") as HTMLElement | null;
    if (itemEl) {
      const overSection = itemEl.dataset.itemSection!;
      const idx = Number(itemEl.dataset.itemIndex);
      setItemDrag({ section: overSection, from: state.startIndex, over: idx });
      return;
    }
    // Otherwise, treat a hover over a section header or the section's body
    // as "drop at the end of that section."
    const sectionEl = el?.closest("[data-drop-section]") as HTMLElement | null;
    if (sectionEl) {
      const overSection = sectionEl.dataset.dropSection!;
      // Insert at the end (length) — moveItem clamps.
      setItemDrag({ section: overSection, from: state.startIndex, over: -1 });
    }
  }, []);

  const handleItemPointerUp = useCallback((e: React.PointerEvent, fromSectionKey: string, _activate: () => void) => {
    const state = itemPointerRef.current;
    if (!state) return;
    const { dragging, startIndex, pointerId } = state;
    const drag = itemDrag;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(pointerId);
    } catch {}
    itemPointerRef.current = null;
    if (dragging) {
      if (drag) {
        const fromSection = filteredSections.find((s) => s.key === fromSectionKey);
        const moduleId = fromSection?.items[startIndex]?.id;
        if (moduleId) {
          const targetSectionKey = drag.section;
          const sameSection = targetSectionKey === fromSectionKey;
          if (sameSection) {
            // Pure reorder within section.
            if (drag.over !== null && drag.over !== -1 && drag.over !== startIndex) {
              const currentIds = fromSection!.items.map((it) => it.id);
              const next = [...currentIds];
              const [moved] = next.splice(startIndex, 1);
              next.splice(drag.over, 0, moved);
              useSidebarLayoutStore.setState((s) => ({
                itemOrder: { ...s.itemOrder, [fromSectionKey]: next },
              }));
            }
          } else {
            // Cross-section move.
            const targetSection = filteredSections.find((s) => s.key === targetSectionKey);
            const targetCount = targetSection?.items.length ?? 0;
            const insertAt = drag.over === -1 || drag.over === null ? targetCount : drag.over;
            moveItem(moduleId, fromSectionKey, targetSectionKey, insertAt);
          }
        }
      }
      setItemDrag(null);
      // Suppress the synthetic click that follows a pointerup after drag.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        document.removeEventListener("click", swallow, true);
      };
      document.addEventListener("click", swallow, true);
    } else {
      setItemDrag(null);
    }
  }, [itemDrag, filteredSections, moveItem]);

  const handleItemPointerCancel = useCallback(() => {
    itemPointerRef.current = null;
    setItemDrag(null);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      setWidth(startW + (ev.clientX - startX));
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth, setWidth]);

  // Hidden mode: sidebar completely gone — toggle via title bar button
  if (mode === "hidden") return null;

  return (
    <div
      data-help-id="activity-bar"
      className="bg-surface-glass border-r border-zinc-200/70 dark:border-zinc-800/60 flex flex-col py-2 gap-0.5 overflow-hidden select-none flex-shrink-0 items-stretch px-1.5 relative"
      style={{
        width: sidebarWidth,
        backgroundImage: `linear-gradient(180deg, rgba(var(--workspace-accent-rgb), 0.10) 0%, rgba(var(--workspace-accent-rgb), 0.02) 100%)`,
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors z-10"
      />
      {/* Tab bar — switches sidebar content */}
      <SidebarTabs activeModule={activeModule} onModuleChange={onModuleChange} />

      {/* Sidebar content based on active tab */}
      {activeTab === "nav" ? (
        <>
          {/* Module sections */}
          {filteredSections.map((section, i) => {
            const isCollapsed = !!collapsedSections[section.key];
            const containsActive = section.items.some((item) => item.id === activeModule);
            const showItems = !isCollapsed || containsActive;
            const isSectionDragging = sectionDragIndex === i;
            const isSectionDragOver = sectionDragOverIndex === i && sectionDragIndex !== i;

            const isCrossSectionTarget =
              itemDrag != null && itemDrag.section === section.key && section.items.length === 0;

            return (
              <div
                key={section.key}
                data-section-index={i}
                data-drop-section={section.key}
                className={cn(
                  section.isCustom && section.items.length === 0 && "min-h-[28px]",
                  isCrossSectionTarget && "ring-1 ring-teal-500/50 rounded"
                )}
              >
                {isExpanded ? (
                  <SectionHeader
                    label={section.label}
                    collapsed={isCollapsed}
                    isRenaming={renamingSection === section.key}
                    isDragging={isSectionDragging}
                    isDragOver={isSectionDragOver}
                    onCommitRename={(next) => {
                      renameSection(section.key, next);
                      setRenamingSection(null);
                    }}
                    onCancelRename={() => setRenamingSection(null)}
                    onContextMenu={(e) => handleSectionContextMenu(e, section.key)}
                    onPointerDown={(e) => handleSectionPointerDown(e, i)}
                    onPointerMove={handleSectionPointerMove}
                    onPointerUp={(e) => handleSectionPointerUp(e, section.key)}
                    onPointerCancel={handleSectionPointerCancel}
                  />
                ) : (
                  i > 0 && (
                    <div className="py-1.5 flex justify-center">
                      <div className="w-5 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>
                  )
                )}
                {showItems && (
                  <div className={cn(
                    "flex flex-col",
                    isExpanded ? "gap-0.5" : "gap-0.5 items-center"
                  )}>
                    {isExpanded && section.isCustom && section.items.length === 0 && (
                      <div className="px-3 py-1.5 text-[11px] italic text-slate-400 dark:text-slate-500">
                        Drop modules here
                      </div>
                    )}
                    {section.items.map((item, itemIdx) => {
                      const isItemDragging =
                        itemDrag?.section === section.key && itemDrag.from === itemIdx;
                      const isItemDragOver =
                        itemDrag?.section === section.key &&
                        itemDrag.over === itemIdx &&
                        itemDrag.from !== itemIdx;
                      return (
                        <div
                          key={item.id}
                          data-item-section={section.key}
                          data-item-index={itemIdx}
                          className="w-full"
                        >
                          <NavButton
                            item={item}
                            isActive={activeModule === item.id}
                            isExpanded={isExpanded}
                            badge={item.id === "chat" ? chatUnreadCount : undefined}
                            isDragging={isItemDragging}
                            isDragOver={isItemDragOver}
                            onModuleChange={onModuleChange}
                            onContextMenu={handleContextMenu}
                            onPointerDown={(e) => handleItemPointerDown(e, section.key, itemIdx)}
                            onPointerMove={handleItemPointerMove}
                            onPointerUp={(e) => handleItemPointerUp(e, section.key, () => onModuleChange(item.id))}
                            onPointerCancel={handleItemPointerCancel}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* New section button — only when expanded; keeps custom layout
              creation discoverable without crowding collapsed-mode icons. */}
          {isExpanded && (
            <button
              onClick={() => {
                const key = addSection("New Section");
                // Open inline rename so the user can name it immediately.
                setRenamingSection(key);
              }}
              className="w-full mt-1 flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 rounded transition-colors"
            >
              <FolderPlus size={11} />
              <span>New Section</span>
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* User profile */}
          <UserProfile collapsed={!isExpanded} />
        </>
      ) : activeTab === "inbox" ? (
        <SidebarInbox onSelectTask={(id) => { useActivityBarStore.getState().openTask(id); }} />
      ) : activeTab === "calendar" ? (
        <SidebarCalendar onSelectTask={(id) => { useActivityBarStore.getState().openTask(id); }} />
      ) : null}

      {/* Context menu overlay */}
      {contextMenu && (
        <ActivityBarContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onModuleChange={onModuleChange}
          onHide={(id) => toggleModule(id)}
          onResetLayout={resetLayout}
        />
      )}
      {sectionMenu && (
        <SectionContextMenu
          menu={sectionMenu}
          isCustom={customSections.some((c) => c.key === sectionMenu.sectionKey)}
          onClose={() => setSectionMenu(null)}
          onRename={() => setRenamingSection(sectionMenu.sectionKey)}
          onAddSection={() => {
            const key = addSection("New Section");
            setRenamingSection(key);
          }}
          onDeleteSection={() => removeSection(sectionMenu.sectionKey)}
          onResetLayout={resetLayout}
        />
      )}
    </div>
  );
}

// ─── Sidebar Tabs ─────────────────────────────────────────────────────────

function SidebarTabs({ onModuleChange }: { activeModule: ModuleId; onModuleChange: (module: ModuleId) => void }) {
  const activeTab = useActivityBarStore((s) => s.activeTab);
  const setActiveTab = useActivityBarStore((s) => s.setActiveTab);

  const tabs = [
    { id: "nav" as const, icon: Home, label: "Home" },
    { id: "inbox" as const, icon: ClipboardList, label: "Today" },
    { id: "calendar" as const, icon: CalendarClock, label: "Upcoming" },
    { id: "search" as const, icon: Search, label: "Search" },
  ];

  return (
    <div className="flex items-center gap-0.5 mb-1 px-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => {
            if (tab.id === "search") {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
            } else if (tab.id === "nav") {
              setActiveTab("nav");
              onModuleChange("home");
            } else {
              setActiveTab(activeTab === tab.id ? "nav" : tab.id);
            }
          }}
          className={cn(
            "flex-1 h-7 flex items-center justify-center rounded-md transition-colors",
            activeTab === tab.id
              ? "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"
          )}
          title={tab.label}
        >
          <tab.icon size={14} />
        </button>
      ))}
    </div>
  );
}

// ─── Sidebar Inbox — today's tasks + recent changes ──────────────────────

function SidebarInbox({ onSelectTask }: { onSelectTask: (id: string) => void }) {
  const currentUserId = useCurrentUserId();

  const { data: todayTasks = [] } = useQuery({
    queryKey: ["sidebar-inbox-tasks", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];
      const today = new Date().toISOString().slice(0, 10);
      // Get completed status IDs to exclude
      const { data: completeStatuses } = await supabase.from("task_statuses").select("id").eq("type", "complete");
      const completeIds = (completeStatuses ?? []).map((s: any) => s.id);
      let query = supabase
        .from("tasks")
        .select("id, title, due_date, status_id, project_id, task_number, triage_action, triage_score, projects!tasks_project_id_fkey(name, identifier_prefix), task_assignees!inner(user_id)")
        .eq("task_assignees.user_id", currentUserId)
        .lte("due_date", today)
        .not("status_id", "is", null)
        .neq("triage_action", "kill")
        .order("due_date", { ascending: true })
        .limit(50);
      if (completeIds.length > 0) {
        for (const cid of completeIds) query = query.neq("status_id", cid);
      }
      const { data } = await query;
      return data ?? [];
    },
    enabled: !!currentUserId,
    staleTime: 30_000,
  });

  const { data: recentChanges = [] } = useQuery({
    queryKey: ["sidebar-inbox-changes", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("task_changes")
        .select("*")
        .gte("changed_at", since)
        .order("changed_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!currentUserId,
    staleTime: 30_000,
  });

  const fieldLabel: Record<string, string> = { due_date: "Due Date", title: "Title", status_id: "Status", priority: "Priority", project_id: "Project", triage_action: "Triage" };

  const triageGroups = useMemo(() => {
    const groups: { key: string; label: string; color: string; dotColor: string; tasks: any[] }[] = [
      { key: "do_now", label: "Now", color: "text-red-500", dotColor: "bg-red-500", tasks: [] },
      { key: "do_this_week", label: "This Week", color: "text-amber-500", dotColor: "bg-amber-400", tasks: [] },
      { key: "defer", label: "Defer", color: "text-blue-500", dotColor: "bg-blue-400", tasks: [] },
      { key: "unsorted", label: "Unsorted", color: "text-slate-400", dotColor: "bg-slate-400", tasks: [] },
    ];
    const map = new Map(groups.map(g => [g.key, g]));
    for (const t of todayTasks) {
      const action = (t as any).triage_action;
      const group = map.get(action) || map.get("unsorted")!;
      group.tasks.push(t);
    }
    // Sort within each group by triage_score desc
    for (const g of groups) g.tasks.sort((a: any, b: any) => (b.triage_score ?? 0) - (a.triage_score ?? 0));
    return groups.filter(g => g.tasks.length > 0);
  }, [todayTasks]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-2 py-1.5">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">Today ({todayTasks.length})</div>
        {todayTasks.length === 0 ? (
          <div className="px-1 py-2 text-[11px] text-slate-400">All clear</div>
        ) : (
          triageGroups.map(group => (
            <SidebarTaskGroup
              key={group.key}
              label={group.label}
              color={group.color}
              dotColor={group.dotColor}
              tasks={group.tasks}
              onSelectTask={onSelectTask}
              defaultOpen={group.key === "do_now" || group.key === "do_this_week"}
            />
          ))
        )}
      </div>

      {/* Recent changes */}
      {recentChanges.length > 0 && (
        <div className="px-2 py-1.5 border-t border-slate-100 dark:border-slate-800">
          <SidebarTaskGroup
            label="Recent Changes"
            color="text-purple-500"
            dotColor="bg-purple-400"
            tasks={[]}
            onSelectTask={() => {}}
            defaultOpen={false}
            customContent={
              <>
                {recentChanges.map((c: any) => (
                  <div key={c.id} className="px-1 py-1.5 text-[10px]">
                    <div className="text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-purple-500">{fieldLabel[c.field] || c.field}</span>
                      {" "}
                      {c.old_value && <span className="line-through text-red-400">{c.old_value}</span>}
                      {" → "}
                      <span className="text-emerald-500">{c.new_value || "(empty)"}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      {new Date(c.changed_at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                      {c.changed_by && ` · ${c.changed_by}`}
                    </div>
                  </div>
                ))}
              </>
            }
          />
        </div>
      )}
    </div>
  );
}

// ─── Sidebar Calendar — upcoming due dates ───────────────────────────────

// ─── Sidebar Task Group — collapsible section ────────────────────────────

function SidebarTaskGroup({ label, color, dotColor, tasks, onSelectTask, defaultOpen = true, customContent }: {
  label: string;
  color: string;
  dotColor: string;
  tasks: any[];
  onSelectTask: (id: string) => void;
  defaultOpen?: boolean;
  customContent?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const count = customContent ? undefined : tasks.length;

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-1 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/30 rounded-md transition-colors"
      >
        {open ? <ChevronDown size={10} className="text-slate-400" /> : <ChevronRight size={10} className="text-slate-400" />}
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", color)}>{label}</span>
        {count != null && <span className={cn("text-[9px] font-medium", color)}>{count}</span>}
      </button>
      {open && (
        customContent || (
          <div className="ml-1">
            {tasks.map((t: any) => {
              const prefix = t.projects?.identifier_prefix || "";
              const identifier = prefix ? `${prefix}-${t.task_number}` : `#${t.task_number}`;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTask(t.id)}
                  className="w-full flex items-start gap-2 px-1 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors text-left"
                >
                  <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", dotColor)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate">{t.title}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {identifier} · {t.projects?.name || ""}
                      {t.triage_score != null && <span className={cn("ml-1 font-medium", color)}>{t.triage_score}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ─── Sidebar Calendar — upcoming due dates ───────────────────────────────

function SidebarCalendar({ onSelectTask }: { onSelectTask: (id: string) => void }) {
  const currentUserId = useCurrentUserId();

  const { data: upcoming = [] } = useQuery({
    queryKey: ["sidebar-calendar", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      // Exclude completed/won't-do statuses
      const { data: completeStatuses } = await supabase.from("task_statuses").select("id").eq("type", "complete");
      const completeIds = (completeStatuses ?? []).map((s: any) => s.id);
      let query = supabase
        .from("tasks")
        .select("id, title, due_date, task_number, projects!tasks_project_id_fkey(name, identifier_prefix), task_assignees!inner(user_id)")
        .eq("task_assignees.user_id", currentUserId)
        .gte("due_date", tomorrow)
        .lte("due_date", nextWeek)
        .neq("triage_action", "kill")
        .order("due_date", { ascending: true })
        .limit(30);
      if (completeIds.length > 0) {
        for (const cid of completeIds) query = query.neq("status_id", cid);
      }
      const { data } = await query;
      return data ?? [];
    },
    enabled: !!currentUserId,
    staleTime: 60_000,
  });

  // Group by date
  const grouped = new Map<string, any[]>();
  for (const t of upcoming) {
    const day = new Date((t as any).due_date).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(t);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-2 py-1.5">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">Next 7 Days</div>
        {upcoming.length === 0 ? (
          <div className="px-1 py-2 text-[11px] text-slate-400">No upcoming tasks</div>
        ) : (
          [...grouped.entries()].map(([day, tasks]) => (
            <div key={day} className="mb-2">
              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 px-1 py-0.5">{day}</div>
              {tasks.map((t: any) => {
                const prefix = t.projects?.identifier_prefix || "";
                const identifier = prefix ? `${prefix}-${t.task_number}` : `#${t.task_number}`;
                return (
                  <div key={t.id} onClick={() => onSelectTask(t.id)} className="flex items-start gap-2 px-1 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                    <CalendarDays size={11} className="text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate">{t.title}</div>
                      <div className="text-[10px] text-slate-400">{identifier}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
