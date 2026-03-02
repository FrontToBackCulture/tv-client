// VAL Drive hooks — browse files and folders in VAL Drive

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// ============================================================
// Types
// ============================================================

export interface DriveFolder {
  id: string;
  name: string;
  last_modified: string | null;
}

export interface DriveFile {
  id: string;
  name: string;
  size: number | null;
  file_type: string | null;
  last_modified: string | null;
}

export interface DriveFilesResult {
  files: DriveFile[];
  last_key: string | null;
  is_last_page: boolean;
}

// ============================================================
// Query keys
// ============================================================

export interface DriveWorkflowFolder {
  folder_path: string;
  move_to_processed: boolean;
  workflow_count: number;
}

export const valDriveKeys = {
  folders: (domain: string, folderId: string) =>
    ["val-drive", "folders", domain, folderId] as const,
  files: (domain: string, folderId: string) =>
    ["val-drive", "files", domain, folderId] as const,
  workflowFolders: (domain: string) =>
    ["val-drive", "workflow-folders", domain] as const,
};

// ============================================================
// Hooks
// ============================================================

/** List folders in a VAL Drive path */
export function useValDriveFolders(domain: string | null, folderId?: string) {
  const folder = folderId ?? "val_drive";
  return useQuery({
    queryKey: valDriveKeys.folders(domain ?? "", folder),
    queryFn: () =>
      invoke<DriveFolder[]>("val_drive_list_folders", {
        domain,
        folderId: folder,
      }),
    enabled: !!domain,
    staleTime: 30_000,
  });
}

/** List files in a VAL Drive folder */
export function useValDriveFiles(domain: string | null, folderId: string | null) {
  return useQuery({
    queryKey: valDriveKeys.files(domain ?? "", folderId ?? ""),
    queryFn: () =>
      invoke<DriveFilesResult>("val_drive_list_files", {
        domain,
        folderId,
      }),
    enabled: !!domain && !!folderId,
    staleTime: 30_000,
  });
}

/** Get workflow folder configs for a domain — which folders have workflows and whether they move to processed */
export function useValDriveWorkflowFolders(domain: string | null) {
  return useQuery({
    queryKey: valDriveKeys.workflowFolders(domain ?? ""),
    queryFn: () =>
      invoke<DriveWorkflowFolder[]>("val_drive_workflow_folders", { domain }),
    enabled: !!domain,
    staleTime: 60_000,
  });
}

// ============================================================
// Drive Scan Config — persisted folder list per domain
// ============================================================

export interface DriveScanFolder {
  folder_path: string;
  enabled: boolean;
  move_to_processed: boolean;
  source: "workflow" | "manual";
}

export interface DomainScanConfig {
  folders: DriveScanFolder[];
}

export interface DriveScanConfig {
  domains: Record<string, DomainScanConfig>;
}

/** Load persisted drive scan config */
export function useValDriveScanConfig() {
  return useQuery({
    queryKey: ["val-drive", "scan-config"],
    queryFn: () => invoke<DriveScanConfig>("val_drive_scan_config_load"),
    staleTime: 60_000,
  });
}

/** Save drive scan config */
export function useValDriveScanConfigSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: DriveScanConfig) =>
      invoke<void>("val_drive_scan_config_save", { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["val-drive", "scan-config"] });
    },
  });
}

/** Seed scan config from workflow configs (merges with existing) */
export function useValDriveScanConfigSeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<DriveScanConfig>("val_drive_scan_config_seed"),
    onSuccess: (data) => {
      queryClient.setQueryData(["val-drive", "scan-config"], data);
    },
  });
}

// ============================================================
// Drive Scan Results — persisted last scan output
// ============================================================

export interface ScanResultFile {
  folder: string;
  name: string;
  size: number | null;
  last_modified: string | null;
  stale: boolean;
}

export interface DomainScanResult {
  domain: string;
  status: "clean" | "has-files" | "stale" | "error";
  files: ScanResultFile[];
  stale_count: number;
  error: string | null;
}

export interface PersistedScanResults {
  last_scan_at: string;
  results: DomainScanResult[];
}

/** Load cached scan results */
export function useValDriveScanResults() {
  return useQuery({
    queryKey: ["val-drive", "scan-results"],
    queryFn: () =>
      invoke<PersistedScanResults | null>("val_drive_scan_results_load"),
    staleTime: Infinity, // only refresh manually
  });
}

/** Save scan results to disk */
export function useValDriveScanResultsSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (results: PersistedScanResults) =>
      invoke<void>("val_drive_scan_results_save", { results }),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(
        ["val-drive", "scan-results"],
        variables
      );
    },
  });
}
