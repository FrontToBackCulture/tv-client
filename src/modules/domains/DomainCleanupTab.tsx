// DomainCleanupTab — Domain resource cleanup view
// Shows cost drivers, dependency explorer, and orphaned resources
// Reads from dependencies.json and recency.json in the domain folder

import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Trash2,
  AlertTriangle,
  Database,
  GitBranch,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Zap,
  Search,
  Download,
  CheckSquare,
  Square,
  Timer,
  Activity,
  XCircle,
  CheckCircle2,
  Code,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui";
import { useJobsStore } from "../../stores/jobsStore";
import { useClaudeRunStore } from "../../stores/claudeRunStore";

// ============================================================================
// Types
// ============================================================================

interface DependencyEdge {
  id: string;
  resource_type: string;
  name: string;
  reference_type: string;
}

interface ResourceNode {
  id: string;
  resource_type: string;
  name: string;
  depends_on: DependencyEdge[];
  depended_by: DependencyEdge[];
  cron_expression?: string;
  is_scheduled?: boolean;
  last_run_at?: string;
  last_run_status?: string;
  is_deleted?: boolean;
  plugin_count?: number;
  calc_field_count?: number;
  calc_field_rules?: Record<string, number>;
  calc_field_lookup_tables?: string[];
  column_count?: number;
  calc_fields?: { name: string; rule_type: string; lookup_table?: string; lookup_table_name?: string }[];
}

interface DependencySummary {
  total_resources: number;
  total_edges: number;
  by_type: Record<string, number>;
  orphaned: {
    tables: string[];
    queries: string[];
    dashboards: string[];
    workflows: string[];
  };
  critical: { id: string; resource_type: string; name: string; dependent_count: number }[];
  heavy_calc_tables: {
    id: string;
    name: string;
    calc_field_count: number;
    rules: Record<string, number>;
    lookup_tables: string[];
    column_count: number;
    fields: { name: string; rule_type: string; lookup_table?: string; lookup_table_name?: string }[];
  }[];
}

interface DependencyReport {
  computed_at: string;
  domain: string;
  resources: Record<string, ResourceNode>;
  summary: DependencySummary;
}

interface TableRecency {
  table_name: string;
  row_count: number;
  dead_tuples: number;
  total_inserts: number;
  total_updates: number;
  total_deletes: number;
  last_autoanalyze: string | null;
  last_autovacuum: string | null;
  activity_status: string;
}

interface RecencyReport {
  computed_at: string;
  domain: string;
  tables: Record<string, TableRecency>;
  summary: {
    total_tables: number;
    active_tables: number;
    stale_tables: number;
    empty_tables: number;
    dead_tables: number;
    total_live_rows: number;
  };
}

