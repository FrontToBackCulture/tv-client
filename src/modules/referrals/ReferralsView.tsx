// src/modules/referrals/ReferralsView.tsx
// View for reviewing partner referral requests

import { useMemo, useState } from "react";
import { Check, X, Clock, MessageSquare, Layers, Hourglass, CheckCircle2, XCircle } from "lucide-react";
import { usePartnerReferrals, useReviewReferral } from "../../hooks/usePartnerReferrals";
import { useAuth } from "../../stores/authStore";
import { SearchInput } from "../crm/CrmComponents";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { cn } from "../../lib/cn";

type FilterStatus = "pending" | "approved" | "rejected" | "all";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
  approved: { label: "Approved", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
  rejected: { label: "Declined", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
};

const FILTERS: { id: FilterStatus; label: string; icon: typeof Layers }[] = [
  { id: "all", label: "All", icon: Layers },
  { id: "pending", label: "Pending", icon: Hourglass },
  { id: "approved", label: "Approved", icon: CheckCircle2 },
  { id: "rejected", label: "Declined", icon: XCircle },
];

export function ReferralsView() {
  const [filter, setFilter] = useState<FilterStatus>(() => {
    try {
      return (localStorage.getItem("referrals-filter") as FilterStatus) || "pending";
    } catch {
      return "pending";
    }
  });
  const [search, setSearch] = useState("");

  const handleSetFilter = (f: FilterStatus) => {
    setFilter(f);
    try { localStorage.setItem("referrals-filter", f); } catch {/* ignore */}
  };

  const user = useAuth((s) => s.user);
  const currentUser = user?.name || user?.login || "";

  const { data: allRequests = [], isLoading } = usePartnerReferrals();
  const reviewMutation = useReviewReferral();

  const counts = useMemo(() => ({
    all: allRequests.length,
    pending: allRequests.filter((r) => r.status === "pending").length,
    approved: allRequests.filter((r) => r.status === "approved").length,
    rejected: allRequests.filter((r) => r.status === "rejected").length,
  }), [allRequests]);

  const filtered = useMemo(() => {
    const byStatus = filter === "all" ? allRequests : allRequests.filter((r) => r.status === filter);
    if (!search) return byStatus;
    const q = search.toLowerCase();
    return byStatus.filter((r) =>
      r.company?.name?.toLowerCase().includes(q) ||
      r.partner?.name?.toLowerCase().includes(q) ||
      r.partner?.company?.toLowerCase().includes(q)
    );
  }, [allRequests, filter, search]);

  const handleReview = (id: string, status: "approved" | "rejected") => {
    reviewMutation.mutate({ id, status, reviewed_by: currentUser });
  };

  const itemBase = "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors";
  const itemActive = "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400";
  const itemIdle = "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50";

  return (
    <div className="h-full flex overflow-hidden px-4 py-4">
     <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
        <div className="h-full flex flex-col overflow-y-auto px-3 py-3 space-y-3">
          <CollapsibleSection title="Status" storageKey="referrals-status">
            {FILTERS.map((f) => {
              const Icon = f.icon;
              const isActive = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => handleSetFilter(f.id)}
                  className={cn(itemBase, isActive ? itemActive : itemIdle)}
                >
                  <Icon size={13} className={isActive ? "text-teal-500" : "text-zinc-400"} />
                  <span className="flex-1">{f.label}</span>
                  <span className="text-[10px] text-zinc-400">{counts[f.id]}</span>
                </button>
              );
            })}
          </CollapsibleSection>
          <div className="flex-1" />
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by company or partner..."
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-zinc-400">Loading...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-zinc-400">
                {filter === "pending" ? "No pending requests" : "No requests found"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {filtered.map((req) => {
                const config = STATUS_CONFIG[req.status];
                return (
                  <div
                    key={req.id}
                    className="px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                            {req.company?.name || "Unknown company"}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.color} ${config.bg}`}>
                            {config.label}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Requested by <span className="font-medium">{req.partner?.name}</span>
                          {req.partner?.company && (
                            <span className="text-zinc-400 dark:text-zinc-500"> ({req.partner.company})</span>
                          )}
                        </p>
                        {req.note && (
                          <div className="flex items-start gap-1.5 mt-1.5">
                            <MessageSquare size={11} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                              {req.note}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(req.created_at).toLocaleDateString("en-SG", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          {req.reviewed_by && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                              Reviewed by {req.reviewed_by}
                            </span>
                          )}
                        </div>
                      </div>

                      {req.status === "pending" && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleReview(req.id, "approved")}
                            disabled={reviewMutation.isPending}
                            className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 transition-colors"
                            title="Approve"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => handleReview(req.id, "rejected")}
                            disabled={reviewMutation.isPending}
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
                            title="Decline"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
     </div>
    </div>
  );
}
