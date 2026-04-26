// src/modules/shared-inbox/SharedInboxModule.tsx

import { useState, useEffect, useMemo } from "react";
import { cn } from "../../lib/cn";
import { PanelLeftOpen, RefreshCw } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { useSharedMailboxes, useSharedEmails, useSharedEmailBody, useSyncSharedMailbox } from "../../hooks/useSharedInbox";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useCollapsiblePanel } from "../../hooks/useCollapsiblePanel";
import { formatError } from "../../lib/formatError";
import { MailboxSidebar, type FolderFilter } from "./MailboxSidebar";
import { SharedEmailList } from "./SharedEmailList";
import { SharedEmailDetail } from "./SharedEmailDetail";

export function SharedInboxModule() {
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useCollapsiblePanel("tv-shared-inbox-sidebar-collapsed");

  // Data
  const { data: mailboxes = [], isLoading: isLoadingMailboxes } = useSharedMailboxes();
  const syncMailbox = useSyncSharedMailbox();

  // Selection state
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderFilter>("all");

  // Auto-select first mailbox
  useEffect(() => {
    if (mailboxes.length > 0 && !selectedMailboxId) {
      setSelectedMailboxId(mailboxes[0].id);
    }
  }, [mailboxes, selectedMailboxId]);

  // Emails for selected mailbox
  const { data: emails = [], isLoading: isLoadingEmails } = useSharedEmails(selectedMailboxId || undefined);

  // Filter by folder
  const filteredEmails = useMemo(
    () => selectedFolder === "all" ? emails : emails.filter((e) => e.folder_name === selectedFolder),
    [emails, selectedFolder],
  );

  // Auto-select first email
  useEffect(() => {
    if (filteredEmails.length > 0 && !selectedEmailId) {
      setSelectedEmailId(filteredEmails[0].id);
    }
  }, [filteredEmails, selectedEmailId]);

  // Clear email selection when mailbox or folder changes
  useEffect(() => {
    setSelectedEmailId(null);
  }, [selectedMailboxId, selectedFolder]);

  // Email body
  const { data: emailBody = "", isLoading: isLoadingBody } = useSharedEmailBody(selectedEmailId);

  // Get selected email object
  const selectedEmail = useMemo(
    () => filteredEmails.find((e) => e.id === selectedEmailId),
    [filteredEmails, selectedEmailId],
  );

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  const selectedMailbox = mailboxes.find((m) => m.id === selectedMailboxId);
  useEffect(() => {
    setViewContext("shared-inbox", selectedMailbox ? selectedMailbox.label : "No mailbox");
  }, [selectedMailbox, setViewContext]);

  const handleRefresh = () => {
    syncMailbox.mutate(selectedMailboxId || undefined);
  };

  const isSyncing = syncMailbox.isPending;

  // Empty state: no mailboxes
  if (!isLoadingMailboxes && mailboxes.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <PageHeader description="Shared email inboxes visible to all workspace users." />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mx-auto mb-4">
              <RefreshCw size={24} className="text-zinc-400" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
              No shared mailboxes
            </h3>
            <p className="text-sm text-zinc-500">
              An admin needs to add a shared mailbox in Settings to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader description="Shared email inboxes visible to all workspace users." />

      {/* Sync status bar */}
      {(isSyncing || syncMailbox.error) && (
        <div
          className={cn(
            "px-4 py-1.5 text-xs flex items-center gap-2 flex-shrink-0",
            syncMailbox.error
              ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
              : "bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400",
          )}
        >
          {isSyncing && (
            <>
              <RefreshCw size={12} className="animate-spin" />
              Syncing...
            </>
          )}
          {syncMailbox.error && (
            <span>Sync error: {formatError(syncMailbox.error)}</span>
          )}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        {sidebarCollapsed ? (
          <div className="w-10 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex flex-col items-center py-2">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              title="Expand panel"
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        ) : (
          <MailboxSidebar
            mailboxes={mailboxes}
            selectedId={selectedMailboxId}
            onSelect={setSelectedMailboxId}
            selectedFolder={selectedFolder}
            onFolderChange={setSelectedFolder}
            onRefresh={handleRefresh}
            isRefreshing={isSyncing}
            onCollapse={toggleSidebar}
          />
        )}

        {/* Email List */}
        <SharedEmailList
          emails={filteredEmails}
          selectedId={selectedEmailId}
          onSelect={setSelectedEmailId}
          isLoading={isLoadingEmails}
        />

        {/* Email Detail */}
        <SharedEmailDetail
          email={selectedEmail}
          body={emailBody}
          isLoading={isLoadingBody}
        />
      </div>
    </div>
  );
}
