// src/modules/crm/DealCard.tsx
// Deal card component for displaying deals

import { useState, memo } from "react";
import { useUpdateDeal, useDeleteDeal } from "../../hooks/crm";
import { Deal, DealTask, DEAL_STAGES } from "../../lib/crm/types";
import { DealForm } from "./DealForm";
import { Pencil, Trash2, User, Calendar, ClipboardList, Circle, CheckCircle2, MessageSquare, Moon, Sun } from "lucide-react";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";
import { IconButton, Badge } from "../../components/ui";
import { DeleteConfirm } from "../../components/ui/DeleteConfirm";
import { toast } from "../../stores/toastStore";
import { formatDateShort as formatDate } from "../../lib/date";
import { cn } from "../../lib/cn";

const stageColorMap: Record<string, "zinc" | "blue" | "purple" | "teal" | "orange" | "green" | "red"> = {
  prospect: "zinc",
  lead: "zinc",
  qualified: "blue",
  pilot: "purple",
  proposal: "teal",
  negotiation: "orange",
  won: "green",
  lost: "red",
};

interface DealCardProps {
  deal: Deal & {
    company?: { name: string; referred_by?: string | null };
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
    : new Date(deal.created_at || 0);
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

// Stale pill styling
const stalePillStyles = {
  fresh: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  attention: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
  critical: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  dormant: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
};

export const DealCard = memo(function DealCard({
  deal,
  compact = false,
  showTasks = true,
  onClick,
  onDealUpdated,
}: DealCardProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showDiscussions, setShowDiscussions] = useState(false);

  const updateMutation = useUpdateDeal();
  const deleteMutation = useDeleteDeal();
  const { data: discussionCount } = useDiscussionCount("crm_deal", deal.id);

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
      toast.success("Deal deleted");
      onDealUpdated?.();
    } catch (error) {
      toast.error("Failed to delete deal");
      console.error("Failed to delete deal:", error);
    }
  }

  // Get date pill styles — neutral by default, red only when overdue
  const getDatePillStyle = (dateStr: string | null) => {
    if (!dateStr) return "text-slate-500 dark:text-slate-400";
    const date = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "text-red-600 dark:text-red-400 font-semibold"; // Past due
    return "text-slate-500 dark:text-slate-400"; // Normal
  };

