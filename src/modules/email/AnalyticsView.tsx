// src/modules/email/AnalyticsView.tsx
// Campaign analytics overview — placeholder for Phase 8

import { useEmailCampaigns, useCampaignStats } from "../../hooks/email";
import { formatDate } from "../../lib/date";

interface AnalyticsViewProps {
  onSelectCampaign: (id: string) => void;
}

export function AnalyticsView({ onSelectCampaign }: AnalyticsViewProps) {
  const { data: campaigns = [], isLoading } = useEmailCampaigns({
    status: "sent",
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Analytics</h1>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
          {campaigns.length} sent campaigns
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
        ) : campaigns.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
            No sent campaigns yet. Stats will appear here after sending.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {campaigns.map((campaign) => (
              <CampaignStatsRow
                key={campaign.id}
                campaignId={campaign.id}
                name={campaign.name}
                subject={campaign.subject}
                sentAt={campaign.sent_at}
                onClick={() => onSelectCampaign(campaign.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignStatsRow({
  campaignId,
  name,
  subject,
  sentAt,
  onClick,
}: {
  campaignId: string;
  name: string;
  subject: string;
  sentAt: string | null;
  onClick: () => void;
}) {
  const { data: stats } = useCampaignStats(campaignId);

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">{name}</p>
        {sentAt && (
          <span className="text-[10px] text-zinc-400 flex-shrink-0">{formatDate(sentAt)}</span>
        )}
      </div>
      <p className="text-[10px] text-zinc-400 truncate mb-2">{subject}</p>
      {stats && stats.sent > 0 && (
        <div className="flex gap-4">
          <MiniStat label="Sent" value={String(stats.sent)} />
          <MiniStat label="Opens" value={`${stats.openRate.toFixed(1)}%`} />
          <MiniStat label="Clicks" value={`${stats.clickRate.toFixed(1)}%`} />
          <MiniStat label="Unsubs" value={String(stats.unsubscribed)} />
        </div>
      )}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{value}</p>
    </div>
  );
}
