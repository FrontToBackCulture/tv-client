// src/modules/library/DomainSchedule.tsx
// Schedule view showing workflow schedules and execution times

import { useState } from "react";
import { Clock, Calendar, Play, Pause, AlertTriangle } from "lucide-react";
import { useDomainData, WorkflowHealth } from "../../hooks/useDomainData";
import { cn } from "../../lib/cn";

interface DomainScheduleProps {
  domainPath: string;
  domainName: string;
}

export function DomainSchedule({ domainPath, domainName }: DomainScheduleProps) {
  const { workflows, loading, error } = useDomainData(domainPath);
  const [showUnscheduled, setShowUnscheduled] = useState(false);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading schedule data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!workflows) {
    return (
      <div className="p-6 text-zinc-500">
        No workflow data available. Run workflow health check to generate schedule data.
      </div>
    );
  }

  // Separate scheduled and unscheduled workflows
  const scheduledWorkflows = workflows.workflows.filter((w) => w.isScheduled);
  const unscheduledWorkflows = workflows.workflows.filter((w) => !w.isScheduled);

  // Group by schedule pattern
  const groupedBySchedule = groupWorkflowsBySchedule(scheduledWorkflows);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">{domainName} Schedule</h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={showUnscheduled}
                onChange={(e) => setShowUnscheduled(e.target.checked)}
                className="rounded bg-zinc-700 border-zinc-600"
              />
              Show manual
            </label>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex gap-6 mt-3 text-sm">
          <div className="flex items-center gap-2 text-zinc-400">
            <Clock size={14} className="text-teal-400" />
            <span>{scheduledWorkflows.length} scheduled</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Play size={14} className="text-zinc-500" />
            <span>{unscheduledWorkflows.length} manual</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Scheduled workflows grouped by pattern */}
        {Object.entries(groupedBySchedule).map(([pattern, wfs]) => (
          <ScheduleGroup key={pattern} pattern={pattern} workflows={wfs} />
        ))}

        {/* Unscheduled workflows */}
        {showUnscheduled && unscheduledWorkflows.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
              <Pause size={14} />
              Manual / On-Demand ({unscheduledWorkflows.length})
            </h3>
            <div className="space-y-2">
              {unscheduledWorkflows.map((workflow) => (
                <WorkflowScheduleCard key={workflow.id} workflow={workflow} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Group workflows by their cron pattern
function groupWorkflowsBySchedule(workflows: WorkflowHealth[]): Record<string, WorkflowHealth[]> {
  const groups: Record<string, WorkflowHealth[]> = {};

  for (const workflow of workflows) {
    const pattern = describeCronPattern(workflow.cronExpression);
    if (!groups[pattern]) {
      groups[pattern] = [];
    }
    groups[pattern].push(workflow);
  }

  // Sort groups by frequency (daily first, then hourly, etc.)
  const sortOrder = ["Daily", "Hourly", "Every 30 minutes", "Every 15 minutes", "Weekly", "Monthly"];
  const sorted: Record<string, WorkflowHealth[]> = {};

  sortOrder.forEach((key) => {
    if (groups[key]) {
      sorted[key] = groups[key];
    }
  });

  // Add remaining groups
  Object.keys(groups).forEach((key) => {
    if (!sorted[key]) {
      sorted[key] = groups[key];
    }
  });

  return sorted;
}

// Convert cron expression to human readable
function describeCronPattern(cron: string | null): string {
  if (!cron) return "Unknown";

  // Common patterns
  if (cron.includes("0 * * * *") || cron.match(/^\d+ \* \* \* \*$/)) return "Hourly";
  if (cron.includes("*/30 * * * *")) return "Every 30 minutes";
  if (cron.includes("*/15 * * * *")) return "Every 15 minutes";
  if (cron.match(/^\d+ \d+ \* \* \*$/)) return "Daily";
  if (cron.match(/^\d+ \d+ \* \* \d$/)) return "Weekly";
  if (cron.match(/^\d+ \d+ \d+ \* \*$/)) return "Monthly";

  return cron;
}

// Schedule group component
function ScheduleGroup({
  pattern,
  workflows,
}: {
  pattern: string;
  workflows: WorkflowHealth[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 mb-3"
      >
        <Calendar size={14} className="text-teal-400" />
        {pattern}
        <span className="text-zinc-500 font-normal">({workflows.length})</span>
      </button>

      {expanded && (
        <div className="space-y-2 ml-5">
          {workflows.map((workflow) => (
            <WorkflowScheduleCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      )}
    </div>
  );
}

// Workflow schedule card
function WorkflowScheduleCard({ workflow }: { workflow: WorkflowHealth }) {
  const lastRunDate = workflow.lastRun
    ? new Date(workflow.lastRun.date)
    : null;

  return (
    <div className="bg-zinc-900 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 truncate">{workflow.name}</p>
          {workflow.cronExpression && (
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">
              {workflow.cronExpression}
            </p>
          )}
        </div>

        {/* Status indicator */}
        <div
          className={cn(
            "px-2 py-0.5 rounded text-xs",
            workflow.health.status.level === "healthy"
              ? "bg-green-400/10 text-green-400"
              : workflow.health.status.level === "warning"
                ? "bg-yellow-400/10 text-yellow-400"
                : workflow.health.status.level === "critical"
                  ? "bg-red-400/10 text-red-400"
                  : "bg-zinc-700 text-zinc-400"
          )}
        >
          {workflow.health.status.level}
        </div>
      </div>

      {/* Last run info */}
      <div className="flex gap-4 mt-2 text-xs text-zinc-400">
        {lastRunDate && (
          <span>
            Last run: {lastRunDate.toLocaleDateString()} {lastRunDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <span>
          Success rate: {workflow.totalExecutions > 0
            ? Math.round((workflow.successfulExecutions / workflow.totalExecutions) * 100)
            : 0}%
        </span>
      </div>
    </div>
  );
}
