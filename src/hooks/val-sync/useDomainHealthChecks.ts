// Domain health check runner + query hooks
//
// Workflow checks: sync via VAL API → read JSON file → score
// Notification checks: fetch from VAL notification stream → score

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import { useJobsStore } from "../../stores/jobsStore";
import { supabase } from "../../lib/supabase";
import { toSGTDateString } from "../../lib/date";
import type { SyncAllDomainsProgress, SyncResult } from "./types";
import {
  API_CHECKS,
  NOTIFICATION_CHECKS,
  type HealthCheckResult,
  type DomainWorkflowContext,
  type ValNotification,
  type WorkflowExecution,
  type WorkflowDefinition,
} from "./healthChecks";

// ============================================================
// Query Keys
// ============================================================

export const healthCheckKeys = {
  all: ["domain-health-checks"] as const,
  list: () => [...healthCheckKeys.all, "list"] as const,
};

// ============================================================
// Helpers
// ============================================================

/** Get monitoring time window (yesterday 23:00 SGT → now) */
function getMonitoringWindow() {
  const now = new Date();
  const todaySGT = toSGTDateString(now);
  const [y, m, d] = todaySGT.split("-").map(Number);
  const yesterdaySGT23 = new Date(Date.UTC(y, m - 1, d - 1, 23 - 8, 0, 0));
  const fmt = (dt: Date) => dt.toISOString().replace("Z", "");
  return { from: fmt(yesterdaySGT23), to: fmt(now) };
}

/** Load workflow context for a domain: sync executions via API, read files */
async function loadWorkflowContext(domain: string): Promise<DomainWorkflowContext> {
  const { from, to } = getMonitoringWindow();

  // 1. Sync fresh workflow execution data via VAL API
  const syncResult = await invoke<SyncResult>("val_sync_workflow_executions", {
    domain,
    from,
    to,
  });

  // 2. Read the synced execution data
  let executions: WorkflowExecution[] = [];
  try {
    const raw = await invoke<string>("read_file", { path: syncResult.file_path });
    const parsed = JSON.parse(raw);
    executions = Array.isArray(parsed) ? parsed : [];
  } catch {
    // File might not exist or be empty
  }

  // 3. Read the workflow registry (all_workflows.json) for names + cron
  //    Derive the path from the sync result file path
  //    syncResult.file_path = .../domains/{domain}/monitoring/{date}/workflow_executions_...
  //    all_workflows.json = .../domains/{domain}/schema/all_workflows.json
  const monitoringIdx = syncResult.file_path.indexOf("/monitoring/");
  const domainBasePath = monitoringIdx > 0 ? syncResult.file_path.slice(0, monitoringIdx) : null;

  let workflows: WorkflowDefinition[] = [];
  if (domainBasePath) {
    try {
      const wfRaw = await invoke<string>("read_file", {
        path: `${domainBasePath}/schema/all_workflows.json`,
      });
      const wfParsed = JSON.parse(wfRaw);
      const wfData = wfParsed?.data ?? wfParsed;
      workflows = Array.isArray(wfData) ? wfData : [];
    } catch {
      // Registry might not be synced yet — checks will use job IDs as fallback
    }
  }

  // Build lookup maps
  const nameMap = new Map<number, string>();
  const cronMap = new Map<number, string | null>();
  for (const wf of workflows) {
    nameMap.set(wf.id, wf.name);
    cronMap.set(wf.id, wf.cron_expression);
  }

  return { executions, workflows, nameMap, cronMap };
}

// ============================================================
// Notification-based check runner (platform errors)
// ============================================================

/** Fetch notifications from VAL notification stream */
async function fetchNotifications(domain: string): Promise<ValNotification[]> {
  const result = await invoke<{ data?: ValNotification[] } | ValNotification[]>(
    "val_fetch_notifications",
    { domain, max: 2000 }
  );
  const items = Array.isArray(result) ? result : (result?.data ?? []);
  return items;
}

// ============================================================
// Runner hook
// ============================================================

