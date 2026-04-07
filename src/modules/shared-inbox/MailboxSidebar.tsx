// src/modules/shared-inbox/MailboxSidebar.tsx

import { cn } from "../../lib/cn";
import { Mail, Send, Inbox, RefreshCw, PanelLeftClose, AlertTriangle } from "lucide-react";
import { IconButton } from "../../components/ui";
import type { SharedMailbox } from "../../hooks/useSharedInbox";
import { formatDateRelative } from "../../lib/date";

export type FolderFilter = "all" | "Inbox" | "Sent Items";

interface MailboxSidebarProps {
  mailboxes: SharedMailbox[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedFolder: FolderFilter;
  onFolderChange: (folder: FolderFilter) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onCollapse?: () => void;
}

const FOLDERS: { id: FolderFilter; label: string; icon: typeof Mail }[] = [
  { id: "all", label: "All Mail", icon: Mail },
  { id: "Inbox", label: "Inbox", icon: Inbox },
  { id: "Sent Items", label: "Sent", icon: Send },
];

export function MailboxSidebar({
  mailboxes,
  selectedId,
  onSelect,
  selectedFolder,
  onFolderChange,
  onRefresh,
  isRefreshing,
  onCollapse,
}: MailboxSidebarProps) {
  return (
    <div className="w-56 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {onCollapse && (
              <button
                onClick={onCollapse}
                className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
                title="Collapse panel"
              >
                <PanelLeftClose size={12} />
              </button>
            )}
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Mailboxes</h2>
          </div>
          <IconButton
            icon={RefreshCw}
            size={14}
            label="Sync all"
            onClick={onRefresh}
            disabled={isRefreshing}
            className={isRefreshing ? "[&>svg]:animate-spin" : ""}
          />
        </div>
      </div>

      {/* Mailbox List */}
      <div className="p-2">
        {mailboxes.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-sm">
            No shared mailboxes configured
          </div>
        ) : (
          mailboxes.map((mb) => (
            <button
              key={mb.id}
              onClick={() => onSelect(mb.id)}
              className={cn(
                "w-full flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors mb-1",
                selectedId === mb.id
                  ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
              )}
            >
              <Mail size={16} className="mt-0.5 flex-shrink-0" />
              <div className="min-w-0 text-left">
                <div className="font-medium truncate">{mb.label}</div>
                <div className="text-xs text-zinc-500 truncate">{mb.email_address}</div>
                {mb.last_sync_error ? (
                  <div className="flex items-center gap-1 text-xs text-red-500 mt-0.5">
                    <AlertTriangle size={10} />
                    <span className="truncate">Sync error</span>
                  </div>
                ) : mb.last_synced_at ? (
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Synced {formatDateRelative(mb.last_synced_at)}
                  </div>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Folder Filter */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800">
        <h3 className="px-3 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Folders
        </h3>
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onFolderChange(f.id)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
              selectedFolder === f.id
                ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
            )}
          >
            <f.icon size={16} />
            <span>{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