  // ---------------------------------------------------------------------------
  // COMPACT MODE — redesigned
  // ---------------------------------------------------------------------------
  if (compact) {
    return (
      <>
        <div
          onClick={onClick}
          className={cn(
            "relative group/card rounded-lg border transition-all duration-150 cursor-pointer",
            "hover:-translate-y-[1px] hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3)]",
            staleStatus.isDormant
              ? "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700/60 opacity-55"
              : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600"
          )}
        >
          {/* Card content */}
          <div className="px-3 py-2.5">
            {/* Top row: company + stale pill */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {deal.company?.name && (
                  <p className="text-[11px] font-medium text-teal-600 dark:text-teal-400 leading-tight truncate">
                    {deal.company.name}
                    {deal.company.referred_by && (
                      <span className="font-normal text-blue-500/60 dark:text-blue-400/50"> via {deal.company.referred_by}</span>
                    )}
                  </p>
                )}
                <h4 className="text-[13px] text-slate-700 dark:text-slate-200 line-clamp-1 leading-snug mt-0.5">
                  {deal.name}
                </h4>
              </div>

              {/* Stale days pill */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSnoozeMenu(!showSnoozeMenu);
                }}
                className={cn(
                  "flex-shrink-0 text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded-md leading-none mt-0.5",
                  stalePillStyles[staleStatus.level]
                )}
                title={staleStatus.isDormant ? "Dormant — click to reactivate" : `${staleStatus.days} days in stage`}
              >
                {staleStatus.isDormant ? "zzz" : `${staleStatus.days}d`}
              </button>
            </div>

            {/* Value row */}
            {deal.value != null && deal.value > 0 && (
              <p className="text-[12px] font-semibold text-teal-600 dark:text-teal-400 mt-1.5 tabular-nums">
                ${deal.value.toLocaleString()}
              </p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              {deal.primaryContact?.name && (
                <span className="flex items-center gap-1 min-w-0">
                  <User size={10} className="flex-shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="truncate max-w-[72px]">{deal.primaryContact.name}</span>
                </span>
              )}

              {deal.expected_close_date && (
                <span className={cn("flex items-center gap-1 flex-shrink-0", getDatePillStyle(deal.expected_close_date))}>
                  <Calendar size={10} className="flex-shrink-0" />
                  {formatDate(deal.expected_close_date)}
                </span>
              )}

              {(deal.openTaskCount ?? 0) > 0 && deal.nextTask?.due_date && (
                <span className="relative group/task flex-shrink-0">
                  <span className={cn("flex items-center gap-1", getDatePillStyle(deal.nextTask.due_date))}>
                    <ClipboardList size={10} className="flex-shrink-0" />
                    {formatDate(deal.nextTask.due_date)}
                  </span>
                  {deal.nextTask?.title && (
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-slate-800 dark:bg-slate-700 rounded shadow-lg whitespace-nowrap opacity-0 invisible group-hover/task:opacity-100 group-hover/task:visible transition-opacity z-50 pointer-events-none">
                      {deal.nextTask.title}
                      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Hover-only dormant toggle */}
          {!showSnoozeMenu && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleDormant();
              }}
              className="absolute top-1.5 right-8 p-1 rounded opacity-0 group-hover/card:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              title={staleStatus.isDormant ? "Reactivate" : "Mark dormant"}
            >
              {staleStatus.isDormant ? <Sun size={11} /> : <Moon size={11} />}
            </button>
          )}

          {/* Snooze menu */}
          {showSnoozeMenu && (
            <div className="absolute top-1 right-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[120px] z-20">
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleDormant(); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                {staleStatus.isDormant ? "Reactivate" : "Mark Dormant"}
              </button>
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
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // FULL CARD VIEW — unchanged
  // ---------------------------------------------------------------------------
  return (
    <>
      <div className="px-3 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg group transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-zinc-200 dark:hover:border-zinc-600">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-tight">
                {deal.name}
              </h4>
              <Badge color={stageColorMap[deal.stage || ""] || "blue"} className="px-1.5 text-xs">{stageConfig?.label || deal.stage}</Badge>
            </div>
            {deal.description && (
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                {deal.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowDiscussions(!showDiscussions)}
              className={`relative p-1 rounded transition-colors ${
                showDiscussions
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
              title="Discussion"
            >
              <MessageSquare size={14} />
              {(discussionCount ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-[12px] flex items-center justify-center text-[8px] font-bold bg-teal-600 text-white rounded-full px-0.5">
                  {discussionCount}
                </span>
              )}
            </button>
            <IconButton icon={Pencil} size={14} label="Edit deal" onClick={() => setShowEditForm(true)} />
            <IconButton icon={Trash2} size={14} label="Delete deal" variant="danger" onClick={() => setShowDeleteConfirm(true)} />
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
          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList size={12} className="text-zinc-500" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tasks ({deal.openTaskCount || 0} open)
              </span>
            </div>
            <div className="space-y-1">
              {deal.tasks.slice(0, 3).map((task) => {
                const isComplete = task.status_type === "complete";
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

        {/* Discussion (collapsible) */}
        {showDiscussions && (
          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 -mx-3 -mb-3">
            <div className="h-[280px]">
              <DiscussionPanel
                entityType="crm_deal"
                entityId={deal.id}
                onClose={() => setShowDiscussions(false)}
              />
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

      {showDeleteConfirm && (
        <DeleteConfirm
          title="Delete Deal"
          message={<>Are you sure you want to delete <strong>{deal.name}</strong>? This action cannot be undone.</>}
          isDeleting={deleteMutation.isPending}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
});
