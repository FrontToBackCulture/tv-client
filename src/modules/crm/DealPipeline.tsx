// src/modules/crm/DealPipeline.tsx
// Flat deal pipeline kanban — columns by stage, optional solution filter

import { useState, useMemo } from "react";
import { useDealsWithTasks, useUpdateDeal } from "../../hooks/crm";
import { Deal, DealWithTaskInfo, DEAL_STAGES, DEAL_SOLUTIONS } from "../../lib/crm/types";
import { DealCard } from "./DealCard";
import { ArrowUpDown, RefreshCw, Filter } from "lucide-react";
import { DetailLoading } from "../../components/ui/DetailStates";

// Storage key for solution filter
const SOLUTION_FILTER_KEY = "tv-desktop-crm-solution-filter";

function getSavedSolutionFilter(): string {
  if (typeof window === "undefined") return "all";
  return localStorage.getItem(SOLUTION_FILTER_KEY) || "all";
}

interface DealPipelineProps {
  onRefresh?: () => void;
  onDealClick?: (deal: DealWithTaskInfo) => void;
}

// Get solution from deal (for filtering)
function getDealSolution(deal: DealWithTaskInfo): string {
  if (deal.solution === "other") return "general";
  if (deal.solution) return deal.solution;

  const lowerName = deal.name.toLowerCase();
  if (lowerName.startsWith("free invoice scan")) return "free_invoice_scan";
  if (lowerName.startsWith("ap automation")) return "ap_automation";
  if (lowerName.startsWith("ar automation")) return "ar_automation";
  if (lowerName.startsWith("analytics")) return "analytics";
  if (lowerName.startsWith("revenue reconciliation")) return "revenue_reconciliation";
  if (lowerName.includes("professional service") || lowerName.includes("sow"))
    return "professional_services";
  if (lowerName.startsWith("events ai")) return "events_ai";
  if (lowerName.startsWith("byoai")) return "byoai";
  if (lowerName.startsWith("general")) return "general";

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
  const [sortField, setSortField] = useState<SortField>("company");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [solutionFilter, setSolutionFilter] = useState<string>(getSavedSolutionFilter);

  // Fetch active deals with tasks (not won/lost)
  const { data: deals = [], isLoading, refetch } = useDealsWithTasks({
    stage: ["target", "prospect", "lead", "qualified", "pilot", "proposal", "negotiation"],
  });

  const updateMutation = useUpdateDeal();

  const activeStages = DEAL_STAGES.filter(
    (s) => !["won", "lost"].includes(s.value)
  );

  // Filter deals by solution
  const filteredDeals = useMemo(() => {
    if (solutionFilter === "all") return deals;
    return deals.filter((d) => getDealSolution(d) === solutionFilter);
  }, [deals, solutionFilter]);

  // Get solutions that have active deals (for filter dropdown)
  const availableSolutions = useMemo(() => {
    const solutionSet = new Set<string>();
    deals.forEach((d) => solutionSet.add(getDealSolution(d)));
    return DEAL_SOLUTIONS.filter((s) => solutionSet.has(s.value));
  }, [deals]);

  // Handle filter change
  const handleFilterChange = (value: string) => {
    setSolutionFilter(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(SOLUTION_FILTER_KEY, value);
    }
  };

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

  // Sort deals
  const sortDeals = (dealsToSort: DealWithTaskInfo[]): DealWithTaskInfo[] => {
    return [...dealsToSort].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "company": {
          const compA = a.company?.name || "";
          const compB = b.company?.name || "";
          comparison = compA.localeCompare(compB);
          break;
        }
        case "value":
          comparison = (a.value || 0) - (b.value || 0);
          break;
        case "task_date": {
          const taskA = a.nextTask?.due_date || "9999-12-31";
          const taskB = b.nextTask?.due_date || "9999-12-31";
          comparison = taskA.localeCompare(taskB);
          break;
        }
        case "close_date": {
          const closeA = a.expected_close_date || "9999-12-31";
          const closeB = b.expected_close_date || "9999-12-31";
          comparison = closeA.localeCompare(closeB);
          break;
        }
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  };

  if (isLoading) return <DetailLoading />;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Controls bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Filter size={12} className="text-zinc-400" />
        <select
          value={solutionFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
        >
          <option value="all">All Solutions</option>
          {availableSolutions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <span className="text-zinc-300 dark:text-zinc-700">|</span>

        <span className="text-xs text-zinc-400">Sort</span>
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
          className="p-0.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded"
        >
          <ArrowUpDown size={12} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => { refetch(); onRefresh?.(); }}
          className="p-0.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded"
          title="Refresh pipeline"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Stage column headers */}
      <div className="flex-shrink-0 flex border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-20">
        {activeStages.map((stage) => {
          const stageDeals = filteredDeals.filter((d) => d.stage === stage.value);
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
          const weightPct = Math.round(stage.weight * 100);
          return (
            <div key={stage.value}
              className="flex-1 min-w-[140px] px-3 py-2 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StageIndicator color={stage.color} />
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{stage.label}</span>
                  <span className="text-xs text-zinc-400">{weightPct}%</span>
                  <span className="text-xs text-zinc-500">{stageDeals.length}</span>
                </div>
                {stageValue > 0 && (
                  <span className="text-xs text-zinc-500">${(stageValue / 1000).toFixed(0)}K</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Flat kanban — one row of stage columns */}
      <div className="flex-1 flex overflow-y-auto">
        {filteredDeals.length === 0 ? (
          <div className="flex items-center justify-center w-full h-full text-zinc-500">
            {solutionFilter !== "all" ? "No deals for this solution" : "No active deals in pipeline"}
          </div>
        ) : (
          activeStages.map((stage) => {
            const stageDeals = sortDeals(
              filteredDeals.filter((d) => d.stage === stage.value)
            );
            return (
              <div
                key={stage.value}
                className="flex-1 min-w-[140px] p-2 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 overflow-y-auto"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const dealId = e.dataTransfer.getData("dealId");
                  if (dealId) handleStageDrop(dealId, stage.value);
                }}
              >
                <div className="space-y-2">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("dealId", deal.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <DealCard
                        deal={deal}
                        compact
                        onClick={() => onDealClick?.(deal)}
                        onDealUpdated={() => { refetch(); onRefresh?.(); }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary footer */}
      <div className="flex-shrink-0 flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>
            <strong className="text-zinc-700 dark:text-zinc-300">{filteredDeals.length}</strong> deals
            {solutionFilter !== "all" && (
              <span className="text-zinc-400"> (of {deals.length})</span>
            )}
          </span>
          <span>
            <strong className="text-zinc-700 dark:text-zinc-300">
              ${(filteredDeals.reduce((sum, d) => sum + (d.value || 0), 0) / 1000).toFixed(0)}K
            </strong>{" "}
            total
          </span>
          <span>
            <strong className="text-teal-600 dark:text-teal-400">
              ${(filteredDeals.reduce((sum, d) => {
                const stage = DEAL_STAGES.find((s) => s.value === d.stage);
                return sum + (d.value || 0) * (stage?.weight ?? 0);
              }, 0) / 1000).toFixed(0)}K
            </strong>{" "}
            weighted
          </span>
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
