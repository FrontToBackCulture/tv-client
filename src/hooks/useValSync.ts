// src/hooks/useValSync.ts
// React hooks for VAL Sync operations via Tauri IPC

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import { useJobsStore } from "../stores/jobsStore";

// ============================================================
// Types (mirror Rust structs)
// ============================================================

export interface DomainSummary {
  domain: string;
  global_path: string;
  has_actual_domain: boolean;
  domain_type: string;
  has_metadata: boolean;
}

export interface DiscoveredDomain {
  domain: string;
  domain_type: string;
  global_path: string;
  has_metadata: boolean;
  has_actual_domain: boolean;
  /** ISO timestamp of the most recent sync operation */
  last_sync: string | null;
  /** Count of total artifacts synced */
  artifact_count: number | null;
}

export interface AuthResult {
  domain: string;
  authenticated: boolean;
  token_preview: string | null;
  expires_at: string | null;
  message: string;
}

export interface SyncResult {
  domain: string;
  artifact_type: string;
  count: number;
  file_path: string;
  duration_ms: number;
  status: string;
  message: string;
}

export interface ExtractResult {
  domain: string;
  extract_type: string;
  count: number;
  duration_ms: number;
  status: string;
  message: string;
}

export interface SyncAllResult {
  domain: string;
  results: SyncResult[];
  extract_results: ExtractResult[];
  total_duration_ms: number;
  status: string;
}

export interface ArtifactStatus {
  last_sync: string;
  count: number;
  status: string;
  duration_ms: number | null;
}

export interface SyncMetadata {
  domain: string;
  created: string;
  artifacts: Record<string, ArtifactStatus>;
  extractions: Record<string, ArtifactStatus>;
  history: { timestamp: string; operation: string; status: string; details: string | null }[];
}

// ============================================================
// Query keys
// ============================================================

export interface ValCredentials {
  email: string | null;
  password: string | null;
  has_credentials: boolean;
}

export interface ProjectConfig {
  solution: string;
  useCase?: string;
  configPath?: string;
  metadataTypes?: Record<string, string>;
}

export interface DomainConfig {
  domain: string;
  actualDomain?: string;
  globalPath: string;
  projects: ProjectConfig[];
  monitoringPath?: string;
  domainType?: string;
}

export interface ValSyncConfig {
  domains: DomainConfig[];
}

export interface OutputFileStatus {
  name: string;
  path: string;
  relative_path: string;
  category: string;
  is_folder: boolean;
  exists: boolean;
  modified: string | null;
  size: number | null;
  item_count: number | null;
  created_by: string;
}

export interface OutputStatusResult {
  domain: string;
  global_path: string;
  outputs: OutputFileStatus[];
}

export const valSyncKeys = {
  all: ["val-sync"] as const,
  config: () => [...valSyncKeys.all, "config"] as const,
  domains: () => [...valSyncKeys.all, "domains"] as const,
  discover: (path: string) => [...valSyncKeys.all, "discover", path] as const,
  auth: (domain: string) => [...valSyncKeys.all, "auth", domain] as const,
  credentials: (domain: string) => [...valSyncKeys.all, "credentials", domain] as const,
  status: (domain: string) => [...valSyncKeys.all, "status", domain] as const,
  outputStatus: (domain: string) => [...valSyncKeys.all, "output-status", domain] as const,
};

// ============================================================
// Queries
// ============================================================

/** List all configured VAL domains */
export function useValDomains() {
  return useQuery({
    queryKey: valSyncKeys.domains(),
    queryFn: () => invoke<DomainSummary[]>("val_sync_list_domains"),
    staleTime: 30_000,
  });
}

/** Discover domains from file system at {repo}/0_Platform/domains/ */
export function useDiscoverDomains(domainsPath: string | null) {
  return useQuery({
    queryKey: valSyncKeys.discover(domainsPath ?? ""),
    queryFn: () => invoke<DiscoveredDomain[]>("val_sync_discover_domains", { domainsPath }),
    enabled: !!domainsPath,
    staleTime: 60_000,
  });
}

/** Check auth status for a domain (no login attempt) */
export function useValAuth(domain: string | null) {
  return useQuery({
    queryKey: valSyncKeys.auth(domain ?? ""),
    queryFn: () => invoke<AuthResult>("val_sync_check_auth", { domain }),
    enabled: !!domain,
    staleTime: 60_000,
  });
}

/** Get sync metadata/status for a domain */
export function useValSyncStatus(domain: string | null) {
  return useQuery({
    queryKey: valSyncKeys.status(domain ?? ""),
    queryFn: () => invoke<SyncMetadata>("val_sync_get_status", { domain }),
    enabled: !!domain,
    staleTime: 10_000,
  });
}

