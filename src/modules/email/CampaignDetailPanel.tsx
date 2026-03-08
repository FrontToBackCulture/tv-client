// src/modules/email/CampaignDetailPanel.tsx
// Right panel showing campaign details and stats

import { useState } from "react";
import { X, Send, Loader2, Copy } from "lucide-react";
import { useEmailCampaign, useCampaignStats, useSendCampaign, useCreateEmailCampaign } from "../../hooks/email";
import { CAMPAIGN_STATUSES } from "../../lib/email/types";
import { formatDate } from "../../lib/date";

interface CampaignDetailPanelProps {
  campaignId: string;
  onClose: () => void;
}

const API_BASE_URL = "https://brusquely-relievable-lilyanna.ngrok-free.dev";

export function CampaignDetailPanel({ campaignId, onClose }: CampaignDetailPanelProps) {
  const { data: campaign, isLoading } = useEmailCampaign(campaignId);
  const { data: stats } = useCampaignStats(campaignId);
  const sendCampaign = useSendCampaign();
  const cloneCampaign = useCreateEmailCampaign();
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; errors: string[] } | null>(null);

  if (isLoading) {
    return (
      <div className="w-[420px] border-l border-zinc-100 dark:border-zinc-800/50 flex items-center justify-center text-xs text-zinc-400">
        Loading...
      </div>
    );
  }

  if (!campaign) return null;

  const statusDef = CAMPAIGN_STATUSES.find((s) => s.value === campaign.status);
  const canSend = campaign.status === "draft" || campaign.status === "scheduled";

  return (
    <div className="w-[420px] border-l border-zinc-100 dark:border-zinc-800/50 flex flex-col bg-white dark:bg-zinc-950 overflow-auto">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <Send size={14} className="flex-shrink-0 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
            {campaign.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
        >
          <X size={14} />
        </button>
      </div>

      {/* Details */}
      <div className="px-4 py-4 space-y-4">
        <div className="space-y-2">
          <DetailRow label="Subject" value={campaign.subject} />
          <DetailRow label="From" value={`${campaign.from_name} <${campaign.from_email}>`} />
          <DetailRow label="Status" value={statusDef?.label || campaign.status} />
          <DetailRow label="Group" value={campaign.group?.name || "—"} />
          {campaign.sent_at && (
            <DetailRow label="Sent" value={formatDate(campaign.sent_at)} />
          )}
          {campaign.scheduled_at && (
            <DetailRow label="Scheduled" value={formatDate(campaign.scheduled_at)} />
          )}
          <DetailRow label="Created" value={formatDate(campaign.created_at)} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {canSend && (
            <button
              onClick={() => {
                if (!confirm("Send this campaign now?")) return;
                sendCampaign.mutate(
                  { campaignId, apiBaseUrl: API_BASE_URL },
                  {
                    onSuccess: (result) => setSendResult(result),
                  }
                );
              }}
              disabled={sendCampaign.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md transition-colors"
            >
              {sendCampaign.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Send
                </>
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (!campaign) return;
              cloneCampaign.mutate({
                name: `${campaign.name} (copy)`,
                subject: campaign.subject,
                from_name: campaign.from_name,
                from_email: campaign.from_email,
                html_body: campaign.html_body,
                group_id: campaign.group_id,
              });
            }}
            disabled={cloneCampaign.isPending}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
          >
            <Copy size={14} />
            Clone
          </button>
        </div>

        {/* Send result */}
        {sendResult && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-xs">
            <p className="font-medium text-green-800 dark:text-green-300">
              Sent: {sendResult.sent} | Failed: {sendResult.failed}
            </p>
            {sendResult.errors.length > 0 && (
              <ul className="mt-1 text-red-600 dark:text-red-400 space-y-0.5">
                {sendResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Send error */}
        {sendCampaign.isError && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
            {(sendCampaign.error as any)?.message || "Failed to send campaign"}
          </div>
        )}

        {/* Stats */}
        {stats && stats.sent > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Performance
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Delivered" value={String(stats.delivered)} />
              <StatCard label="Open Rate" value={`${stats.openRate.toFixed(1)}%`} />
              <StatCard label="Click Rate" value={`${stats.clickRate.toFixed(1)}%`} />
              <StatCard label="Bounced" value={String(stats.bounced)} />
              <StatCard label="Unsubscribed" value={String(stats.unsubscribed)} />
              <StatCard label="Complaints" value={String(stats.complained)} />
            </div>
          </div>
        )}

        {/* HTML preview */}
        {campaign.html_body && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Preview
            </h3>
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
              <iframe
                srcDoc={campaign.html_body}
                className="w-full h-64 bg-white"
                sandbox=""
                title="Email preview"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 flex-shrink-0">{label}</span>
      <span className="text-xs text-zinc-700 dark:text-zinc-300 text-right">{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-md px-2 py-1.5 text-center">
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{value}</p>
      <p className="text-[10px] text-zinc-400">{label}</p>
    </div>
  );
}
