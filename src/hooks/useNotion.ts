// Notion sync hooks — React Query + Tauri IPC

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { notionKeys } from "./notion/keys";
import type {
  NotionDatabaseInfo,
  SyncConfig,
  CreateSyncConfig,
  UpdateSyncConfig,
  SyncComplete,
  SyncStatus,
  PreviewCard,
} from "../lib/notion/types";

// ============================================================================
// Database Discovery
// ============================================================================

export function useNotionDatabases(query?: string) {
  return useQuery({
    queryKey: [...notionKeys.databases(), query ?? ""],
    queryFn: () =>
      invoke<NotionDatabaseInfo[]>("notion_list_databases", {
        query: query ?? "",
      }),
    staleTime: 1000 * 60 * 5, // 5 min
    enabled: true,
  });
}

export function useNotionDatabaseSchema(databaseId: string | null) {
  return useQuery({
    queryKey: notionKeys.databaseSchema(databaseId ?? ""),
    queryFn: () =>
      invoke<NotionDatabaseInfo>("notion_get_database_schema", {
        databaseId: databaseId!,
      }),
    staleTime: 1000 * 60 * 10, // 10 min
    enabled: !!databaseId,
  });
}

export interface NotionUser {
  id: string;
  name: string;
  email: string | null;
}

export function useNotionUsers() {
  return useQuery({
    queryKey: [...notionKeys.all, "users"],
    queryFn: () => invoke<NotionUser[]>("notion_list_users"),
    staleTime: 1000 * 60 * 10, // 10 min
  });
}

export function useNotionDatabasePages(databaseId: string | null) {
  return useQuery({
    queryKey: [...notionKeys.all, "database-pages", databaseId],
    queryFn: () =>
      invoke<[string, string][]>("notion_list_database_pages", {
        databaseId: databaseId!,
      }),
    staleTime: 1000 * 60 * 10, // 10 min
    enabled: !!databaseId,
  });
}

export function useNotionPageContent(pageId: string | null) {
  return useQuery({
    queryKey: [...notionKeys.all, "page-content", pageId],
    queryFn: () =>
      invoke<[string, { block_id: string; file_name: string; file_type: string | null; url: string }[]]>(
        "notion_get_page_content",
        { pageId: pageId! }
      ),
    staleTime: 1000 * 60 * 5, // 5 min — URLs expire after ~1 hour so this is safe
    enabled: !!pageId,
  });
}

export function useNotionPreview(
  databaseId: string | null,
  filter?: Record<string, unknown>
) {
  return useQuery({
    queryKey: [...notionKeys.preview(databaseId ?? ""), filter],
    queryFn: () =>
      invoke<PreviewCard[]>("notion_preview_cards", {
        databaseId: databaseId!,
        filter: filter ?? null,
      }),
    staleTime: 1000 * 60 * 2, // 2 min
    enabled: !!databaseId,
  });
}

// ============================================================================
// Sync Configurations
// ============================================================================

export function useNotionSyncConfigs() {
  return useQuery({
    queryKey: notionKeys.configs(),
    queryFn: () => invoke<SyncConfig[]>("notion_list_sync_configs"),
    staleTime: 1000 * 30, // 30s
  });
}

export function useNotionSyncStatus() {
  return useQuery({
    queryKey: notionKeys.status(),
    queryFn: () => invoke<SyncStatus>("notion_sync_status"),
    staleTime: 1000 * 30,
  });
}

export function useCreateSyncConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSyncConfig) =>
      invoke<SyncConfig>("notion_save_sync_config", { data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notionKeys.configs() });
      queryClient.invalidateQueries({ queryKey: notionKeys.status() });
    },
  });
}

export function useUpdateSyncConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      configId,
      data,
    }: {
      configId: string;
      data: UpdateSyncConfig;
    }) => invoke<SyncConfig>("notion_update_sync_config", { configId, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notionKeys.configs() });
      queryClient.invalidateQueries({ queryKey: notionKeys.status() });
    },
  });
}

export function useDeleteSyncConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (configId: string) =>
      invoke<void>("notion_delete_sync_config", { configId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notionKeys.configs() });
      queryClient.invalidateQueries({ queryKey: notionKeys.status() });
    },
  });
}

// ============================================================================
// Sync Actions
// ============================================================================

export function useNotionSyncStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<SyncComplete[]>("notion_sync_start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notionKeys.all });
      // Also refresh work tasks
      queryClient.invalidateQueries({ queryKey: ["work"] });
    },
  });
}

// ============================================================================
// Push (tv-client → Notion)
// ============================================================================

interface PushResult {
  action: string; // "created" | "updated"
  notion_page_id: string;
}

export function useNotionPushTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      invoke<PushResult>("notion_push_task", { taskId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work"] });
      queryClient.invalidateQueries({ queryKey: notionKeys.all });
    },
  });
}

// ============================================================================
// Pull (Notion → tv-client)
// ============================================================================

export function useNotionBlockChildren(blockId: string | null) {
  return useQuery({
    queryKey: [...notionKeys.all, "block-children", blockId],
    queryFn: () =>
      invoke<NotionBlock[]>("notion_get_block_children", { blockId: blockId! }),
    staleTime: 1000 * 60 * 5,
    enabled: !!blockId,
  });
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  _children?: NotionBlock[];
  [key: string]: unknown;
}

export function useNotionPullTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      invoke<PushResult>("notion_pull_task", { taskId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work"] });
      queryClient.invalidateQueries({ queryKey: notionKeys.all });
    },
  });
}
