// src/hooks/useInbox.ts
// Hooks for reading emails from the knowledge base

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { EmailIndex, EmailCategory, EmailStatus } from "../lib/inbox/types";

const INBOX_USER = "melvin"; // TODO: Get from auth/config

// Get the inbox base path
function getInboxPath(): string {
  const basePath = import.meta.env.VITE_LOCAL_REPO_PATH || "";
  return `${basePath}/_team/${INBOX_USER}/emails`;
}

// Read email index
async function readEmailIndex(): Promise<EmailIndex | null> {
  try {
    const indexPath = `${getInboxPath()}/index.json`;
    const content = await invoke<string>("read_file", { path: indexPath });
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to read email index:", error);
    return null;
  }
}

// Read email body (markdown file)
async function readEmailBody(bodyPath: string): Promise<string> {
  try {
    const fullPath = bodyPath.startsWith("/") ? bodyPath : `${getInboxPath()}/${bodyPath}`;
    return await invoke<string>("read_file", { path: fullPath });
  } catch (error) {
    console.error("Failed to read email body:", error);
    return "Failed to load email content.";
  }
}

// Write updated email index
async function writeEmailIndex(index: EmailIndex): Promise<void> {
  const indexPath = `${getInboxPath()}/index.json`;
  await invoke("write_file", {
    path: indexPath,
    content: JSON.stringify(index, null, 2),
  });
}

// Hook: Get email index
export function useEmailIndex() {
  return useQuery({
    queryKey: ["inbox", "index"],
    queryFn: readEmailIndex,
    staleTime: 1000 * 60, // 1 minute
  });
}

// Hook: Get filtered emails
export function useEmails(options?: {
  folder?: string;
  category?: EmailCategory;
  status?: EmailStatus;
  search?: string;
}) {
  const { data: index, isLoading, error } = useEmailIndex();

  let emails = index?.emails || [];

  // Apply filters
  if (options?.folder) {
    emails = emails.filter((e) => e.folder === options.folder);
  }
  if (options?.category) {
    emails = emails.filter((e) => e.classification?.category === options.category);
  }
  if (options?.status) {
    emails = emails.filter((e) => e.status === options.status);
  }
  if (options?.search) {
    const searchLower = options.search.toLowerCase();
    emails = emails.filter(
      (e) =>
        e.subject.toLowerCase().includes(searchLower) ||
        e.from.name.toLowerCase().includes(searchLower) ||
        e.from.email.toLowerCase().includes(searchLower) ||
        e.preview.toLowerCase().includes(searchLower)
    );
  }

  // Sort by date descending
  emails = [...emails].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );

  return {
    emails,
    folders: index?.folders || [],
    isLoading,
    error,
    lastUpdated: index?.lastUpdated,
  };
}

// Hook: Get single email with body
export function useEmail(emailId: string | null) {
  const { data: index } = useEmailIndex();
  const email = index?.emails.find((e) => e.id === emailId);

  const bodyQuery = useQuery({
    queryKey: ["inbox", "body", emailId],
    queryFn: () => (email ? readEmailBody(email.bodyPath) : Promise.resolve("")),
    enabled: !!email,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    email,
    body: bodyQuery.data || "",
    isLoading: bodyQuery.isLoading,
  };
}

// Hook: Update email status
export function useUpdateEmailStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailId, status }: { emailId: string; status: EmailStatus }) => {
      const index = await readEmailIndex();
      if (!index) throw new Error("No email index found");

      const emailIndex = index.emails.findIndex((e) => e.id === emailId);
      if (emailIndex === -1) throw new Error("Email not found");

      index.emails[emailIndex].status = status;
      if (status === "read" || status === "archived") {
        index.emails[emailIndex].isRead = true;
      }

      await writeEmailIndex(index);
      return index;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
}

// Hook: Mark email as read
export function useMarkAsRead() {
  const updateStatus = useUpdateEmailStatus();

  return (emailId: string) => {
    updateStatus.mutate({ emailId, status: "read" });
  };
}

// Hook: Archive email
export function useArchiveEmail() {
  const updateStatus = useUpdateEmailStatus();

  return (emailId: string) => {
    updateStatus.mutate({ emailId, status: "archived" });
  };
}

// Hook: Get email stats
export function useEmailStats() {
  const { emails, folders } = useEmails();

  const stats = {
    total: emails.length,
    unread: emails.filter((e) => !e.isRead).length,
    inbox: emails.filter((e) => e.status === "inbox").length,
    archived: emails.filter((e) => e.status === "archived").length,
    byCategory: {
      client: emails.filter((e) => e.classification?.category === "client").length,
      deal: emails.filter((e) => e.classification?.category === "deal").length,
      lead: emails.filter((e) => e.classification?.category === "lead").length,
      internal: emails.filter((e) => e.classification?.category === "internal").length,
      vendor: emails.filter((e) => e.classification?.category === "vendor").length,
      noise: emails.filter((e) => e.classification?.category === "noise").length,
    },
    actionRequired: emails.filter((e) => e.classification?.actionRequired).length,
  };

  return { stats, folders };
}
