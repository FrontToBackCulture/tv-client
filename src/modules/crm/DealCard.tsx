// src/modules/crm/DealCard.tsx
// Deal card component for displaying deals

import { useState } from "react";
import { useUpdateDeal, useDeleteDeal } from "../../hooks/useCRM";
import { Deal, DealTask, DEAL_STAGES } from "../../lib/crm/types";
import { DealForm } from "./DealForm";
import { Pencil, Trash2, User, Calendar, ClipboardList, Circle, CheckCircle2 } from "lucide-react";

interface DealCardProps {
  deal: Deal & {
    company?: { name: string };
    primaryContact?: { name: string } | null;
    tasks?: DealTask[];
    openTaskCount?: number;
    nextTask?: { title: string; due_date: string | null } | null;
  };
  compact?: boolean;
  showTasks?: boolean; // Show tasks section in full view (default: true)
  onClick?: () => void;
  onDealUpdated?: () => void;
}

// Calculate stale status based on days in stage
function getStaleStatus(deal: Deal): {
  level: "fresh" | "warning" | "attention" | "critical" | "dormant";
  days: number;
  isDormant: boolean;
} {
  const stageDate = deal.stage_changed_at
    ? new Date(deal.stage_changed_at)
    : new Date(deal.created_at);
  const now = new Date();
  const days = Math.floor(
    (now.getTime() - stageDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check if dormant
  if (deal.stale_snoozed_until) {
    const snoozeDate = new Date(deal.stale_snoozed_until);
    const tenYearsFromNow = new Date();
    tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);
    if (snoozeDate >= tenYearsFromNow) {
      return { level: "dormant", days, isDormant: true };
    }
  }

  if (days >= 30) return { level: "critical", days, isDormant: false };
  if (days >= 14) return { level: "attention", days, isDormant: false };
  if (days >= 7) return { level: "warning", days, isDormant: false };
  return { level: "fresh", days, isDormant: false };
}

export function DealCard({
  deal,
  compact = false,
  showTasks = true,
  onClick,
  onDealUpdated,
}: DealCardProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  const updateMutation = useUpdateDeal();
  const deleteMutation = useDeleteDeal();

  const stageConfig = DEAL_STAGES.find((s) => s.value === deal.stage);
  const staleStatus = getStaleStatus(deal);

  async function handleToggleDormant() {
    const snoozeUntil = staleStatus.isDormant ? null : "2099-12-31";
    await updateMutation.mutateAsync({
      id: deal.id,
      updates: { stale_snoozed_until: snoozeUntil },
    });
    setShowSnoozeMenu(false);
    onDealUpdated?.();
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(deal.id);
      onDealUpdated?.();
    } catch (error) {
      console.error("Failed to delete deal:", error);
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Get date pill styles based on due date proximity
  const getDatePillStyle = (dateStr: string | null) => {
    if (!dateStr) return "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400";
    const date = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"; // Past due
    if (diffDays <= 5) return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"; // Due in 1-5 days
    return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"; // Future
  };

  if (compact) {
    const staleBorderColor = {
      fresh: "border-l-emerald-500",
      warning: "border-l-amber-400",
      attention: "border-l-orange-500",
      critical: "border-l-red-500",
      dormant: "border-l-zinc-500",
    }[staleStatus.level];

    return (
      <>
        <div
          onClick={onClick}
          className={`relative group/card px-3 py-2 rounded border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-600 transition-colors cursor-pointer border-l-2 ${staleBorderColor} ${
            staleStatus.isDormant ? "bg-slate-100 dark:bg-zinc-900 opacity-70" : "bg-white dark:bg-zinc-800"
          }`}
        >
          {/* Days badge */}
          <div className="absolute -top-1.5 -right-1.5 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSnoozeMenu(!showSnoozeMenu);
              }}
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shadow-sm ${
                staleStatus.level === "critical"
                  ? "bg-red-500 text-white"
                  : staleStatus.level === "attention"
                  ? "bg-orange-500 text-white"
                  : staleStatus.level === "warning"
                  ? "bg-amber-400 text-amber-900"
                  : staleStatus.level === "dormant"
                  ? "bg-zinc-500 text-white"
                  : "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"
              }`}
              title={
                staleStatus.isDormant
                  ? "Dormant - click to reactivate"
                  : `${staleStatus.days} days in stage`
              }
            >
              {staleStatus.isDormant ? "💤" : `${staleStatus.days}d`}
            </button>

            {showSnoozeMenu && (
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded shadow-lg py-1 min-w-[120px] z-20">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleDormant();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                >
                  {staleStatus.isDormant ? "Reactivate" : "Mark Dormant"}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              {deal.company?.name && (
                <p className="text-[11px] text-teal-600 dark:text-teal-400/80 leading-tight">
                  {deal.company.name}
                </p>
              )}
              <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 line-clamp-1 leading-tight">
                {deal.name}
              </h4>
            </div>
            {deal.value && (
              <span className="text-xs font-medium text-teal-600 dark:text-teal-400 flex-shrink-0">
                ${deal.value.toLocaleString()}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 text-[11px]">
            {deal.primaryContact?.name && (
              <span className="flex items-center gap-1 text-zinc-500">
                <User size={10} />
                <span className="truncate max-w-[80px]">
                  {deal.primaryContact.name}
                </span>
              </span>
            )}

            {/* Expected close date */}
            {deal.expected_close_date && (
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${getDatePillStyle(deal.expected_close_date)}`}>
                <Calendar size={10} />
                Close {formatDate(deal.expected_close_date)}
              </span>
            )}

            {/* Task due date */}
            {(deal.openTaskCount ?? 0) > 0 && deal.nextTask?.due_date && (
              <span className="relative group/task">
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${getDatePillStyle(deal.nextTask.due_date)}`}>
                  <ClipboardList size={10} />
                  Task {formatDate(deal.nextTask.due_date)}
                </span>
                {/* Tooltip */}
                {deal.nextTask?.title && (
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] font-medium text-white bg-zinc-800 rounded shadow-lg whitespace-nowrap opacity-0 invisible group-hover/task:opacity-100 group-hover/task:visible transition-opacity z-50 pointer-events-none">
                    {deal.nextTask.title}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {showEditForm && (
          <DealForm
            deal={deal}
            companyId={deal.company_id}
            onClose={() => setShowEditForm(false)}
            onSaved={() => {
              setShowEditForm(false);
              onDealUpdated?.();
            }}
          />
        )}
      </>
    );
  }

  // Full card view
  return (
    <>
      <div className="px-3 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg group">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-tight">
                {deal.name}
              </h4>
              <StageChip stage={deal.stage} label={stageConfig?.label || deal.stage} />
            </div>
            {deal.description && (
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                {deal.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowEditForm(true)}
              className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded hover:bg-slate-100 dark:hover:bg-zinc-700"
              title="Edit deal"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1 text-zinc-500 hover:text-red-500 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-zinc-700"
              title="Delete deal"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs">
          {deal.value && (
            <span className="font-medium text-teal-600 dark:text-teal-400">
              ${deal.value.toLocaleString()} {deal.currency}
            </span>
          )}
          {deal.expected_close_date && (
            <span className="text-zinc-500">
              Close {formatDate(deal.expected_close_date)}
            </span>
          )}
        </div>

        {deal.notes && (
          <p className="mt-2 text-xs text-zinc-500 line-clamp-2">{deal.notes}</p>
        )}

        {/* Linked Tasks */}
        {showTasks && deal.tasks && deal.tasks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList size={12} className="text-zinc-500" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tasks ({deal.openTaskCount || 0} open)
              </span>
            </div>
            <div className="space-y-1">
              {deal.tasks.slice(0, 3).map((task) => {
                const isComplete = ["completed", "canceled"].includes(task.status_type);
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 text-xs"
                  >
                    {isComplete ? (
                      <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <Circle size={12} className="text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
                    )}
                    <span className={`truncate ${isComplete ? "text-zinc-400 dark:text-zinc-600 line-through" : "text-zinc-700 dark:text-zinc-300"}`}>
                      {task.title}
                    </span>
                    {task.due_date && !isComplete && (
                      <span className="text-zinc-400 dark:text-zinc-600 flex-shrink-0">
                        {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                );
              })}
              {deal.tasks.length > 3 && (
                <p className="text-xs text-zinc-400 dark:text-zinc-600">+{deal.tasks.length - 3} more</p>
              )}
            </div>
          </div>
        )}
      </div>

      {showEditForm && (
        <DealForm
          deal={deal}
          companyId={deal.company_id}
          onClose={() => setShowEditForm(false)}
          onSaved={() => {
            setShowEditForm(false);
            onDealUpdated?.();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-md p-4 max-w-sm w-full mx-4 shadow-lg">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Delete Deal</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
              Are you sure you want to delete <strong>{deal.name}</strong>? This
              action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded"
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-500 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StageChip({ stage, label }: { stage: string; label: string }) {
  const colors: Record<string, string> = {
    prospect: "bg-slate-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400",
    lead: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400",
    qualified: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400",
    pilot: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400",
    proposal: "bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400",
    negotiation: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400",
    won: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400",
    lost: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400",
  };

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
        colors[stage] || colors.qualified
      }`}
    >
      {label}
    </span>
  );
}
