// src/modules/crm/DealPipeline.tsx
// Deal pipeline view with swimlanes by solution and columns by stage

import { useState, useMemo, useEffect } from "react";
import { useDealsWithTasks, useUpdateDeal } from "../../hooks/useCRM";
import { Deal, DealWithTaskInfo, DEAL_STAGES, DEAL_SOLUTIONS } from "../../lib/crm/types";
import { DealCard } from "./DealCard";
import { Loader2, ChevronRight, ArrowUpDown, GripVertical, RefreshCw } from "lucide-react";

// Storage key for swimlane order
const SWIMLANE_ORDER_KEY = "tv-desktop-crm-swimlane-order";

// Default order: AP, AR, Analytics, then rest. Free Invoice Scan and Partnership at bottom.
const DEFAULT_SWIMLANE_ORDER = [
  "ap_automation",
  "ar_automation",
  "analytics",
  "revenue_reconciliation",
  "professional_services",
  "data_extraction",
  "events_ai",
  "general",
  "other",
  "byoai",
  "free_invoice_scan",
  "partnership",
  "unassigned",
];

function getSwimlaneOrder(): string[] {
  if (typeof window === "undefined") return DEFAULT_SWIMLANE_ORDER;
  const stored = localStorage.getItem(SWIMLANE_ORDER_KEY);
  return stored ? JSON.parse(stored) : DEFAULT_SWIMLANE_ORDER;
}

function setSwimlaneOrder(order: string[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(SWIMLANE_ORDER_KEY, JSON.stringify(order));
  }
}

interface DealPipelineProps {
  onRefresh?: () => void;
  onDealClick?: (deal: DealWithTaskInfo) => void;
}

type SolutionValue = (typeof DEAL_SOLUTIONS)[number]["value"] | "unassigned";

