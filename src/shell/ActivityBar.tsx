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
  { id: "work", icon: CheckSquare, label: "Work", shortcut: "⌘2" },
  { id: "crm", icon: Building2, label: "CRM", shortcut: "⌘3" },
  { id: "inbox", icon: Mail, label: "Inbox", shortcut: "⌘4" },
  { id: "console", icon: Settings, label: "Console", shortcut: "⌘5" },
];

export function ActivityBar({ activeModule, onModuleChange }: ActivityBarProps) {
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

      {/* Spacer to push user profile to bottom */}
      <div className="flex-1" />

      {/* User profile */}
      <UserProfile collapsed />
    </div>
  );
}
