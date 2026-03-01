// src/shell/ActivityBar.tsx

import { useState, useEffect, useRef } from "react";
import {
  Library,
  CheckSquare,
  Mail,
  Building2,
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
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "../lib/cn";
import { ModuleId, useAppStore } from "../stores/appStore";
import { useSidePanelStore } from "../stores/sidePanelStore";
import { useActivityBarStore } from "../stores/activityBarStore";
import { openModuleInNewWindow } from "../lib/windowManager";
import { UserProfile } from "../components/UserProfile";

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
  dimmed?: boolean;
}

const navSections: NavSection[] = [
  {
    label: "Business",
    items: [
      { id: "library", icon: Library, label: "Library", shortcut: "⌘1" },
      { id: "crm", icon: Building2, label: "CRM", shortcut: "⌘2" },
      { id: "work", icon: CheckSquare, label: "Work", shortcut: "⌘3" },
      { id: "product", icon: Boxes, label: "Product", shortcut: "⌘4" },
    ],
  },
  {
    label: "Technical",
    items: [
      { id: "bot", icon: Bot, label: "Bots", shortcut: "⌘5" },
      { id: "skills", icon: Puzzle, label: "Skills", shortcut: "⌘6" },
      { id: "scheduler", icon: Clock, label: "Scheduler", shortcut: "⌘7" },
      { id: "repos", icon: GitBranch, label: "Repos", shortcut: "⌘8" },
    ],
  },
  {
    label: "Coming Soon",
    dimmed: true,
    items: [
      { id: "inbox", icon: Mail, label: "Inbox", shortcut: "" },
      { id: "portal", icon: Headset, label: "Portal", shortcut: "" },
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

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="w-full px-3 pt-2 pb-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
    </div>
  );
}

function NavButton({
  item,
  isActive,
  isExpanded,
  dimmed,
  onModuleChange,
  onContextMenu,
}: {
  item: NavItem;
  isActive: boolean;
  isExpanded: boolean;
  dimmed?: boolean;
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
            : dimmed
              ? "text-zinc-400 dark:text-zinc-600"
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
          : dimmed
            ? "text-zinc-400 dark:text-zinc-600"
            : "text-zinc-600 dark:text-zinc-400"
      )}
      title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ""}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="text-sm truncate flex-1 text-left">{item.label}</span>
      {item.shortcut && (
        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0">{item.shortcut}</span>
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = (e: React.MouseEvent, item: NavItem) => {
    e.preventDefault();
    setContextMenu({ moduleId: item.id, label: item.label, x: e.clientX, y: e.clientY });
  };

  const ToggleIcon = isExpanded ? PanelLeftClose : PanelLeft;

  return (
    <div
      data-help-id="activity-bar"
      className={cn(
        "bg-zinc-100 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col py-2 gap-0.5 transition-all duration-200 overflow-hidden",
        isExpanded ? "w-48 items-stretch px-1.5" : "w-12 items-center"
      )}
    >
      {/* Toggle button */}
      {isExpanded ? (
        <button
          onClick={toggleExpanded}
          className="w-full h-9 flex items-center gap-2.5 px-3 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 mb-1"
          title="Collapse sidebar"
        >
          <ToggleIcon size={18} className="shrink-0" />
          <span className="text-sm font-medium truncate">TV Desktop</span>
        </button>
      ) : (
        <button
          onClick={toggleExpanded}
          className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 mb-1"
          title="Expand sidebar"
        >
          <ToggleIcon size={20} />
        </button>
      )}

      {/* Module sections */}
      {navSections.map((section, i) => (
        <div key={section.label}>
          {isExpanded ? (
            <SectionHeader label={section.label} />
          ) : (
            i > 0 && <div className="w-6 border-t border-zinc-300 dark:border-zinc-700 my-1 mx-auto" />
          )}
          {section.items.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeModule === item.id}
              isExpanded={isExpanded}
              dimmed={section.dimmed}
              onModuleChange={onModuleChange}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      ))}

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
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0">⌘.</span>
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
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0">⌘,</span>
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
