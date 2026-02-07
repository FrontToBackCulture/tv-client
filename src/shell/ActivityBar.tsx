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
  Book,
} from "lucide-react";
import { cn } from "../lib/cn";
import { ModuleId } from "../stores/appStore";
import { useSidePanelStore } from "../stores/sidePanelStore";
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

const navItems: NavItem[] = [
  { id: "library", icon: Library, label: "Library", shortcut: "⌘1" },
  { id: "crm", icon: Building2, label: "CRM", shortcut: "⌘2" },
  { id: "work", icon: CheckSquare, label: "Work", shortcut: "⌘3" },
  { id: "product", icon: Boxes, label: "Product", shortcut: "⌘4" },
  { id: "bot", icon: Bot, label: "Bots", shortcut: "⌘5" },
  { id: "inbox", icon: Mail, label: "Inbox", shortcut: "⌘6" },
  { id: "system", icon: Book, label: "System", shortcut: "⌘7" },
];

// Bottom items (settings, etc.)
const bottomItems: NavItem[] = [
  { id: "settings", icon: Settings, label: "Settings", shortcut: "⌘," },
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
      className="fixed z-50 min-w-[200px] bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-700 shadow-xl py-1"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        onClick={() => {
          openModuleInNewWindow(menu.moduleId);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
      >
        <ExternalLink size={14} />
        Open {menu.label} in New Window
      </button>
    </div>
  );
}

export function ActivityBar({ activeModule, onModuleChange }: ActivityBarProps) {
  const sidePanelOpen = useSidePanelStore((s) => s.isOpen);
  const togglePanel = useSidePanelStore((s) => s.togglePanel);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = (e: React.MouseEvent, item: NavItem) => {
    e.preventDefault();
    setContextMenu({ moduleId: item.id, label: item.label, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="w-12 bg-slate-100 dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 flex flex-col items-center py-2 gap-1">
      {/* Module navigation */}
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeModule === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onModuleChange(item.id)}
            onContextMenu={(e) => handleContextMenu(e, item)}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-zinc-600 dark:text-zinc-400",
              "hover:bg-slate-200 dark:hover:bg-zinc-800",
              isActive && "bg-slate-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
            )}
            title={`${item.label} (${item.shortcut})`}
          >
            <Icon size={20} />
          </button>
        );
      })}

      {/* Side document panel toggle — visible in Work/CRM/Inbox */}
      {activeModule !== "library" && (
        <>
          <div className="w-6 border-t border-slate-300 dark:border-zinc-700 my-1" />
          <button
            onClick={togglePanel}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-zinc-600 dark:text-zinc-400",
              "hover:bg-slate-200 dark:hover:bg-zinc-800",
              sidePanelOpen && "bg-slate-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
            )}
            title="Toggle Document Panel (⌘.)"
          >
            <PanelRight size={20} />
          </button>
        </>
      )}

      {/* Spacer to push bottom items down */}
      <div className="flex-1" />

      {/* Bottom navigation (settings) */}
      {bottomItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeModule === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onModuleChange(item.id)}
            onContextMenu={(e) => handleContextMenu(e, item)}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-zinc-600 dark:text-zinc-400",
              "hover:bg-slate-200 dark:hover:bg-zinc-800",
              isActive && "bg-slate-200 dark:bg-zinc-800 text-teal-600 dark:text-teal-400"
            )}
            title={`${item.label} (${item.shortcut})`}
          >
            <Icon size={20} />
          </button>
        );
      })}

      {/* User profile */}
      <UserProfile collapsed />

      {/* Context menu overlay */}
      {contextMenu && (
        <ActivityBarContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}
