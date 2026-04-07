// src/modules/crm/DealPipeline.tsx
// Flat deal pipeline kanban — columns by stage, optional solution filter

import { useState, useMemo } from "react";
import { useDealsWithTasks, useUpdateDeal } from "../../hooks/crm";
import { toast } from "../../stores/toastStore";
import { Deal, DealWithTaskInfo, DEAL_STAGES, DEAL_SOLUTIONS } from "../../lib/crm/types";
import { DealCard } from "./DealCard";
import { ArrowUpDown, RefreshCw, Filter, ChevronDown, GripVertical } from "lucide-react";
import { DetailLoading } from "../../components/ui/DetailStates";
import { staggerStyle } from "../../hooks/useStaggeredList";
import { cn } from "../../lib/cn";

// Storage keys for filters
const SOLUTION_FILTER_KEY = "tv-desktop-crm-solution-filter";
const SHOW_CLOSED_KEY = "tv-desktop-crm-show-closed";

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

// Stage color → Tailwind classes mapping
const stageColors: Record<string, { dot: string; bar: string; barBg: string; dropzone: string }> = {
  zinc: {
    dot: "bg-slate-400",
    bar: "bg-slate-400",
    barBg: "bg-slate-200 dark:bg-slate-700",
    dropzone: "border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30",
  },
  gray: {
    dot: "bg-gray-500",
    bar: "bg-gray-500",
    barBg: "bg-gray-200 dark:bg-gray-700",
    dropzone: "border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30",
  },
  blue: {
    dot: "bg-blue-500",
    bar: "bg-blue-500",
    barBg: "bg-blue-100 dark:bg-blue-900/30",
    dropzone: "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20",
  },
  purple: {
    dot: "bg-purple-500",
    bar: "bg-purple-500",
    barBg: "bg-purple-100 dark:bg-purple-900/30",
    dropzone: "border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/20",
  },
  cyan: {
    dot: "bg-cyan-500",
    bar: "bg-cyan-500",
    barBg: "bg-cyan-100 dark:bg-cyan-900/30",
    dropzone: "border-cyan-300 dark:border-cyan-700 bg-cyan-50/50 dark:bg-cyan-900/20",
  },
  yellow: {
    dot: "bg-yellow-500",
    bar: "bg-yellow-500",
    barBg: "bg-yellow-100 dark:bg-yellow-900/30",
    dropzone: "border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-900/20",
  },
  green: {
    dot: "bg-green-500",
    bar: "bg-green-500",
    barBg: "bg-green-100 dark:bg-green-900/30",
    dropzone: "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/20",
  },
  red: {
    dot: "bg-red-500",
    bar: "bg-red-500",
    barBg: "bg-red-100 dark:bg-red-900/30",
    dropzone: "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/20",
  },
};

const defaultStageColor = stageColors.gray;

function getSavedShowClosed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHOW_CLOSED_KEY) === "true";
}

