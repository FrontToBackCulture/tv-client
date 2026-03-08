// src/modules/email/CampaignsView.tsx
// Campaign list view — placeholder for Phase 4

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useEmailCampaigns } from "../../hooks/email";
import { CAMPAIGN_STATUSES } from "../../lib/email/types";
import type { EmailCampaignWithStats } from "../../lib/email/types";
import { formatDate } from "../../lib/date";

interface CampaignsViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNewCampaign: () => void;
}

export function CampaignsView({ selectedId, onSelect, onNewCampaign }: CampaignsViewProps) {
  const [search, setSearch] = useState("");
  const { data: campaigns = [], isLoading } = useEmailCampaigns({
    search: search || undefined,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Campaigns</h1>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {campaigns.length} campaigns
            </p>
          </div>
          <button
            onClick={onNewCampaign}
            className="p-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
        ) : campaigns.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
            {search ? "No campaigns found" : "No campaigns yet. Create one to get started."}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                isSelected={campaign.id === selectedId}
                onClick={() => onSelect(campaign.id === selectedId ? null : campaign.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  isSelected,
  onClick,
}: {
  campaign: EmailCampaignWithStats;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusDef = CAMPAIGN_STATUSES.find((s) => s.value === campaign.status);
  const statusColors: Record<string, string> = {
    gray: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
        isSelected ? "bg-zinc-50 dark:bg-zinc-900/50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
            {campaign.name}
          </p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
            {campaign.subject}
            {campaign.group && ` · ${campaign.group.name}`}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {statusDef && (
            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusColors[statusDef.color] || statusColors.gray}`}>
              {statusDef.label}
            </span>
          )}
          <span className="text-[10px] text-zinc-400">
            {formatDate(campaign.sent_at || campaign.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
}
