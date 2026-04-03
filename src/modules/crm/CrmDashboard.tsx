// src/modules/crm/CrmDashboard.tsx
// CRM Dashboard — action queue, pipeline summary, follow-ups

import { useState, useMemo } from "react";
import { useDealsWithTasks, useActivities } from "../../hooks/crm";
import { DealWithTaskInfo, DEAL_STAGES, DEAL_SOLUTIONS } from "../../lib/crm/types";
import { AlertTriangle, TrendingUp, Clock, Calendar, ClipboardList, DollarSign, ChevronDown, ChevronRight } from "lucide-react";
import { DetailLoading } from "../../components/ui/DetailStates";
import { formatDateShort as formatDate, toSGTDateString } from "../../lib/date";

interface CrmDashboardProps {
  onDealClick?: (deal: DealWithTaskInfo) => void;
}

// Stale calculation (mirrors DealCard logic)
function getStaleInfo(deal: DealWithTaskInfo): {
  level: "fresh" | "warning" | "attention" | "critical" | "dormant";
  days: number;
} {
  const stageDate = deal.stage_changed_at
    ? new Date(deal.stage_changed_at)
    : new Date(deal.created_at || 0);
  const now = new Date();
  const days = Math.floor(
    (now.getTime() - stageDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (deal.stale_snoozed_until) {
    const snoozeDate = new Date(deal.stale_snoozed_until);
    const tenYearsFromNow = new Date();
    tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);
    if (snoozeDate >= tenYearsFromNow) {
      return { level: "dormant", days };
    }
  }

  if (days >= 30) return { level: "critical", days };
  if (days >= 14) return { level: "attention", days };
  if (days >= 7) return { level: "warning", days };
  return { level: "fresh", days };
}

// Get urgency reason for action queue
function getUrgencyReason(deal: DealWithTaskInfo): {
  priority: number;
  reason: string;
  color: string;
} | null {
  const stale = getStaleInfo(deal);
  const todaySGT = toSGTDateString();

  // Skip dormant deals
  if (stale.level === "dormant") return null;

  // 1. Overdue expected close
  if (deal.expected_close_date) {
    const closeDateStr = deal.expected_close_date.slice(0, 10);
    if (closeDateStr < todaySGT) {
      const overdueDays = Math.floor((Date.now() - new Date(deal.expected_close_date).getTime()) / (1000 * 60 * 60 * 24));
      return {
        priority: 1,
        reason: `Close date ${overdueDays}d overdue`,
        color: "text-red-600 dark:text-red-400",
      };
    }
  }

  // 2. Critical stale (30+ days in stage)
  if (stale.level === "critical") {
    return {
      priority: 2,
      reason: `${stale.days}d in stage — needs action`,
      color: "text-red-600 dark:text-red-400",
    };
  }

  // 3. Attention stale (14+ days)
  if (stale.level === "attention") {
    return {
      priority: 3,
      reason: `${stale.days}d in stage — follow up`,
      color: "text-orange-600 dark:text-orange-400",
    };
  }

  // 4. Task overdue
  if (deal.nextTask?.due_date) {
    const taskDateStr = deal.nextTask.due_date.slice(0, 10);
    if (taskDateStr < todaySGT) {
      return {
        priority: 4,
        reason: `Task overdue: ${deal.nextTask.title}`,
        color: "text-orange-600 dark:text-orange-400",
      };
    }
  }

  // 5. Warning stale (7+ days)
  if (stale.level === "warning") {
    return {
      priority: 5,
      reason: `${stale.days}d in stage`,
      color: "text-amber-600 dark:text-amber-400",
    };
  }

  return null;
}

export function CrmDashboard({ onDealClick }: CrmDashboardProps) {
  const { data: deals = [], isLoading } = useDealsWithTasks({
    stage: ["target", "prospect", "lead", "qualified", "pilot", "proposal", "negotiation"],
  });

  // Recent activities (last 10)
  const { data: recentActivities = [] } = useActivities({ limit: 10 });

  // Active stages for pipeline summary
  const activeStages = DEAL_STAGES.filter(
    (s) => !["won", "lost"].includes(s.value)
  );

  // Action queue — deals needing attention, sorted by urgency
  const actionQueue = useMemo(() => {
    const items: { deal: DealWithTaskInfo; priority: number; reason: string; color: string }[] = [];

    deals.forEach((deal) => {
      const urgency = getUrgencyReason(deal);
      if (urgency) {
        items.push({ deal, ...urgency });
      }
    });

    return items.sort((a, b) => a.priority - b.priority);
  }, [deals]);

  // Pipeline summary by stage
  const pipelineSummary = useMemo(() => {
    return activeStages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stage === stage.value);
      const value = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const weighted = value * stage.weight;
      return {
        ...stage,
        count: stageDeals.length,
        value,
        weighted,
      };
    });
  }, [deals, activeStages]);

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
  const weightedValue = pipelineSummary.reduce((sum, s) => sum + s.weighted, 0);

  // Solution breakdown
  const solutionBreakdown = useMemo(() => {
    const bySln: Record<string, { count: number; value: number }> = {};
    deals.forEach((d) => {
      const sln = d.solution || "unassigned";
      if (!bySln[sln]) bySln[sln] = { count: 0, value: 0 };
      bySln[sln].count++;
      bySln[sln].value += d.value || 0;
    });
    return Object.entries(bySln)
      .map(([key, stats]) => {
        const def = DEAL_SOLUTIONS.find((s) => s.value === key);
        return { key, label: def?.label || key, color: def?.color || "zinc", ...stats };
      })
      .sort((a, b) => b.value - a.value);
  }, [deals]);

  // Upcoming closes (next 14 days)
  const upcomingCloses = useMemo(() => {
    const now = new Date();
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);

    return deals
      .filter((d) => {
        if (!d.expected_close_date) return false;
        const close = new Date(d.expected_close_date);
        return close >= now && close <= twoWeeks;
      })
      .sort((a, b) => (a.expected_close_date || "").localeCompare(b.expected_close_date || ""));
  }, [deals]);

  if (isLoading) return <DetailLoading />;

  const [showDetails, setShowDetails] = useState(false);
  const lateStageCount = pipelineSummary.filter((s) => s.count > 0 && ["proposal", "negotiation"].includes(s.label.toLowerCase())).reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-[1000px] mx-auto p-6 space-y-6">

        {/* Compact pipeline summary — inline stats */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign size={14} className="text-zinc-400" />
            <span className="text-zinc-500">Pipeline</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">${(totalValue / 1000).toFixed(0)}K</span>
            <span className="text-xs text-zinc-400">({deals.length})</span>
          </div>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-teal-500" />
            <span className="text-zinc-500">Weighted</span>
            <span className="font-semibold text-teal-600 dark:text-teal-400 tabular-nums">${(weightedValue / 1000).toFixed(0)}K</span>
            {lateStageCount > 0 && (
              <span className="text-xs text-zinc-400">{lateStageCount} late stage</span>
            )}
          </div>
          {actionQueue.length > 0 && (
            <>
              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-orange-500" />
                <span className="font-semibold text-orange-600 dark:text-orange-400 tabular-nums">{actionQueue.length}</span>
                <span className="text-zinc-500">need attention</span>
                {actionQueue.filter((a) => a.priority <= 2).length > 0 && (
                  <span className="text-xs text-red-600 dark:text-red-400">({actionQueue.filter((a) => a.priority <= 2).length} critical)</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Action Required — full width, primary focus */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <AlertTriangle size={14} className="text-orange-500" />
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Action Required</span>
            <span className="text-xs text-zinc-400 ml-auto">{actionQueue.length} deals</span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {actionQueue.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-400">
                All clear — no deals need attention
              </div>
            ) : (
              actionQueue.slice(0, 15).map(({ deal, reason, color }) => (
                <button
                  key={deal.id}
                  onClick={() => onDealClick?.(deal)}
                  className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs text-teal-600 dark:text-teal-400/80">
                        {deal.company?.name || "Unknown"}
                      </span>
                      <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{deal.name}</p>
                    </div>
                    {deal.value && (
                      <span className="text-xs font-medium text-zinc-500 flex-shrink-0 tabular-nums">
                        ${(deal.value / 1000).toFixed(0)}K
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${color}`}>{reason}</p>
                </button>
              ))
            )}
            {actionQueue.length > 15 && (
              <div className="px-4 py-2 text-xs text-zinc-400 text-center">
                +{actionQueue.length - 15} more
              </div>
            )}
          </div>
        </div>

        {/* Closing Soon — full width */}
        {upcomingCloses.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <Calendar size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Closing Soon</span>
              <span className="text-xs text-zinc-400 ml-auto">Next 14 days</span>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {upcomingCloses.map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => onDealClick?.(deal)}
                  className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs text-teal-600 dark:text-teal-400/80">
                        {deal.company?.name || "Unknown"}
                      </span>
                      <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{deal.name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {deal.value && (
                        <span className="text-xs font-medium text-zinc-500 tabular-nums">
                          ${(deal.value / 1000).toFixed(0)}K
                        </span>
                      )}
                      <span className="text-xs text-zinc-400 tabular-nums">
                        {formatDate(deal.expected_close_date!)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline Details — collapsed by default */}
        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Pipeline Details</span>
          </button>

          {showDetails && (
            <div className="grid grid-cols-3 gap-4 mt-3">
              {/* Stage Funnel */}
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                  <TrendingUp size={14} className="text-teal-500" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">By Stage</span>
                </div>
                <div className="p-4 space-y-2">
                  {pipelineSummary.map((stage) => {
                    const pct = totalValue > 0 ? (stage.value / totalValue) * 100 : 0;
                    return (
                      <div key={stage.value} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 w-24 flex-shrink-0">
                          <StageIndicator color={stage.color} />
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">{stage.label}</span>
                        </div>
                        <div className="flex-1 h-5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                          {pct > 0 && (
                            <div
                              className="h-full bg-teal-500/20 dark:bg-teal-500/30 rounded flex items-center px-2"
                              style={{ width: `${Math.max(pct, 8)}%` }}
                            >
                              <span className="text-[10px] text-teal-700 dark:text-teal-300 tabular-nums whitespace-nowrap">
                                {stage.count}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums w-16 text-right flex-shrink-0">
                          {stage.value > 0 ? `$${(stage.value / 1000).toFixed(0)}K` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Solution Breakdown */}
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                  <ClipboardList size={14} className="text-purple-500" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">By Solution</span>
                </div>
                <div className="p-4 space-y-2">
                  {solutionBreakdown.map((sln) => (
                    <div key={sln.key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SolutionBadge color={sln.color} />
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">{sln.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 tabular-nums">{sln.count}</span>
                        <span className="text-xs text-zinc-500 tabular-nums w-14 text-right">
                          ${(sln.value / 1000).toFixed(0)}K
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                  <Clock size={14} className="text-zinc-500" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Activity</span>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recentActivities.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-zinc-400">
                      No recent activities
                    </div>
                  ) : (
                    recentActivities.slice(0, 8).map((activity) => (
                      <div key={activity.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">
                              {activity.subject || activity.type}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <ActivityBadge type={activity.type} />
                            <span className="text-xs text-zinc-400 tabular-nums">
                              {activity.activity_date ? formatDate(activity.activity_date) : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StageIndicator({ color }: { color: string }) {
  const colors: Record<string, string> = {
    zinc: "bg-zinc-400",
    gray: "bg-gray-500",
    purple: "bg-purple-500",
    blue: "bg-blue-500",
    cyan: "bg-cyan-500",
    yellow: "bg-yellow-500",
    green: "bg-green-500",
    red: "bg-red-500",
  };

  return (
    <div className={`w-2 h-2 rounded-full ${colors[color] || colors.gray}`} />
  );
}

function SolutionBadge({ color }: { color: string }) {
  const colors: Record<string, string> = {
    zinc: "bg-zinc-400",
    gray: "bg-gray-500",
    purple: "bg-purple-500",
    blue: "bg-blue-500",
    indigo: "bg-indigo-500",
    cyan: "bg-cyan-500",
    yellow: "bg-yellow-500",
    green: "bg-green-500",
    red: "bg-red-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    orange: "bg-orange-500",
    emerald: "bg-emerald-500",
    pink: "bg-pink-500",
  };

  return (
    <div className={`w-2 h-2 rounded-sm ${colors[color] || colors.gray}`} />
  );
}

function ActivityBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    email: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950",
    meeting: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950",
    call: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950",
    note: "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800",
    task: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950",
    stage_change: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950",
  };

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles[type] || styles.note}`}>
      {type.replace("_", " ")}
    </span>
  );
}