// Get solution from deal
function getDealSolution(deal: DealWithTaskInfo): SolutionValue {
  // Map "other" to "general" swimlane
  if (deal.solution === "other") return "general";
  if (deal.solution) return deal.solution as SolutionValue;

  // Fall back to parsing from deal name
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
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<SolutionValue>>(
    new Set()
  );
  const [sortField, setSortField] = useState<SortField>("company");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Swimlane reordering
  const [swimlaneOrder, setSwimlaneOrderState] = useState<string[]>(DEFAULT_SWIMLANE_ORDER);
  const [draggingSwimlane, setDraggingSwimlane] = useState<string | null>(null);
  const [dragOverSwimlane, setDragOverSwimlane] = useState<string | null>(null);

  // Load swimlane order on mount
  useEffect(() => {
    setSwimlaneOrderState(getSwimlaneOrder());
  }, []);

  // Fetch active deals with tasks (not won/lost)
  const { data: deals = [], isLoading, refetch } = useDealsWithTasks({
    stage: ["target", "prospect", "lead", "qualified", "pilot", "proposal", "negotiation"],
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
      events_ai: [],
      byoai: [],
      general: [],
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

  // Get solutions that have deals (respecting custom order)
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

      // Apply custom order
      solutions.sort((a, b) => {
        const indexA = swimlaneOrder.indexOf(a.value);
        const indexB = swimlaneOrder.indexOf(b.value);
        // Items not in order go to the end
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });

      return solutions;
    }, [dealsBySolution, swimlaneOrder]);

  // Handle swimlane drag and drop
  const handleSwimlaneDragStart = (e: React.DragEvent, solutionValue: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", solutionValue);
    e.dataTransfer.setData("swimlaneId", solutionValue);
    // Use setTimeout to avoid immediate state update interfering with drag
    setTimeout(() => setDraggingSwimlane(solutionValue), 0);
  };

  const handleSwimlaneDragOver = (e: React.DragEvent, solutionValue: string) => {
    // Only handle if we're actively dragging a swimlane
    if (!draggingSwimlane) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggingSwimlane !== solutionValue) {
      setDragOverSwimlane(solutionValue);
    }
  };

  const handleSwimlaneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSwimlane(null);
  };

  const handleSwimlaneDragEnd = () => {
    setDraggingSwimlane(null);
    setDragOverSwimlane(null);
  };

  const handleSwimlaneDrop = (e: React.DragEvent, targetSolutionValue: string) => {
    e.preventDefault();
    e.stopPropagation();

    const draggedId = e.dataTransfer.getData("swimlaneId") || e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === targetSolutionValue) {
      handleSwimlaneDragEnd();
      return;
    }

    // Get current order (use activeSolutions order as base)
    const currentOrder = activeSolutions.map(s => s.value);
    const draggedIndex = currentOrder.indexOf(draggedId as SolutionValue);
    const targetIndex = currentOrder.indexOf(targetSolutionValue as SolutionValue);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove dragged item and insert at target position
      const newOrder = [...currentOrder];
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedId as SolutionValue);
      setSwimlaneOrderState(newOrder);
      setSwimlaneOrder(newOrder);
    }

    handleSwimlaneDragEnd();
  };

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
      {/* Controls bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <span className="text-[11px] text-zinc-400">Sort</span>
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
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

      {/* Stage column headers — sticky */}
      <div className="flex-shrink-0 flex border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-20">
        {activeStages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage.value);
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
          return (
            <div key={stage.value}
              className="flex-1 min-w-[140px] px-3 py-2 border-r border-slate-200 dark:border-zinc-800 last:border-r-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StageIndicator color={stage.color} />
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{stage.label}</span>
                  <span className="text-xs text-zinc-500">{stageDeals.length}</span>
                </div>
                <span className="text-xs text-zinc-500">${(stageValue / 1000).toFixed(0)}K</span>
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

            const isDragging = draggingSwimlane === solution.value;
            const isDragOver = dragOverSwimlane === solution.value;

            return (
              <div
                key={solution.value}
                className={`border-b border-slate-200 dark:border-zinc-800 last:border-b-0 transition-all ${
                  isDragging ? "opacity-50" : ""
                } ${isDragOver ? "border-t-2 border-t-teal-500 bg-teal-50 dark:bg-teal-900/20" : ""}`}
                onDragOver={(e) => handleSwimlaneDragOver(e, solution.value)}
                onDragLeave={handleSwimlaneDragLeave}
                onDrop={(e) => handleSwimlaneDrop(e, solution.value)}
              >
                {/* Full-width swimlane header */}
                <div className="flex items-center gap-1 px-1.5 py-1.5 bg-slate-100 dark:bg-zinc-950">
                  <div
                    draggable
                    onDragStart={(e) => handleSwimlaneDragStart(e, solution.value)}
                    onDragEnd={handleSwimlaneDragEnd}
                    className="flex items-center px-1 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 dark:text-zinc-700 dark:hover:text-zinc-500"
                  >
                    <GripVertical size={12} />
                  </div>
                  <button
                    onClick={() => toggleSwimlane(solution.value)}
                    className="flex items-center gap-1.5 px-1 py-0.5 hover:bg-slate-200 dark:hover:bg-zinc-900 rounded transition-colors"
                  >
                    <ChevronRight
                      size={12}
                      className={`text-zinc-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                    />
                    <SolutionBadge color={solution.color} />
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {solution.label}
                    </span>
                  </button>
                  <span className="text-[11px] text-zinc-400 tabular-nums">
                    {stats?.count || 0} · ${((stats?.value || 0) / 1000).toFixed(0)}K
                  </span>

                  {/* Collapsed: stage distribution inline */}
                  {isCollapsed && (
                    <div className="flex items-center gap-2 ml-auto pr-2">
                      {activeStages.map((stage) => {
                        const cellCount = solutionDeals.filter((d) => d.stage === stage.value).length;
                        if (cellCount === 0) return null;
                        return (
                          <span key={stage.value} className="flex items-center gap-1 text-[10px] text-zinc-400">
                            <StageIndicator color={stage.color} /> {cellCount}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Expanded: stage cells — full width, no solution column */}
                {!isCollapsed && (
                  <div className="flex bg-slate-50/50 dark:bg-zinc-900/30">
                    {activeStages.map((stage) => {
                      const cellDeals = sortDeals(
                        solutionDeals.filter((d) => d.stage === stage.value)
                      );
                      return (
                        <div
                          key={stage.value}
                          className="flex-1 min-w-[140px] p-2 border-r border-slate-200 dark:border-zinc-800 last:border-r-0 min-h-[80px]"
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
    zinc: "bg-zinc-400",
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
    zinc: "bg-zinc-400",
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
    emerald: "bg-emerald-500",
    pink: "bg-pink-500",
  };

  return (
    <div className={`w-2 h-2 rounded-sm ${colors[color] || colors.gray}`} />
  );
}
