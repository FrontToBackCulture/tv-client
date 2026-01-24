// src/modules/library/AllSchedulesReport.tsx
// Multi-domain schedule report showing workflow schedules across all domains
// Matches tv-app's design with List/Timeline views

import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Calendar,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  XCircle,
  Play,
  Database,
  List,
  BarChart3,
  Search,
  AlertTriangle,
  FileJson,
  FolderOpen,
  FileText,
} from "lucide-react";
import { cn } from "../../lib/cn";

interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified: string | null;
}

interface WorkflowExecution {
  status: string;
  started_at: string;
  completed_at: string;
}

interface WorkflowData {
  id: number;
  name: string;
  cron_expression: string | null;
  status: string | null;
  latest_run_status: string | null;
  run_started_at: string | null;
  run_completed_at: string | null;
  last_five_executions: WorkflowExecution[];
  tags: string[];
}

interface AllWorkflowsFile {
  data: WorkflowData[];
}

interface DomainScheduleData {
  domain: string;
  workflows: WorkflowData[];
  scheduledCount: number;
  manualCount: number;
}

interface AllSchedulesReportProps {
  basePath: string;
}

type ViewMode = "list" | "timeline";
type FilterStatus = "all" | "completed" | "failed" | "not_yet" | "missed";
type TabMode = "report" | "sources";

