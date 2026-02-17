// src/modules/inbox/InboxModule.tsx

import { useState, useEffect, useMemo } from "react";
import {
  useEmails,
  useEmail,
  useEmailBody,
  useEmailStats,
  useMarkRead,
  useArchiveEmail,
  useOutlookAuth,
  useSyncStart,
} from "../../hooks/useOutlook";
import { useOutlookSync } from "../../hooks/useOutlookSync";
import { cn } from "../../lib/cn";
import { RefreshCw } from "lucide-react";
import { InboxSidebar } from "./InboxSidebar";
import { EmailList } from "./EmailList";
import { EmailDetail } from "./EmailDetail";
import { EmptyInbox } from "./EmptyInbox";
import { OutlookSetup } from "./OutlookSetup";
import type { EmailCategory, EmailStatus } from "../../hooks/useOutlook";
import { useViewContextStore } from "../../stores/viewContextStore";

export function InboxModule() {
  // Auth state
  const { data: auth, isLoading: isLoadingAuth } = useOutlookAuth();

  // Sync state
  const { isSyncing, progress: syncProgress, error: syncEventError } = useOutlookSync();
  const syncStart = useSyncStart();

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);

  // Filter state
  const [selectedFolder, setSelectedFolder] = useState("Inbox");
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<EmailStatus | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // Report current inbox view to help bot
  const inboxViewLabel = useMemo(() => {
    if (selectedCategory) return `Category: ${selectedCategory}`;
    if (selectedStatus) return `Status: ${selectedStatus}`;
    return `Folder: ${selectedFolder}`;
  }, [selectedFolder, selectedCategory, selectedStatus]);
  useEffect(() => {
    setViewContext("inbox", inboxViewLabel);
  }, [inboxViewLabel, setViewContext]);

  // Get emails with filters
  const { data: emails = [], isLoading, error: emailsError } = useEmails({
    folder: selectedCategory || selectedStatus ? undefined : selectedFolder,
    category: selectedCategory || undefined,
    status: selectedStatus || undefined,
  });

  // Log query errors
  if (emailsError) {
    console.error("[inbox] emails query error:", emailsError);
  }

  // Get selected email with body
  const { data: selectedEmail } = useEmail(selectedEmailId);
  const { data: emailBody = "", isLoading: isLoadingBody } = useEmailBody(selectedEmailId);

  // Get stats for sidebar
  const { data: stats } = useEmailStats();

  // Actions
  const markRead = useMarkRead();
  const archiveEmail = useArchiveEmail();

  // Auto-mark as read when email is selected
  useEffect(() => {
    if (selectedEmail && !selectedEmail.isRead) {
      markRead.mutate(selectedEmail.id);
    }
  }, [selectedEmail?.id]);

  // Select first email when list changes
  useEffect(() => {
    if (emails.length > 0 && !selectedEmailId) {
      setSelectedEmailId(emails[0].id);
    }
  }, [emails, selectedEmailId]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedEmailId(null);
  }, [selectedFolder, selectedCategory, selectedStatus]);

  const handleRefresh = () => {
    console.log("[inbox] handleRefresh called, invoking outlook_sync_start");
    syncStart.mutate(undefined, {
      onSuccess: (count) => {
        console.log("[inbox] sync success:", count, "emails");
      },
      onError: (err) => {
        console.error("[inbox] sync failed:", err);
      },
    });
  };

  const handleArchive = (emailId: string) => {
    archiveEmail.mutate(emailId);
    // Select next email
    const currentIndex = emails.findIndex((e) => e.id === emailId);
    if (currentIndex >= 0 && currentIndex < emails.length - 1) {
      setSelectedEmailId(emails[currentIndex + 1].id);
    } else if (currentIndex > 0) {
      setSelectedEmailId(emails[currentIndex - 1].id);
    } else {
      setSelectedEmailId(null);
    }
  };

  // Show loading while checking auth
  if (isLoadingAuth) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  // Show setup if not authenticated
  if (!auth?.isAuthenticated) {
    return <OutlookSetup />;
  }

  // Map stats
  const sidebarStats = {
    total: stats?.total ?? 0,
    unread: stats?.unread ?? 0,
    inbox: stats?.inbox ?? 0,
    archived: stats?.archived ?? 0,
    actionRequired: stats?.actionRequired ?? 0,
    byCategory: stats?.byCategory ?? {},
  };

  // Show empty state if no emails
  if (!isLoading && emails.length === 0 && !selectedCategory && !selectedStatus) {
    return (
      <div className="h-full flex">
        <InboxSidebar
          selectedFolder={selectedFolder}
          selectedCategory={selectedCategory}
          selectedStatus={selectedStatus}
          onFolderChange={setSelectedFolder}
          onCategoryChange={setSelectedCategory}
          onStatusChange={setSelectedStatus}
          stats={sidebarStats}
          onRefresh={handleRefresh}
          isRefreshing={isSyncing}
        />
        <EmptyInbox
          onRefresh={handleRefresh}
          isSyncing={isSyncing || syncStart.isPending}
          syncError={emailsError ? String(emailsError) : syncEventError || (syncStart.error ? String(syncStart.error) : null)}
          syncProgress={syncProgress}
        />
      </div>
    );
  }

  // Map selected email to the shape EmailDetail expects
  const emailForDetail = selectedEmail
    ? {
        id: selectedEmail.id,
        subject: selectedEmail.subject,
        from: { name: selectedEmail.fromName, email: selectedEmail.fromEmail },
        to: selectedEmail.toAddresses,
        cc: selectedEmail.ccAddresses,
        receivedAt: selectedEmail.receivedAt,
        isRead: selectedEmail.isRead,
        hasAttachments: selectedEmail.hasAttachments,
        classification: {
          category: selectedEmail.category as EmailCategory,
          priority: selectedEmail.priorityLevel as "high" | "medium" | "low",
          summary: selectedEmail.aiSummary || undefined,
          actionRequired: selectedEmail.actionRequired,
        },
        linkedCompanyId: selectedEmail.linkedCompanyId || undefined,
        linkedCompanyName: selectedEmail.linkedCompanyName || undefined,
        attachments: [],
      }
    : undefined;

  const isAnySyncing = isSyncing || syncStart.isPending;
  const syncErrorMsg = syncEventError || (syncStart.error ? String(syncStart.error) : null);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Sync status bar */}
      {(isAnySyncing || syncErrorMsg) && (
        <div className={cn(
          "px-4 py-1.5 text-xs flex items-center gap-2 flex-shrink-0",
          syncErrorMsg
            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
            : "bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400"
        )}>
          {isAnySyncing && !syncErrorMsg && (
            <>
              <RefreshCw size={12} className="animate-spin" />
              {syncProgress ? syncProgress.message : "Syncing..."}
            </>
          )}
          {syncErrorMsg && (
            <>
              <span>Sync error: {syncErrorMsg}</span>
              <button
                onClick={() => syncStart.reset()}
                className="ml-auto underline hover:no-underline"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <InboxSidebar
          selectedFolder={selectedFolder}
          selectedCategory={selectedCategory}
          selectedStatus={selectedStatus}
          onFolderChange={setSelectedFolder}
          onCategoryChange={setSelectedCategory}
          onStatusChange={setSelectedStatus}
          stats={sidebarStats}
          onRefresh={handleRefresh}
          isRefreshing={isAnySyncing}
        />

        {/* Email List */}
        <EmailList
          emails={emails}
          selectedId={selectedEmailId}
          onSelect={setSelectedEmailId}
          onArchive={handleArchive}
          onMarkRead={(id) => markRead.mutate(id)}
          isLoading={isLoading}
        />

        {/* Email Detail / Reading Pane */}
        <EmailDetail
          email={emailForDetail}
          body={emailBody}
          isLoading={isLoadingBody}
          onArchive={() => selectedEmailId && handleArchive(selectedEmailId)}
        />
      </div>
    </div>
  );
}