interface CleanupCandidate {
  id: string;
  resource_type: string;
  name: string;
  reason: string;
  severity: "high" | "medium" | "low";
  dependents: number;
  dependencies: number;
  // Workflow-specific
  cron_expression?: string;
  last_run_at?: string;
  last_run_status?: string;
  runs_per_month?: number;
  // Table-specific
  row_count?: number;
  activity_status?: string;
  last_autoanalyze?: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function estimateRunsPerMonth(cron: string): number {
  // Simple cron frequency estimator
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return 0;
  const [min, hour, dom, , dow] = parts;

  // Every minute
  if (min === "*" && hour === "*") return 43200;
  // Every hour
  if (min !== "*" && hour === "*") return 720;
  // Daily
  if (min !== "*" && hour !== "*" && dom === "*" && dow === "*") return 30;
  // Weekly
  if (dow !== "*" && dom === "*") {
    const days = dow.split(",").length;
    return days * 4;
  }
  // Monthly
  if (dom !== "*") return 1;
  return 30; // Default: assume daily
}

function formatRunFrequency(runsPerMonth: number): string {
  if (runsPerMonth >= 1440) return `~${Math.round(runsPerMonth / 720)}/hr`;
  if (runsPerMonth >= 60) return `~${Math.round(runsPerMonth / 30)}/day`;
  if (runsPerMonth >= 8) return `~${Math.round(runsPerMonth / 4)}/week`;
  if (runsPerMonth >= 1) return `~${runsPerMonth}/month`;
  return "Rare";
}

function frequencyColor(runsPerMonth: number): string {
  if (runsPerMonth >= 60) return "text-red-600 dark:text-red-400"; // Daily+
  if (runsPerMonth >= 8) return "text-orange-600 dark:text-orange-400"; // Weekly+
  if (runsPerMonth >= 1) return "text-yellow-600 dark:text-yellow-400"; // Monthly+
  return "text-zinc-500"; // Manual
}

function daysAgo(isoString: string | null): number | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDaysAgo(d: number | null): string {
  if (d === null) return "Never";
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}yr ago`;
}

const TYPE_ICON: Record<string, typeof Database> = {
  table: Database,
  query: Search,
  dashboard: Activity,
  workflow: Zap,
};

const TYPE_COLOR: Record<string, string> = {
  table: "text-blue-600 dark:text-blue-400",
  query: "text-purple-600 dark:text-purple-400",
  dashboard: "text-green-600 dark:text-green-400",
  workflow: "text-orange-600 dark:text-orange-400",
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  stale: { bg: "bg-yellow-50 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
  empty: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500" },
  dead: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
};

// ============================================================================
// Sub-components
// ============================================================================

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
      <div className={cn("text-lg font-bold", color || "text-zinc-800 dark:text-zinc-200")}>{value}</div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ResourceBadge({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] || Database;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", TYPE_COLOR[type] || "text-zinc-500")}>
      <Icon size={12} />
      {type}
    </span>
  );
}

/** Single row in the dependency tree — shows resource info + expandable children */
function DependencyTreeNode({
  resource,
  resources,
  recency,
  direction,
  depth = 0,
  maxDepth = 3,
  visited = new Set<string>(),
}: {
  resource: ResourceNode;
  resources: Record<string, ResourceNode>;
  recency: Record<string, TableRecency>;
  direction: "upstream" | "downstream";
  depth?: number;
  maxDepth?: number;
  visited?: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const childEdges = direction === "upstream" ? resource.depends_on : resource.depended_by;

  const tableRecency = resource.resource_type === "table" ? recency[resource.id] : null;
  const hasChildren = childEdges.length > 0 && depth < maxDepth && !visited.has(resource.id);

  return (
    <div className={cn(depth > 0 && "pl-4")}>
      <div
        className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded px-2 -mx-2"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />
        ) : (
          <span className="w-3" />
        )}
        <ResourceBadge type={resource.resource_type} />
        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{resource.name}</span>
        {resource.is_scheduled && resource.cron_expression && (
          <span className={cn("text-[10px] font-mono", frequencyColor(estimateRunsPerMonth(resource.cron_expression)))}>
            {formatRunFrequency(estimateRunsPerMonth(resource.cron_expression))}
          </span>
        )}
        {tableRecency && (
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded", STATUS_BADGE[tableRecency.activity_status]?.bg, STATUS_BADGE[tableRecency.activity_status]?.text)}>
            {tableRecency.activity_status}
          </span>
        )}
        {resource.last_run_status && (
          resource.last_run_status === "completed" ? (
            <CheckCircle2 size={12} className="text-green-500" />
          ) : resource.last_run_status === "failed" ? (
            <XCircle size={12} className="text-red-500" />
          ) : null
        )}
        {childEdges.length > 0 && (
          <span className="text-[10px] text-zinc-400">{childEdges.length}</span>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="border-l border-zinc-200 dark:border-zinc-700 ml-1.5">
          {childEdges.map((edge) => {
            const childResource = resources[edge.id];
            if (!childResource) {
              return (
                <div key={edge.id} className="pl-4 py-1 text-xs text-zinc-400 italic">
                  {edge.id} ({edge.resource_type}) — not in registry
                </div>
              );
            }
            const childVisited = new Set(visited);
            childVisited.add(resource.id);
            return (
              <DependencyTreeNode
                key={edge.id}
                resource={childResource}
                resources={resources}
                recency={recency}
                direction={direction}
                depth={depth + 1}
                maxDepth={maxDepth}
                visited={childVisited}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Flat list of direct edges, each expandable into a tree */
function DependencyList({
  edges,
  resources,
  recency,
  direction,
}: {
  edges: DependencyEdge[];
  resources: Record<string, ResourceNode>;
  recency: Record<string, TableRecency>;
  direction: "upstream" | "downstream";
}) {
  if (edges.length === 0) return null;

  // Group by resource type for readability
  const byType: Record<string, DependencyEdge[]> = {};
  for (const edge of edges) {
    (byType[edge.resource_type] ??= []).push(edge);
  }

  return (
    <div className="space-y-1">
      {Object.entries(byType).map(([type, typeEdges]) => (
        <div key={type}>
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium px-2 pt-2 pb-0.5">
            {type}s ({typeEdges.length})
          </div>
          {typeEdges.map((edge) => {
            const childResource = resources[edge.id];
            if (!childResource) {
              return (
                <div key={edge.id} className="px-2 py-1 text-xs text-zinc-400 italic">
                  {edge.id} — not in registry
                </div>
              );
            }
            return (
              <DependencyTreeNode
                key={edge.id}
                resource={childResource}
                resources={resources}
                recency={recency}
                direction={direction}
                depth={1}
                maxDepth={3}
                visited={new Set()}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Claude Runner Panel — streams live output from claude CLI
// ============================================================================

interface ClaudeStreamEvent {
  run_id: string;
  event_type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

async function buildCalcToSqlPrompt(
  domainName: string,
  globalPath: string,
  tableId: string,
  tableName: string,
): Promise<string> {
  // Pre-load all the data so Claude doesn't need to read files
  let calcFieldsJson = "{}";
  let tableDetailsJson = "{}";
  try {
    calcFieldsJson = await invoke<string>("read_file", {
      path: `${globalPath}/data_models/table_${tableId}/definition_calculated_fields.json`,
    });
  } catch { /* ignore */ }
  try {
    tableDetailsJson = await invoke<string>("read_file", {
      path: `${globalPath}/data_models/table_${tableId}/definition_details.json`,
    });
  } catch { /* ignore */ }

  // Truncate if too large (keep it under ~50k chars for the prompt)
  const maxLen = 50000;
  if (calcFieldsJson.length > maxLen) {
    calcFieldsJson = calcFieldsJson.slice(0, maxLen) + "\n... (truncated)";
  }
  if (tableDetailsJson.length > maxLen) {
    tableDetailsJson = tableDetailsJson.slice(0, maxLen) + "\n... (truncated)";
  }

  return `You are converting VAL platform calculated fields to SQL for the domain "${domainName}".

## Table: "${tableName}" (${tableId})

### Calculated Field Definitions
\`\`\`json
${calcFieldsJson}
\`\`\`

### Table Schema (columns)
\`\`\`json
${tableDetailsJson}
\`\`\`

## Task

This table has calculated fields (vlookup, rollup, linked, ifelse) that compute on every row read — expensive at scale. Write a SQL SELECT that replicates ALL calculated fields.

1. Analyze each calculated field definition above
2. Write a SQL SELECT that replicates each one using JOINs and CASE WHEN
3. Test it against the "${domainName}" domain using execute-val-sql (SELECT only, limit 10)
4. Compare SQL results against the existing calculated field values
5. If the test fails, debug and retry

## Conversion Rules
- vlookup → LEFT JOIN on the lookup table, match on the join column
- ifelse → CASE WHEN with the condition filters
- rollup → subquery with GROUP BY
- constant → literal value in SELECT
- string/date → direct column reference or CAST

## Important
- Only SELECT queries — never INSERT/UPDATE/DELETE
- Test against "${domainName}" domain
- Column aliases MUST match original field names
- Keep the SQL clean and readable with CTEs if needed
- If a vlookup references another table, you already have the join column info in the definitions above — use it directly

## Output
1. Brief summary of each calculated field (one line each)
2. Final SQL in a \`\`\`sql code block
3. Sample test results (first few rows)
4. Notes on edge cases`;
}

