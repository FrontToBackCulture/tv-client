// src/modules/library/DomainSchedule.tsx
// Schedule view showing workflow schedules and execution times

import { useState, useMemo } from "react";
import {
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  List,
  BarChart3,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { useDomainData, WorkflowHealth } from "../../hooks/useDomainData";
import { cn } from "../../lib/cn";
import { ViewerLayout, ViewerTab, DataSourcesTab } from "./ViewerLayout";

interface DomainScheduleProps {
  domainPath: string;
  domainName: string;
}

type TabType = "schedule" | "sources";
type StatusFilter = "all" | "completed" | "failed" | "warning" | "healthy";
type ViewMode = "list" | "timeline";

export function DomainSchedule({ domainPath, domainName }: DomainScheduleProps) {
  const { workflows, loading, error } = useDomainData(domainPath);
  const [activeTab, setActiveTab] = useState<TabType>("schedule");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [monitoringDate, setMonitoringDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Define tabs
  const tabs: ViewerTab[] = useMemo(() => [
    {
      id: "schedule",
      label: "Schedule",
      icon: <Clock size={14} />,
      count: workflows?.workflows.filter(w => w.isScheduled).length ?? 0,
    },
    {
      id: "sources",
      label: "Data Sources",
      icon: <FolderOpen size={14} />,
    },
  ], [workflows]);

  // Data sources for this viewer
  const dataSources = useMemo(() => [
    {
      name: "Workflow Definitions",
      path: `${domainPath}/all_workflows.json`,
      description: "All workflow definitions from VAL",
    },
    {
      name: "Workflow Health Results",
      path: `${domainPath}/workflow-health-results.json`,
      description: "Workflow health analysis and execution history",
    },
    {
      name: "Workflow Executions",
      path: `${domainPath}/monitoring/${monitoringDate}/workflow_executions_${monitoringDate}.json`,
      description: `Execution logs for ${monitoringDate}`,
    },
  ], [domainPath, monitoringDate]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500 mr-2" />
        <span className="text-zinc-500">Loading schedule data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <ViewerLayout
      title={`${domainName} Schedule`}
      subtitle="Workflow schedules and execution times"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabType)}
    >
      {activeTab === "schedule" && workflows && (
        <ScheduleTab
          workflows={workflows.workflows}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewMode={viewMode}
          setViewMode={setViewMode}
          monitoringDate={monitoringDate}
          setMonitoringDate={setMonitoringDate}
        />
      )}
      {activeTab === "schedule" && !workflows && (
        <div className="p-6 text-zinc-500">
          No workflow data available. Run workflow health check to generate schedule data.
        </div>
      )}
      {activeTab === "sources" && (
        <DataSourcesTab sources={dataSources} basePath={domainPath} />
      )}
    </ViewerLayout>
  );
}

