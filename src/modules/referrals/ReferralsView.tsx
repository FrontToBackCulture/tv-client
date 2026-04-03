// src/modules/referrals/ReferralsView.tsx
// View for reviewing partner referral requests

import { useState } from "react";
import { Check, X, Clock, MessageSquare } from "lucide-react";
import { usePartnerReferrals, useReviewReferral } from "../../hooks/usePartnerReferrals";
import { useAuth } from "../../stores/authStore";
import { SearchInput } from "../crm/CrmComponents";

type FilterStatus = "pending" | "approved" | "rejected" | "all";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
  approved: { label: "Approved", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
  rejected: { label: "Declined", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
};

export function ReferralsView() {
  const [filter, setFilter] = useState<FilterStatus>("pending");
  const [search, setSearch] = useState("");

  const user = useAuth((s) => s.user);
  const currentUser = user?.name || user?.login || "";

  const { data: requests = [], isLoading } = usePartnerReferrals(
    filter === "all" ? undefined : filter
  );
  const reviewMutation = useReviewReferral();

  const filtered = requests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.company?.name?.toLowerCase().includes(q) ||
      r.partner?.name?.toLowerCase().includes(q) ||
      r.partner?.company?.toLowerCase().includes(q)
    );
  });

  const handleReview = (id: string, status: "approved" | "rejected") => {
    reviewMutation.mutate({ id, status, reviewed_by: currentUser });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Partner Referrals
          </h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Review and approve partner referral requests
          </p>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5">
          {(["pending", "approved", "rejected", "all"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-all ${
                filter === s
                  ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {s === "all" ? "All" : s === "rejected" ? "Declined" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by company or partner..."
        />
      </div>

      {/* List */}
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

                    {/* Action buttons — only for pending */}
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
  );
}
