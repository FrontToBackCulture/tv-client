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
  Settings,
  PanelRight,
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
} from "lucide-react";
import { cn } from "../lib/cn";
import { ModuleId, useAppStore } from "../stores/appStore";
import { useSidePanelStore } from "../stores/sidePanelStore";
import { useActivityBarStore } from "../stores/activityBarStore";
import { openModuleInNewWindow } from "../lib/windowManager";
import { UserProfile } from "../components/UserProfile";
import { NotificationBell } from "../components/notifications/NotificationBell";
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
      { id: "projects", icon: FolderOpen, label: "Projects", shortcut: "⌘1" },
      { id: "library", icon: Library, label: "Library", shortcut: "⌘2" },
      { id: "domains", icon: Globe, label: "Domains", shortcut: "⌘3" },
      { id: "inbox", icon: Mail, label: "Inbox", shortcut: "" },
    ],
  },
  {
    label: "Product",
    items: [
      { id: "product", icon: Boxes, label: "Product", shortcut: "⌘4" },
      { id: "metadata", icon: Library, label: "Metadata", shortcut: "⌘5" },
      { id: "gallery", icon: GalleryHorizontalEnd, label: "Gallery", shortcut: "⌘6" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { id: "email", icon: MailPlus, label: "EDM", shortcut: "" },
      { id: "blog", icon: FileText, label: "Blog", shortcut: "" },
      { id: "portal", icon: Headset, label: "Portal", shortcut: "" },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "bot", icon: Bot, label: "Bots", shortcut: "⌘7" },
      { id: "skills", icon: Puzzle, label: "Skills", shortcut: "⌘8" },
      { id: "scheduler", icon: Clock, label: "Scheduler", shortcut: "⌘9" },
      { id: "repos", icon: GitBranch, label: "Repos", shortcut: "" },
      { id: "s3browser", icon: Cloud, label: "S3 Browser", shortcut: "" },
    ],
  },
];


