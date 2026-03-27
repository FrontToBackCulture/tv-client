// Domain health check definitions — pure data + logic, no React
//
// Two check modes:
// - "api" checks: use VAL workflow execution API, then score the response
// - "sql" checks: use execute-val-sql for data-in-table checks (mapping duplicates)

// ============================================================
// Types
// ============================================================

export type HealthStatus = "pass" | "warn" | "fail" | "error";

export interface HealthCheckResult {
  domain: string;
  check_type: string;
  status: HealthStatus;
  details: Record<string, unknown>;
  checked_at: string;
}

export interface CheckScoreResult {
  status: HealthStatus;
  details: Record<string, unknown>;
}

/** A workflow execution record from the VAL API */
export interface WorkflowExecution {
  id: string;
  job_id: number;
  status: "completed" | "failed" | "active";
  result: string[] | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  user_id: number | null;
}

/** A workflow definition from all_workflows.json */
export interface WorkflowDefinition {
  id: number;
  name: string;
  cron_expression: string | null;
  deleted: boolean;
  latest_run_status: string | null;
  run_started_at: string | null;
  run_completed_at: string | null;
}

/** A notification entry from the VAL notification stream */
export interface ValNotification {
  updated: number | string;
  user: string | number;
  uuid: string;
  message: string;
  created: string;
  status?: string;
  action?: string;
  table?: string;
  tableName?: string;
  origin?: string;
  identifier?: string;
  progress?: number;
  topic?: string;
  userName?: string;
  fail?: boolean;
  errorMessage?: string;
}

/** Preloaded context for API-based checks (fetched once per domain) */
export interface DomainWorkflowContext {
  executions: WorkflowExecution[];
  workflows: WorkflowDefinition[];
  /** Lookup: job_id → workflow name */
  nameMap: Map<number, string>;
  /** Lookup: job_id → cron expression (null = ad-hoc) */
  cronMap: Map<number, string | null>;
}

export interface HealthCheckDefinition {
  type: string;
  label: string;
  description: string;
  criteria: { pass: string; warn: string; fail: string };
  whatItChecks: string;
  howItWorks: string;
  /** Check mode: "api" uses VAL workflow API data, "notifications" uses VAL notification stream */
  mode: "api" | "notifications";
  /** For "api" mode: score from preloaded workflow context */
  scoreFromApi?: (ctx: DomainWorkflowContext) => CheckScoreResult;
  /** For "notifications" mode: score from notification stream data */
  scoreFromNotifications?: (notifications: ValNotification[]) => CheckScoreResult;
  /** For "sql" mode: primary SQL query */
  getSql?: () => string;
  /** For "sql" mode: optional pre-query */
  preSql?: string;
  /** For "sql" mode: build follow-up queries from pre-query results */
  getFollowUpQueries?: (preRows: Record<string, unknown>[]) => { sql: string; meta: Record<string, unknown> }[];
  /** For "sql" mode: score single-query results */
  score?: (rows: Record<string, unknown>[], error: string | null) => CheckScoreResult;
  /** For "sql" mode: score multi-step results */
  scoreMulti?: (
    preRows: Record<string, unknown>[],
    followUpResults: { rows: Record<string, unknown>[]; meta: Record<string, unknown>; error: string | null }[]
  ) => CheckScoreResult;
}

// ============================================================
// API-based Check Definitions (use VAL workflow execution API)
// ============================================================

const workflowFailures: HealthCheckDefinition = {
  type: "workflow_failures",
  label: "Workflow Failures",
  description: "Failed workflow executions since yesterday 11pm",
  criteria: { pass: "0 failures", warn: "1–5 failures", fail: "6+ failures" },
  whatItChecks: "Looks for any automated workflow (data imports, reconciliation, report generation) that crashed or errored since yesterday 11pm SGT.",
  howItWorks: "Fetches workflow executions from the VAL API (yesterday 23:00 SGT → now), then filters for entries with status 'failed'. Resolves job IDs to workflow names using the synced workflow registry.",
  mode: "api",
  scoreFromApi: (ctx) => {
    const failures = ctx.executions.filter((e) => e.status === "failed");
    const count = failures.length;
    const status: HealthStatus = count === 0 ? "pass" : count <= 5 ? "warn" : "fail";
    return {
      status,
      details: {
        count,
        failures: failures.slice(0, 20).map((e) => ({
          job_id: e.job_id,
          job_name: ctx.nameMap.get(e.job_id) || `Job #${e.job_id}`,
          error: e.error,
          started_at: e.started_at,
        })),
      },
    };
  },
};