/** Get output file/folder status for a domain */
export function useValOutputStatus(domain: string | null) {
  return useQuery({
    queryKey: valSyncKeys.outputStatus(domain ?? ""),
    queryFn: () => invoke<OutputStatusResult>("val_get_output_status", { domain }),
    enabled: !!domain,
    staleTime: 30_000,
  });
}

/** Check if credentials exist for a domain */
export function useValCredentials(domain: string | null) {
  return useQuery({
    queryKey: valSyncKeys.credentials(domain ?? ""),
    queryFn: async (): Promise<ValCredentials> => {
      const [email, password] = await invoke<[string | null, string | null]>(
        "settings_get_val_credentials",
        { domain }
      );
      return {
        email,
        password,
        has_credentials: email !== null && password !== null,
      };
    },
    enabled: !!domain,
    staleTime: 30_000,
  });
}

// ============================================================
// Mutations
// ============================================================

/** Login to a domain using stored credentials */
export function useValLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => invoke<AuthResult>("val_sync_login", { domain }),
    onSuccess: (_data, domain) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.auth(domain) });
    },
  });
}

/** Save VAL credentials for a domain */
export function useSetValCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ domain, email, password }: { domain: string; email: string; password: string }) => {
      await invoke("settings_set_key", { keyName: `val_email_${domain}`, value: email });
      await invoke("settings_set_key", { keyName: `val_password_${domain}`, value: password });
    },
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.credentials(domain) });
    },
  });
}

/** Sync a single artifact type */
export function useValSyncArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, artifactType }: { domain: string; artifactType: string }) => {
      const cmdMap: Record<string, string> = {
        fields: "val_sync_fields",
        queries: "val_sync_queries",
        workflows: "val_sync_workflows",
        dashboards: "val_sync_dashboards",
        tables: "val_sync_tables",
        "calc-fields": "val_sync_calc_fields",
      };
      const cmd = cmdMap[artifactType];
      if (!cmd) throw new Error(`Unknown artifact type: ${artifactType}`);
      return invoke<SyncResult>(cmd, { domain });
    },
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Full sync + extract for a domain */
export function useValSyncAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => invoke<SyncAllResult>("val_sync_all", { domain }),
    onSuccess: (_data, domain) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Import config from val-sync config.json */
export function useValImportConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) =>
      invoke<unknown>("val_sync_import_config", { filePath, tvKnowledgePath: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: valSyncKeys.domains() });
    },
  });
}

/** Import credentials from val-sync .env */
export function useValImportCredentials() {
  return useMutation({
    mutationFn: (envFilePath: string) =>
      invoke<string[]>("settings_import_val_credentials", { envFilePath }),
  });
}

/** Load full val-sync config */
export function useValSyncConfig() {
  return useQuery({
    queryKey: valSyncKeys.config(),
    queryFn: async () => {
      // Rust returns snake_case, we need to map to camelCase
      const raw = await invoke<{
        domains: {
          domain: string;
          actual_domain?: string;
          global_path: string;
          projects: {
            solution: string;
            use_case?: string;
            config_path?: string;
            metadata_types?: Record<string, string>;
          }[];
          monitoring_path?: string;
          domain_type?: string;
        }[];
      }>("val_sync_load_config");

      return {
        domains: raw.domains.map((d) => ({
          domain: d.domain,
          actualDomain: d.actual_domain,
          globalPath: d.global_path,
          projects: d.projects.map((p) => ({
            solution: p.solution,
            useCase: p.use_case,
            configPath: p.config_path,
            metadataTypes: p.metadata_types,
          })),
          monitoringPath: d.monitoring_path,
          domainType: d.domain_type,
        })),
      } as ValSyncConfig;
    },
    staleTime: 30_000,
  });
}

/** Update a domain's global path */
export function useUpdateDomainPath() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ domain, globalPath }: { domain: string; globalPath: string }) => {
      // Load current config
      const raw = await invoke<{
        domains: {
          domain: string;
          actual_domain?: string;
          global_path: string;
          projects: unknown[];
          monitoring_path?: string;
          domain_type?: string;
        }[];
      }>("val_sync_load_config");

      // Update the specific domain's path
      const updated = {
        domains: raw.domains.map((d) =>
          d.domain === domain ? { ...d, global_path: globalPath } : d
        ),
      };

      // Save back
      await invoke("val_sync_save_config", { config: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: valSyncKeys.config() });
      qc.invalidateQueries({ queryKey: valSyncKeys.domains() });
    },
  });
}

