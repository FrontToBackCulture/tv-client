// src/modules/crm/DealPipeline.tsx
// Flat deal pipeline kanban — columns by stage, controlled by parent for
// filters/sort/view so the surrounding shell (sidebar + chrome) owns state.

import { useState, useMemo, useEffect } from "react";
import { useDealsWithTasks, useUpdateDeal } from "../../hooks/crm";
import { toast } from "../../stores/toastStore";
import { Deal, DealWithTaskInfo, DEAL_STAGES, DEAL_SOLUTIONS } from "../../lib/crm/types";
import { DealCard } from "./DealCard";
import { GripVertical } from "lucide-react";
import { DetailLoading } from "../../components/ui/DetailStates";
import { staggerStyle } from "../../hooks/useStaggeredList";
import { cn } from "../../lib/cn";

export type DealSortField = "company" | "task_date" | "value" | "close_date";
export type DealSortDirection = "asc" | "desc";
export type DealCloseWindow = "any" | "overdue" | "next_7d" | "next_14d" | "next_21d" | "next_28d" | "beyond_28d";
export type DealUpdateWindow = "any" | "7d" | "14d" | "21d" | "28d" | "older_28d";

interface DealPipelineProps {
  onRefresh?: () => void;
  onDealClick?: (deal: DealWithTaskInfo) => void;
  solutionFilter: string;
  showClosed: boolean;
  sortField: DealSortField;
  sortDirection: DealSortDirection;
  onSolutionsAvailableChange?: (solutions: { value: string; label: string }[]) => void;
  referralFilter?: string[];
  closeWindow?: DealCloseWindow;
  updateWindow?: DealUpdateWindow;
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

const DAY = 86400000;

function inCloseWindow(dateStr: string | null | undefined, window: DealCloseWindow): boolean {
  if (window === "any") return true;
  if (!dateStr) return false;
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (window) {
    case "overdue":    return ts < today;
    case "next_7d":    return ts >= today && ts <= today + 7 * DAY;
    case "next_14d":   return ts >= today && ts <= today + 14 * DAY;
    case "next_21d":   return ts >= today && ts <= today + 21 * DAY;
    case "next_28d":   return ts >= today && ts <= today + 28 * DAY;
    case "beyond_28d": return ts > today + 28 * DAY;
  }
}

function inUpdateWindow(dateStr: string | null | undefined, window: DealUpdateWindow): boolean {
  if (window === "any") return true;
  if (!dateStr) return false;
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return false;
  const now = Date.now();
  switch (window) {
    case "7d":        return ts >= now - 7 * DAY;
    case "14d":       return ts >= now - 14 * DAY;
    case "21d":       return ts >= now - 21 * DAY;
    case "28d":       return ts >= now - 28 * DAY;
    case "older_28d": return ts < now - 28 * DAY;
  }
}

function applyDealFilters(
  deals: DealWithTaskInfo[],
  opts: { solutionFilter: string; referralFilter: string[]; closeWindow: DealCloseWindow; updateWindow: DealUpdateWindow }
): DealWithTaskInfo[] {
  return deals.filter((d) => {
    if (opts.solutionFilter !== "all" && getDealSolution(d) !== opts.solutionFilter) return false;
    if (opts.referralFilter.length > 0) {
      const r = d.company?.referred_by;
      if (!r || !opts.referralFilter.includes(r)) return false;
    }
    if (!inCloseWindow(d.expected_close_date, opts.closeWindow)) return false;
    if (!inUpdateWindow(d.updated_at, opts.updateWindow)) return false;
    return true;
  });
}

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

export function DealPipeline({
  onRefresh,
  onDealClick,
  solutionFilter,
  showClosed,
  sortField,
  sortDirection,
  onSolutionsAvailableChange,
  referralFilter = [],
  closeWindow = "any",
  updateWindow = "any",
}: DealPipelineProps) {
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

  // Filter deals: solution + referral + close window + update window
  const filteredDeals = useMemo(() => {
    return applyDealFilters(deals, {
      solutionFilter,
      referralFilter,
      closeWindow,
      updateWindow,
    });
  }, [deals, solutionFilter, referralFilter, closeWindow, updateWindow]);

  // Get solutions that have active deals (for sidebar filter dropdown)
  const availableSolutions = useMemo(() => {
    const solutionSet = new Set<string>();
    deals.forEach((d) => solutionSet.add(getDealSolution(d)));
    return DEAL_SOLUTIONS.filter((s) => solutionSet.has(s.value));
  }, [deals]);

  // Notify parent of available solutions for sidebar dropdown
  useEffect(() => {
    onSolutionsAvailableChange?.(availableSolutions);
  }, [availableSolutions, onSolutionsAvailableChange]);

  // Pipeline totals for progress bars
  const totalPipelineValue = useMemo(
    () => filteredDeals.reduce((sum, d) => sum + (d.value || 0), 0),
    [filteredDeals]
  );

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