export function useDomainHealthCheckRunner() {
  const addJob = useJobsStore((s) => s.addJob);
  const updateJob = useJobsStore((s) => s.updateJob);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncAllDomainsProgress | null>(null);
  const abortRef = useRef(false);

  const trigger = useCallback(
    async (domains: string[]) => {
      if (progress?.isRunning) return;
      abortRef.current = false;

      const jobId = `domain-health-checks-${Date.now()}`;
      const total = domains.length;
      const completed: string[] = [];
      const failed: string[] = [];

      addJob({
        id: jobId,
        name: `Health Checks (${total} domains)`,
        status: "running",
        progress: 0,
        message: `Starting health checks for ${total} domains...`,
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
            progress: Math.round((i / total) * 100),
            message: `Aborted after ${completed.length} completed, ${failed.length} failed`,
          });
          setProgress((p) => (p ? { ...p, isRunning: false } : null));
          return;
        }

        const domain = domains[i];
        updateJob(jobId, {
          progress: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] Checking ${domain}...`,
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
          const results: HealthCheckResult[] = [];
          const now = new Date().toISOString();

          // 1. Load workflow context once (syncs via API + reads files)
          let workflowCtx: DomainWorkflowContext | null = null;
          if (API_CHECKS.length > 0) {
            try {
              workflowCtx = await loadWorkflowContext(domain);
            } catch (err) {
              // If API sync fails, mark all API checks as error
              for (const check of API_CHECKS) {
                results.push({
                  domain,
                  check_type: check.type,
                  status: "error",
                  details: { error: err instanceof Error ? err.message : String(err) },
                  checked_at: now,
                });
              }
            }
          }

          // 2. Run API-based checks against the loaded context
          if (workflowCtx) {
            for (const check of API_CHECKS) {
              try {
                const scored = check.scoreFromApi!(workflowCtx);
                results.push({ domain, check_type: check.type, ...scored, checked_at: now });
              } catch (err) {
                results.push({
                  domain,
                  check_type: check.type,
                  status: "error",
                  details: { error: err instanceof Error ? err.message : String(err) },
                  checked_at: now,
                });
              }
            }
          }

          // 3. Run notification-based checks (platform errors)
          if (NOTIFICATION_CHECKS.length > 0) {
            try {
              const notifications = await fetchNotifications(domain);
              for (const check of NOTIFICATION_CHECKS) {
                try {
                  const scored = check.scoreFromNotifications!(notifications);
                  results.push({ domain, check_type: check.type, ...scored, checked_at: now });
                } catch (err) {
                  results.push({
                    domain,
                    check_type: check.type,
                    status: "error",
                    details: { error: err instanceof Error ? err.message : String(err) },
                    checked_at: now,
                  });
                }
              }
            } catch (err) {
              for (const check of NOTIFICATION_CHECKS) {
                results.push({
                  domain,
                  check_type: check.type,
                  status: "error",
                  details: { error: err instanceof Error ? err.message : String(err) },
                  checked_at: now,
                });
              }
            }
          }

          // 4. Upsert results to Supabase
          const { error } = await supabase
            .from("domain_health_checks")
            .upsert(results, { onConflict: "domain,check_type" });

          if (error) throw error;
          completed.push(domain);
        } catch {
          failed.push(domain);
        }
      }

      const finalMsg =
        failed.length > 0
          ? `Done: ${completed.length} checked, ${failed.length} failed (${failed.join(", ")})`
          : `Done: ${completed.length}/${total} domains checked`;

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

      qc.invalidateQueries({ queryKey: healthCheckKeys.all });
    },
    [addJob, updateJob, qc, progress?.isRunning]
  );

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { trigger, abort, progress };
}

// ============================================================
// Query: read health check results
// ============================================================

export function useDomainHealthChecks() {
  return useQuery({
    queryKey: healthCheckKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domain_health_checks")
        .select("*")
        .order("domain");
      if (error) throw error;
      return data as HealthCheckResult[];
    },
    staleTime: 60_000,
  });
}
