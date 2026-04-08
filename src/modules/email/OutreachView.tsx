// src/modules/email/OutreachView.tsx
// Outreach draft list — review automation-generated emails before pushing to Outlook

import { useState, useMemo, useCallback } from "react";
import { Check, ChevronRight, Send, Trash2 } from "lucide-react";
import { SectionToolbar } from "../../components/SectionToolbar";
import { useOutreachDrafts, useBatchApproveOutreach } from "../../hooks/email";
import { useDraftTracking, useDeleteDraft } from "../../hooks/email/useDrafts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/cn";
import type { OutreachDraft } from "../../hooks/email/useOutreachDrafts";

// ─── Status config ───────────────────────────────────────────────────────────

const STATUSES = [
  { value: "all", label: "All" },
  { value: "draft", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "skipped", label: "Skipped" },
] as const;

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Pending" },
  approved: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "In Outlook" },
  sent: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Sent" },
  failed: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Failed" },
  skipped: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400", label: "Skipped" },
};

// ─── Date grouping ───────────────────────────────────────────────────────────

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (d >= today) return "Today";
  if (d >= yesterday) return "Yesterday";
  if (d >= weekAgo) return "This Week";
  return "Older";
}

const DATE_GROUP_ORDER = ["Today", "Yesterday", "This Week", "Older"];

// ─── Tracking badge component ────────────────────────────────────────────────

function TrackingBadges({ draftId, status }: { draftId: string; status: string }) {
  const isApprovedOrSent = status === "approved" || status === "sent";
  const { data: tracking } = useDraftTracking(draftId, isApprovedOrSent);

  // Check if a 'sent' event exists — means tracking pixel was injected
  const { data: hasPixel } = useQuery({
    queryKey: ["outreach-has-pixel", draftId],
    queryFn: async () => {
      const { data } = await supabase
        .from("email_events")
        .select("id")
        .eq("draft_id", draftId)
        .eq("event_type", "sent")
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
    enabled: isApprovedOrSent,
  });

  return (
    <>
      {isApprovedOrSent && hasPixel !== undefined && (
        hasPixel ? (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-medium">
            Tracked
          </span>
        ) : (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">
            No Pixel
          </span>
        )
      )}
      {tracking?.opened && (
        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
          Opened
        </span>
      )}
      {tracking && tracking.clicks.length > 0 && (
        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
          {tracking.clicks.length} click{tracking.clicks.length !== 1 ? "s" : ""}
        </span>
      )}
    </>
  );
}

// ─── View ────────────────────────────────────────────────────────────────────

interface OutreachViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function OutreachView({ selectedId, onSelect }: OutreachViewProps) {
  const [statusFilter, setStatusFilter] = useState("draft");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: drafts = [], isLoading } = useOutreachDrafts(
    statusFilter === "all" ? undefined : statusFilter
  );
  const batchApprove = useBatchApproveOutreach();
  const deleteDraft = useDeleteDraft();

  // Group by date
  const grouped = useMemo(() => {
    const groups = new Map<string, OutreachDraft[]>();
    for (const d of drafts) {
      const group = getDateGroup(d.created_at);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(d);
    }
    return DATE_GROUP_ORDER
      .filter((g) => groups.has(g))
      .map((g) => ({ label: g, items: groups.get(g)! }));
  }, [drafts]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Batch select
  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pendingIds = useMemo(
    () => drafts.filter((d) => d.status === "draft").map((d) => d.id),
    [drafts]
  );

  const handleBatchApprove = async () => {
    const ids = selectedIds.size > 0
      ? Array.from(selectedIds).filter((id) => drafts.find((d) => d.id === id)?.status === "draft")
      : pendingIds;
    if (ids.length === 0) return;
    await batchApprove.mutateAsync(ids);
    setSelectedIds(new Set());
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Status filter chips + batch actions */}
      <SectionToolbar
        subtitle={`${drafts.length} outreach email${drafts.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex items-center gap-1.5">
            {statusFilter === "draft" && pendingIds.length > 0 && (
              <button
                onClick={handleBatchApprove}
                disabled={batchApprove.isPending}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                <Send size={10} />
                {batchApprove.isPending
                  ? "Pushing..."
                  : selectedIds.size > 0
                    ? `Approve ${selectedIds.size}`
                    : `Approve All (${pendingIds.length})`}
              </button>
            )}
          </div>
        }
      />

      {/* Filter chips */}
      <div className="flex items-center gap-1 px-4 pb-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => { setStatusFilter(s.value); setSelectedIds(new Set()); }}
            className={cn(
              "px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors",
              statusFilter === s.value
                ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
        ) : drafts.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
            {statusFilter === "draft" ? "No pending outreach drafts." : "No outreach emails found."}
          </div>
        ) : (
          grouped.map(({ label, items }) => (
            <div key={label}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(label)}
                className="w-full flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
              >
                <ChevronRight
                  size={10}
                  className={cn("transition-transform", !collapsedGroups.has(label) && "rotate-90")}
                />
                {label}
                <span className="font-normal text-zinc-300 dark:text-zinc-600">({items.length})</span>
              </button>

              {!collapsedGroups.has(label) &&
                items.map((draft) => {
                  const badge = STATUS_BADGE[draft.status] || STATUS_BADGE.draft;
                  const contactName = draft.crm_contacts?.name || draft.to_email;
                  const companyName = draft.crm_companies?.name;

                  return (
                    <div
                      key={draft.id}
                      onClick={() => onSelect(draft.id)}
                      className={cn(
                        "group/row w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer border-b border-zinc-50 dark:border-zinc-900",
                        selectedId === draft.id && "bg-zinc-50 dark:bg-zinc-900/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {/* Checkbox for batch select (pending only) */}
                        {draft.status === "draft" && (
                          <button
                            onClick={(e) => toggleSelect(draft.id, e)}
                            className={cn(
                              "flex-shrink-0 w-4 h-4 rounded border transition-colors flex items-center justify-center",
                              selectedIds.has(draft.id)
                                ? "bg-teal-600 border-teal-600 text-white"
                                : "border-zinc-300 dark:border-zinc-600 hover:border-teal-500"
                            )}
                          >
                            {selectedIds.has(draft.id) && <Check size={10} />}
                          </button>
                        )}

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
                              {contactName}
                            </span>
                            {contactName !== draft.to_email && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                                &lt;{draft.to_email}&gt;
                              </span>
                            )}
                            {companyName && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                                · {companyName}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                            {draft.subject}
                          </p>
                        </div>

                        {/* Right side: badges + time + delete */}
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                          <TrackingBadges draftId={draft.id} status={draft.status} />
                          <span className={cn("text-[8px] px-1.5 py-0.5 rounded-full font-medium", badge.bg, badge.text)}>
                            {badge.label}
                          </span>
                          <span className="text-[9px] text-zinc-400 tabular-nums">
                            {formatTime(draft.created_at)}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteDraft.mutate(draft.id); if (selectedId === draft.id) onSelect(null); }}
                            className="hidden group-hover/row:block p-1 text-zinc-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