/** Sync workflow executions for a domain */
export function useValSyncWorkflowExecutions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, from, to }: { domain: string; from: string; to: string }) =>
      invoke<SyncResult>("val_sync_workflow_executions", { domain, from, to }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Sync SOD tables status for a domain */
export function useValSyncSodTablesStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, date, regenerate }: { domain: string; date: string; regenerate: boolean }) =>
      invoke<SyncResult>("val_sync_sod_tables_status", { domain, date, regenerate }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Sync importer errors for a domain */
export function useValSyncImporterErrors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, from, to }: { domain: string; from: string; to: string }) =>
      invoke<SyncResult>("val_sync_importer_errors", { domain, from, to }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Sync integration errors for a domain */
export function useValSyncIntegrationErrors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, from, to }: { domain: string; from: string; to: string }) =>
      invoke<SyncResult>("val_sync_integration_errors", { domain, from, to }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

// ============================================================
// Bulk operations
// ============================================================

export interface SyncAllDomainsProgress {
  current: number;
  total: number;
  currentDomain: string;
  completed: string[];
  failed: string[];
  isRunning: boolean;
}

/** Sync all domains sequentially (one after another) with job tracking */
export function useSyncAllDomains() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-sync-all-domains-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Sync All Domains (${total})`,
        status: "running",
        progress: 0,
        message: `Starting sync for ${total} domains...`,
      });

      setProgress({
        current: 0,
        total,
        currentDomain: "",
        completed: [],
        failed: [],
        isRunning: true,
      });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round(((i) / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        const pct = Math.round((i / total) * 100);

        updateJob(jobId, {
          progress: pct,
          message: `[${i + 1}/${total}] Syncing ${domain}...`,
        });

        setProgress({
          current: i + 1,
          total,
          currentDomain: domain,
          completed: [...completed],
          failed: [...failed],
          isRunning: true,
        });

        try {
          await invoke<SyncAllResult>("val_sync_all", { domain });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch (err) {
          failed.push(domain);
          // Continue to next domain — don't stop on failure
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} synced, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains synced`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({
        current: total,
        total,
        currentDomain: "",
        completed,
        failed,
        isRunning: false,
      });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { trigger, abort, progress };
}

/** Helper: get default monitoring time window (yesterday 23:00 → now) */
function getDefaultMonitoringWindow() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().replace("Z", "");
  return { from: fmt(yesterday), to: fmt(now) };
}

/** Helper: get today's date as YYYY-MM-DD */
function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Sync monitoring (workflow executions) for all domains sequentially */
export function useSyncAllDomainsMonitoring() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-sync-monitoring-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];
      const { from, to } = getDefaultMonitoringWindow();

      addJob({
        id: jobId,
        name: `Sync Monitoring (${total})`,
        status: "running",
        progress: 0,
        message: `Starting monitoring sync for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Syncing monitoring for ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<SyncResult>("val_sync_workflow_executions", { domain, from, to });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} synced, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains monitoring synced`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

/** Sync SOD tables status for all domains sequentially */
export function useSyncAllDomainsSod() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-sync-sod-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];
      const date = getTodayDate();

      addJob({
        id: jobId,
        name: `Sync SOD Tables (${total})`,
        status: "running",
        progress: 0,
        message: `Starting SOD sync for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Syncing SOD for ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<SyncResult>("val_sync_sod_tables_status", { domain, date, regenerate: false });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} synced, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains SOD synced`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

/** Sync importer errors for all domains sequentially */
export function useSyncAllDomainsImporterErrors() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-sync-importer-errors-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];
      const { from, to } = getDefaultMonitoringWindow();

      addJob({
        id: jobId,
        name: `Sync Importer Errors (${total})`,
        status: "running",
        progress: 0,
        message: `Starting importer errors sync for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Syncing importer errors for ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<SyncResult>("val_sync_importer_errors", { domain, from, to });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} synced, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains importer errors synced`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

/** Sync integration errors for all domains sequentially */
export function useSyncAllDomainsIntegrationErrors() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-sync-integration-errors-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];
      const { from, to } = getDefaultMonitoringWindow();

      addJob({
        id: jobId,
        name: `Sync Integration Errors (${total})`,
        status: "running",
        progress: 0,
        message: `Starting integration errors sync for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Syncing integration errors for ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<SyncResult>("val_sync_integration_errors", { domain, from, to });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} synced, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains integration errors synced`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

// ============================================================
// S3 Sync (push AI folders to S3)
// ============================================================

export interface S3FileStatus {
  path: string;
  in_local: boolean;
  in_s3: boolean;
  s3_last_modified: string | null;
  s3_size: number | null;
  local_size: number | null;
}

export interface S3StatusResult {
  domain: string;
  has_ai_folder: boolean;
  local_count: number;
  s3_count: number;
  files: S3FileStatus[];
}

export interface S3SyncResult {
  domain: string;
  status: string;
  message: string;
  files_uploaded: number;
  duration_ms: number;
}

/** Check S3 status for a domain's AI folder */
export function useS3AiStatus(domain: string | null, globalPath: string | null) {
  return useQuery({
    queryKey: ["s3-ai-status", domain],
    queryFn: () => invoke<S3StatusResult>("val_s3_ai_status", { domain: domain!, globalPath: globalPath! }),
    enabled: !!domain && !!globalPath,
    staleTime: 60_000, // Cache for 1 minute
  });
}

/** Sync a single domain's AI folder to S3 */
export function useSyncAiToS3() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, globalPath }: { domain: string; globalPath: string }) =>
      invoke<S3SyncResult>("val_sync_ai_to_s3", { domain, globalPath }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: ["s3-ai-status", domain] });
    },
  });
}

