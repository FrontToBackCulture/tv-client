// src/modules/email/CampaignDetailPanel.tsx
// Right panel showing campaign details, token-replaced preview, and test send

import { useState, useEffect, useMemo } from "react";
import { X, Send, Loader2, Copy, Pencil, FlaskConical, User, Maximize2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  useEmailCampaign,
  useCampaignStats,
  useCampaignRecipients,
  useSendCampaign,
  useCreateEmailCampaign,
  useSendTestEmail,
  useEmailContacts,
} from "../../hooks/email";
import { CAMPAIGN_STATUSES } from "../../lib/email/types";
import type { EmailContact } from "../../lib/email/types";
import { formatDate } from "../../lib/date";
import { useRepositoryStore } from "../../stores/repositoryStore";

interface CampaignDetailPanelProps {
  campaignId: string;
  onClose: () => void;
  onEdit?: (campaign: import("../../lib/email/types").EmailCampaignWithStats) => void;
}

export function CampaignDetailPanel({ campaignId, onClose, onEdit }: CampaignDetailPanelProps) {
  const { data: campaign, isLoading } = useEmailCampaign(campaignId);
  const { data: stats } = useCampaignStats(campaignId);
  const { data: recipients = [] } = useCampaignRecipients(campaignId, campaign?.group_id ?? null);
  const sendCampaign = useSendCampaign();
  const cloneCampaign = useCreateEmailCampaign();
  const sendTest = useSendTestEmail();
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; errors: string[] } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; error: string | null } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [showTestForm, setShowTestForm] = useState(false);
  const [previewContactId, setPreviewContactId] = useState<string>("");
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [fileHtml, setFileHtml] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("");

  // Load email API base URL from settings
  useEffect(() => {
    invoke<string | null>("settings_get_key", { keyName: "email_api_base_url" })
      .then((url) => setApiBaseUrl(url || ""))
      .catch(() => setApiBaseUrl(""));
  }, []);

  const knowledgePath = useRepositoryStore((s) => {
    const repo = s.repositories.find((r) => r.id === s.activeRepositoryId);
    return repo?.path || "";
  });

  // Fetch contacts from the campaign's target group for preview selector
  const { data: groupContacts = [] } = useEmailContacts(
    campaign?.group_id ? { groupId: campaign.group_id, status: "active" } : undefined
  );

  const selectedContact = useMemo(() => {
    if (!previewContactId) return null;
    return groupContacts.find((c: EmailContact) => c.id === previewContactId) || null;
  }, [previewContactId, groupContacts]);

  // Load HTML from content_path file if set
  useEffect(() => {
    if (!campaign?.content_path || !knowledgePath) {
      setFileHtml(null);
      return;
    }
    const fullPath = `${knowledgePath}/${campaign.content_path}`;
    invoke<string>("read_file", { path: fullPath })
      .then(setFileHtml)
      .catch(() => setFileHtml(null));
  }, [campaign?.content_path, knowledgePath]);

  // The HTML to show — prefer file content over stored html_body
  const rawHtml = fileHtml || campaign?.html_body || "";

  // Apply token replacement for preview
  const previewHtml = useMemo(() => {
    if (!rawHtml) return "";
    let html = rawHtml;
    const firstName = selectedContact?.first_name || "there";
    const subject = campaign?.subject || "";
    html = html.replace(/\{\{first_name\}\}/g, firstName);
    html = html.replace(/\{\{subject\}\}/g, subject);
    html = html.replace(/\{\{unsubscribe_url\}\}/g, "#unsubscribe");
    return html;
  }, [rawHtml, selectedContact, campaign?.subject]);

  if (isLoading) {
    return (
      <div className="w-[420px] border-l border-zinc-100 dark:border-zinc-800/50 flex items-center justify-center text-xs text-zinc-400">
        Loading...
      </div>
    );
  }

  if (!campaign) return null;

  const statusDef = CAMPAIGN_STATUSES.find((s) => s.value === campaign.status);
  const canSend = ["draft", "scheduled", "failed", "partial"].includes(campaign.status);
  const missingApiUrl = !apiBaseUrl;

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
          {campaign.content_path && (
            <DetailRow label="Content" value={campaign.content_path.split("/").pop() || campaign.content_path} />
          )}
          {campaign.sent_at && (
            <DetailRow label="Sent" value={formatDate(campaign.sent_at)} />
          )}
          {campaign.scheduled_at && (
            <DetailRow label="Scheduled" value={formatDate(campaign.scheduled_at)} />
          )}
          <DetailRow label="Created" value={formatDate(campaign.created_at)} />
        </div>

        {/* Missing API URL warning */}
        {missingApiUrl && canSend && (
          <p className="text-[10px] text-orange-600 dark:text-orange-400">
            Set <strong>Email API Base URL</strong> in Settings to enable sending.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {onEdit && campaign && (
            <button
              onClick={() => onEdit(campaign)}
              className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
            >
              <Pencil size={14} />
              Edit
            </button>
          )}
          {canSend && (
            <>
              <button
                onClick={() => setShowTestForm(!showTestForm)}
                className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
              >
                <FlaskConical size={14} />
                Test
              </button>
              <button
                onClick={() => {
                  if (!confirm("Send this campaign to the entire group now?")) return;
                  sendCampaign.mutate(
                    { campaignId, apiBaseUrl: apiBaseUrl, knowledgePath: knowledgePath || undefined },
                    {
                      onSuccess: (result) => setSendResult(result),
                    }
                  );
                }}
                disabled={sendCampaign.isPending || missingApiUrl}
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
            </>
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
                content_path: campaign.content_path,
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

        {/* Test email form */}
        {showTestForm && (
          <div className="rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
            <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              Send a test email (no tracking, [TEST] prefix)
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <button
                onClick={() => {
                  if (!testEmail.trim()) return;
                  setTestResult(null);
                  sendTest.mutate(
                    {
                      campaignId,
                      testEmail: testEmail.trim(),
                      apiBaseUrl: apiBaseUrl,
                      knowledgePath: knowledgePath || undefined,
                    },
                    {
                      onSuccess: (result) => setTestResult(result),
                    }
                  );
                }}
                disabled={sendTest.isPending || !testEmail.trim() || missingApiUrl}
                className="px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 rounded transition-colors"
              >
                {sendTest.isPending ? "Sending..." : "Send Test"}
              </button>
            </div>
            {testResult && (
              <p className={`text-[10px] ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                {testResult.success ? "Test email sent successfully!" : `Failed: ${testResult.error}`}
              </p>
            )}
          </div>
        )}

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

        {/* Preview button */}
        {(rawHtml) && (
          <div>
            <button
              onClick={() => setShowFullPreview(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-md transition-colors"
            >
              <Maximize2 size={14} />
              Open Full Preview
            </button>
          </div>
        )}

        {/* Recipients table */}
        {recipients.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Recipients ({recipients.length})
            </h3>
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
              <div className="max-h-48 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                      <th className="text-left px-3 py-1.5 text-[10px] font-medium text-zinc-500">Email</th>
                      <th className="text-right px-3 py-1.5 text-[10px] font-medium text-zinc-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => (
                      <tr key={r.contactId} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
                          {r.firstName ? `${r.firstName} ` : ""}<span className="text-zinc-400">{r.email}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <RecipientBadge status={r.latestEvent} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full preview modal */}
      {showFullPreview && rawHtml && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-auto">
          <div className="my-8 w-[700px] max-w-[95vw]">
            {/* Modal header */}
            <div className="flex items-center justify-between bg-white dark:bg-zinc-900 rounded-t-lg px-5 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Preview: {campaign.name}
                </h3>
                {groupContacts.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <User size={11} className="text-zinc-400" />
                    <select
                      value={previewContactId}
                      onChange={(e) => setPreviewContactId(e.target.value)}
                      className="text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-zinc-600 dark:text-zinc-400 focus:outline-none"
                    >
                      <option value="">Default tokens</option>
                      {groupContacts.map((c: EmailContact) => (
                        <option key={c.id} value={c.id}>
                          {c.first_name || c.email} {c.last_name || ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowFullPreview(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
              >
                <X size={16} />
              </button>
            </div>
            {/* Email render */}
            <div className="bg-white rounded-b-lg overflow-hidden shadow-xl">
              <iframe
                srcDoc={previewHtml}
                className="w-full bg-white border-0"
                style={{ height: "85vh" }}
                sandbox=""
                title={`Preview: ${campaign.name}`}
              />
            </div>
          </div>
        </div>
      )}
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

const RECIPIENT_STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  clicked: { label: "Clicked", classes: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  opened: { label: "Opened", classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  delivered: { label: "Delivered", classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  sent: { label: "Sent", classes: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  bounced: { label: "Bounced", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  complained: { label: "Complained", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  unsubscribed: { label: "Unsubscribed", classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  skipped: { label: "Skipped", classes: "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-500" },
  pending: { label: "Pending", classes: "bg-zinc-50 text-zinc-400 dark:bg-zinc-800/50 dark:text-zinc-500" },
};

function RecipientBadge({ status }: { status: string }) {
  const style = RECIPIENT_STATUS_STYLES[status] || RECIPIENT_STATUS_STYLES.pending;
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${style.classes}`}>
      {style.label}
    </span>
  );
}
