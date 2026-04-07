// src/modules/domains/HealthDashboard.tsx
// Domain health scoreboard — shows pass/warn/fail per domain per check type
// with AI-generated plain-English explanations via Haiku

import { useState, useCallback, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDiscoverDomains } from "../../hooks/val-sync";
import {
  useDomainHealthChecks,
  useDomainHealthCheckRunner,
} from "../../hooks/val-sync/useDomainHealthChecks";
import {
  HEALTH_CHECKS,
  HEALTH_CHECK_LABELS,
  type HealthCheckResult,
  type HealthStatus,
} from "../../hooks/val-sync/healthChecks";
import { usePrimaryKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { supabase } from "../../lib/supabase";
import { RefreshCw, Loader2, X, Sparkles, Info, FileWarning, Plug } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";

// ============================================================
// Status helpers
// ============================================================

const STATUS_DOT: Record<HealthStatus | "none", string> = {
  pass: "bg-green-500",
  warn: "bg-yellow-500",
  fail: "bg-red-500",
  error: "bg-zinc-400",
  none: "bg-zinc-300 dark:bg-zinc-700",
};

const STATUS_LABEL: Record<HealthStatus | "none", string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
  error: "Error",
  none: "Not checked",
};

const STATUS_BG: Record<HealthStatus | "none", string> = {
  pass: "bg-green-50 dark:bg-green-950/30",
  warn: "bg-yellow-50 dark:bg-yellow-950/30",
  fail: "bg-red-50 dark:bg-red-950/30",
  error: "bg-zinc-50 dark:bg-zinc-900",
  none: "",
};

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ============================================================
// AI Summary (Haiku)
// ============================================================

