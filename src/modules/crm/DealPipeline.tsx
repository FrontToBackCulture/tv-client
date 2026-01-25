// src/modules/crm/DealPipeline.tsx
// Deal pipeline view with swimlanes by solution and columns by stage

import { useState, useMemo } from "react";
import { useDealsWithTasks, useUpdateDeal } from "../../hooks/useCRM";
import { Deal, DealWithTaskInfo, DEAL_STAGES, DEAL_SOLUTIONS } from "../../lib/crm/types";
import { DealCard } from "./DealCard";
import { Loader2, ChevronRight, ArrowUpDown } from "lucide-react";

interface DealPipelineProps {
  onRefresh?: () => void;
  onDealClick?: (deal: DealWithTaskInfo) => void;
}

type SolutionValue = (typeof DEAL_SOLUTIONS)[number]["value"] | "unassigned";

// Get solution from deal
function getDealSolution(deal: DealWithTaskInfo): SolutionValue {
  if (deal.solution && deal.solution !== "other") {
    return deal.solution as SolutionValue;
  }

  // Fall back to parsing from deal name
  const lowerName = deal.name.toLowerCase();
  if (lowerName.startsWith("free invoice scan")) return "free_invoice_scan";
  if (lowerName.startsWith("ap automation")) return "ap_automation";
  if (lowerName.startsWith("ar automation")) return "ar_automation";
  if (lowerName.startsWith("analytics")) return "analytics";
  if (lowerName.startsWith("revenue reconciliation")) return "revenue_reconciliation";
  if (lowerName.includes("professional service") || lowerName.includes("sow"))
    return "professional_services";

  return "unassigned";
}

type SortField = "company" | "task_date" | "value" | "close_date";
type SortDirection = "asc" | "desc";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "company", label: "Company" },
  { value: "value", label: "Value" },
  { value: "task_date", label: "Task Due" },
  { value: "close_date", label: "Close Date" },
];

