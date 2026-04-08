// Outreach Analytics — metrics for outreach email performance including tracking

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutreachDrafts } from "../../hooks/email/useOutreachDrafts";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/cn";

/** Fetch all tracking events for outreach drafts */
function useOutreachTracking(draftIds: string[]) {
  return useQuery({
    queryKey: ["outreach-tracking", draftIds.sort().join(",")],
    queryFn: async () => {
      if (draftIds.length === 0) return [];
      const { data, error } = await supabase
        .from("email_events")
        .select("draft_id, event_type, url_clicked, occurred_at")
        .in("draft_id", draftIds)
        .in("event_type", ["sent", "opened", "clicked"])
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: draftIds.length > 0,
    refetchInterval: 30000,
  });
}

export function OutreachAnalyticsView() {
  const { data: allDrafts = [] } = useOutreachDrafts("all");
  const draftIds = useMemo(() => allDrafts.map(d => d.id), [allDrafts]);
  const { data: events = [] } = useOutreachTracking(draftIds);

  const stats = useMemo(() => {
    const total = allDrafts.length;
    const pending = allDrafts.filter(d => d.status === "draft").length;
    const approved = allDrafts.filter(d => d.status === "approved").length;
    const sent = allDrafts.filter(d => d.status === "sent" || d.status === "approved").length;
    const skipped = allDrafts.filter(d => d.status === "skipped").length;

    // Tracking stats from email_events
    const sentEvents = new Set(events.filter(e => e.event_type === "sent").map(e => e.draft_id));
    const openedDrafts = new Set(events.filter(e => e.event_type === "opened").map(e => e.draft_id));
    const clickedDrafts = new Set(events.filter(e => e.event_type === "clicked").map(e => e.draft_id));

    const totalSentWithTracking = sentEvents.size;
    const totalOpened = openedDrafts.size;
    const totalClicked = clickedDrafts.size;
    const openRate = totalSentWithTracking > 0 ? Math.round((totalOpened / totalSentWithTracking) * 100) : 0;
    const clickRate = totalSentWithTracking > 0 ? Math.round((totalClicked / totalSentWithTracking) * 100) : 0;

    // Per-draft tracking map
    const trackingByDraft = new Map<string, { opened: boolean; clicked: boolean; clicks: number }>();
    for (const e of events) {
      if (!trackingByDraft.has(e.draft_id)) trackingByDraft.set(e.draft_id, { opened: false, clicked: false, clicks: 0 });
      const t = trackingByDraft.get(e.draft_id)!;
      if (e.event_type === "opened") t.opened = true;
      if (e.event_type === "clicked") { t.clicked = true; t.clicks++; }
    }

    // Group by company with tracking
    const byCompany = new Map<string, { name: string; drafts: number; sent: number; opened: number; clicked: number; statuses: string[] }>();
    for (const d of allDrafts) {
      const companyName = d.crm_companies?.name || "Unknown";
      const companyId = d.company_id || "unknown";
      if (!byCompany.has(companyId)) byCompany.set(companyId, { name: companyName, drafts: 0, sent: 0, opened: 0, clicked: 0, statuses: [] });
      const c = byCompany.get(companyId)!;
      c.drafts++;
      c.statuses.push(d.status);
      const t = trackingByDraft.get(d.id);
      if (sentEvents.has(d.id)) c.sent++;
      if (t?.opened) c.opened++;
      if (t?.clicked) c.clicked++;
    }

    return { total, pending, approved, sent, skipped, totalSentWithTracking, totalOpened, totalClicked, openRate, clickRate, byCompany, trackingByDraft };
  }, [allDrafts, events]);

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Pipeline cards */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Pipeline</h3>
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Total Drafts" value={stats.total} color="text-zinc-800 dark:text-zinc-100" />
          <StatCard label="Pending Review" value={stats.pending} color="text-amber-600 dark:text-amber-400" />
          <StatCard label="Approved" value={stats.approved} color="text-blue-600 dark:text-blue-400" />
          <StatCard label="Sent" value={stats.sent} color="text-green-600 dark:text-green-400" />
          <StatCard label="Skipped" value={stats.skipped} color="text-zinc-500" />
        </div>
      </div>

      {/* Engagement cards */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Engagement</h3>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Tracked Sends" value={stats.totalSentWithTracking} color="text-zinc-800 dark:text-zinc-100" />
          <StatCard label="Opened" value={stats.totalOpened} suffix={stats.openRate > 0 ? `${stats.openRate}%` : undefined} color="text-blue-600 dark:text-blue-400" />
          <StatCard label="Clicked" value={stats.totalClicked} suffix={stats.clickRate > 0 ? `${stats.clickRate}%` : undefined} color="text-purple-600 dark:text-purple-400" />
          <StatCard label="Replied" value={0} color="text-green-600 dark:text-green-400" />
        </div>
      </div>

      {/* Individual emails breakdown */}
      {allDrafts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
            All Outreach Emails
          </h3>
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400">
                  <th className="text-left px-4 py-2 font-medium">Subject</th>
                  <th className="text-left px-4 py-2 font-medium">To</th>
                  <th className="text-left px-4 py-2 font-medium">Company</th>
                  <th className="text-center px-4 py-2 font-medium">Status</th>
                  <th className="text-center px-4 py-2 font-medium">Opened</th>
                  <th className="text-center px-4 py-2 font-medium">Clicks</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {allDrafts.map((draft) => {
                  const t = stats.trackingByDraft.get(draft.id);
                  const contactName = draft.crm_contacts?.name || "—";
                  const companyName = draft.crm_companies?.name || "—";
                  return (
                    <tr key={draft.id} className="border-b border-zinc-50 dark:border-zinc-900 last:border-0">
                      <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300 max-w-[200px] truncate">{draft.subject}</td>
                      <td className="px-4 py-2">
                        <div className="text-zinc-700 dark:text-zinc-300">{contactName}</div>
                        <div className="text-[9px] text-zinc-400">{draft.to_email}</div>
                      </td>
                      <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{companyName}</td>
                      <td className="px-4 py-2 text-center"><StatusBadge status={draft.status} /></td>
                      <td className="px-4 py-2 text-center">
                        {t?.opened
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">Yes</span>
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {t?.clicks && t.clicks > 0
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">{t.clicks}</span>
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-zinc-400 text-[10px]">
                        {new Date(draft.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.total === 0 && (
        <div className="flex items-center justify-center py-16 text-xs text-zinc-400">
          No outreach data yet. Run the Daily Outreach Drafter to get started.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, suffix, color }: { label: string; value: number; suffix?: string; color: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-center">
      <div className="flex items-baseline justify-center gap-1">
        <p className={cn("text-2xl font-semibold", color)}>{value}</p>
        {suffix && <span className="text-xs text-zinc-400">{suffix}</span>}
      </div>
      <p className="text-[10px] text-zinc-400 mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Pending" },
    approved: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "In Outlook" },
    sent: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Sent" },
    failed: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Failed" },
    skipped: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400", label: "Skipped" },
  };
  const c = config[status] || config.draft;
  return <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", c.bg, c.text)}>{c.label}</span>;
}