/** Launch a background Claude run to convert calc fields to SQL */
async function launchCalcToSqlRun(
  domainName: string,
  globalPath: string,
  tableId: string,
  tableName: string,
  addJob: (job: { id: string; name: string; status: "running"; message: string }) => void,
  updateJob: (id: string, updates: { status?: "running" | "completed" | "failed"; message?: string }) => void,
  createRun: (run: { id: string; name: string; domainName: string; tableId: string }) => void,
  addEvent: (runId: string, event: { type: string; content: string; timestamp: number }) => void,
  completeRun: (runId: string, result: string, isError: boolean, costUsd: number, durationMs: number) => void,
  expandRun: (runId: string) => void,
) {
  const runId = `calc-sql-${tableId}-${Date.now()}`;
  const jobName = `Convert to SQL: ${tableName}`;

  // Create job + run
  addJob({ id: runId, name: jobName, status: "running", message: "Loading definitions..." });
  createRun({ id: runId, name: jobName, domainName, tableId });
  expandRun(runId);

  // Listen for events
  const unlisten = await listen<ClaudeStreamEvent>("claude-stream", (event) => {
    const data = event.payload;
    if (data.run_id !== runId) return;

    if (data.event_type === "result") {
      const isError = (data.metadata?.is_error as boolean) ?? false;
      const costUsd = (data.metadata?.cost_usd as number) ?? 0;
      const durationMs = (data.metadata?.duration_ms as number) ?? 0;
      completeRun(runId, data.content, isError, costUsd, durationMs);
      updateJob(runId, {
        status: isError ? "failed" : "completed",
        message: isError ? "SQL conversion failed" : `Done — ${(durationMs / 1000).toFixed(0)}s`,
      });
    } else if (data.event_type === "error") {
      addEvent(runId, { type: "error", content: data.content, timestamp: Date.now() });
    } else {
      addEvent(runId, { type: data.event_type, content: data.content, timestamp: Date.now() });
      // Update job message with latest step
      if (data.event_type === "text") {
        updateJob(runId, { message: data.content.slice(0, 100) });
      } else if (data.event_type === "tool_use") {
        updateJob(runId, { message: data.content.slice(0, 100) });
      }
    }
  });

  try {
    addEvent(runId, { type: "init", content: "Loading table definitions...", timestamp: Date.now() });
    const prompt = await buildCalcToSqlPrompt(domainName, globalPath, tableId, tableName);
    addEvent(runId, { type: "init", content: "Definitions loaded. Starting Claude...", timestamp: Date.now() });
    updateJob(runId, { message: "Claude is analyzing calc fields..." });

    await invoke("claude_run", {
      runId,
      request: {
        prompt,
        allowed_tools: ["mcp__tv-mcp__execute-val-sql"],
        model: "sonnet",
        cwd: globalPath,
      },
    });
  } catch (e) {
    addEvent(runId, { type: "error", content: String(e), timestamp: Date.now() });
    completeRun(runId, String(e), true, 0, 0);
    updateJob(runId, { status: "failed", message: String(e).slice(0, 100) });
  } finally {
    unlisten();
  }
}