interface ContextMenuState {
  moduleId: ModuleId;
  label: string;
  x: number;
  y: number;
}

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
      className="fixed z-50 min-w-[200px] bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-xl py-1"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        onClick={() => {
          openModuleInNewWindow(menu.moduleId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <ExternalLink size={14} />
        Open {menu.label} in New Window
      </button>
    </div>
  );
}

function SectionHeader({ label, collapsed, onToggle }: { label: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full px-3 pt-2 pb-1 flex items-center gap-1 group cursor-pointer"
    >
      <ChevronRight
        size={10}
        className={cn(
          "text-zinc-400 dark:text-zinc-500 transition-transform shrink-0",
          !collapsed && "rotate-90"
        )}
      />
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
        {label}
      </span>
    </button>
  );
}

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
      <button
        key={item.id}
        data-help-id={`activity-bar-${item.id}`}
        onClick={() => onModuleChange(item.id)}
        onContextMenu={(e) => onContextMenu(e, item)}
        className={cn(
          "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
          "hover:bg-zinc-200 dark:hover:bg-zinc-800",
          isActive
            ? "bg-zinc-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
            : "text-zinc-600 dark:text-zinc-400"
        )}
        title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ""}`}
      >
        <Icon size={20} />
      </button>
    );
  }

  return (
    <button
      key={item.id}
      data-help-id={`activity-bar-${item.id}`}
      onClick={() => onModuleChange(item.id)}
      onContextMenu={(e) => onContextMenu(e, item)}
      className={cn(
        "w-full h-9 flex items-center gap-2.5 px-3 rounded-lg transition-colors",
        "hover:bg-zinc-200 dark:hover:bg-zinc-800",
        isActive
          ? "bg-zinc-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
          : "text-zinc-600 dark:text-zinc-400"
      )}
      title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ""}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="text-sm truncate flex-1 text-left">{item.label}</span>
      {item.shortcut && (
        <span className="text-xs text-zinc-400 dark:text-zinc-600 shrink-0">{item.shortcut}</span>
      )}
    </button>
  );
}

export function ActivityBar({ activeModule, onModuleChange }: ActivityBarProps) {
  const sidePanelOpen = useSidePanelStore((s) => s.isOpen);
  const togglePanel = useSidePanelStore((s) => s.togglePanel);
  const isExpanded = useActivityBarStore((s) => s.isExpanded);
  const toggleExpanded = useActivityBarStore((s) => s.toggleExpanded);
  const openSettings = useAppStore((s) => s.openSettings);
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

  // Filter sections to exclude hidden modules (team config takes precedence over local storage)
  // hiddenModules and teamConfig are deps to trigger re-render when either changes
  const filteredSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => isModuleVisible(item.id)),
      }))
      .filter((section) => section.items.length > 0);
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
        "bg-zinc-100 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col py-2 gap-0.5 transition-all duration-200 overflow-hidden select-none",
        isExpanded ? "w-48 items-stretch px-1.5" : "w-12 items-center"
      )}
    >
      {/* Title / Home button + collapse toggle */}
      {isExpanded ? (
        <div className="flex items-center gap-0.5 mb-1">
          <button
            onClick={() => onModuleChange("home")}
            className={cn(
              "flex-1 h-9 flex items-center gap-2.5 px-3 rounded-lg transition-colors",
              "hover:bg-zinc-200 dark:hover:bg-zinc-800",
              activeModule === "home"
                ? "text-teal-600 dark:text-teal-400"
                : "text-zinc-600 dark:text-zinc-400"
            )}
            title="Home"
          >
            <Home size={18} className="shrink-0" />
            <span className="text-sm font-medium truncate">TV Desktop</span>
          </button>
          <button
            onClick={toggleExpanded}
            className="h-9 w-8 flex items-center justify-center rounded-lg transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 shrink-0"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5 mb-1">
          <button
            onClick={() => onModuleChange("home")}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
              "hover:bg-zinc-200 dark:hover:bg-zinc-800",
              activeModule === "home"
                ? "text-teal-600 dark:text-teal-400"
                : "text-zinc-600 dark:text-zinc-400"
            )}
            title="Home"
          >
            <Home size={20} />
          </button>
          <button
            onClick={toggleExpanded}
            className="w-10 h-6 flex items-center justify-center rounded-lg transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            title="Expand sidebar"
          >
            <PanelLeft size={14} />
          </button>
        </div>
      )}

      {/* Module sections */}
      {filteredSections.map((section, i) => {
        const isCollapsed = !!collapsedSections[section.label];
        // Always show section if it contains the active module (even if collapsed)
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
              i > 0 && <div className="w-6 border-t border-zinc-300 dark:border-zinc-700 my-1 mx-auto" />
            )}
            {showItems && section.items.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                isActive={activeModule === item.id}
                isExpanded={isExpanded}
                onModuleChange={onModuleChange}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        );
      })}

      {/* Spacer to push bottom items down */}
      <div className="flex-1" />

      {/* Doc panel toggle — utility feature, not a module */}
      {activeModule !== "library" && (
        isExpanded ? (
          <button
            onClick={togglePanel}
            className={cn(
              "w-full h-9 flex items-center gap-2.5 px-3 rounded-lg transition-colors",
              "hover:bg-zinc-200 dark:hover:bg-zinc-800",
              sidePanelOpen
                ? "bg-zinc-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
                : "text-zinc-600 dark:text-zinc-400"
            )}
            title="Toggle Document Panel (⌘.)"
          >
            <PanelRight size={18} className="shrink-0" />
            <span className="text-sm truncate flex-1 text-left">Doc Panel</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-600 shrink-0">⌘.</span>
          </button>
        ) : (
          <button
            onClick={togglePanel}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-zinc-600 dark:text-zinc-400",
              "hover:bg-zinc-200 dark:hover:bg-zinc-800",
              sidePanelOpen && "bg-zinc-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
            )}
            title="Toggle Document Panel (⌘.)"
          >
            <PanelRight size={20} />
          </button>
        )
      )}

      {/* Notification bell */}
      <NotificationBell collapsed={!isExpanded} />

      {/* Settings button */}
      {isExpanded ? (
        <button
          data-help-id="activity-bar-settings"
          onClick={() => openSettings()}
          className="w-full h-9 flex items-center gap-2.5 px-3 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          title="Settings (⌘,)"
        >
          <Settings size={18} className="shrink-0" />
          <span className="text-sm truncate flex-1 text-left">Settings</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-600 shrink-0">⌘,</span>
        </button>
      ) : (
        <button
          data-help-id="activity-bar-settings"
          onClick={() => openSettings()}
          className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          title="Settings (⌘,)"
        >
          <Settings size={20} />
        </button>
      )}

      {/* User profile */}
      <UserProfile collapsed={!isExpanded} />

      {/* Context menu overlay */}
      {contextMenu && (
        <ActivityBarContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}