const staleScheduledJobs: HealthCheckDefinition = {
  type: "stale_scheduled_jobs",
  label: "Stale Scheduled Jobs",
  description: "Scheduled workflows that haven't run in 48+ hours",
  criteria: { pass: "All on schedule", warn: "1–2 overdue", fail: "3+ overdue" },
  whatItChecks: "Finds scheduled automations (cron jobs) that should be running regularly but haven't executed recently. If a daily job hasn't run in 48 hours, something is stuck or disabled.",
  howItWorks: "Reads the workflow registry (all_workflows.json) for jobs with a cron expression, then cross-references with recent executions from the VAL API. Flags any scheduled job whose last run was more than 48 hours ago, or that has never run.",
  mode: "api",
  scoreFromApi: (ctx) => {
    const now = Date.now();
    const threshold48h = 48 * 60 * 60 * 1000;

    // Find scheduled workflows (have cron) that are not deleted
    const scheduledWorkflows = ctx.workflows.filter(
      (w) => w.cron_expression && !w.deleted
    );

    // For each scheduled workflow, find the most recent execution
    const stale: {
      id: number;
      name: string;
      cron_expression: string;
      last_run: string | null;
      hours_since_last_run: number | null;
    }[] = [];

    for (const wf of scheduledWorkflows) {
      const execsForJob = ctx.executions.filter((e) => e.job_id === wf.id);
      const lastExec = execsForJob.reduce<WorkflowExecution | null>((latest, e) => {
        if (!latest) return e;
        return e.started_at > latest.started_at ? e : latest;
      }, null);

      // Also consider the workflow's own run_started_at (from the registry, which covers history beyond the sync window)
      let lastRunTime: number | null = null;
      let lastRunStr: string | null = null;

      if (lastExec) {
        lastRunTime = new Date(lastExec.started_at).getTime();
        lastRunStr = lastExec.started_at;
      }
      if (wf.run_started_at) {
        const regTime = new Date(wf.run_started_at).getTime();
        if (!lastRunTime || regTime > lastRunTime) {
          lastRunTime = regTime;
          lastRunStr = wf.run_started_at;
        }
      }

      if (!lastRunTime || now - lastRunTime > threshold48h) {
        const hoursSince = lastRunTime
          ? Math.round((now - lastRunTime) / (60 * 60 * 1000))
          : null;
        stale.push({
          id: wf.id,
          name: wf.name,
          cron_expression: wf.cron_expression!,
          last_run: lastRunStr,
          hours_since_last_run: hoursSince,
        });
      }
    }

    // Sort: never-run first, then by hours descending
    stale.sort((a, b) => {
      if (a.hours_since_last_run === null) return -1;
      if (b.hours_since_last_run === null) return 1;
      return b.hours_since_last_run - a.hours_since_last_run;
    });

    const count = stale.length;
    const status: HealthStatus = count === 0 ? "pass" : count <= 2 ? "warn" : "fail";
    return {
      status,
      details: { count, stale_jobs: stale.slice(0, 20) },
    };
  },
};