/** Batch sync all domains' AI folders to S3 */
export function useSyncAllDomainsAiToS3() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: { domain: string; global_path: string }[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-s3-sync-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `S3 Sync AI (${total})`,
        status: "running",
        progress: 0,
        message: `Pushing AI folders to S3 for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const { domain, global_path } = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Syncing ${domain} AI to S3...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          const result = await invoke<S3SyncResult>("val_sync_ai_to_s3", { domain, globalPath: global_path });
          if (result.status === "skipped") {
            // Don't count skipped as failed
            completed.push(domain);
          } else {
            completed.push(domain);
          }
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} synced, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains AI synced to S3`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

// ============================================================
// Health Check Types
// ============================================================

export interface HealthStatus {
  level: string;
  emoji: string;
  description: string;
}

export interface HealthResult {
  score: number;
  status: HealthStatus;
  issues: string[];
}

export interface HealthSummary {
  healthy: number;
  warning: number;
  stale: number;
  critical: number;
  errors: number;
  skipped: number;
}

export interface HealthCheckResult {
  domain: string;
  checkType: string;
  file_path: string;
  duration_ms: number;
  status: string;
  message: string;
  summary: HealthSummary;
}

export interface GenerateConfigResult {
  domain: string;
  file_path: string;
  tablesFound: number;
  tablesWithDateColumns: number;
  message: string;
}

// ============================================================
// Artifact Audit Types
// ============================================================

export interface AuditSummary {
  total_local: number;
  total_remote: number;
  stale_count: number;
  new_count: number;
  matching_count: number;
}

export interface AuditResult {
  domain: string;
  global_path: string;
  timestamp: string;
  artifact_type: string;
  local_folder: string;
  summary: AuditSummary;
  file_path: string;
  duration_ms: number;
}

// ============================================================
// Query Health Types
// ============================================================

export interface QueryHealthStatus {
  level: string;
  description: string;
}

export interface QueryHealth {
  score: number | null;
  status: QueryHealthStatus;
  issues: string[];
}

export interface DashboardReference {
  id: number;
  name: string;
  category: string | null;
  widget_type: string;
  health: string;
}

export interface QueryAnalysis {
  id: number;
  name: string;
  query_type: string | null;
  created_date: string | null;
  updated_date: string | null;
  dashboard_count: number;
  dashboards: DashboardReference[];
  health: QueryHealth;
}

export interface QueryHealthSummary {
  essential: number;
  active: number;
  at_risk: number;
  orphaned: number;
  standalone: number;
  errors: number;
}

export interface QueryHealthResult {
  domain: string;
  global_path: string;
  timestamp: string;
  total_queries: number;
  queries_in_dashboards: number;
  standalone_queries: number;
  has_dashboard_health: boolean;
  queries: QueryAnalysis[];
  summary: QueryHealthSummary;
  file_path: string;
  duration_ms: number;
}

// ============================================================
// Dashboard Health Types
// ============================================================

export interface DashboardHealthStatus {
  level: string;
  emoji: string;
  description: string;
}

export interface DashboardHealthInfo {
  score: number | null;
  status: DashboardHealthStatus;
  issues: string[];
  stats: {
    view_count: number;
    unique_users: number;
    last_viewed: string | null;
    avg_views_per_day: number;
    days_since_view: number | null;
  };
}

export interface DashboardAnalysis {
  id: number;
  name: string;
  category: string | null;
  created_date: string | null;
  updated_date: string | null;
  widget_count: number;
  health: DashboardHealthInfo;
}

export interface DashboardHealthSummary {
  critical: number;
  active: number;
  occasional: number;
  attention: number;
  declining: number;
  abandoned: number;
  stale: number;
  dead: number;
  unused: number;
  errors: number;
}

export interface DashboardHealthResult {
  domain: string;
  global_path: string;
  timestamp: string;
  lookback_days: number;
  total_dashboards: number;
  dashboards_with_views: number;
  dashboards: DashboardAnalysis[];
  summary: DashboardHealthSummary;
  file_path: string;
  duration_ms: number;
}

// ============================================================
// Overview Types
// ============================================================

export interface OverviewResult {
  domain: string;
  file_path: string;
  duration_ms: number;
}

// ============================================================
// Health Check Mutations
// ============================================================

/** Generate health config template for a domain */
export function useGenerateHealthConfig() {
  return useMutation({
    mutationFn: (domain: string) =>
      invoke<GenerateConfigResult>("val_generate_health_config", { domain }),
  });
}

/** Run data model health check for a domain */
export function useRunDataModelHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      skipFreshness = false,
      skipDependencies = false,
      limit,
    }: {
      domain: string;
      skipFreshness?: boolean;
      skipDependencies?: boolean;
      limit?: number;
    }) =>
      invoke<HealthCheckResult>("val_run_data_model_health", {
        domain,
        skipFreshness,
        skipDependencies,
        limit: limit ?? null,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Run workflow health check for a domain */
export function useRunWorkflowHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      lookbackDays = 60,
    }: {
      domain: string;
      lookbackDays?: number;
    }) =>
      invoke<HealthCheckResult>("val_run_workflow_health", {
        domain,
        lookbackDays,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
    },
  });
}

