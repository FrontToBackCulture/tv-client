// Bulk domain operations + S3 sync

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import { useJobsStore } from "../../stores/jobsStore";
import { valSyncKeys, type SyncAllDomainsProgress, type SyncResult, type SyncAllResult } from "./types";
import { toSGTDateString } from "../../lib/date";

// ============================================================
// S3 Types
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

// ============================================================
// Helpers
// ============================================================

/** Get default monitoring time window (yesterday 23:00 → now) in SGT */
function getDefaultMonitoringWindow() {
  const now = new Date();
  // Build yesterday 23:00 SGT by getting today's SGT date and subtracting
  const todaySGT = toSGTDateString(now);
  const [y, m, d] = todaySGT.split("-").map(Number);
  // Yesterday 23:00 SGT = UTC 15:00 the day before
  const yesterdaySGT23 = new Date(Date.UTC(y, m - 1, d - 1, 23 - 8, 0, 0));
  const fmt = (dt: Date) => dt.toISOString().replace("Z", "");
  return { from: fmt(yesterdaySGT23), to: fmt(now) };
}

/** Get today's date as YYYY-MM-DD in SGT */
function getTodayDate() {
  return toSGTDateString();
}

// ============================================================
// Bulk Sync Hooks
// ============================================================

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
// S3 Sync Hooks
// ============================================================

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

/** Compute dependencies + recency for all domains (no full sync needed) */
export function useComputeAllDependencies() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `val-compute-deps-all-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Compute Dependencies (${total} domains)`,
        status: "running",
        progress: 0,
        message: `Starting for ${total} domains...`,
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
        const pct = Math.round((i / total) * 100);

        updateJob(jobId, { progress: pct, message: `[${i + 1}/${total}] ${domain}: computing dependencies...` });
        setProgress({ current: i + 1, total, currentDomain: domain, completed: [...completed], failed: [...failed], isRunning: true });

        try {
          await invoke("val_compute_dependencies", { domain });
          updateJob(jobId, { message: `[${i + 1}/${total}] ${domain}: collecting recency...` });
          await invoke("val_collect_recency", { domain });
          completed.push(domain);
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg = failed.length > 0
        ? `Done: ${completed.length} computed, ${failed.length} failed (${failed.join(", ")})`
        : `Done: ${completed.length}/${total} domains analyzed`;

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