// Schedule Tab
function ScheduleTab({
  workflows,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  viewMode,
  setViewMode,
  monitoringDate,
  setMonitoringDate,
}: {
  workflows: WorkflowHealth[];
  statusFilter: StatusFilter;
  setStatusFilter: (f: StatusFilter) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  monitoringDate: string;
  setMonitoringDate: (d: string) => void;
}) {
  // Date navigation
  const isToday = monitoringDate === new Date().toISOString().split("T")[0];

  const goToPreviousDay = () => {
    const current = new Date(monitoringDate);
    current.setDate(current.getDate() - 1);
    setMonitoringDate(current.toISOString().split("T")[0]);
  };

  const goToNextDay = () => {
    const current = new Date(monitoringDate);
    const today = new Date().toISOString().split("T")[0];
    current.setDate(current.getDate() + 1);
    const nextDate = current.toISOString().split("T")[0];
    if (nextDate <= today) {
      setMonitoringDate(nextDate);
    }
  };

  const goToToday = () => {
    setMonitoringDate(new Date().toISOString().split("T")[0]);
  };

  const formatMonitoringDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  // Stats calculation
  const stats = useMemo(() => {
    const scheduled = workflows.filter((w) => w.isScheduled);
    const healthy = scheduled.filter((w) => w.health.status.level === "healthy");
    const warning = scheduled.filter((w) => w.health.status.level === "warning");
    const critical = scheduled.filter((w) => w.health.status.level === "critical");

    return {
      total: workflows.length,
      scheduled: scheduled.length,
      healthy: healthy.length,
      warning: warning.length,
      critical: critical.length,
    };
  }, [workflows]);

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    let result = workflows.filter((w) => w.isScheduled);

    if (statusFilter !== "all") {
      result = result.filter((w) => {
        if (statusFilter === "healthy") return w.health.status.level === "healthy";
        if (statusFilter === "warning") return w.health.status.level === "warning";
        if (statusFilter === "failed") return w.health.status.level === "critical";
        return true;
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((wf) => wf.name.toLowerCase().includes(query));
    }

    // Sort by schedule time
    result.sort((a, b) => {
      const aTime = getCronTimeInMinutes(a.cronExpression);
      const bTime = getCronTimeInMinutes(b.cronExpression);
      return aTime - bTime;
    });

    return result;
  }, [workflows, statusFilter, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls Section */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          {/* Date Navigator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1">
              <button
                onClick={goToPreviousDay}
                className="p-1 hover:bg-zinc-700 rounded transition-colors"
                title="Previous day"
              >
                <ChevronLeft size={16} className="text-zinc-400" />
              </button>
              <div className="flex items-center gap-2 px-2">
                <Calendar size={14} className="text-zinc-500" />
                <span className="text-sm font-medium text-zinc-300 min-w-[100px] text-center">
                  {formatMonitoringDate(monitoringDate)}
                </span>
                {isToday && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-400/10 text-green-400 rounded">
                    Today
                  </span>
                )}
              </div>
              <button
                onClick={goToNextDay}
                disabled={isToday}
                className={cn(
                  "p-1 rounded transition-colors",
                  isToday ? "text-zinc-600 cursor-not-allowed" : "hover:bg-zinc-700 text-zinc-400"
                )}
                title={isToday ? "Already on today" : "Next day"}
              >
                <ChevronRight size={16} />
              </button>
              {!isToday && (
                <button
                  onClick={goToToday}
                  className="ml-1 px-2 py-0.5 text-xs font-medium text-teal-400 hover:bg-teal-400/10 rounded transition-colors"
                  title="Go to today"
                >
                  Today
                </button>
              )}
            </div>

            {/* View Toggle */}
            <div className="flex items-center bg-zinc-800 rounded-md p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium rounded transition-colors",
                  viewMode === "list" ? "bg-zinc-700 text-teal-400" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="List View"
              >
                <List size={14} />
                List
              </button>
              <button
                onClick={() => setViewMode("timeline")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium rounded transition-colors",
                  viewMode === "timeline" ? "bg-zinc-700 text-teal-400" : "text-zinc-400 hover:text-zinc-200"
                )}
                title="Timeline View"
              >
                <BarChart3 size={14} />
                Timeline
              </button>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          <StatCard label="Total" value={stats.total} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} color="zinc" />
          <StatCard label="Scheduled" value={stats.scheduled} active={false} onClick={() => {}} color="teal" />
          <StatCard label="Healthy" value={stats.healthy} active={statusFilter === "healthy"} onClick={() => setStatusFilter(statusFilter === "healthy" ? "all" : "healthy")} color="green" />
          <StatCard label="Warning" value={stats.warning} active={statusFilter === "warning"} onClick={() => setStatusFilter(statusFilter === "warning" ? "all" : "warning")} color="yellow" />
          <StatCard label="Failed" value={stats.critical} active={statusFilter === "failed"} onClick={() => setStatusFilter(statusFilter === "failed" ? "all" : "failed")} color="red" />
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Workflow List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-sm text-zinc-500 mb-3">
          Showing {filteredWorkflows.length} of {workflows.length} workflows
        </div>

        {viewMode === "list" ? (
          <div className="space-y-2">
            {filteredWorkflows.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
          </div>
        ) : (
          <TimelineView workflows={filteredWorkflows} />
        )}
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  label,
  value,
  active,
  onClick,
  color,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  color: "zinc" | "teal" | "green" | "yellow" | "red";
}) {
  const colors = {
    zinc: { bg: active ? "bg-zinc-700 ring-2 ring-zinc-500" : "bg-zinc-800 hover:bg-zinc-700", text: "text-zinc-100", label: "text-zinc-400" },
    teal: { bg: "bg-teal-400/10", text: "text-teal-400", label: "text-teal-400/70" },
    green: { bg: active ? "bg-green-400/20 ring-2 ring-green-500" : "bg-green-400/10 hover:bg-green-400/15", text: "text-green-400", label: "text-green-400/70" },
    yellow: { bg: active ? "bg-yellow-400/20 ring-2 ring-yellow-500" : "bg-yellow-400/10 hover:bg-yellow-400/15", text: "text-yellow-400", label: "text-yellow-400/70" },
    red: { bg: active ? "bg-red-400/20 ring-2 ring-red-500" : "bg-red-400/10 hover:bg-red-400/15", text: "text-red-400", label: "text-red-400/70" },
  };

  const c = colors[color];

  return (
    <button onClick={onClick} className={cn("rounded-lg p-3 text-center cursor-pointer transition-all", c.bg)}>
      <div className={cn("text-2xl font-bold", c.text)}>{value}</div>
      <div className={cn("text-xs", c.label)}>{label}</div>
    </button>
  );
}