/** Run data model health check for all domains sequentially */
export function useRunAllDomainsDataModelHealth() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[], options?: { skipFreshness?: boolean; skipDependencies?: boolean }) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-health-data-model-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Data Model Health (${total})`,
        status: "running",
        progress: 0,
        message: `Starting data model health check for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Checking ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<HealthCheckResult>("val_run_data_model_health", {
            domain,
            skipFreshness: options?.skipFreshness ?? false,
            skipDependencies: options?.skipDependencies ?? false,
            limit: null,
          });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} checked, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains checked`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

/** Run workflow health check for all domains sequentially */
export function useRunAllDomainsWorkflowHealth() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[], lookbackDays = 60) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-health-workflow-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Workflow Health (${total})`,
        status: "running",
        progress: 0,
        message: `Starting workflow health check for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Checking ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<HealthCheckResult>("val_run_workflow_health", { domain, lookbackDays });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} checked, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains checked`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

// ============================================================
// Additional Analysis Mutations
// ============================================================

/** Run artifact audit for a domain */
export function useRunArtifactAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) =>
      invoke<AuditResult>("val_run_artifact_audit", { domain }),
    onSuccess: (_data, domain) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Run query health analysis for a domain */
export function useRunQueryHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) =>
      invoke<QueryHealthResult>("val_run_query_health", { domain }),
    onSuccess: (_data, domain) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Run dashboard health analysis for a domain */
export function useRunDashboardHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, lookbackDays = 60 }: { domain: string; lookbackDays?: number }) =>
      invoke<DashboardHealthResult>("val_run_dashboard_health", { domain, lookbackDays }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Generate HTML overview page for a domain */
export function useGenerateOverview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) =>
      invoke<OverviewResult>("val_generate_overview", { domain }),
    onSuccess: (_data, domain) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

// ============================================================
// Bulk Analysis Operations
// ============================================================

/** Run artifact audit for all domains sequentially */
export function useRunAllDomainsArtifactAudit() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-artifact-audit-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Artifact Audit (${total})`,
        status: "running",
        progress: 0,
        message: `Starting artifact audit for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Auditing ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<AuditResult>("val_run_artifact_audit", { domain });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} audited, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains audited`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

/** Run dashboard health analysis for all domains sequentially */
export function useRunAllDomainsDashboardHealth() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[], lookbackDays = 60) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-dashboard-health-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Dashboard Health (${total})`,
        status: "running",
        progress: 0,
        message: `Starting dashboard health analysis for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Analyzing ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<DashboardHealthResult>("val_run_dashboard_health", { domain, lookbackDays });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} analyzed, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains analyzed`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