// Convert cron expression to human readable
function describeCronPattern(cron: string | null): string {
  if (!cron) return "Manual";

  // Hourly patterns
  if (cron.match(/^\d+ \* \* \* \*$/)) return "Hourly";
  if (cron.includes("*/30 * * * *")) return "Every 30 min";
  if (cron.includes("*/15 * * * *")) return "Every 15 min";

  // Daily patterns
  if (cron.match(/^\d+ \d+ \* \* \*$/)) return "Daily";

  // Weekly patterns
  if (cron.match(/^\d+ \d+ \* \* \d$/)) return "Weekly";

  // Monthly patterns
  if (cron.match(/^\d+ \d+ \d+ \* \*$/)) return "Monthly";

  return cron;
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return diffMins <= 1 ? "Just now" : `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseCronTime(cron: string | null): { hour: number; minute: number } | null {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const minute = parseInt(parts[0]);
  const hour = parseInt(parts[1]);

  if (isNaN(minute) || isNaN(hour) || parts[1] === "*") return null;

  return { hour, minute };
}

function formatCronTime(cron: string | null): string {
  const time = parseCronTime(cron);
  if (!time) return cron || "";

  const period = time.hour >= 12 ? "PM" : "AM";
  const hour12 = time.hour === 0 ? 12 : time.hour > 12 ? time.hour - 12 : time.hour;
  return `${hour12}:${time.minute.toString().padStart(2, "0")} ${period}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Check if workflow should run on a specific date based on cron
function shouldRunOnDate(cron: string | null, dateStr: string): boolean {
  if (!cron) return false;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [, , dayOfMonth, month, dayOfWeek] = parts;
  const date = new Date(dateStr + "T00:00:00");
  const dateDayOfMonth = date.getDate();
  const dateMonth = date.getMonth() + 1;
  const dateDayOfWeek = date.getDay();

  // Check day of week
  if (dayOfWeek !== "*") {
    const targetDays = dayOfWeek.split(",").map((d) => parseInt(d));
    if (!targetDays.includes(dateDayOfWeek)) return false;
  }

  // Check day of month
  if (dayOfMonth !== "*") {
    // Handle patterns like "1-10"
    if (dayOfMonth.includes("-")) {
      const [start, end] = dayOfMonth.split("-").map((d) => parseInt(d));
      if (dateDayOfMonth < start || dateDayOfMonth > end) return false;
    } else {
      const targetDays = dayOfMonth.split(",").map((d) => parseInt(d));
      if (!targetDays.includes(dateDayOfMonth)) return false;
    }
  }

  // Check month
  if (month !== "*") {
    const targetMonths = month.split(",").map((m) => parseInt(m));
    if (!targetMonths.includes(dateMonth)) return false;
  }

  return true;
}

// Check if scheduled time has passed
function hasScheduledTimePassed(cron: string | null, dateStr: string): boolean {
  if (!cron) return false;
  const time = parseCronTime(cron);
  if (!time) return true; // Can't parse, assume passed

  const now = new Date();
  const today = now.toISOString().split("T")[0];

  if (dateStr < today) return true;
  if (dateStr > today) return false;

  // Same day - compare times
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (currentHour > time.hour) return true;
  if (currentHour === time.hour && currentMinute >= time.minute) return true;
  return false;
}

// Get execution status for the selected date
function getExecutionStatus(
  workflow: WorkflowData,
  dateStr: string
): "completed" | "failed" | "not_yet" | "missed" | null {
  const executions = workflow.last_five_executions || [];
  const targetDate = dateStr;

  // Check if there's an execution on the target date
  const dateExecution = executions.find((exec) => {
    const execDate = exec.started_at?.split("T")[0];
    return execDate === targetDate;
  });

  if (dateExecution) {
    const status = dateExecution.status.toLowerCase();
    if (status === "completed" || status === "success") return "completed";
    if (status === "failed" || status === "error") return "failed";
  }

  // No execution found - check if scheduled
  if (!shouldRunOnDate(workflow.cron_expression, dateStr)) {
    return null; // Not scheduled for this date
  }

  // Scheduled but no execution
  if (hasScheduledTimePassed(workflow.cron_expression, dateStr)) {
    return "missed";
  }
  return "not_yet";
}

// Timeline hour columns
const TIMELINE_HOURS = Array.from({ length: 24 }, (_, i) => i);

function TimelineHeader({ zoom }: { zoom: number }) {
  const hourLabels = TIMELINE_HOURS.filter((h) => {
    if (zoom >= 60) return true; // Show all hours at 1h zoom
    if (zoom >= 30) return h % 2 === 0; // Show every 2 hours at 30m zoom
    return h % 4 === 0; // Show every 4 hours at smaller zooms
  });

  return (
    <div className="flex border-b border-zinc-800 bg-zinc-900/50">
      {hourLabels.map((hour) => {
        const label = hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`;
        return (
          <div
            key={hour}
            className="flex-shrink-0 px-2 py-1 text-xs text-zinc-500 border-r border-zinc-800"
            style={{ width: `${30 * (60 / zoom)}px` }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

function WorkflowTimelinePill({
  workflow,
  dateStr,
  zoom,
}: {
  workflow: WorkflowData;
  dateStr: string;
  zoom: number;
}) {
  const time = parseCronTime(workflow.cron_expression);
  if (!time) return null;

  const status = getExecutionStatus(workflow, dateStr);
  const minutePosition = time.hour * 60 + time.minute;
  const pixelsPerMinute = 30 / zoom;
  const leftOffset = minutePosition * pixelsPerMinute;

  // Execution counts from last_five_executions
  const executions = workflow.last_five_executions || [];
  const successCount = executions.filter(
    (e) => e.status.toLowerCase() === "completed" || e.status.toLowerCase() === "success"
  ).length;
  const failCount = executions.filter(
    (e) => e.status.toLowerCase() === "failed" || e.status.toLowerCase() === "error"
  ).length;

  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1"
      style={{ left: `${leftOffset}px` }}
    >
      <div
        className={cn(
          "h-5 rounded-full flex items-center gap-1 px-2 text-xs font-medium whitespace-nowrap",
          isCompleted && "bg-green-500 text-white",
          isFailed && "bg-red-500 text-white",
          status === "missed" && "bg-amber-500/80 text-white",
          status === "not_yet" && "bg-zinc-600 text-zinc-300",
          !status && "bg-zinc-700 text-zinc-400"
        )}
      >
        {successCount > 0 && <span>{successCount}✓</span>}
        {failCount > 0 && <span className="text-red-200">{failCount}✗</span>}
        {successCount === 0 && failCount === 0 && <span>-</span>}
      </div>
    </div>
  );
}

function DomainScheduleCard({
  data,
  expanded,
  onToggle,
  dateStr,
  viewMode,
  searchQuery,
  filterStatus,
  zoom,
}: {
  data: DomainScheduleData;
  expanded: boolean;
  onToggle: () => void;
  dateStr: string;
  viewMode: ViewMode;
  searchQuery: string;
  filterStatus: FilterStatus;
  zoom: number;
}) {
  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    let workflows = data.workflows;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      workflows = workflows.filter((w) => w.name.toLowerCase().includes(query));
    }

    // Status filter
    if (filterStatus !== "all") {
      workflows = workflows.filter((w) => {
        const status = getExecutionStatus(w, dateStr);
        return status === filterStatus;
      });
    }

    return workflows;
  }, [data.workflows, searchQuery, filterStatus, dateStr]);

  const scheduledWorkflows = filteredWorkflows.filter((w) => w.cron_expression);
  const manualWorkflows = filteredWorkflows.filter((w) => !w.cron_expression);

  // Group by schedule pattern for list view
  const byPattern = useMemo(() => {
    const groups: Record<string, WorkflowData[]> = {};
    for (const wf of scheduledWorkflows) {
      const pattern = describeCronPattern(wf.cron_expression);
      if (!groups[pattern]) groups[pattern] = [];
      groups[pattern].push(wf);
    }
    // Sort patterns
    const sortOrder = ["Daily", "Hourly", "Every 30 min", "Every 15 min", "Weekly", "Monthly"];
    const sorted: Record<string, WorkflowData[]> = {};
    sortOrder.forEach((key) => {
      if (groups[key]) sorted[key] = groups[key];
    });
    Object.keys(groups).forEach((key) => {
      if (!sorted[key]) sorted[key] = groups[key];
    });
    return sorted;
  }, [scheduledWorkflows]);

  // Sort by time for timeline view
  const sortedByTime = useMemo(() => {
    return [...scheduledWorkflows].sort((a, b) => {
      const aTime = parseCronTime(a.cron_expression);
      const bTime = parseCronTime(b.cron_expression);
      if (!aTime || !bTime) return 0;
      return aTime.hour * 60 + aTime.minute - (bTime.hour * 60 + bTime.minute);
    });
  }, [scheduledWorkflows]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown size={16} className="text-zinc-500" />
          ) : (
            <ChevronRight size={16} className="text-zinc-500" />
          )}
          <Database size={16} className="text-teal-400" />
          <span className="font-medium text-zinc-200">{data.domain}</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock size={14} className="text-teal-400" />
            {scheduledWorkflows.length} scheduled
          </span>
          <span className="flex items-center gap-1">
            <Play size={14} />
            {manualWorkflows.length} manual
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-800">
          {viewMode === "timeline" ? (
            <div className="overflow-x-auto">
              <TimelineHeader zoom={zoom} />
              <div className="divide-y divide-zinc-800">
                {sortedByTime.map((wf) => (
                  <div key={wf.id} className="flex items-center">
                    <div className="flex-shrink-0 w-64 px-4 py-2 border-r border-zinc-800">
                      <div className="flex items-center gap-2">
                        <WorkflowStatusIcon workflow={wf} dateStr={dateStr} />
                        <span className="text-sm text-zinc-300 truncate">{wf.name}</span>
                      </div>
                      <div className="text-xs text-zinc-500 ml-5">
                        {formatCronTime(wf.cron_expression)}
                      </div>
                    </div>
                    <div className="flex-1 relative h-10 min-w-[720px]">
                      <WorkflowTimelinePill workflow={wf} dateStr={dateStr} zoom={zoom} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {Object.entries(byPattern).map(([pattern, workflows]) => (
                <div key={pattern}>
                  <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Calendar size={12} className="text-teal-400" />
                    {pattern}
                    <span className="text-zinc-600">({workflows.length})</span>
                  </h4>
                  <div className="space-y-1">
                    {workflows.map((wf) => (
                      <WorkflowRow key={wf.id} workflow={wf} dateStr={dateStr} />
                    ))}
                  </div>
                </div>
              ))}

              {manualWorkflows.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Play size={12} className="text-zinc-500" />
                    Manual
                    <span className="text-zinc-600">({manualWorkflows.length})</span>
                  </h4>
                  <div className="space-y-1">
                    {manualWorkflows.slice(0, 5).map((wf) => (
                      <WorkflowRow key={wf.id} workflow={wf} dateStr={dateStr} />
                    ))}
                    {manualWorkflows.length > 5 && (
                      <p className="text-xs text-zinc-600 pl-2">
                        + {manualWorkflows.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowStatusIcon({ workflow, dateStr }: { workflow: WorkflowData; dateStr: string }) {
  const status = getExecutionStatus(workflow, dateStr);

  if (status === "completed") {
    return <CheckCircle size={14} className="text-green-400 flex-shrink-0" />;
  }
  if (status === "failed") {
    return <XCircle size={14} className="text-red-400 flex-shrink-0" />;
  }
  if (status === "missed") {
    return <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />;
  }
  if (status === "not_yet") {
    return <Clock size={14} className="text-zinc-500 flex-shrink-0" />;
  }
  return <div className="w-3.5 h-3.5 rounded-full bg-zinc-700 flex-shrink-0" />;
}

function WorkflowRow({ workflow, dateStr }: { workflow: WorkflowData; dateStr: string }) {
  const cronTime = formatCronTime(workflow.cron_expression);

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-zinc-800/50">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <WorkflowStatusIcon workflow={workflow} dateStr={dateStr} />
        <span className="text-sm text-zinc-300 truncate">{workflow.name}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        {cronTime && workflow.cron_expression && (
          <span className="text-xs text-zinc-600 font-mono">{cronTime}</span>
        )}
        <span className="text-xs text-zinc-500">
          {formatRelativeTime(workflow.run_completed_at)}
        </span>
      </div>
    </div>
  );
}

// Data Sources Tab
function DataSourcesTab({
  productionPath,
  domains
}: {
  productionPath: string;
  domains: DomainScheduleData[];
}) {
  const sources = domains.map((d) => ({
    domain: d.domain,
    file: "all_workflows.json",
    path: `${productionPath}/${d.domain}/all_workflows.json`,
    workflows: d.workflows.length,
    scheduled: d.scheduledCount,
  }));

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Data Sources section */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <FileJson size={16} className="text-teal-400" />
            <span className="font-medium text-zinc-200">Data Sources by Domain</span>
            <span className="text-xs text-zinc-500 ml-2">
              ({sources.length} domains)
            </span>
          </div>
          <div className="divide-y divide-zinc-800">
            {sources.map((source) => (
              <div key={source.domain} className="px-4 py-3 hover:bg-zinc-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database size={14} className="text-zinc-500" />
                    <span className="text-sm font-medium text-zinc-200">
                      {source.domain}
                    </span>
                    <span className="text-xs text-zinc-600">/</span>
                    <span className="text-xs text-teal-400 font-mono">
                      {source.file}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>{source.workflows} workflows</span>
                    <span className="text-teal-400">{source.scheduled} scheduled</span>
                  </div>
                </div>
                <div className="mt-1.5 text-xs text-zinc-600 font-mono truncate">
                  {source.path}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* File Locations section */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <FolderOpen size={16} className="text-teal-400" />
            <span className="font-medium text-zinc-200">Base Locations</span>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1.5">
                <FolderOpen size={12} />
                Production Path
              </div>
              <code className="text-xs text-zinc-400 font-mono bg-zinc-800 px-2 py-1 rounded block overflow-x-auto">
                {productionPath}
              </code>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1.5">
                <FileText size={12} />
                Workflow File Pattern
              </div>
              <code className="text-xs text-zinc-400 font-mono bg-zinc-800 px-2 py-1 rounded block">
                {"{domain}"}/all_workflows.json
              </code>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-zinc-100">
                {sources.length}
              </div>
              <div className="text-xs text-zinc-500">Domains</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-100">
                {sources.reduce((sum, s) => sum + s.workflows, 0)}
              </div>
              <div className="text-xs text-zinc-500">Total Workflows</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-teal-400">
                {sources.reduce((sum, s) => sum + s.scheduled, 0)}
              </div>
              <div className="text-xs text-teal-400/70">Scheduled</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AllSchedulesReport({ basePath }: AllSchedulesReportProps) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [timelineZoom, setTimelineZoom] = useState<number>(60); // minutes per segment
  const [activeTab, setActiveTab] = useState<TabMode>("report");

  // Date navigation
  const [currentDate, setCurrentDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const goToPreviousDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    setCurrentDate(date.toISOString().split("T")[0]);
  };

  const goToNextDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    const today = new Date().toISOString().split("T")[0];
    if (date.toISOString().split("T")[0] <= today) {
      setCurrentDate(date.toISOString().split("T")[0]);
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date().toISOString().split("T")[0]);
  };

  const isToday = currentDate === new Date().toISOString().split("T")[0];

  // Determine the production path
  const productionPath = useMemo(() => {
    if (basePath.endsWith("/production")) {
      return basePath;
    }
    return `${basePath}/production`;
  }, [basePath]);

  // Load all domain data
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["all-schedules", productionPath],
    queryFn: async () => {
      const entries = await invoke<FileEntry[]>("list_directory", { path: productionPath });

      const domainData: DomainScheduleData[] = [];

      for (const entry of entries) {
        if (!entry.is_directory || entry.name.startsWith("_")) continue;

        const workflowsPath = `${productionPath}/${entry.name}/all_workflows.json`;

        try {
          const content = await invoke<string>("read_file", { path: workflowsPath });
          const parsed: AllWorkflowsFile = JSON.parse(content);

          if (parsed.data && Array.isArray(parsed.data)) {
            const scheduledCount = parsed.data.filter((w) => w.cron_expression).length;
            const manualCount = parsed.data.filter((w) => !w.cron_expression).length;

            domainData.push({
              domain: entry.name,
              workflows: parsed.data,
              scheduledCount,
              manualCount,
            });
          }
        } catch (err) {
          console.log(`Skipping ${entry.name}: no all_workflows.json`);
        }
      }

      domainData.sort((a, b) => a.domain.localeCompare(b.domain));

      return {
        generatedAt: new Date().toISOString(),
        domains: domainData,
      };
    },
  });

  const toggleDomain = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (data) {
      setExpandedDomains(new Set(data.domains.map((d) => d.domain)));
    }
  };

  const collapseAll = () => {
    setExpandedDomains(new Set());
  };

  // Filter domains
  const filteredDomains = useMemo(() => {
    if (!data) return [];
    if (selectedDomain === "all") return data.domains;
    return data.domains.filter((d) => d.domain === selectedDomain);
  }, [data, selectedDomain]);

  // Calculate stats across all domains
  const stats = useMemo(() => {
    if (!data) return { total: 0, scheduled: 0, completed: 0, failed: 0, notYet: 0, missed: 0 };

    let total = 0;
    let scheduled = 0;
    let completed = 0;
    let failed = 0;
    let notYet = 0;
    let missed = 0;

    for (const d of data.domains) {
      for (const wf of d.workflows) {
        total++;
        if (wf.cron_expression) {
          if (shouldRunOnDate(wf.cron_expression, currentDate)) {
            scheduled++;
            const status = getExecutionStatus(wf, currentDate);
            if (status === "completed") completed++;
            else if (status === "failed") failed++;
            else if (status === "not_yet") notYet++;
            else if (status === "missed") missed++;
          }
        }
      }
    }

    return { total, scheduled, completed, failed, notYet, missed };
  }, [data, currentDate]);

  // Auto-expand first domain
  useEffect(() => {
    if (data && data.domains.length > 0 && expandedDomains.size === 0) {
      setExpandedDomains(new Set([data.domains[0].domain]));
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto mb-3 text-zinc-600 animate-spin" />
          <p className="text-sm text-zinc-500">Loading schedule data...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-400">Failed to load schedule data</p>
          <p className="text-xs text-zinc-500 mt-1">
            Could not read domain workflow files
          </p>
          <code className="text-xs text-zinc-600 mt-2 block">{productionPath}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800 p-4">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
                <Clock size={22} className="text-teal-400" />
                All Domain Schedules
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                Scheduled workflows across all production domains
              </p>
            </div>

            {/* Tab Buttons */}
            <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab("report")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  activeTab === "report"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <BarChart3 size={14} />
                Report
              </button>
              <button
                onClick={() => setActiveTab("sources")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  activeTab === "sources"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <FileJson size={14} />
                Data Sources
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Toggle - only show when on report tab */}
            {activeTab === "report" && (
              <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors",
                    viewMode === "list"
                      ? "bg-zinc-700 text-teal-400"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <List size={14} />
                  List
                </button>
                <button
                  onClick={() => setViewMode("timeline")}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors",
                    viewMode === "timeline"
                      ? "bg-zinc-700 text-teal-400"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <BarChart3 size={14} />
                  Timeline
                </button>
              </div>
            )}

            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>

        {/* Date navigation - only show when on report tab */}
        {activeTab === "report" && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1">
            <button
              onClick={goToPreviousDay}
              className="p-1 hover:bg-zinc-700 rounded transition-colors"
            >
              <ChevronLeft size={16} className="text-zinc-400" />
            </button>
            <Calendar size={14} className="text-zinc-500 mx-1" />
            <span className="text-sm font-medium text-zinc-300 min-w-[90px] text-center">
              {formatDate(currentDate)}
            </span>
            {isToday && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-teal-500/20 text-teal-400 rounded">
                Today
              </span>
            )}
            <button
              onClick={goToNextDay}
              className="p-1 hover:bg-zinc-700 rounded transition-colors"
            >
              <ChevronRight size={16} className="text-zinc-400" />
            </button>
          </div>
          {!isToday && (
            <button
              onClick={goToToday}
              className="px-2.5 py-1 text-sm font-medium text-teal-400 hover:bg-teal-500/10 rounded-lg transition-colors"
            >
              Today
            </button>
          )}
        </div>
        )}

        {/* Stats cards - only show when on report tab */}
        {activeTab === "report" && (
        <>
        <div className="grid grid-cols-6 gap-2 mb-4">
          <button
            onClick={() => setFilterStatus("all")}
            className={cn(
              "bg-zinc-800 border rounded-lg px-3 py-2 text-left transition-all",
              filterStatus === "all" ? "border-zinc-500" : "border-zinc-700 hover:border-zinc-600"
            )}
          >
            <div className="text-lg font-bold text-zinc-100">{stats.total}</div>
            <div className="text-xs text-zinc-500">Total</div>
          </button>
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
            <div className="text-lg font-bold text-teal-400">{stats.scheduled}</div>
            <div className="text-xs text-zinc-500">Scheduled</div>
          </div>
          <button
            onClick={() => setFilterStatus("completed")}
            className={cn(
              "bg-zinc-800 border rounded-lg px-3 py-2 text-left transition-all",
              filterStatus === "completed" ? "border-green-500" : "border-zinc-700 hover:border-green-600"
            )}
          >
            <div className="text-lg font-bold text-green-400">{stats.completed}</div>
            <div className="text-xs text-green-400/70">Completed</div>
          </button>
          <button
            onClick={() => setFilterStatus("failed")}
            className={cn(
              "bg-zinc-800 border rounded-lg px-3 py-2 text-left transition-all",
              filterStatus === "failed" ? "border-red-500" : "border-zinc-700 hover:border-red-600"
            )}
          >
            <div className="text-lg font-bold text-red-400">{stats.failed}</div>
            <div className="text-xs text-red-400/70">Failed</div>
          </button>
          <button
            onClick={() => setFilterStatus("not_yet")}
            className={cn(
              "bg-zinc-800 border rounded-lg px-3 py-2 text-left transition-all",
              filterStatus === "not_yet" ? "border-zinc-400" : "border-zinc-700 hover:border-zinc-500"
            )}
          >
            <div className="text-lg font-bold text-zinc-400">{stats.notYet}</div>
            <div className="text-xs text-zinc-500">Not Yet</div>
          </button>
          <button
            onClick={() => setFilterStatus("missed")}
            className={cn(
              "bg-zinc-800 border rounded-lg px-3 py-2 text-left transition-all",
              filterStatus === "missed" ? "border-amber-500" : "border-zinc-700 hover:border-amber-600"
            )}
          >
            <div className="text-lg font-bold text-amber-400">{stats.missed}</div>
            <div className="text-xs text-amber-400/70">Missed</div>
          </button>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search workflows or domains..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 placeholder-zinc-600"
            />
          </div>

          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300"
          >
            <option value="all">All Domains ({data.domains.length})</option>
            {data.domains.map((d) => (
              <option key={d.domain} value={d.domain}>
                {d.domain} ({d.scheduledCount})
              </option>
            ))}
          </select>

          {viewMode === "timeline" && (
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <span>Zoom:</span>
              {[60, 30, 15, 5].map((z) => (
                <button
                  key={z}
                  onClick={() => setTimelineZoom(z)}
                  className={cn(
                    "px-2 py-1 rounded transition-colors",
                    timelineZoom === z
                      ? "bg-zinc-700 text-zinc-200"
                      : "hover:bg-zinc-800 text-zinc-500"
                  )}
                >
                  {z === 60 ? "1h" : `${z}m`}
                </button>
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* Data Sources Tab */}
      {activeTab === "sources" && (
        <DataSourcesTab productionPath={productionPath} domains={data.domains} />
      )}

      {/* Report Content */}
      {activeTab === "report" && (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-6xl mx-auto">
          {/* Controls */}
          <div className="flex items-center gap-2 mb-4 text-xs">
            <span className="text-zinc-500">
              Showing {filteredDomains.reduce((sum, d) => sum + d.workflows.filter((w) => w.cron_expression).length, 0)} scheduled workflows
            </span>
            <span className="text-zinc-700">|</span>
            <button onClick={expandAll} className="text-zinc-500 hover:text-zinc-300">
              Expand all
            </button>
            <span className="text-zinc-700">|</span>
            <button onClick={collapseAll} className="text-zinc-500 hover:text-zinc-300">
              Collapse all
            </button>
          </div>

          {/* Domain cards */}
          <div className="space-y-3">
            {filteredDomains.map((domain) => (
              <DomainScheduleCard
                key={domain.domain}
                data={domain}
                expanded={expandedDomains.has(domain.domain)}
                onToggle={() => toggleDomain(domain.domain)}
                dateStr={currentDate}
                viewMode={viewMode}
                searchQuery={searchQuery}
                filterStatus={filterStatus}
                zoom={timelineZoom}
              />
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
