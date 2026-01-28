// src/modules/inbox/InboxSidebar.tsx

import { cn } from "../../lib/cn";
import {
  Inbox,
  Archive,
  Send,
  AlertCircle,
  Building2,
  Handshake,
  UserPlus,
  Users,
  Package,
  VolumeX,
  RefreshCw,
} from "lucide-react";
import type { EmailCategory, EmailStatus } from "../../hooks/useOutlook";

interface InboxSidebarProps {
  selectedFolder: string;
  selectedCategory: EmailCategory | null;
  selectedStatus: EmailStatus | null;
  onFolderChange: (folder: string) => void;
  onCategoryChange: (category: EmailCategory | null) => void;
  onStatusChange: (status: EmailStatus | null) => void;
  stats: {
    total: number;
    unread: number;
    inbox: number;
    archived: number;
    actionRequired: number;
    byCategory: Record<string, number>;
  };
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function InboxSidebar({
  selectedFolder,
  selectedCategory,
  selectedStatus,
  onFolderChange,
  onCategoryChange,
  onStatusChange,
  stats,
  onRefresh,
  isRefreshing,
}: InboxSidebarProps) {
  const folders = [
    { id: "Inbox", icon: Inbox, count: stats.inbox },
    { id: "Sent Items", icon: Send, count: 0 },
    { id: "Archive", icon: Archive, count: stats.archived },
  ];

  const categories: { id: EmailCategory; label: string; icon: typeof Building2; color: string }[] = [
    { id: "client", label: "Clients", icon: Building2, color: "text-blue-500" },
    { id: "deal", label: "Deals", icon: Handshake, color: "text-green-500" },
    { id: "lead", label: "Leads", icon: UserPlus, color: "text-purple-500" },
    { id: "internal", label: "Internal", icon: Users, color: "text-zinc-500" },
    { id: "vendor", label: "Vendors", icon: Package, color: "text-orange-500" },
    { id: "noise", label: "Noise", icon: VolumeX, color: "text-zinc-400" },
  ];

  return (
    <div className="w-56 border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Inbox</h2>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-500"
              title="Refresh emails"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            </button>
          )}
        </div>
        {stats.unread > 0 && (
          <p className="text-xs text-zinc-500 mt-1">{stats.unread} unread</p>
        )}
      </div>

      {/* Action Required */}
      {stats.actionRequired > 0 && (
        <div className="p-2">
          <button
            onClick={() => {
              onCategoryChange(null);
              onStatusChange("inbox");
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
              "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400",
              "hover:bg-amber-100 dark:hover:bg-amber-900/30"
            )}
          >
            <AlertCircle size={16} />
            <span>Action Required</span>
            <span className="ml-auto text-xs font-medium">{stats.actionRequired}</span>
          </button>
        </div>
      )}

      {/* Folders */}
      <div className="p-2">
        <h3 className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Folders
        </h3>
        {folders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => {
              onFolderChange(folder.id);
              onCategoryChange(null);
              onStatusChange(null);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
              selectedFolder === folder.id && !selectedCategory && !selectedStatus
                ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            )}
          >
            <folder.icon size={16} />
            <span>{folder.id}</span>
            {folder.count > 0 && (
              <span className="ml-auto text-xs text-zinc-500">{folder.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Categories */}
      <div className="p-2 flex-1 overflow-y-auto">
        <h3 className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Categories
        </h3>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              onCategoryChange(cat.id);
              onStatusChange(null);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
              selectedCategory === cat.id
                ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            )}
          >
            <cat.icon size={16} className={cat.color} />
            <span>{cat.label}</span>
            {stats.byCategory[cat.id] > 0 && (
              <span className="ml-auto text-xs text-zinc-500">
                {stats.byCategory[cat.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Starred / Filters */}
      <div className="p-2 border-t border-slate-200 dark:border-zinc-800">
        <button
          onClick={() => {
            onStatusChange("archived");
            onCategoryChange(null);
          }}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            selectedStatus === "archived"
              ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
              : "text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
          )}
        >
          <Archive size={16} />
          <span>Archived</span>
          <span className="ml-auto text-xs text-zinc-500">{stats.archived}</span>
        </button>
      </div>
    </div>
  );
}
