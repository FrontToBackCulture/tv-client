// src/modules/inbox/InboxModule.tsx

import { useState, useEffect } from "react";
import { useEmails, useEmail, useEmailStats, useMarkAsRead, useArchiveEmail } from "../../hooks/useInbox";
import { InboxSidebar } from "./InboxSidebar";
import { EmailList } from "./EmailList";
import { EmailDetail } from "./EmailDetail";
import { EmptyInbox } from "./EmptyInbox";
import type { EmailCategory, EmailStatus } from "../../lib/inbox/types";

export function InboxModule() {
  // Filter state
  const [selectedFolder, setSelectedFolder] = useState("Inbox");
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<EmailStatus | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // Get emails with filters
  const { emails, isLoading } = useEmails({
    folder: selectedCategory || selectedStatus ? undefined : selectedFolder,
    category: selectedCategory || undefined,
    status: selectedStatus || undefined,
  });

  // Get selected email with body
  const { email: selectedEmail, body: emailBody, isLoading: isLoadingBody } = useEmail(selectedEmailId);

  // Get stats for sidebar
  const { stats } = useEmailStats();

  // Actions
  const markAsRead = useMarkAsRead();
  const archiveEmail = useArchiveEmail();

  // Auto-mark as read when email is selected
  useEffect(() => {
    if (selectedEmail && !selectedEmail.isRead) {
      markAsRead(selectedEmail.id);
    }
  }, [selectedEmail, markAsRead]);

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
    // TODO: Trigger email sync via tv-tools
    console.log("Refresh emails");
  };

  const handleArchive = (emailId: string) => {
    archiveEmail(emailId);
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
          stats={stats}
          onRefresh={handleRefresh}
        />
        <EmptyInbox onRefresh={handleRefresh} />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-white dark:bg-zinc-950">
      {/* Sidebar */}
      <InboxSidebar
        selectedFolder={selectedFolder}
        selectedCategory={selectedCategory}
        selectedStatus={selectedStatus}
        onFolderChange={setSelectedFolder}
        onCategoryChange={setSelectedCategory}
        onStatusChange={setSelectedStatus}
        stats={stats}
        onRefresh={handleRefresh}
      />

      {/* Email List */}
      <EmailList
        emails={emails}
        selectedId={selectedEmailId}
        onSelect={setSelectedEmailId}
        onArchive={handleArchive}
        onMarkRead={markAsRead}
        isLoading={isLoading}
      />

      {/* Email Detail / Reading Pane */}
      <EmailDetail
        email={selectedEmail}
        body={emailBody}
        isLoading={isLoadingBody}
        onArchive={() => selectedEmailId && handleArchive(selectedEmailId)}
      />
    </div>
  );
}