/** Run query health analysis for all domains sequentially */
export function useRunAllDomainsQueryHealth() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-query-health-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Query Health (${total})`,
        status: "running",
        progress: 0,
        message: `Starting query health analysis for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Analyzing ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<QueryHealthResult>("val_run_query_health", { domain });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.status(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} analyzed, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains analyzed`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

/** Generate overview HTML for all domains sequentially */
export function useRunAllDomainsOverview() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-overview-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Generate Overview (${total})`,
        status: "running",
        progress: 0,
        message: `Generating overview pages for ${total} domains...`,
      });

      setProgress({ current: 0, total, currentDomain: "", completed: [], failed: [], isRunning: true });

      for (let i = 0; i < domains.length; i++) {
        if (abortRef.current) {
          updateJob(jobId, {
            status: "failed",
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => p ? { ...p, isRunning: false } : null);
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Generating ${domain}...`,
        });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke<OverviewResult>("val_generate_overview", { domain });
          completed.push(domain);
          qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} generated, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} overview pages generated`;

      updateJob(jobId, {
        status: failed.length === total ? "failed" : "completed",
        progress: 100,
        message: finalMsg,
      });

      setProgress({ current: total, total, currentDomain: "", completed, failed, isRunning: false });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => { abortRef.current = true; }, []);
  return { trigger, abort, progress };
}

// ============================================================
// SQL Execution
// ============================================================

export interface SqlExecuteResult {
  domain: string;
  sql: string;
  row_count: number;
  columns: string[];
  data: Record<string, unknown>[];
  truncated: boolean;
  error: string | null;
}

/** Execute a SQL query against a VAL domain */
export function useValExecuteSql() {
  return useMutation({
    mutationFn: ({ domain, sql, limit }: { domain: string; sql: string; limit?: number }) =>
      invoke<SqlExecuteResult>("val_execute_sql", { domain, sql, limit: limit ?? null }),
  });
}

// ============================================================
// SQL Generation (AI)
// ============================================================

export interface SqlGenerateResult {
  domain: string;
  prompt: string;
  sql: string;
  explanation: string;
  tables_used: string[];
  error: string | null;
}

/** Generate SQL from natural language using Claude Haiku */
export function useValGenerateSql() {
  return useMutation({
    mutationFn: ({ domain, prompt }: { domain: string; prompt: string }) =>
      invoke<SqlGenerateResult>("val_generate_sql", { domain, prompt }),
  });
}

// ============================================================
// Table Pipeline (generate overview.md)
// ============================================================

export interface TablePipelineResult {
  domain: string;
  table_name: string;
  step: string;
  status: string;
  file_path: string | null;
  message: string;
  duration_ms: number;
}


/** Step 1: Prepare table overview (definition_details.json) */
export function usePrepareTableOverview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
      skipSql = false,
      freshnessColumn,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
      skipSql?: boolean;
      freshnessColumn?: string;
    }) =>
      invoke<TablePipelineResult>("val_prepare_table_overview", {
        domain,
        tableName,
        overwrite,
        skipSql,
        freshnessColumn: freshnessColumn ?? null,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 2: Sample table data (definition_sample.json) */
export function useSampleTableData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      rowCount = 20,
      orderBy,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      rowCount?: number;
      orderBy?: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_sample_table_data", {
        domain,
        tableName,
        rowCount,
        orderBy: orderBy ?? null,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 2b: Fetch categorical values from full table (definition_categorical.json) */
export function useFetchCategoricalValues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
      schemaPath,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
      schemaPath?: string;
    }) =>
      invoke<TablePipelineResult>("val_fetch_categorical_values", {
        domain,
        tableName,
        overwrite,
        schemaPath: schemaPath ?? null,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 3a: Describe table data with AI (naming, summary, useCases, columnDescriptions) */
export function useDescribeTableData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_describe_table_data", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 3b: Classify table data with AI (dataType, category, tags, usageStatus) */
export function useClassifyTableData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_classify_table_data", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 3 (legacy): Analyze table data with AI - runs both describe + classify */
export function useAnalyzeTableData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_analyze_table_data", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 4: Extract table calculated fields (definition_calculated_fields.json) */
export function useExtractTableCalcFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_extract_table_calc_fields", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}

/** Step 5: Generate table overview markdown (overview.md) */
export function useGenerateTableOverviewMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      domain,
      tableName,
      overwrite = false,
    }: {
      domain: string;
      tableName: string;
      overwrite?: boolean;
    }) =>
      invoke<TablePipelineResult>("val_generate_table_overview_md", {
        domain,
        tableName,
        overwrite,
      }),
    onSuccess: (_data, { domain }) => {
      qc.invalidateQueries({ queryKey: valSyncKeys.outputStatus(domain) });
    },
  });
}


/** Table info with ID and display name */
export interface TableInfo {
  id: string;
  display_name: string;
}