export function DealPipeline({ onRefresh, onDealClick }: DealPipelineProps) {
  const [sortField, setSortField] = useState<SortField>("company");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [solutionFilter, setSolutionFilter] = useState<string>(getSavedSolutionFilter);
  const [showClosed, setShowClosed] = useState(getSavedShowClosed);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Fetch deals with tasks
  const activeStageValues = ["target", "prospect", "lead", "qualified", "pilot", "proposal", "negotiation"];
  const allStageValues = [...activeStageValues, "won", "lost"];
  const { data: deals = [], isLoading, refetch } = useDealsWithTasks({
    stage: showClosed ? allStageValues : activeStageValues,
  });

  const updateMutation = useUpdateDeal();

  const visibleStages = DEAL_STAGES.filter(
    (s) => showClosed || !["won", "lost"].includes(s.value)
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

  // Pipeline totals for progress bars
  const totalPipelineValue = useMemo(
    () => filteredDeals.reduce((sum, d) => sum + (d.value || 0), 0),
    [filteredDeals]
  );

  // Handle filter change
  const handleFilterChange = (value: string) => {
    setSolutionFilter(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(SOLUTION_FILTER_KEY, value);
    }
  };

  // Handle drag and drop stage change
  async function handleStageDrop(dealId: string, newStage: string) {
    setDragOverStage(null);
    setDraggingId(null);
    const deal = deals.find(d => d.id === dealId);
    const dealName = deal?.name || dealId.slice(0, 8);
    toast.loading(`Moving ${dealName} to ${newStage}...`);
    try {
      await updateMutation.mutateAsync({
        id: dealId,
        updates: { stage: newStage as Deal["stage"] },
      });
      toast.success(`${dealName} moved to ${newStage}`);
      refetch();
      onRefresh?.();
    } catch (error) {
      console.error("[pipeline] Failed to update deal stage:", error);
      toast.error(`Failed to move deal: ${error}`);
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

  // Compute per-stage data for headers and footer
  const stageData = visibleStages.map((stage) => {
    const stageDeals = filteredDeals.filter((d) => d.stage === stage.value);
    const totalValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const valuePct = totalPipelineValue > 0 ? (totalValue / totalPipelineValue) * 100 : 0;
    return { ...stage, deals: stageDeals, totalValue, valuePct };
  });

  const weightedTotal = filteredDeals.reduce((sum, d) => {
    const stage = DEAL_STAGES.find((s) => s.value === d.stage);
    return sum + (d.value || 0) * (stage?.weight ?? 0);
  }, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Controls bar */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {/* Solution filter */}
        <div className="flex items-center gap-1.5">
          <Filter size={11} className="text-slate-400" />
          <div className="relative">
            <select
              value={solutionFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className={cn(
                "text-[11px] pl-2 pr-6 py-1 rounded-md border appearance-none cursor-pointer",
                "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800",
                "text-slate-600 dark:text-slate-400",
                "hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
              )}
            >
              <option value="all">All Solutions</option>
              {availableSolutions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

        {/* Won/Lost toggle */}
        <button
          onClick={() => {
            const next = !showClosed;
            setShowClosed(next);
            localStorage.setItem(SHOW_CLOSED_KEY, String(next));
          }}
          className={cn(
            "text-[11px] px-2 py-1 rounded-md border transition-colors",
            showClosed
              ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
              : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
          )}
        >
          Won / Lost
        </button>

        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

        {/* Sort controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Sort</span>
          <div className="relative">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className={cn(
                "text-[11px] pl-2 pr-6 py-1 rounded-md border appearance-none cursor-pointer",
                "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800",
                "text-slate-600 dark:text-slate-400",
                "hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
              )}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
            className={cn(
              "p-1 rounded-md transition-colors",
              "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300",
              "hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
            title={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}`}
          >
            <ArrowUpDown size={12} className={sortDirection === "desc" ? "rotate-180" : ""} />
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => { refetch(); onRefresh?.(); }}
          className={cn(
            "p-1 rounded-md transition-colors",
            "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300",
            "hover:bg-slate-100 dark:hover:bg-slate-800"
          )}
          title="Refresh pipeline"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Stage column headers */}
      <div className="flex-shrink-0 flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20">
        {stageData.map((stage) => {
          const colors = stageColors[stage.color] || defaultStageColor;
          const weightPct = Math.round(stage.weight * 100);
          return (
            <div
              key={stage.value}
              className="flex-1 min-w-[140px] border-r border-slate-200 dark:border-slate-800 last:border-r-0"
            >
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2.5 h-2.5 rounded-full", colors.dot)} />
                    <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
                      {stage.label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      {weightPct}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {stage.deals.length}
                    </span>
                    {stage.totalValue > 0 && (
                      <span className="text-[11px] tabular-nums font-medium text-slate-600 dark:text-slate-300">
                        ${(stage.totalValue / 1000).toFixed(0)}K
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Value progress bar */}
              <div className={cn("h-[3px] mx-3 mb-1 rounded-full overflow-hidden", colors.barBg)}>
                <div
                  className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
                  style={{ width: `${Math.max(stage.valuePct, stage.deals.length > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Kanban columns */}
      <div className="flex-1 flex overflow-y-auto">
        {filteredDeals.length === 0 ? (
          <div className="flex items-center justify-center w-full h-full text-[13px] text-slate-400 dark:text-slate-500">
            {solutionFilter !== "all" ? "No deals for this solution" : "No active deals in pipeline"}
          </div>
        ) : (
          stageData.map((stage) => {
            const sorted = sortDeals(stage.deals);
            const colors = stageColors[stage.color] || defaultStageColor;
            const isDragTarget = dragOverStage === stage.value;

            return (
              <div
                key={stage.value}
                className={cn(
                  "flex-1 min-w-[140px] p-2 border-r border-slate-200 dark:border-slate-800 last:border-r-0 overflow-y-auto scrollbar-auto-hide transition-colors duration-150",
                  isDragTarget && "bg-slate-100/60 dark:bg-slate-800/40"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverStage !== stage.value) setDragOverStage(stage.value);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStage(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const dealId = e.dataTransfer.getData("dealId");
                  console.log("[pipeline] onDrop fired, dealId:", dealId, "stage:", stage.value);
                  if (dealId) {
                    handleStageDrop(dealId, stage.value);
                  } else {
                    console.warn("[pipeline] No dealId in dataTransfer");
                  }
                }}
              >
                {sorted.length === 0 ? (
                  // Empty column placeholder
                  <div
                    className={cn(
                      "flex items-center justify-center h-20 rounded-lg border-2 border-dashed transition-colors duration-150",
                      isDragTarget
                        ? colors.dropzone
                        : "border-slate-200 dark:border-slate-800"
                    )}
                  >
                    {isDragTarget ? (
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Drop here
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 dark:text-slate-600">
                        No deals
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {sorted.map((deal, i) => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("dealId", deal.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(deal.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dragOverStage !== stage.value) setDragOverStage(stage.value);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const dealId = e.dataTransfer.getData("dealId");
                          if (dealId && dealId !== deal.id) handleStageDrop(dealId, stage.value);
                        }}
                        className={`cursor-grab active:cursor-grabbing active:opacity-60 animate-fade-slide-in ${draggingId && draggingId !== deal.id ? "[&>*]:pointer-events-none" : ""}`}
                        style={staggerStyle(i)}
                      >
                        <DealCard
                          deal={deal}
                          compact
                          onClick={() => onDealClick?.(deal)}
                          onDealUpdated={() => { refetch(); onRefresh?.(); }}
                        />
                      </div>
                    ))}
                    {/* Drop zone at bottom when dragging */}
                    {isDragTarget && sorted.length > 0 && (
                      <div
                        className={cn(
                          "h-10 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors",
                          colors.dropzone
                        )}
                      >
                        <GripVertical size={12} className="text-slate-400 dark:text-slate-500" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Summary footer with pipeline bar */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {/* Mini pipeline bar */}
        {totalPipelineValue > 0 && (
          <div className="flex h-[4px]">
            {stageData.map((stage) => {
              if (stage.valuePct <= 0) return null;
              const colors = stageColors[stage.color] || defaultStageColor;
              return (
                <div
                  key={stage.value}
                  className={cn("transition-all duration-500", colors.bar)}
                  style={{ width: `${stage.valuePct}%` }}
                  title={`${stage.label}: $${(stage.totalValue / 1000).toFixed(0)}K (${stage.valuePct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
        )}

        {/* Stats */}
        <div className="flex justify-between items-center px-4 py-2">
          <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              <strong className="font-semibold text-slate-700 dark:text-slate-300">{filteredDeals.length}</strong> deals
              {solutionFilter !== "all" && (
                <span className="text-slate-400 dark:text-slate-500"> of {deals.length}</span>
              )}
            </span>
            <span>
              <strong className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                ${(totalPipelineValue / 1000).toFixed(0)}K
              </strong>{" "}
              total
            </span>
            <span>
              <strong className="font-semibold text-teal-600 dark:text-teal-400 tabular-nums">
                ${(weightedTotal / 1000).toFixed(0)}K
              </strong>{" "}
              weighted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
