// Domain health check runner + query hooks
//
// Workflow checks: sync via VAL API → read JSON file → score
// Mapping checks: execute-val-sql → score

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";
import { useJobsStore } from "../../stores/jobsStore";
import { supabase } from "../../lib/supabase";
import { toSGTDateString } from "../../lib/date";
import type { SyncAllDomainsProgress, SyncResult } from "./types";
import type { SqlExecuteResult } from "./useValSql";
import {
  API_CHECKS,
  SQL_CHECKS,
  type HealthCheckResult,
  type HealthCheckDefinition,
  type HealthStatus,
  type DomainWorkflowContext,
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
// SQL-based check runner (mapping duplicates)
// ============================================================

async function runSql(domain: string, sql: string, limit = 500): Promise<SqlExecuteResult> {
  return invoke<SqlExecuteResult>("val_execute_sql", { domain, sql, limit });
}

async function runSqlCheck(
  domain: string,
  check: HealthCheckDefinition
): Promise<HealthCheckResult> {
  const now = new Date().toISOString();

  try {
    // Multi-step check (mapping duplicates)
    if (check.preSql && check.getFollowUpQueries && check.scoreMulti) {
      const preResult = await runSql(domain, check.preSql);
      if (preResult.error) {
        return {
          domain,
          check_type: check.type,
          status: "pass",
          details: { note: "Pre-query failed", error: preResult.error },
          checked_at: now,
        };
      }

      const followUpQueries = check.getFollowUpQueries(preResult.data);
      const followUpResults: {
        rows: Record<string, unknown>[];
        meta: Record<string, unknown>;
        error: string | null;
      }[] = [];

      for (const fq of followUpQueries) {
        try {
          const result = await runSql(domain, fq.sql);
          followUpResults.push({ rows: result.data, meta: fq.meta, error: result.error });
        } catch (err) {
          followUpResults.push({
            rows: [],
            meta: fq.meta,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const scored = check.scoreMulti(preResult.data, followUpResults);
      return { domain, check_type: check.type, ...scored, checked_at: now };
    }

    // Simple single-query
    const sql = check.getSql!();
    const result = await runSql(domain, sql);
    const scored = check.score!(result.data, result.error);
    return { domain, check_type: check.type, ...scored, checked_at: now };
  } catch (err) {
    return {
      domain,
      check_type: check.type,
      status: "error" as HealthStatus,
      details: { error: err instanceof Error ? err.message : String(err) },
      checked_at: now,
    };
  }
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

          // 3. Run SQL-based checks (mapping duplicates)
          for (const check of SQL_CHECKS) {
            const result = await runSqlCheck(domain, check);
            results.push(result);
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