// ============================================================================
// Main Component
// ============================================================================

interface DomainCleanupTabProps {
  domainName: string;
  globalPath: string;
}

export function DomainCleanupTab({ domainName, globalPath }: DomainCleanupTabProps) {
  const [deps, setDeps] = useState<DependencyReport | null>(null);
  const [recency, setRecency] = useState<RecencyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [computeStep, setComputeStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"cost" | "explorer" | "orphaned" | "calcrules">("cost");
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const { addJob, updateJob } = useJobsStore();
  const { createRun, addEvent, completeRun, expandRun } = useClaudeRunStore();

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [depsContent, recencyContent] = await Promise.allSettled([
        invoke<string>("read_file", { path: `${globalPath}/dependencies.json` }),
        invoke<string>("read_file", { path: `${globalPath}/recency.json` }),
      ]);

      if (depsContent.status === "fulfilled") {
        setDeps(JSON.parse(depsContent.value));
      }
      if (recencyContent.status === "fulfilled") {
        setRecency(JSON.parse(recencyContent.value));
      }

      if (depsContent.status === "rejected" && recencyContent.status === "rejected") {
        setError("No cleanup data found. Run 'Compute Dependencies' to generate it.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [globalPath]);

  useEffect(() => { loadData(); }, [loadData]);

  // Compute dependencies on demand
  const handleCompute = useCallback(async () => {
    setComputing(true);
    setError(null);
    try {
      setComputeStep("Scanning definition files and building dependency graph...");
      await invoke("val_compute_dependencies", { domain: domainName });

      setComputeStep("Querying VAL for table activity data (pg_stat)...");
      await invoke("val_collect_recency", { domain: domainName });

      setComputeStep("Loading results...");
      await loadData();
    } catch (e) {
      setError(`Computation failed: ${String(e)}`);
    } finally {
      setComputing(false);
      setComputeStep(null);
    }
  }, [domainName, loadData]);

  // Build cleanup candidates
  const candidates = useMemo((): CleanupCandidate[] => {
    if (!deps) return [];
    const result: CleanupCandidate[] = [];
    const recencyTables = recency?.tables || {};

    for (const [id, node] of Object.entries(deps.resources)) {
      const tableRec = recencyTables[id];
      let reason = "";
      let severity: "high" | "medium" | "low" = "low";

      // Scheduled workflow with no recent runs
      if (node.resource_type === "workflow" && node.is_scheduled && node.cron_expression) {
        const lastRunDays = daysAgo(node.last_run_at ?? null);
        if (lastRunDays !== null && lastRunDays > 30) {
          reason = `Scheduled (${node.cron_expression}) but last ran ${formatDaysAgo(lastRunDays)}`;
          severity = lastRunDays > 90 ? "high" : "medium";
        } else if (node.last_run_status === "failed") {
          reason = `Scheduled but last run failed (${formatDaysAgo(lastRunDays)})`;
          severity = "medium";
        }
      }

      // Deleted workflows still in config
      if (node.resource_type === "workflow" && node.is_deleted) {
        reason = "Marked as deleted";
        severity = "high";
      }

      // Orphaned resources
      if (node.depended_by.length === 0) {
        if (node.resource_type === "table" && tableRec) {
          if (tableRec.activity_status === "dead" || tableRec.activity_status === "empty") {
            reason = `Orphaned table — ${tableRec.activity_status}, ${tableRec.row_count.toLocaleString()} rows`;
            severity = "high";
          } else if (tableRec.activity_status === "stale") {
            reason = `Orphaned table — stale, ${tableRec.row_count.toLocaleString()} rows`;
            severity = "medium";
          }
        }
        if (node.resource_type === "query" && !reason) {
          reason = "Query not used by any dashboard or workflow";
          severity = "low";
        }
        if (node.resource_type === "workflow" && !node.is_scheduled && !reason) {
          reason = "Manual workflow with no parent workflow";
          severity = "low";
        }
      }

      // Stale tables with dependents (sneaky cost burners)
      if (node.resource_type === "table" && tableRec && node.depended_by.length > 0) {
        const analyzeAge = daysAgo(tableRec.last_autoanalyze);
        if (tableRec.activity_status === "stale" || (analyzeAge !== null && analyzeAge > 90)) {
          reason = `Has ${node.depended_by.length} dependents but table is stale (last activity ${formatDaysAgo(analyzeAge)})`;
          severity = "medium";
        }
      }

      if (!reason) continue;

      result.push({
        id,
        resource_type: node.resource_type,
        name: node.name,
        reason,
        severity,
        dependents: node.depended_by.length,
        dependencies: node.depends_on.length,
        cron_expression: node.cron_expression ?? undefined,
        last_run_at: node.last_run_at ?? undefined,
        last_run_status: node.last_run_status ?? undefined,
        runs_per_month: node.cron_expression ? estimateRunsPerMonth(node.cron_expression) : undefined,
        row_count: tableRec?.row_count,
        activity_status: tableRec?.activity_status,
        last_autoanalyze: tableRec?.last_autoanalyze,
      });
    }

    // Sort: high severity first, then by runs_per_month desc (for cost), then by row_count desc
    result.sort((a, b) => {
      const sevOrder = { high: 0, medium: 1, low: 2 };
      if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
      if ((b.runs_per_month ?? 0) !== (a.runs_per_month ?? 0)) return (b.runs_per_month ?? 0) - (a.runs_per_month ?? 0);
      return (b.row_count ?? 0) - (a.row_count ?? 0);
    });

    return result;
  }, [deps, recency]);

  // Filtered candidates by search
  const filtered = useMemo(() => {
    if (!searchQuery) return candidates;
    const q = searchQuery.toLowerCase();
    return candidates.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.reason.toLowerCase().includes(q)
    );
  }, [candidates, searchQuery]);

  // Cost driver workflows
  const costDrivers = useMemo(() => {
    if (!deps) return [];
    return Object.values(deps.resources)
      .filter((r) => r.resource_type === "workflow" && r.is_scheduled && r.cron_expression && !r.is_deleted)
      .map((r) => ({
        ...r,
        runs_per_month: estimateRunsPerMonth(r.cron_expression!),
        last_run_days: daysAgo(r.last_run_at ?? null),
      }))
      .sort((a, b) => b.runs_per_month - a.runs_per_month);
  }, [deps]);

  // Toggle candidate selection
  const toggleCandidate = (id: string) => {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedCandidates(new Set(filtered.map((c) => c.id)));
  };

  const clearSelection = () => setSelectedCandidates(new Set());

  // Export cleanup plan
  const handleExport = useCallback(async () => {
    const plan = filtered
      .filter((c) => selectedCandidates.has(c.id))
      .map((c) => ({
        id: c.id,
        resource_type: c.resource_type,
        name: c.name,
        reason: c.reason,
        severity: c.severity,
        dependents: c.dependents,
      }));

    const content = JSON.stringify({ domain: domainName, exported_at: new Date().toISOString(), candidates: plan }, null, 2);
    const path = `${globalPath}/cleanup_plan.json`;
    await invoke("write_file", { path, content });
  }, [domainName, globalPath, filtered, selectedCandidates]);

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <RefreshCw size={16} className="animate-spin mr-2" />
        Loading cleanup data...
      </div>
    );
  }

  if (computing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <RefreshCw size={32} className="animate-spin text-teal-500" />
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Computing cleanup data...</p>
          {computeStep && (
            <p className="text-xs text-zinc-500 mt-1.5">{computeStep}</p>
          )}
        </div>
      </div>
    );
  }

  if (error && !deps) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertTriangle size={32} className="text-zinc-400" />
        <p className="text-sm text-zinc-500">{error}</p>
        <Button onClick={handleCompute} icon={RefreshCw}>
          Compute Dependencies
        </Button>
      </div>
    );
  }

  if (!deps) return null;

  const selectedNode = selectedResource ? deps.resources[selectedResource] : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        {/* Summary pills */}
        <div className="flex items-center gap-2 flex-1">
          <StatPill label="Resources" value={deps.summary.total_resources} />
          <StatPill label="Edges" value={deps.summary.total_edges} />
          <StatPill
            label="Orphaned"
            value={
              deps.summary.orphaned.tables.length +
              deps.summary.orphaned.queries.length +
              deps.summary.orphaned.dashboards.length +
              deps.summary.orphaned.workflows.length
            }
            color="text-orange-600 dark:text-orange-400"
          />
          {recency && (
            <>
              <StatPill label="Active Tables" value={recency.summary.active_tables} color="text-green-600" />
              <StatPill label="Stale Tables" value={recency.summary.stale_tables} color="text-yellow-600" />
              <StatPill label="Dead Tables" value={recency.summary.dead_tables} color="text-red-600" />
            </>
          )}
          <StatPill label="Cleanup Candidates" value={candidates.length} color="text-red-600 dark:text-red-400" />
        </div>

        {/* Actions */}
        <Button onClick={handleCompute} icon={RefreshCw} variant="ghost" disabled={computing}>
          {computing ? "Computing..." : "Refresh"}
        </Button>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        {[
          { id: "cost" as const, label: "What's costing me?", icon: Timer },
          { id: "explorer" as const, label: "What depends on what?", icon: GitBranch },
          { id: "orphaned" as const, label: "What can I delete?", icon: Trash2 },
          { id: "calcrules" as const, label: "What should be SQL?", icon: Code },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
              activeSection === s.id
                ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-medium"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            )}
          >
            <s.icon size={14} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-auto">
        {/* ========== COST DRIVERS ========== */}
        {activeSection === "cost" && (
          <div className="p-4">
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Every scheduled workflow runs on AWS cron.</h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                This table shows all scheduled workflows sorted by how often they run. Daily workflows at the top cost the most.
                Click any row to see what tables and queries it touches — if those are stale or unused, the whole chain is waste.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
                  <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Workflow</th>
                  <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Cron</th>
                  <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Frequency</th>
                  <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Last Run</th>
                  <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Status</th>
                  <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Tables</th>
                  <th className="py-2 text-xs font-medium text-zinc-500 uppercase">Queries</th>
                </tr>
              </thead>
              <tbody>
                {costDrivers.map((wf) => {
                  const tableRefs = wf.depends_on.filter((e) => e.resource_type === "table").length;
                  const queryRefs = wf.depends_on.filter((e) => e.resource_type === "query").length;
                  return (
                    <tr
                      key={wf.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                      onClick={() => {
                        setSelectedResource(wf.id);
                        setActiveSection("explorer");
                      }}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[300px]">{wf.name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{wf.id}</div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-zinc-500">{wf.cron_expression}</td>
                      <td className={cn("py-2 pr-3 text-xs font-medium", frequencyColor(wf.runs_per_month))}>
                        {formatRunFrequency(wf.runs_per_month)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-zinc-500">
                        {formatDaysAgo(wf.last_run_days)}
                      </td>
                      <td className="py-2 pr-3">
                        {wf.last_run_status === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 size={12} /> OK</span>
                        ) : wf.last_run_status === "failed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle size={12} /> Failed</span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-zinc-600 dark:text-zinc-400">{tableRefs}</td>
                      <td className="py-2 text-xs text-zinc-600 dark:text-zinc-400">{queryRefs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {costDrivers.length === 0 && (
              <div className="text-center py-8 text-zinc-400 text-sm">No scheduled workflows found.</div>
            )}
          </div>
        )}

        {/* ========== DEPENDENCY EXPLORER ========== */}
        {activeSection === "explorer" && (
          <div className="flex h-full">
            {/* Left: resource list */}
            <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col flex-shrink-0">
              <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <p className="text-[11px] text-zinc-500 mb-1.5">
                  Pick any resource to see what it depends on and what depends on it. Use this before deleting anything to understand the blast radius.
                </p>
              </div>
              <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search resources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {Object.values(deps.resources)
                  .filter((r) => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.id.toLowerCase().includes(searchQuery.toLowerCase()))
                  .sort((a, b) => b.depended_by.length - a.depended_by.length)
                  .slice(0, 200)
                  .map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedResource(r.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                        selectedResource === r.id && "bg-teal-50 dark:bg-teal-900/20"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <ResourceBadge type={r.resource_type} />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{r.name}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-400">
                        <span>{r.depends_on.length} deps</span>
                        <span>{r.depended_by.length} dependents</span>
                        {r.is_scheduled && <span className="text-orange-500">scheduled</span>}
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Right: detail view */}
            <div className="flex-1 overflow-auto p-4">
              {selectedNode ? (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <ResourceBadge type={selectedNode.resource_type} />
                    <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">{selectedNode.name}</h3>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono mb-4">{selectedNode.id}</div>

                  {/* Workflow metadata */}
                  {selectedNode.resource_type === "workflow" && (
                    <div className="flex items-center gap-3 mb-4 text-sm">
                      {selectedNode.cron_expression && (
                        <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-xs font-mono">{selectedNode.cron_expression}</span>
                      )}
                      {selectedNode.last_run_at && (
                        <span className="text-zinc-500">Last run: {formatDaysAgo(daysAgo(selectedNode.last_run_at))}</span>
                      )}
                      {selectedNode.last_run_status && (
                        <span className={selectedNode.last_run_status === "completed" ? "text-green-600" : "text-red-600"}>
                          {selectedNode.last_run_status}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Table recency */}
                  {selectedNode.resource_type === "table" && recency?.tables[selectedNode.id] && (
                    <div className="flex items-center gap-3 mb-4 text-sm">
                      {(() => {
                        const t = recency.tables[selectedNode.id];
                        const badge = STATUS_BADGE[t.activity_status] || STATUS_BADGE.stale;
                        return (
                          <>
                            <span className={cn("px-2 py-1 rounded text-xs font-medium", badge.bg, badge.text)}>
                              {t.activity_status}
                            </span>
                            <span className="text-zinc-500">{t.row_count.toLocaleString()} rows</span>
                            <span className="text-zinc-500">ins: {t.total_inserts.toLocaleString()}</span>
                            <span className="text-zinc-500">upd: {t.total_updates.toLocaleString()}</span>
                            <span className="text-zinc-500">
                              analyzed: {formatDaysAgo(daysAgo(t.last_autoanalyze))}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Impact: what breaks if deleted */}
                  {selectedNode.depended_by.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        If deleted, these {selectedNode.depended_by.length} resources break:
                      </h4>
                      <DependencyList
                        edges={selectedNode.depended_by}
                        resources={deps.resources}
                        recency={recency?.tables || {}}
                        direction="downstream"
                      />
                    </div>
                  )}

                  {selectedNode.depended_by.length === 0 && (
                    <div className="mb-6 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
                      <CheckCircle2 size={14} className="inline mr-1.5 -mt-0.5" />
                      Nothing depends on this resource. Safe to delete.
                    </div>
                  )}

                  {/* What this depends on */}
                  {selectedNode.depends_on.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                        Depends on ({selectedNode.depends_on.length}):
                      </h4>
                      <DependencyList
                        edges={selectedNode.depends_on}
                        resources={deps.resources}
                        recency={recency?.tables || {}}
                        direction="upstream"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                  Select a resource to explore its dependencies
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== CLEANUP CANDIDATES ========== */}
        {activeSection === "orphaned" && (
          <div className="p-4">
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Resources flagged for potential deletion.</h3>
              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                These are resources that are either orphaned (nothing depends on them), stale (no recent data activity),
                or broken (scheduled but failing/not running). <strong>High</strong> = safe to delete or clearly wasteful.
                <strong> Medium</strong> = likely safe but verify. <strong> Low</strong> = unused but harmless.
                Select items and export a cleanup plan to review before deleting in VAL.
              </p>
            </div>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search candidates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400"
                />
              </div>
              <Button onClick={selectAllFiltered} variant="ghost" icon={CheckSquare}>
                Select All
              </Button>
              <Button onClick={clearSelection} variant="ghost" icon={Square}>
                Clear
              </Button>
              {selectedCandidates.size > 0 && (
                <Button onClick={handleExport} variant="ghost" icon={Download}>
                  Export Plan ({selectedCandidates.size})
                </Button>
              )}
            </div>

            {/* Candidate list */}
            <div className="space-y-1">
              {filtered.map((c) => {
                const severityColors = {
                  high: "border-l-red-500",
                  medium: "border-l-yellow-500",
                  low: "border-l-zinc-300 dark:border-l-zinc-600",
                };
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 border-l-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer",
                      severityColors[c.severity],
                      selectedCandidates.has(c.id) && "bg-teal-50/50 dark:bg-teal-900/10"
                    )}
                    onClick={() => toggleCandidate(c.id)}
                  >
                    {/* Checkbox */}
                    <div className="mt-0.5 flex-shrink-0">
                      {selectedCandidates.has(c.id) ? (
                        <CheckSquare size={16} className="text-teal-600" />
                      ) : (
                        <Square size={16} className="text-zinc-300" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ResourceBadge type={c.resource_type} />
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{c.name}</span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase",
                          c.severity === "high" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" :
                          c.severity === "medium" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" :
                          "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                        )}>
                          {c.severity}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{c.reason}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-400">
                        <span className="font-mono">{c.id}</span>
                        {c.dependents > 0 && <span className="text-red-500">{c.dependents} dependents</span>}
                        {c.runs_per_month && (
                          <span className={frequencyColor(c.runs_per_month)}>
                            {formatRunFrequency(c.runs_per_month)}
                          </span>
                        )}
                        {c.row_count !== undefined && <span>{c.row_count.toLocaleString()} rows</span>}
                      </div>
                    </div>

                    {/* Explore button */}
                    <button
                      className="text-zinc-400 hover:text-teal-600 flex-shrink-0 mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedResource(c.id);
                        setActiveSection("explorer");
                      }}
                    >
                      <GitBranch size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-8 text-zinc-400 text-sm">
                {candidates.length === 0 ? "No cleanup candidates found. Domain looks clean." : "No matches for search."}
              </div>
            )}
          </div>
        )}

        {/* ========== CALC RULES / CONVERT TO SQL ========== */}
        {activeSection === "calcrules" && (
          <div className="p-4">
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
              <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300">Tables using vlookup, rollup, linked, or ifelse calculated fields.</h3>
              <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                These fields compute on every row read — vlookups join against another table live, rollups aggregate on the fly.
                For large tables this kills performance and increases I/O cost. Converting them to SQL workflows
                (pre-compute and write to a column) eliminates the runtime overhead.
              </p>
            </div>

            {(deps.summary.heavy_calc_tables ?? []).length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
                    <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Table</th>
                    <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Columns</th>
                    <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Calc Fields</th>
                    <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Rule Types</th>
                    <th className="py-2 pr-3 text-xs font-medium text-zinc-500 uppercase">Lookup Tables</th>
                    <th className="py-2 text-xs font-medium text-zinc-500 uppercase w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {(deps.summary.heavy_calc_tables ?? []).map((t) => {
                    const tableRecency = recency?.tables[t.id];
                    const EXPENSIVE_RULES = ["vlookup", "rollup", "linked", "aggregate"];
                    const hasExpensiveRule = Object.keys(t.rules).some((r) => EXPENSIVE_RULES.includes(r));
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          "border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer",
                          hasExpensiveRule && "bg-purple-50/30 dark:bg-purple-900/5"
                        )}
                        onClick={() => {
                          setSelectedResource(t.id);
                          setActiveSection("explorer");
                        }}
                      >
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[280px]">{t.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-zinc-400 font-mono">{t.id}</span>
                            {tableRecency && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded",
                                STATUS_BADGE[tableRecency.activity_status]?.bg,
                                STATUS_BADGE[tableRecency.activity_status]?.text
                              )}>
                                {tableRecency.activity_status} ({tableRecency.row_count.toLocaleString()} rows)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-zinc-600 dark:text-zinc-400">
                          {t.column_count}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={cn(
                            "text-xs font-medium",
                            t.calc_field_count >= 5 ? "text-red-600 dark:text-red-400" :
                            t.calc_field_count >= 3 ? "text-orange-600 dark:text-orange-400" :
                            "text-zinc-600 dark:text-zinc-400"
                          )}>
                            {t.calc_field_count}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(t.rules).map(([rule, count]) => (
                              <span
                                key={rule}
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                  EXPENSIVE_RULES.includes(rule)
                                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                                )}
                              >
                                {rule}: {count}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {t.lookup_tables.map((lt) => {
                              const ltNode = deps.resources[lt];
                              return (
                                <span key={lt} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                                  {ltNode?.name || lt}
                                </span>
                              );
                            })}
                            {t.lookup_tables.length === 0 && <span className="text-[10px] text-zinc-400">—</span>}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <button
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              launchCalcToSqlRun(
                                domainName, globalPath, t.id, t.name,
                                addJob, updateJob, createRun, addEvent, completeRun, expandRun,
                              );
                            }}
                          >
                            <Code size={10} />
                            Convert
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-zinc-400 text-sm">
                No tables with calculated fields found in this domain.
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