/** List available tables in a domain's data_models folder */
export function useListDomainTables(domain: string | undefined) {
  return useQuery({
    queryKey: ["val-domain-tables", domain],
    queryFn: () => invoke<TableInfo[]>("val_list_domain_tables", { domain: domain! }),
    enabled: !!domain,
    staleTime: 60_000, // Cache for 1 minute
  });
}


// ============================================================================
// Category Library
// ============================================================================

/** Category entry with value, count, and domains */
export interface CategoryEntry {
  value: string;
  count: number;
  domains: string[];
}

/** Category library result from scanning all definition_analysis.json files */
export interface CategoryLibrary {
  data_types: CategoryEntry[];
  data_categories: CategoryEntry[];
  data_sub_categories: CategoryEntry[];
  usage_statuses: CategoryEntry[];
  actions: CategoryEntry[];
  data_sources: CategoryEntry[];
  total_tables_scanned: number;
  domains_scanned: string[];
}

/** Scan all definition_analysis.json files to extract unique category values */
export function useScanCategoryLibrary() {
  return useQuery({
    queryKey: ["val-category-library"],
    queryFn: () => invoke<CategoryLibrary>("val_scan_category_library"),
    staleTime: 5 * 60_000, // Cache for 5 minutes
  });
}

// ============================================================================
// Domain Model (entity scan across production domains)
// ============================================================================

export interface ModelInfo {
  name: string;
  table_name: string | null;
  display_name: string | null;
  has_schema_json: boolean;
  has_schema_md: boolean;
  has_sql: boolean;
  has_workflow: boolean;
  has_domains: boolean;
  has_categoricals: boolean;
  field_count: number | null;
  categorical_count: number | null;
  domain_count: number | null;
  active_domain_count: number | null;
  total_records: number | null;
  ai_package: boolean;
  ai_skills: string[];
}

export interface EntityInfo {
  name: string;
  models: ModelInfo[];
}

export interface DomainModelScanResult {
  domains_found: number;
  active_domains: number;
  total_records: number;
  duration_ms: number;
  errors: string[];
}

/** List all documented domain model entities from the entities folder */
export function useDomainModelEntities(entitiesPath: string | null) {
  return useQuery({
    queryKey: ["domain-model-entities", entitiesPath],
    queryFn: () =>
      invoke<EntityInfo[]>("val_list_domain_model_entities", {
        entitiesPath,
      }),
    enabled: !!entitiesPath,
    staleTime: 30_000,
  });
}

/** Read a domain model JSON file (domains.json or categoricals.json) */
export function useDomainModelFile<T = unknown>(filePath: string | null) {
  return useQuery({
    queryKey: ["domain-model-file", filePath],
    queryFn: () =>
      invoke<T>("val_read_domain_model_file", { filePath }),
    enabled: !!filePath,
    staleTime: 30_000,
  });
}

/** Scan all configured domains using schema.json as source of truth */
export function useScanDomainModelTable() {
  const qc = useQueryClient();
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);

  return useMutation({
    mutationFn: async (params: {
      schemaPath: string;
      domainTypes?: string[];
      referenceDomain?: string;
    }) => {
      const jobId = `domain-model-scan-${Date.now()}`;
      addJob({
        id: jobId,
        name: "Domain Model Scan",
        status: "running",
        message: "Scanning domains...",
      });

      try {
        const result = await invoke<DomainModelScanResult>(
          "val_scan_domain_model_table",
          {
            schemaPath: params.schemaPath,
            domainTypes: params.domainTypes ?? null,
            referenceDomain: params.referenceDomain ?? null,
          }
        );

        updateJob(jobId, {
          status: "completed",
          progress: 100,
          message: `Found ${result.domains_found} domains (${result.active_domains} active, ${result.total_records.toLocaleString()} records) in ${(result.duration_ms / 1000).toFixed(1)}s`,
        });

        return result;
      } catch (err) {
        updateJob(jobId, {
          status: "failed",
          message: `Scan failed: ${err}`,
        });
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
      qc.invalidateQueries({ queryKey: ["domain-model-file"] });
    },
  });
}

