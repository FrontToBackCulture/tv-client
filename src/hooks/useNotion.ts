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
