// Overview tab — summary stats + removal candidates table

import type { LucideIcon } from "lucide-react";
import { Activity, TrendingDown, AlertTriangle, Skull, Eye } from "lucide-react";
import { ListSkeleton } from "../../components/ui";
import type { PageAnalytics } from "./analyticsTypes";
import { useAnalyticsSummary } from "./useAnalytics";
import { HealthBadge, TrendBadge } from "./AnalyticsBadges";

interface AnalyticsOverviewProps {
  platform: PageAnalytics[] | undefined;
  website: PageAnalytics[] | undefined;
  isLoading: boolean;
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: LucideIcon; color: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
      <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${color}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

export function AnalyticsOverview({ platform, website, isLoading }: AnalyticsOverviewProps) {
  const allPages = [...(platform ?? []), ...(website ?? [])];
  const summary = useAnalyticsSummary(allPages.length > 0 ? allPages : undefined);
  const platformSummary = useAnalyticsSummary(platform);
  const websiteSummary = useAnalyticsSummary(website);

  if (isLoading) {
    return <div className="p-6"><ListSkeleton /></div>;
  }

  // Removal candidates: stale + dead + unused, sorted by health score ascending
  const removalCandidates = allPages
    .filter((p) => p.healthStatus === "stale" || p.healthStatus === "dead" || p.healthStatus === "unused")
    .sort((a, b) => a.healthScore - b.healthScore);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Summary stats */}
        <div>
          <h2 className="text-sm font-medium text-zinc-500 mb-3">All Sources</h2>
          <div className="grid grid-cols-5 gap-3">
            <StatCard label="Active" value={summary.activePages} icon={Activity} color="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" />
            <StatCard label="Declining" value={summary.decliningPages} icon={TrendingDown} color="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400" />
            <StatCard label="Stale" value={summary.stalePages} icon={AlertTriangle} color="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400" />
            <StatCard label="Dead" value={summary.deadPages} icon={Skull} color="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" />
            <StatCard label="Unused" value={summary.unusedPages} icon={Eye} color="bg-zinc-100 dark:bg-zinc-800 text-zinc-500" />
          </div>
        </div>

        {/* Breakdown by source */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 mb-2">VAL Platform</p>
            <div className="flex items-baseline gap-4">
              <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{platformSummary.totalPages}</span>
              <span className="text-xs text-zinc-400">pages tracked</span>
            </div>
            <div className="flex gap-3 mt-2 text-xs text-zinc-500">
              <span className="text-green-500">{platformSummary.activePages} active</span>
              <span className="text-yellow-500">{platformSummary.decliningPages} declining</span>
              <span className="text-red-500">{platformSummary.deadPages + platformSummary.stalePages} stale/dead</span>
            </div>
          </div>
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 mb-2">Website</p>
            <div className="flex items-baseline gap-4">
              <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{websiteSummary.totalPages}</span>
              <span className="text-xs text-zinc-400">pages tracked</span>
            </div>
            <div className="flex gap-3 mt-2 text-xs text-zinc-500">
              <span className="text-green-500">{websiteSummary.activePages} active</span>
              <span className="text-yellow-500">{websiteSummary.decliningPages} declining</span>
              <span className="text-red-500">{websiteSummary.deadPages + websiteSummary.stalePages} stale/dead</span>
            </div>
          </div>
        </div>

        {/* Removal candidates */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-zinc-500">Removal Candidates</h2>
            <span className="text-xs text-zinc-400">{removalCandidates.length} pages</span>
          </div>

          {removalCandidates.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-400 border border-zinc-200 dark:border-zinc-800 rounded-lg">
              No removal candidates found. All pages are actively used.
            </div>
          ) : (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900 text-left text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">Page</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Domain</th>
                    <th className="px-4 py-2 font-medium text-right">Views 30d</th>
                    <th className="px-4 py-2 font-medium text-right">Users</th>
                    <th className="px-4 py-2 font-medium">Last Viewed</th>
                    <th className="px-4 py-2 font-medium">Trend</th>
                    <th className="px-4 py-2 font-medium">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {removalCandidates.slice(0, 100).map((p) => (
                    <tr key={`${p.source}-${p.pagePath}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300 max-w-xs truncate" title={p.pagePath}>
                        {p.pagePath}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${p.source === "ga4" ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300" : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"}`}>
                          {p.source === "ga4" ? "Platform" : "Website"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-500">{p.domain || "—"}</td>
                      <td className="px-4 py-2 text-right text-xs text-zinc-600 dark:text-zinc-400">{p.views30d}</td>
                      <td className="px-4 py-2 text-right text-xs text-zinc-600 dark:text-zinc-400">{p.users30d || "—"}</td>
                      <td className="px-4 py-2 text-xs text-zinc-500">{p.lastViewed || "Never"}</td>
                      <td className="px-4 py-2"><TrendBadge trend={p.trend} /></td>
                      <td className="px-4 py-2"><HealthBadge score={p.healthScore} status={p.healthStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {removalCandidates.length > 100 && (
                <div className="px-4 py-2 text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                  Showing 100 of {removalCandidates.length} — switch to Platform or Website tab for full list
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