/** Generate schema.md from schema.json */
export function useGenerateSchemaMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schemaJsonPath: string) =>
      invoke<string>("val_generate_schema_md", { schemaJsonPath }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

/** Enrich empty descriptions in schema.json from domain AI analysis */
export function useEnrichSchemaDescriptions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      schemaJsonPath,
      domainsBasePath,
    }: {
      schemaJsonPath: string;
      domainsBasePath: string;
    }) =>
      invoke<{ enriched: number; total_ai_descriptions: number; source_domain: string | null }>(
        "val_enrich_schema_descriptions",
        { schemaJsonPath, domainsBasePath }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-file"] });
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

export interface CreateSchemaResult {
  schema_path: string;
  field_count: number;
}

// ============================================================================
// Field Master (cross-entity field registry)
// ============================================================================

export interface MasterFieldEntity {
  entity: string;
  model: string;
}

export interface MasterField {
  key: string;
  field_id: number | null;
  column: string;
  name: string;
  type: string;
  group: string | null;
  is_categorical: boolean;
  description: string | null;
  tags: string[];
  entities: MasterFieldEntity[];
}

export interface FieldMasterFile {
  generated: string;
  total_fields: number;
  total_entities: number;
  fields: MasterField[];
}

/** Build the field master by scanning all entity schemas and merging with existing edits */
export function useBuildFieldMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entitiesPath: string) =>
      invoke<FieldMasterFile>("val_build_field_master", { entitiesPath }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-file"] });
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

/** Save the field master and propagate governed fields to all entity schemas */
export function useSaveFieldMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entitiesPath,
      master,
    }: {
      entitiesPath: string;
      master: FieldMasterFile;
    }) =>
      invoke<number>("val_save_field_master", { entitiesPath, master }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-file"] });
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

/** Create schema.json for a domain model entity from a domain's definition.json */
export function useCreateDomainModelSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      definitionPath: string;
      entityName: string;
      modelName: string;
      entitiesBasePath: string;
      tableDisplayName: string;
    }) =>
      invoke<CreateSchemaResult>("val_create_domain_model_schema", {
        definitionPath: params.definitionPath,
        entityName: params.entityName,
        modelName: params.modelName,
        entitiesBasePath: params.entitiesBasePath,
        tableDisplayName: params.tableDisplayName,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-model-entities"] });
    },
  });
}

// ============================================================================
// AI Package (domain AI skill packages)
// ============================================================================

export interface AiTableInfo {
  file_name: string;
  table_id: string;
  display_name: string;
  ai_skills: string[];
}

export interface DomainAiStatus {
  domain: string;
  domain_type: string;
  global_path: string;
  has_ai_folder: boolean;
  table_count: number;
  skill_count: number;
  has_instructions: boolean;
  table_files: AiTableInfo[];
  skill_files: string[];
  configured_skills: string[];
  disabled_tables: string[];
}

export interface AiPackageResult {
  domain: string;
  tables_copied: string[];
  skills_copied: string[];
  instructions_generated: boolean;
  errors: string[];
}

export interface ExtractTemplatesResult {
  skills_extracted: string[];
  instructions_extracted: boolean;
}

/** List AI package status for all configured domains */
export function useListDomainAiStatus(entitiesPath?: string | null) {
  return useQuery({
    queryKey: ["domain-ai-status", entitiesPath],
    queryFn: () =>
      invoke<DomainAiStatus[]>("val_list_domain_ai_status", {
        entitiesPath: entitiesPath ?? undefined,
      }),
    staleTime: 30_000,
  });
}

/** Generate an AI package for a domain with explicit skill selection */
export function useGenerateAiPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      domain: string;
      entitiesPath: string;
      templatesPath: string;
      skills: string[];
    }) =>
      invoke<AiPackageResult>("val_generate_ai_package", {
        domain: params.domain,
        entitiesPath: params.entitiesPath,
        templatesPath: params.templatesPath,
        skills: params.skills,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-ai-status"] });
    },
  });
}

/** Save per-domain AI skill configuration */
export function useSaveDomainAiConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { domain: string; skills: string[] }) =>
      invoke<void>("val_save_domain_ai_config", {
        domain: params.domain,
        skills: params.skills,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-ai-status"] });
    },
  });
}

/** Toggle a single table enabled/disabled for a domain */
export function useToggleAiTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      domain: string;
      entitiesPath: string;
      templatesPath: string;
      fileName: string;
      enabled: boolean;
    }) =>
      invoke<AiPackageResult>("val_toggle_ai_table", {
        domain: params.domain,
        entitiesPath: params.entitiesPath,
        templatesPath: params.templatesPath,
        fileName: params.fileName,
        enabled: params.enabled,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-ai-status"] });
    },
  });
}

/** Extract templates from an existing domain's AI package */
export function useExtractAiTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      domain: string;
      templatesOutputPath: string;
    }) =>
      invoke<ExtractTemplatesResult>("val_extract_ai_templates", {
        domain: params.domain,
        templatesOutputPath: params.templatesOutputPath,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-ai-status"] });
    },
  });
}