async function generateAiSummary(result: HealthCheckResult): Promise<string> {
  const apiKey = await invoke<string | null>("settings_get_anthropic_key");
  if (!apiKey) return "No Anthropic API key configured.";

  const detailsText = JSON.stringify(result.details, null, 2).slice(0, 4000);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `You are a data operations assistant for a data platform called VAL. A health check just ran on the "${result.domain}" domain.

Check type: ${result.check_type} (${HEALTH_CHECK_LABELS[result.check_type] || result.check_type})
Status: ${result.status}

Raw results:
${detailsText}

Context:
- "Workflow failures" = automated data processing jobs that crashed. The error messages contain SQL errors or data issues.
- "Stale scheduled jobs" = cron-scheduled automations that haven't run when they should have. hours_since_last_run shows how overdue they are.
- "Mapping duplicates" = outlet/platform mapping tables where the same vendor code (key_value) maps to multiple rows. This causes reconciliation mismatches because the system can't determine which outlet a transaction belongs to.
- "Error patterns" = the same error happening repeatedly, indicating a systemic issue.

Write a brief plain-English summary (3-5 sentences max) that:
1. Explains what the issue is in simple terms (no technical jargon like "job_id" or "custom_tbl")
2. States the impact on data quality
3. Suggests what to do about it

If status is "pass", just say everything looks good in 1 sentence.
Do NOT use markdown formatting — just plain sentences.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const parsed = await response.json();
  return parsed.content?.[0]?.text || "Could not generate summary.";
}

// ============================================================
// Detail Panel
// ============================================================

function HealthDetailPanel({
  result,
  onClose,
}: {
  result: HealthCheckResult;
  onClose: () => void;
}) {
  const details = result.details;
  const [aiSummary, setAiSummary] = useState<string | null>(
    (details.ai_summary as string) || null
  );
  const [aiLoading, setAiLoading] = useState(false);

  // Auto-generate summary when panel opens if there's an issue and no cached summary
  useEffect(() => {
    if (result.status !== "pass" && !aiSummary && !aiLoading) {
      setAiLoading(true);
      generateAiSummary(result)
        .then(async (summary) => {
          setAiSummary(summary);
          // Cache the summary in Supabase
          await supabase
            .from("domain_health_checks")
            .update({ details: { ...result.details, ai_summary: summary } })
            .eq("domain", result.domain)
            .eq("check_type", result.check_type);
        })
        .catch(() => setAiSummary("Could not generate summary."))
        .finally(() => setAiLoading(false));
    }
  }, [result.domain, result.check_type]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = useCallback(async () => {
    setAiLoading(true);
    setAiSummary(null);
    try {
      const summary = await generateAiSummary(result);
      setAiSummary(summary);
      await supabase
        .from("domain_health_checks")
        .update({ details: { ...result.details, ai_summary: summary } })
        .eq("domain", result.domain)
        .eq("check_type", result.check_type);
    } catch {
      setAiSummary("Could not generate summary.");
    } finally {
      setAiLoading(false);
    }
  }, [result]);

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 max-h-96 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", STATUS_DOT[result.status])} />
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {result.domain} — {HEALTH_CHECK_LABELS[result.check_type] || result.check_type}
          </span>
          <span className="text-xs text-zinc-400">
            {formatTimeAgo(result.checked_at)}
          </span>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>

      {/* AI Summary */}
      {result.status !== "pass" && (
        <div className="mb-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={12} className="text-amber-500" />
            <span className="text-xs font-medium text-zinc-500">AI Summary</span>
            {aiSummary && !aiLoading && (
              <button
                onClick={handleRegenerate}
                className="text-xs text-zinc-400 hover:text-zinc-600 ml-auto"
                title="Regenerate"
              >
                <RefreshCw size={10} />
              </button>
            )}
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              Analyzing...
            </div>
          ) : (
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {aiSummary}
            </p>
          )}
        </div>
      )}

      {/* Pass — simple message */}
      {result.status === "pass" && (
        <p className="text-xs text-green-600 dark:text-green-400">
          {details.note ? String(details.note) : "All checks passed — no issues found."}
        </p>
      )}

      {/* Error message */}
      {result.status === "error" && details.error != null && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-2 font-mono">
          {String(details.error)}
        </p>
      )}

      {/* Raw details (collapsible) */}
      {result.status !== "pass" && <RawDetails result={result} />}
    </div>
  );
}

function RawDetails({ result }: { result: HealthCheckResult }) {
  const [expanded, setExpanded] = useState(false);
  const details = result.details;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mb-1"
      >
        {expanded ? "Hide" : "Show"} raw details
      </button>

      {expanded && (
        <div className="space-y-1 mt-1">
          {/* Workflow failures */}
          {result.check_type === "workflow_failures" && Array.isArray(details.failures) && (
            <>
              <p className="text-xs text-zinc-500">{details.count as number} failure(s) in last 7 days</p>
              {(details.failures as Record<string, unknown>[]).map((f, i) => (
                <div key={i} className="text-xs bg-white dark:bg-zinc-800 rounded px-2 py-1.5 border border-zinc-200 dark:border-zinc-800">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{String(f.job_name)}</span>
                  <p className="text-zinc-500 mt-0.5 font-mono truncate">{String(f.error || "No error message")}</p>
                </div>
              ))}
            </>
          )}

          {/* Stale scheduled jobs */}
          {result.check_type === "stale_scheduled_jobs" && Array.isArray(details.stale_jobs) && (
            <>
              <p className="text-xs text-zinc-500">{details.count as number} stale job(s)</p>
              {(details.stale_jobs as Record<string, unknown>[]).map((j, i) => (
                <div key={i} className="text-xs bg-white dark:bg-zinc-800 rounded px-2 py-1.5 border border-zinc-200 dark:border-zinc-800">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{String(j.name)}</span>
                  <span className="text-zinc-400 ml-2">
                    {j.hours_since_last_run != null ? `${j.hours_since_last_run}h since last run` : "Never run"}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* Mapping duplicates */}
          {result.check_type === "mapping_duplicates" && (
            <>
              <p className="text-xs text-zinc-500">
                {details.tables_checked as number} table(s) checked, {details.tables_with_duplicates as number} with duplicates
              </p>
              {Array.isArray(details.duplicates) &&
                (details.duplicates as Record<string, unknown>[]).map((d, i) => (
                  <div key={i} className="text-xs bg-white dark:bg-zinc-800 rounded px-2 py-1.5 border border-zinc-200 dark:border-zinc-800">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{String(d.platform)}</span>
                    <span className="text-zinc-400 ml-2">{String(d.table)}</span>
                    <span className="text-zinc-500 ml-2">
                      key=<span className="font-mono">{String(d.key_value)}</span> ({String(d.count)}x)
                    </span>
                  </div>
                ))}
            </>
          )}

          {/* Error patterns */}
          {result.check_type === "error_patterns" && Array.isArray(details.patterns) && (
            <>
              <p className="text-xs text-zinc-500">{details.pattern_count as number} recurring pattern(s)</p>
              {(details.patterns as Record<string, unknown>[]).map((p, i) => (
                <div key={i} className="text-xs bg-white dark:bg-zinc-800 rounded px-2 py-1.5 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{String(p.job_name)}</span>
                    <span className="text-red-500 font-medium">{String(p.occurrences)}x</span>
                  </div>
                  <p className="text-zinc-500 mt-0.5 font-mono truncate">{String(p.error)}</p>
                </div>
              ))}
            </>
          )}

          {/* Platform errors */}
          {result.check_type === "platform_errors" && Array.isArray(details.failures) && (
            <>
              <p className="text-xs text-zinc-500">
                {details.count as number} failed operation(s) across {details.tables_affected as number} table(s)
              </p>
              {(details.failures as Record<string, unknown>[]).map((f, i) => (
                <div key={i} className="text-xs bg-white dark:bg-zinc-800 rounded px-2 py-1.5 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{String(f.table)}</span>
                    <span className="text-red-500 font-medium">{String(f.count)}x</span>
                    {f.origin != null && <span className="text-zinc-400">{String(f.origin)}</span>}
                  </div>
                  <p className="text-zinc-500 mt-0.5 truncate">{String(f.message)}</p>
                  <p className="text-zinc-400 text-[10px]">{String(f.latest)}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Check Info Modal
// ============================================================

function CheckInfoModal({
  checkType,
  onClose,
}: {
  checkType: string;
  onClose: () => void;
}) {
  const check = HEALTH_CHECKS.find((c) => c.type === checkType);
  if (!check) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-teal-500" />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {check.label}
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* What it checks */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
              What it checks
            </h4>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {check.whatItChecks}
            </p>
          </div>

          {/* How it works */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
              How it works
            </h4>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {check.howItWorks}
            </p>
          </div>

          {/* Criteria */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
              Status criteria
            </h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                <span className="font-medium text-green-600 dark:text-green-400 w-14">Pass</span>
                <span className="text-zinc-600 dark:text-zinc-400">{check.criteria.pass}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 flex-shrink-0" />
                <span className="font-medium text-yellow-600 dark:text-yellow-400 w-14">Warn</span>
                <span className="text-zinc-600 dark:text-zinc-400">{check.criteria.warn}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                <span className="font-medium text-red-600 dark:text-red-400 w-14">Fail</span>
                <span className="text-zinc-600 dark:text-zinc-400">{check.criteria.fail}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Dashboard
// ============================================================

function HealthScoreboard() {
  const paths = usePrimaryKnowledgePaths();
  const domainsPath = paths ? `${paths.platform}/domains` : null;
  const domainsQuery = useDiscoverDomains(domainsPath);
  const healthQuery = useDomainHealthChecks();
  const runner = useDomainHealthCheckRunner();

  const [selectedCell, setSelectedCell] = useState<{ domain: string; check: string } | null>(null);
  const [infoCheck, setInfoCheck] = useState<string | null>(null);

  // Only production domains
  const productionDomains = useMemo(
    () =>
      (domainsQuery.data ?? [])
        .filter((d) => d.domain_type === "production")
        .sort((a, b) => a.domain.localeCompare(b.domain)),
    [domainsQuery.data]
  );

  // Build set of production domain names for filtering results
  const productionSet = useMemo(
    () => new Set(productionDomains.map((d) => d.domain)),
    [productionDomains]
  );

  // Index results by domain+check_type (only production)
  const resultMap = useMemo(() => {
    const map = new Map<string, HealthCheckResult>();
    for (const r of healthQuery.data ?? []) {
      if (productionSet.has(r.domain)) {
        map.set(`${r.domain}:${r.check_type}`, r);
      }
    }
    return map;
  }, [healthQuery.data, productionSet]);

  // Summary stats (only production)
  const stats = useMemo(() => {
    const productionResults = (healthQuery.data ?? []).filter((r) => productionSet.has(r.domain));
    return {
      total: productionDomains.length,
      pass: new Set(
        productionDomains
          .filter((d) =>
            HEALTH_CHECKS.every(
              (c) => resultMap.get(`${d.domain}:${c.type}`)?.status === "pass"
            )
          )
          .map((d) => d.domain)
      ).size,
      warn: new Set(
        productionResults.filter((r) => r.status === "warn").map((r) => r.domain)
      ).size,
      fail: new Set(
        productionResults.filter((r) => r.status === "fail").map((r) => r.domain)
      ).size,
      lastChecked:
        productionResults.length > 0
          ? productionResults.reduce(
              (latest, r) => (r.checked_at > latest ? r.checked_at : latest),
              ""
            )
          : null,
    };
  }, [healthQuery.data, productionDomains, productionSet, resultMap]);

  const handleRunChecks = useCallback(() => {
    const domains = productionDomains.map((d) => d.domain);
    if (domains.length > 0) runner.trigger(domains);
  }, [productionDomains, runner]);

  const selectedResult = selectedCell
    ? resultMap.get(`${selectedCell.domain}:${selectedCell.check}`) ?? null
    : null;

  return (
    <div className="h-full flex flex-col">
      {/* Summary bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRunChecks}
            disabled={runner.progress?.isRunning}
          >
            {runner.progress?.isRunning ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <RefreshCw size={14} className="mr-1.5" />
            )}
            {runner.progress?.isRunning
              ? `Checking ${runner.progress.currentDomain} (${runner.progress.current}/${runner.progress.total})`
              : "Run Health Checks"}
          </Button>
          {stats.lastChecked && (
            <span className="text-xs text-zinc-400">
              Last checked {formatTimeAgo(stats.lastChecked)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {stats.pass} healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            {stats.warn} warnings
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {stats.fail} failing
          </span>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex-1 overflow-auto">
        {productionDomains.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-zinc-400">
            No production domains found. Discover domains first.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-zinc-950 z-10">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider w-40">
                  Domain
                </th>
                {HEALTH_CHECKS.map((check) => (
                  <th
                    key={check.type}
                    className="text-center px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider"
                  >
                    <span className="inline-flex items-center gap-1">
                      {check.label}
                      <button
                        onClick={() => setInfoCheck(infoCheck === check.type ? null : check.type)}
                        className="text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                      >
                        <Info size={12} />
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productionDomains.map((domain) => (
                <tr
                  key={domain.domain}
                  className="group border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {domain.domain}
                      </span>
                      <button
                        onClick={() => runner.trigger([domain.domain])}
                        disabled={runner.progress?.isRunning}
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-teal-500 transition-all"
                        title={`Run checks for ${domain.domain}`}
                      >
                        <RefreshCw size={11} />
                      </button>
                    </div>
                  </td>
                  {HEALTH_CHECKS.map((check) => {
                    const result = resultMap.get(
                      `${domain.domain}:${check.type}`
                    );
                    const status = result?.status ?? "none";
                    const isSelected =
                      selectedCell?.domain === domain.domain &&
                      selectedCell?.check === check.type;

                    return (
                      <td key={check.type} className="text-center px-3 py-2">
                        <button
                          onClick={() =>
                            result
                              ? setSelectedCell(
                                  isSelected
                                    ? null
                                    : {
                                        domain: domain.domain,
                                        check: check.type,
                                      }
                                )
                              : undefined
                          }
                          disabled={!result}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs transition-colors",
                            result
                              ? "cursor-pointer hover:ring-1 hover:ring-zinc-300 dark:hover:ring-zinc-600"
                              : "cursor-default",
                            isSelected && "ring-2 ring-teal-500",
                            STATUS_BG[status]
                          )}
                          title={`${STATUS_LABEL[status]}${result ? ` — checked ${formatTimeAgo(result.checked_at)}` : ""}`}
                        >
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full flex-shrink-0",
                              STATUS_DOT[status]
                            )}
                          />
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {STATUS_LABEL[status]}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selectedResult && (
        <HealthDetailPanel
          key={`${selectedResult.domain}:${selectedResult.check_type}`}
          result={selectedResult}
          onClose={() => setSelectedCell(null)}
        />
      )}

      {/* Check info modal */}
      {infoCheck && <CheckInfoModal checkType={infoCheck} onClose={() => setInfoCheck(null)} />}
    </div>
  );
}

// ============================================================
// Tabbed Health Dashboard (wraps Scoreboard + Error Grids)
// ============================================================

import { ImporterErrorsGrid, IntegrationErrorsGrid, WorkflowExecutionsGrid, NotificationsGrid } from "./ErrorsGridView";
import { Play, Bell, Clock } from "lucide-react";

type HealthSubTab = "scoreboard" | "executions" | "notifications" | "importer-errors" | "integration-errors";

type TimeRange = "24h" | "48h" | "7d" | "30d";
const TIME_RANGE_OPTIONS: { id: TimeRange; label: string; hours: number }[] = [
  { id: "24h", label: "24h", hours: 24 },
  { id: "48h", label: "48h", hours: 48 },
  { id: "7d", label: "7 days", hours: 168 },
  { id: "30d", label: "30 days", hours: 720 },
];

function getTimeSince(range: TimeRange): string {
  const hours = TIME_RANGE_OPTIONS.find((r) => r.id === range)!.hours;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

const HEALTH_SUB_TABS: { id: HealthSubTab; label: string; icon: typeof Info }[] = [
  { id: "scoreboard", label: "Scoreboard", icon: Info },
  { id: "executions", label: "Executions", icon: Play },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "importer-errors", label: "Importer Errors", icon: FileWarning },
  { id: "integration-errors", label: "Integration Errors", icon: Plug },
];

export function HealthDashboard() {
  const [activeSubTab, setActiveSubTab] = useState<HealthSubTab>("scoreboard");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  const since = useMemo(() => getTimeSince(timeRange), [timeRange]);
  const showTimeRange = activeSubTab !== "scoreboard";

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <div className="flex items-center gap-1">
          {HEALTH_SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {showTimeRange && (
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-zinc-400 mr-1" />
            {TIME_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTimeRange(opt.id)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  timeRange === opt.id
                    ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === "scoreboard" && <HealthScoreboard />}
        {activeSubTab === "executions" && <WorkflowExecutionsGrid since={since} />}
        {activeSubTab === "notifications" && <NotificationsGrid since={since} />}
        {activeSubTab === "importer-errors" && <ImporterErrorsGrid since={since} />}
        {activeSubTab === "integration-errors" && <IntegrationErrorsGrid since={since} />}
      </div>
    </div>
  );
}
