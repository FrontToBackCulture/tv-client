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
  GitBranch,
  MailPlus,
  GalleryHorizontalEnd,
  FileText,
  ChevronRight,
  ChevronDown,
  Cloud,
  Database,
  CalendarDays,
  MoreHorizontal,
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
} from "lucide-react";
import { cn } from "../lib/cn";
import { ModuleId } from "../stores/appStore";
import { useActivityBarStore } from "../stores/activityBarStore";
import { openModuleInNewWindow } from "../lib/windowManager";
import { UserProfile } from "../components/UserProfile";
import { useModuleVisibilityStore } from "../stores/moduleVisibilityStore";
import { useTeamConfigStore } from "../stores/teamConfigStore";
import { useModeStore } from "../stores/modeStore";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useCurrentUserId } from "../hooks/work/useUsers";

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
];

// Items hidden behind "More" flyout in Platform section
const moreItems: NavItem[] = [
  { id: "product", icon: Boxes, label: "Product", shortcut: "\u23184" },
  { id: "scheduler", icon: Clock, label: "Scheduler", shortcut: "\u23189" },
  { id: "repos", icon: GitBranch, label: "Repos", shortcut: "" },
  { id: "s3browser", icon: Cloud, label: "S3 Browser", shortcut: "" },
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

function ActivityBarContextMenu({ menu, onClose, onModuleChange }: { menu: ContextMenuState; onClose: () => void; onModuleChange: (module: ModuleId) => void }) {
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header (expanded mode)
// ---------------------------------------------------------------------------

function SectionHeader({ label, collapsed, onToggle }: { label: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full px-3 pt-3 pb-1 flex items-center gap-1.5 group cursor-pointer"
    >
      <ChevronRight
        size={10}
        className={cn(
          "text-slate-400 dark:text-slate-500 transition-transform duration-150 shrink-0",
          !collapsed && "rotate-90"
        )}
      />
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
        {label}
      </span>
    </button>
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
  onModuleChange,
  onContextMenu,
}: {
  item: NavItem;
  isActive: boolean;
  isExpanded: boolean;
  badge?: number;
  onModuleChange: (id: ModuleId) => void;
  onContextMenu: (e: React.MouseEvent, item: NavItem) => void;
}) {
  const Icon = item.icon;

  if (!isExpanded) {
    return (
      <Tooltip label={item.label} shortcut={item.shortcut} show>
        <div className="relative">
          <button
            key={item.id}
            data-help-id={`activity-bar-${item.id}`}
            onClick={() => onModuleChange(item.id)}
            onContextMenu={(e) => onContextMenu(e, item)}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150",
              isActive
                ? "bg-teal-600 dark:bg-teal-600 text-white shadow-sm shadow-teal-600/20 dark:shadow-teal-500/15"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
            )}
          >
            <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
          </button>
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
    <button
      key={item.id}
      data-help-id={`activity-bar-${item.id}`}
      onClick={() => onModuleChange(item.id)}
      onContextMenu={(e) => onContextMenu(e, item)}
      className={cn(
        "w-full h-8 flex items-center gap-2.5 px-2.5 rounded-lg transition-all duration-150",
        isActive
          ? "bg-teal-600 dark:bg-teal-600 text-white shadow-sm shadow-teal-600/20 dark:shadow-teal-500/15"
          : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
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
          isActive ? "text-teal-200" : "text-slate-400 dark:text-slate-600"
        )}>
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// More flyout
// ---------------------------------------------------------------------------

function MoreFlyout({
  items,
  activeModule,
  isExpanded,
  onModuleChange,
  onContextMenu,
}: {
  items: NavItem[];
  activeModule: ModuleId;
  isExpanded: boolean;
  onModuleChange: (id: ModuleId) => void;
  onContextMenu: (e: React.MouseEvent, item: NavItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasActiveItem = items.some((item) => item.id === activeModule);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {isExpanded ? (
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "w-full h-8 flex items-center gap-2.5 px-2.5 rounded-lg transition-colors",
            "hover:bg-slate-200/60 dark:hover:bg-slate-800/60",
            hasActiveItem
              ? "text-teal-600 dark:text-teal-400"
              : "text-slate-500 dark:text-slate-400"
          )}
        >
          <MoreHorizontal size={16} className="shrink-0" />
          <span className="text-[13px] truncate flex-1 text-left">More</span>
          <ChevronRight
            size={11}
            className={cn("shrink-0 transition-transform text-slate-400", open && "rotate-90")}
          />
        </button>
      ) : (
        <Tooltip label="More modules" show>
          <button
            onClick={() => setOpen(!open)}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
              "hover:bg-slate-200/60 dark:hover:bg-slate-800/60",
              hasActiveItem
                ? "text-teal-600 dark:text-teal-400"
                : "text-slate-500 dark:text-slate-400"
            )}
          >
            <MoreHorizontal size={18} />
          </button>
        </Tooltip>
      )}

      {open && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg py-1 min-w-[200px]"
          style={{
            left: ref.current ? ref.current.getBoundingClientRect().right + 6 : 0,
            bottom: ref.current
              ? window.innerHeight - ref.current.getBoundingClientRect().bottom
              : 0,
          }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onModuleChange(item.id);
                  setOpen(false);
                }}
                onContextMenu={(e) => {
                  onContextMenu(e, item);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors",
                  "hover:bg-slate-100 dark:hover:bg-slate-800",
                  isActive
                    ? "text-teal-600 dark:text-teal-400 bg-slate-50 dark:bg-slate-800/50"
                    : "text-slate-700 dark:text-slate-300"
                )}
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.shortcut && (
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600 shrink-0">
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
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

  // Chat unread badge — count conversations with activity after user's last read position
  const currentUserId = useCurrentUserId();
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

  const toggleSection = useCallback((label: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem("tv-client-collapsed-sections", JSON.stringify(next));
      return next;
    });
  }, []);

  // Filter sections to exclude hidden modules
  const filteredSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => isModuleVisible(item.id)),
      }))
      .filter((section) => section.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModuleVisible, hiddenModules, teamConfig, activeMode]);

  const filteredMoreItems = useMemo(() => {
    return moreItems.filter((item) => isModuleVisible(item.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModuleVisible, hiddenModules, teamConfig, activeMode]);

  const handleContextMenu = (e: React.MouseEvent, item: NavItem) => {
    e.preventDefault();
    setContextMenu({ moduleId: item.id, label: item.label, x: e.clientX, y: e.clientY });
  };

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
      className="bg-slate-50 dark:bg-slate-900 flex flex-col py-2 gap-0.5 overflow-hidden select-none flex-shrink-0 items-stretch px-1.5 relative"
      style={{
        width: sidebarWidth,
        // Workspace-color tint layered over the base background-color set
        // by Tailwind. Matches the title bar tint so both surfaces read as
        // the same workspace at a glance. The `--workspace-accent-rgb` var
        // is set on :root by the Shell's useWorkspaceAccent hook.
        backgroundImage: `linear-gradient(rgba(var(--workspace-accent-rgb), 0.12), rgba(var(--workspace-accent-rgb), 0.12))`,
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
            const isCollapsed = !!collapsedSections[section.label];
            const containsActive = section.items.some((item) => item.id === activeModule);
            const showItems = !isCollapsed || containsActive;

            return (
              <div key={section.label}>
                {isExpanded ? (
                  <SectionHeader
                    label={section.label}
                    collapsed={isCollapsed}
                    onToggle={() => toggleSection(section.label)}
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
                    {section.items.map((item) => (
                      <NavButton
                        key={item.id}
                        item={item}
                        isActive={activeModule === item.id}
                        isExpanded={isExpanded}
                        badge={item.id === "chat" ? chatUnreadCount : undefined}
                        onModuleChange={onModuleChange}
                        onContextMenu={handleContextMenu}
                      />
                    ))}
                    {/* More flyout — at the end of Platform section */}
                    {section.label === "Platform" && filteredMoreItems.length > 0 && (
                      <MoreFlyout
                        items={filteredMoreItems}
                        activeModule={activeModule}
                        isExpanded={isExpanded}
                        onModuleChange={onModuleChange}
                        onContextMenu={handleContextMenu}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

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
        <ActivityBarContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onModuleChange={onModuleChange} />
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
