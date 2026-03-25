// src/shell/ActivityBar.tsx

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Home,
  Library,
  FolderOpen,
  Mail,
  Globe,
  Boxes,
  Bot,
  ExternalLink,
  LucideIcon,
  Headset,
  Clock,
  Puzzle,
  GitBranch,
  MailPlus,
  GalleryHorizontalEnd,
  PanelLeftClose,
  PanelLeft,
  FileText,
  ChevronRight,
  Cloud,
  CalendarDays,
  MoreHorizontal,
  Linkedin,
  Target,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "../lib/cn";
import { ModuleId } from "../stores/appStore";
import { useActivityBarStore } from "../stores/activityBarStore";
import { openModuleInNewWindow } from "../lib/windowManager";
import { UserProfile } from "../components/UserProfile";
import { useModuleVisibilityStore } from "../stores/moduleVisibilityStore";
import { useTeamConfigStore } from "../stores/teamConfigStore";

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
    ],
  },
  {
    label: "Comms",
    items: [
      { id: "inbox", icon: Mail, label: "Inbox", shortcut: "" },
      { id: "calendar", icon: CalendarDays, label: "Calendar", shortcut: "" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { id: "prospecting", icon: Target, label: "Outbound", shortcut: "" },
      { id: "email", icon: MailPlus, label: "EDM", shortcut: "" },
      { id: "blog", icon: FileText, label: "Blog", shortcut: "" },
      { id: "gallery", icon: GalleryHorizontalEnd, label: "Gallery", shortcut: "\u23186" },
      { id: "portal", icon: Headset, label: "Portal", shortcut: "" },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "domains", icon: Globe, label: "Domains", shortcut: "\u23183" },
      { id: "skills", icon: Puzzle, label: "Skills", shortcut: "\u23188" },
    ],
  },
];

// Items hidden behind "More" flyout in Platform section
const moreItems: NavItem[] = [
  { id: "bot", icon: Bot, label: "Bots", shortcut: "\u23187" },
  { id: "linkedin", icon: Linkedin, label: "LinkedIn", shortcut: "" },
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

function ActivityBarContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
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
      className="fixed z-50 min-w-[200px] bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl py-1"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        onClick={() => {
          openModuleInNewWindow(menu.moduleId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <ExternalLink size={14} />
        Open {menu.label} in New Window
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
  onModuleChange,
  onContextMenu,
}: {
  item: NavItem;
  isActive: boolean;
  isExpanded: boolean;
  onModuleChange: (id: ModuleId) => void;
  onContextMenu: (e: React.MouseEvent, item: NavItem) => void;
}) {
  const Icon = item.icon;

  if (!isExpanded) {
    return (
      <Tooltip label={item.label} shortcut={item.shortcut} show>
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
      {item.shortcut && (
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
          className="fixed z-50 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl py-1 min-w-[200px]"
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
  const toggleExpanded = useActivityBarStore((s) => s.toggleExpanded);
  const isModuleVisible = useModuleVisibilityStore((s) => s.isModuleVisible);
  const hiddenModules = useModuleVisibilityStore((s) => s.hiddenModules);
  const teamConfig = useTeamConfigStore((s) => s.config);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
  }, [isModuleVisible, hiddenModules, teamConfig]);

  const filteredMoreItems = useMemo(() => {
    return moreItems.filter((item) => isModuleVisible(item.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModuleVisible, hiddenModules, teamConfig]);

  const handleContextMenu = (e: React.MouseEvent, item: NavItem) => {
    e.preventDefault();
    setContextMenu({ moduleId: item.id, label: item.label, x: e.clientX, y: e.clientY });
  };

  return (
    <div
      data-help-id="activity-bar"
      className={cn(
        "bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col py-2 gap-0.5 transition-all duration-200 overflow-hidden select-none",
        isExpanded ? "w-48 items-stretch px-1.5" : "w-[52px] items-center px-1.5"
      )}
    >
      {/* Home + collapse toggle */}
      {isExpanded ? (
        <div className="flex items-center gap-0.5 mb-1">
          <button
            onClick={() => onModuleChange("home")}
            className={cn(
              "flex-1 h-8 flex items-center gap-2.5 px-2.5 rounded-lg transition-all duration-150",
              activeModule === "home"
                ? "bg-teal-600 dark:bg-teal-600 text-white shadow-sm shadow-teal-600/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
            )}
            title="Home"
          >
            <Home size={16} strokeWidth={activeModule === "home" ? 2.25 : 1.75} className="shrink-0" />
            <span className="text-[13px] font-medium truncate">TV Desktop</span>
          </button>
          <button
            onClick={toggleExpanded}
            className="h-8 w-7 flex items-center justify-center rounded-lg transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 shrink-0"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5 mb-1">
          <Tooltip label="Home" show>
            <button
              onClick={() => onModuleChange("home")}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150",
                activeModule === "home"
                  ? "bg-teal-600 dark:bg-teal-600 text-white shadow-sm shadow-teal-600/20"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
              )}
              title="Home"
            >
              <Home size={18} strokeWidth={activeModule === "home" ? 2.25 : 1.75} />
            </button>
          </Tooltip>
          <button
            onClick={toggleExpanded}
            className="w-9 h-5 flex items-center justify-center rounded transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
            title="Expand sidebar"
          >
            <PanelLeft size={13} />
          </button>
        </div>
      )}

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

      {/* Context menu overlay */}
      {contextMenu && (
        <ActivityBarContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}