export function DealPipeline({ onRefresh, onDealClick }: DealPipelineProps) {
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<SolutionValue>>(
    new Set()
  );
  const [sortField, setSortField] = useState<SortField>("company");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Fetch active deals with tasks (not won/lost)
  const { data: deals = [], isLoading, refetch } = useDealsWithTasks({
    stage: ["prospect", "lead", "qualified", "pilot", "proposal", "negotiation"],
  });

  const updateMutation = useUpdateDeal();

  const activeStages = DEAL_STAGES.filter(
    (s) => !["won", "lost"].includes(s.value)
  );

  // Handle drag and drop stage change
  async function handleStageDrop(dealId: string, newStage: string) {
    try {
      await updateMutation.mutateAsync({
        id: dealId,
        updates: { stage: newStage as Deal["stage"] },
      });
      refetch();
      onRefresh?.();
    } catch (error) {
      console.error("Failed to update deal stage:", error);
      refetch();
    }
  }

  // Group deals by solution
  const dealsBySolution = useMemo(() => {
    const grouped: Record<SolutionValue, DealWithTaskInfo[]> = {
      ap_automation: [],
      ar_automation: [],
      free_invoice_scan: [],
      analytics: [],
      revenue_reconciliation: [],
      professional_services: [],
      partnership: [],
      data_extraction: [],
      other: [],
      unassigned: [],
    };

    deals.forEach((deal) => {
      const solution = getDealSolution(deal);
      grouped[solution].push(deal);
    });

    return grouped;
  }, [deals]);

  // Calculate totals per solution
  const solutionStats = useMemo(() => {
    const stats: Record<SolutionValue, { count: number; value: number }> =
      {} as Record<SolutionValue, { count: number; value: number }>;

    Object.entries(dealsBySolution).forEach(([solution, solutionDeals]) => {
      stats[solution as SolutionValue] = {
        count: solutionDeals.length,
        value: solutionDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      };
    });

    return stats;
  }, [dealsBySolution]);

  // Get solutions that have deals
  const activeSolutions: { value: SolutionValue; label: string; color: string }[] =
    useMemo(() => {
      const solutions: { value: SolutionValue; label: string; color: string }[] = [];

      DEAL_SOLUTIONS.forEach((s) => {
        if (dealsBySolution[s.value]?.length > 0) {
          solutions.push(s);
        }
      });

      if (dealsBySolution.unassigned?.length > 0) {
        solutions.push({ value: "unassigned", label: "Unassigned", color: "slate" });
      }

      return solutions;
    }, [dealsBySolution]);

  const toggleSwimlane = (solution: SolutionValue) => {
    setCollapsedSwimlanes((prev) => {
      const next = new Set(prev);
      if (next.has(solution)) {
        next.delete(solution);
      } else {
        next.add(solution);
      }
      return next;
    });
  };

  // Sort deals
  const sortDeals = (dealsToSort: DealWithTaskInfo[]): DealWithTaskInfo[] => {
    const sorted = [...dealsToSort].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "company":
          const compA = a.company?.name || "";
          const compB = b.company?.name || "";
          comparison = compA.localeCompare(compB);
          break;
        case "value":
          comparison = (a.value || 0) - (b.value || 0);
          break;
        case "task_date":
          const taskA = a.nextTask?.due_date || "9999-12-31";
          const taskB = b.nextTask?.due_date || "9999-12-31";
          comparison = taskA.localeCompare(taskB);
          break;
        case "close_date":
          const closeA = a.expected_close_date || "9999-12-31";
          const closeB = b.expected_close_date || "9999-12-31";
          comparison = closeA.localeCompare(closeB);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <Loader2 size={24} className="text-zinc-400 dark:text-zinc-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-zinc-950">
      {/* Stage header row */}
      <div className="flex-shrink-0 flex border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {/* Solution column header with sort */}
        <div className="w-44 flex-shrink-0 px-3 py-2 border-r border-slate-200 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              Solution
            </span>
            <div className="flex items-center gap-1">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="text-[10px] px-1 py-0.5 rounded border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                className="p-0.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded"
              >
                <ArrowUpDown size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Stage column headers */}
        {activeStages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage.value);
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);

          return (
            <div
              key={stage.value}
              className="flex-1 min-w-[140px] px-3 py-2 border-r border-slate-200 dark:border-zinc-800 last:border-r-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StageIndicator color={stage.color} />
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {stage.label}
                  </span>
                  <span className="text-xs text-zinc-500">{stageDeals.length}</span>
                </div>
                <span className="text-xs text-zinc-500">
                  ${(stageValue / 1000).toFixed(0)}K
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Swimlanes */}
      <div className="flex-1 overflow-y-auto">
        {activeSolutions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            No active deals in pipeline
          </div>
        ) : (
          activeSolutions.map((solution) => {
            const isCollapsed = collapsedSwimlanes.has(solution.value);
            const solutionDeals = dealsBySolution[solution.value] || [];
            const stats = solutionStats[solution.value];

            return (
              <div
                key={solution.value}
                className="border-b border-slate-200 dark:border-zinc-800 last:border-b-0"
              >
                {/* Swimlane header */}
                <div className="flex bg-slate-100 dark:bg-zinc-950">
                  <button
                    onClick={() => toggleSwimlane(solution.value)}
                    className="w-44 flex-shrink-0 px-3 py-2 flex items-center gap-2 border-r border-slate-200 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-900 transition-colors text-left"
                  >
                    <ChevronRight
                      size={14}
                      className={`text-zinc-500 transition-transform ${
                        isCollapsed ? "" : "rotate-90"
                      }`}
                    />
                    <SolutionBadge color={solution.color} />
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {solution.label}
                    </span>
                    <span className="text-xs text-zinc-500 ml-auto">
                      {stats?.count || 0}
                    </span>
                  </button>

                  {/* Stage cells summary (when collapsed) */}
                  {isCollapsed && (
                    <>
                      {activeStages.map((stage) => {
                        const cellDeals = solutionDeals.filter(
                          (d) => d.stage === stage.value
                        );
                        return (
                          <div
                            key={stage.value}
                            className="flex-1 min-w-[140px] px-3 py-2 border-r border-slate-200 dark:border-zinc-800 last:border-r-0 flex items-center justify-center"
                          >
                            {cellDeals.length > 0 && (
                              <span className="text-xs text-zinc-500 bg-slate-200 dark:bg-zinc-800 px-2 py-0.5 rounded">
                                {cellDeals.length} deal
                                {cellDeals.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* Swimlane content (expanded) */}
                {!isCollapsed && (
                  <div className="flex bg-slate-50/50 dark:bg-zinc-900/30">
                    {/* Empty cell under solution label */}
                    <div className="w-44 flex-shrink-0 border-r border-slate-200 dark:border-zinc-800" />

                    {/* Stage cells with cards */}
                    {activeStages.map((stage) => {
                      const cellDeals = sortDeals(
                        solutionDeals.filter((d) => d.stage === stage.value)
                      );

                      return (
                        <div
                          key={stage.value}
                          className="flex-1 min-w-[140px] p-2 border-r border-slate-200 dark:border-zinc-800 last:border-r-0 min-h-[100px]"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            const dealId = e.dataTransfer.getData("dealId");
                            if (dealId) handleStageDrop(dealId, stage.value);
                          }}
                        >
                          <div className="space-y-2">
                            {cellDeals.map((deal) => (
                              <div
                                key={deal.id}
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData("dealId", deal.id)
                                }
                                className="cursor-grab active:cursor-grabbing"
                              >
                                <DealCard
                                  deal={deal}
                                  compact
                                  onClick={() => onDealClick?.(deal)}
                                  onDealUpdated={() => {
                                    refetch();
                                    onRefresh?.();
                                  }}
                                />
                              </div>
                            ))}
                            {cellDeals.length === 0 && (
                              <div className="text-center py-4 text-zinc-400 dark:text-zinc-600 text-xs">
                                Drop here
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Summary footer */}
      <div className="flex-shrink-0 flex justify-between items-center border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>
            <strong className="text-zinc-700 dark:text-zinc-300">{deals.length}</strong> deals
          </span>
          <span>
            <strong className="text-zinc-700 dark:text-zinc-300">
              ${(deals.reduce((sum, d) => sum + (d.value || 0), 0) / 1000).toFixed(0)}K
            </strong>{" "}
            total value
          </span>
        </div>
      </div>
    </div>
  );
}

function StageIndicator({ color }: { color: string }) {
  const colors: Record<string, string> = {
    slate: "bg-slate-400",
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
    slate: "bg-slate-400",
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
  };

  return (
    <div className={`w-2 h-2 rounded-sm ${colors[color] || colors.gray}`} />
  );
}
