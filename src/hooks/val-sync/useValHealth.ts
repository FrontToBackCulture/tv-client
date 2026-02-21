// Health checks + analysis hooks

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import { useJobsStore } from "../../stores/jobsStore";
import { valSyncKeys, type SyncAllDomainsProgress } from "./types";

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
// Single-Domain Health Mutations
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
// Bulk Health Hooks
// ============================================================

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