const errorPatterns: HealthCheckDefinition = {
  type: "error_patterns",
  label: "Error Patterns",
  description: "Recurring workflow errors since yesterday 11pm",
  criteria: { pass: "No repeating errors", warn: "Same error 2–4 times", fail: "Same error 5+ times" },
  whatItChecks: "Identifies errors that keep happening repeatedly — a sign of a systemic issue rather than a one-off glitch. For example, the same SQL column missing across multiple runs.",
  howItWorks: "Groups failed workflow executions from the VAL API (yesterday 23:00 SGT → now) by job and error message. Flags any error that occurred 2 or more times. The more repetitions, the higher the severity.",
  mode: "api",
  scoreFromApi: (ctx) => {
    const failures = ctx.executions.filter((e) => e.status === "failed" && e.error);

    // Group by job_id + truncated error
    const groups = new Map<string, { job_id: number; job_name: string; error: string; count: number; latest: string }>();
    for (const e of failures) {
      const errorKey = (e.error || "").slice(0, 200);
      const key = `${e.job_id}:${errorKey}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        if (e.started_at > existing.latest) existing.latest = e.started_at;
      } else {
        groups.set(key, {
          job_id: e.job_id,
          job_name: ctx.nameMap.get(e.job_id) || `Job #${e.job_id}`,
          error: errorKey,
          count: 1,
          latest: e.started_at,
        });
      }
    }

    // Filter to patterns (2+ occurrences)
    const patterns = Array.from(groups.values())
      .filter((g) => g.count >= 2)
      .sort((a, b) => b.count - a.count);

    const maxOccurrences = patterns.reduce((max, p) => Math.max(max, p.count), 0);
    const status: HealthStatus =
      patterns.length === 0 ? "pass" : maxOccurrences >= 5 ? "fail" : "warn";

    return {
      status,
      details: {
        pattern_count: patterns.length,
        patterns: patterns.slice(0, 15).map((p) => ({
          job_id: p.job_id,
          job_name: p.job_name,
          error: p.error,
          occurrences: p.count,
          latest: p.latest,
        })),
      },
    };
  },
};

// ============================================================
// Notification-based Check Definitions (use VAL notification stream)
// ============================================================

const platformErrors: HealthCheckDefinition = {
  type: "platform_errors",
  label: "Platform Errors",
  description: "Failed operations reported in the VAL notification stream",
  criteria: { pass: "0 failed operations", warn: "1–3 failures", fail: "4+ failures" },
  whatItChecks: "Checks the VAL notification stream for any operations that failed — workflow imports, data uploads, inline edits, AI extractions. These are errors that users or automated processes encountered.",
  howItWorks: "Fetches the last 2000 notifications from the VAL workspace API and filters for entries with status 'failed'. Groups failures by table/origin to identify patterns.",
  mode: "notifications",
  scoreFromNotifications: (notifications) => {
    const failed = notifications.filter(
      (n) => n.status === "failed" || n.status === "fail"
    );

    // Group by table for summary
    const byTable = new Map<string, { count: number; latest: string; origin: string; message: string }>();
    for (const n of failed) {
      const key = n.tableName || n.table || "unknown";
      const existing = byTable.get(key);
      if (existing) {
        existing.count++;
        if (n.created > existing.latest) {
          existing.latest = n.created;
          existing.message = n.message;
        }
      } else {
        byTable.set(key, {
          count: 1,
          latest: n.created,
          origin: n.origin || "",
          message: n.message,
        });
      }
    }

    const count = failed.length;
    const status: HealthStatus = count === 0 ? "pass" : count <= 3 ? "warn" : "fail";

    return {
      status,
      details: {
        count,
        tables_affected: byTable.size,
        failures: Array.from(byTable.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 15)
          .map(([table, info]) => ({
            table,
            count: info.count,
            origin: info.origin,
            latest: info.latest,
            message: info.message,
          })),
      },
    };
  },
};

// ============================================================
// Exports
// ============================================================

export const HEALTH_CHECKS: HealthCheckDefinition[] = [
  workflowFailures,
  staleScheduledJobs,
  errorPatterns,
  platformErrors,
];

export const HEALTH_CHECK_LABELS: Record<string, string> = Object.fromEntries(
  HEALTH_CHECKS.map((c) => [c.type, c.label])
);

/** Checks that use the VAL workflow API */
export const API_CHECKS = HEALTH_CHECKS.filter((c) => c.mode === "api");

/** Checks that use the VAL notification stream */
export const NOTIFICATION_CHECKS = HEALTH_CHECKS.filter((c) => c.mode === "notifications");
