// React Query hooks for Outlook emails (replaces useInbox.ts)
// All data comes from Rust/SQLite via Tauri IPC

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types (match Rust EmailEntry)
// ============================================================================

export interface EmailAddress {
  name: string;
  email: string;
}

export interface OutlookEmail {
  id: string;
  conversationId: string | null;
  subject: string;
  fromName: string;
  fromEmail: string;
  toAddresses: EmailAddress[];
  ccAddresses: EmailAddress[];
  receivedAt: string;
  folderName: string;
  importance: string;
  isRead: boolean;
  hasAttachments: boolean;
  bodyPreview: string;
  bodyPath: string | null;
  category: string;
  priorityScore: number;
  priorityLevel: string;
  aiSummary: string | null;
  actionRequired: boolean;
  status: string;
  linkedCompanyId: string | null;
  linkedCompanyName: string | null;
}

export interface OutlookStats {
  total: number;
  unread: number;
  inbox: number;
  archived: number;
  actionRequired: number;
  byCategory: Record<string, number>;
}

export interface OutlookFolder {
  id: string;
  displayName: string;
  totalCount: number;
  unreadCount: number;
}

export interface OutlookAuthStatus {
  isAuthenticated: boolean;
  userEmail: string | null;
  expiresAt: number | null;
}

export type EmailCategory = "client" | "deal" | "lead" | "internal" | "vendor" | "noise" | "unknown";
export type EmailStatus = "inbox" | "read" | "archived";
export type EmailPriority = "high" | "medium" | "low";

// ============================================================================
// Auth hooks
// ============================================================================

export function useOutlookAuth() {
  return useQuery({
    queryKey: ["outlook", "auth"],
    queryFn: () => invoke<OutlookAuthStatus>("outlook_auth_check"),
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

export function useOutlookLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clientId, tenantId, clientSecret }: { clientId: string; tenantId: string; clientSecret: string }) =>
      invoke<OutlookAuthStatus>("outlook_auth_start", { clientId, tenantId, clientSecret }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outlook", "auth"] });
    },
  });
}

export function useOutlookLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => invoke<void>("outlook_auth_logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outlook"] });
    },
  });
}

// ============================================================================
// Email query hooks
// ============================================================================

export function useEmails(options?: {
  folder?: string;
  category?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["outlook", "emails", options],
    queryFn: () =>
      invoke<OutlookEmail[]>("outlook_list_emails", {
        folder: options?.folder || null,
        category: options?.category || null,
        status: options?.status || null,
        search: options?.search || null,
        limit: options?.limit || 100,
        offset: options?.offset || 0,
      }),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useEmail(id: string | null) {
  return useQuery({
    queryKey: ["outlook", "email", id],
    queryFn: () => invoke<OutlookEmail | null>("outlook_get_email", { id }),
    enabled: !!id,
    staleTime: 1000 * 60, // 1 min
  });
}

export function useEmailBody(id: string | null) {
  return useQuery({
    queryKey: ["outlook", "body", id],
    queryFn: () => invoke<string>("outlook_get_email_body", { id }),
    enabled: !!id,
    staleTime: 1000 * 60 * 30, // 30 min - bodies rarely change
    gcTime: 1000 * 60 * 10, // GC unused entries after 10 min
  });
}

export function useEmailStats() {
  return useQuery({
    queryKey: ["outlook", "stats"],
    queryFn: () => invoke<OutlookStats>("outlook_get_stats"),
    staleTime: 1000 * 30,
  });
}

// ============================================================================
// Action hooks
// ============================================================================

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoke<void>("outlook_mark_read", { id }),
    onMutate: async (id) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["outlook", "emails"] });
      queryClient.setQueriesData<OutlookEmail[]>(
        { queryKey: ["outlook", "emails"] },
        (old) => old?.map((e) => (e.id === id ? { ...e, isRead: true, status: "read" } : e))
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["outlook", "stats"] });
    },
  });
}

export function useArchiveEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoke<void>("outlook_archive_email", { id }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["outlook", "emails"] });
      queryClient.setQueriesData<OutlookEmail[]>(
        { queryKey: ["outlook", "emails"] },
        (old) => old?.filter((e) => e.id !== id)
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["outlook"] });
    },
  });
}

// ============================================================================
// Sync hooks
// ============================================================================

export function useSyncStart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => invoke<number>("outlook_sync_start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outlook"] });
    },
  });
}

