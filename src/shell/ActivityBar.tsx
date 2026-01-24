// src/shell/ActivityBar.tsx

import {
  Library,
  CheckSquare,
  Mail,
  Building2,
  Settings,
  LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn";
import { ModuleId } from "../stores/appStore";

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
  { id: "work", icon: CheckSquare, label: "Work", shortcut: "⌘2" },
  { id: "inbox", icon: Mail, label: "Inbox", shortcut: "⌘3" },
  { id: "crm", icon: Building2, label: "CRM", shortcut: "⌘4" },
  { id: "console", icon: Settings, label: "Console", shortcut: "⌘5" },
];

export function ActivityBar({ activeModule, onModuleChange }: ActivityBarProps) {
  return (
    <div className="w-12 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-2 gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeModule === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onModuleChange(item.id)}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
              "hover:bg-zinc-800",
              isActive && "bg-zinc-800 text-teal-400"
            )}
            title={`${item.label} (${item.shortcut})`}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </div>
  );
}