// Workflow card component
function WorkflowCard({ workflow }: { workflow: WorkflowHealth }) {
  const cronInfo = parseCronExpression(workflow.cronExpression);
  const lastRunDate = workflow.lastRun ? new Date(workflow.lastRun.date) : null;

  return (
    <div className="bg-zinc-900 rounded-lg p-4 hover:bg-zinc-800/80 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-200 truncate">{workflow.name}</p>
            {workflow.isChildWorkflow && (
              <span className="text-[10px] px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">Child</span>
            )}
          </div>
          {cronInfo && (
            <div className="flex items-center gap-2 mt-1">
              <Clock size={12} className="text-zinc-500" />
              <span className="text-xs text-zinc-400">{cronInfo.readable}</span>
              <span className="text-[10px] text-zinc-600 font-mono">{cronInfo.raw}</span>
            </div>
          )}
        </div>
        <StatusBadge level={workflow.health.status.level} />
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-zinc-400">
        {lastRunDate && (
          <span>
            Last: {lastRunDate.toLocaleDateString()} {lastRunDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <span>
          Success: {workflow.totalExecutions > 0 ? Math.round((workflow.successfulExecutions / workflow.totalExecutions) * 100) : 0}%
        </span>
        <span>{workflow.totalExecutions} runs</span>
      </div>

      {workflow.health.issues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {workflow.health.issues.slice(0, 2).map((issue, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-red-400/10 text-red-400 rounded">{issue}</span>
          ))}
          {workflow.health.issues.length > 2 && (
            <span className="text-[10px] text-zinc-500">+{workflow.health.issues.length - 2} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// Status badge component
function StatusBadge({ level }: { level: "healthy" | "warning" | "critical" | "skipped" }) {
  const config = {
    healthy: { icon: CheckCircle2, bg: "bg-green-400/10", text: "text-green-400" },
    warning: { icon: AlertCircle, bg: "bg-yellow-400/10", text: "text-yellow-400" },
    critical: { icon: XCircle, bg: "bg-red-400/10", text: "text-red-400" },
    skipped: { icon: AlertTriangle, bg: "bg-zinc-700", text: "text-zinc-400" },
  };

  const c = config[level];
  const Icon = c.icon;

  return (
    <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-xs", c.bg, c.text)}>
      <Icon size={12} />
      {level}
    </span>
  );
}

// Timeline view component
function TimelineView({ workflows }: { workflows: WorkflowHealth[] }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex border-b border-zinc-800">
        <div className="w-48 flex-shrink-0 px-3 py-2 text-xs font-medium text-zinc-400 border-r border-zinc-800 bg-zinc-800/50">
          Workflow
        </div>
        <div className="flex-1 flex">
          {hours.map((h) => (
            <div key={h} className="flex-1 text-center py-2 text-[10px] text-zinc-500 border-r border-zinc-800 last:border-r-0">
              {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
            </div>
          ))}
        </div>
      </div>

      <div className="divide-y divide-zinc-800">
        {workflows.map((workflow) => {
          const timeInMinutes = getCronTimeInMinutes(workflow.cronExpression);
          const leftPercent = timeInMinutes < 9999 ? (timeInMinutes / 1440) * 100 : -1;

          return (
            <div key={workflow.id} className="flex hover:bg-zinc-800/50 transition-colors">
              <div className="w-48 flex-shrink-0 px-3 py-2 border-r border-zinc-800 bg-zinc-900">
                <p className="text-xs text-zinc-300 truncate">{workflow.name}</p>
              </div>
              <div className="flex-1 relative h-10">
                {leftPercent >= 0 && (
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 h-6 w-20 rounded flex items-center justify-center text-[10px]",
                      workflow.health.status.level === "healthy"
                        ? "bg-green-400/20 text-green-400"
                        : workflow.health.status.level === "warning"
                          ? "bg-yellow-400/20 text-yellow-400"
                          : workflow.health.status.level === "critical"
                            ? "bg-red-400/20 text-red-400"
                            : "bg-zinc-700 text-zinc-400"
                    )}
                    style={{ left: `${leftPercent}%` }}
                    title={parseCronExpression(workflow.cronExpression)?.readable}
                  >
                    {workflow.health.status.level}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper: Parse cron expression
function parseCronExpression(cron: string | null): { readable: string; raw: string } | null {
  if (!cron) return null;

  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return { readable: cron, raw: cron };

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const formatTime = (h: string, m: string) => {
    const hourNum = parseInt(h);
    const minNum = parseInt(m);
    if (isNaN(hourNum)) return null;
    const period = hourNum >= 12 ? "PM" : "AM";
    const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
    const minStr = minNum.toString().padStart(2, "0");
    return `${hour12}:${minStr} ${period}`;
  };

  let readable = "";
  const time = formatTime(hour, minute);

  if (minute === "*" && hour === "*") {
    readable = "Every minute";
  } else if (minute !== "*" && hour === "*") {
    readable = `Every hour at :${minute.padStart(2, "0")}`;
  } else if (hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    readable = time ? `Daily at ${time}` : `Daily at ${hour}:${minute}`;
  } else if (hour !== "*" && dayOfWeek !== "*") {
    readable = time ? `${dayOfWeek} at ${time}` : cron;
  } else {
    readable = cron;
  }

  return { readable, raw: cron };
}

// Helper: Extract time in minutes from cron
function getCronTimeInMinutes(cron: string | null): number {
  if (!cron) return 9999;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return 9999;

  const minute = parseInt(parts[0]);
  const hour = parseInt(parts[1]);

  if (isNaN(minute) || isNaN(hour)) return 9999;

  return hour * 60 + minute;
}
