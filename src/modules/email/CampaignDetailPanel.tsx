// src/modules/email/CampaignDetailPanel.tsx
// Right panel showing campaign details, token-replaced preview, and test send

import { useState, useEffect, useMemo, useRef } from "react";
import { formatError } from "@/lib/formatError";
import { X, Send, Loader2, Copy, Pencil, FlaskConical, User, Maximize2, FileText, Upload, Check, ChevronRight, ChevronDown, Folder, FolderOpen, MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";
import { invoke } from "@tauri-apps/api/core";
import {
  useEmailCampaign,
  useEmailCampaigns,
  useCampaignStats,
  useCampaignRecipients,
  useSendCampaign,
  useCreateEmailCampaign,
  useSendTestEmail,
  useUpdateEmailCampaign,
  useEmailContacts,
  useEmailGroups,
} from "../../hooks/email";
import { useQueryClient } from "@tanstack/react-query";
import { CAMPAIGN_STATUSES } from "../../lib/email/types";
import { emailKeys } from "../../hooks/email/keys";
import type { EmailContact } from "../../lib/email/types";
import { formatDate } from "../../lib/date";
import { useRepositoryStore } from "../../stores/repositoryStore";
import { useFileTree, useFolderChildren, type TreeNode } from "../../hooks/useFiles";
import { extractTokens, classifyTokens, applyTokens } from "../../lib/email/tokens";

interface CampaignDetailPanelProps {
  campaignId: string;
  onClose: () => void;
  onEdit?: (campaign: import("../../lib/email/types").EmailCampaignWithStats) => void;
}

export function CampaignDetailPanel({ campaignId, onClose, onEdit }: CampaignDetailPanelProps) {
  const { data: campaign, isLoading } = useEmailCampaign(campaignId);
  const { data: allCampaigns = [] } = useEmailCampaigns();
  const { data: stats } = useCampaignStats(campaignId);

  // Collect existing categories for autocomplete
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCampaigns) {
      if (c.category) set.add(c.category);
    }
    return Array.from(set).sort();
  }, [allCampaigns]);
  const { data: recipients = [] } = useCampaignRecipients(campaignId, campaign?.group_id ?? null);
  const sendCampaign = useSendCampaign();
  const cloneCampaign = useCreateEmailCampaign();
  const sendTest = useSendTestEmail();
  const updateCampaign = useUpdateEmailCampaign();
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; errors: string[] } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; error: string | null } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [showTestForm, setShowTestForm] = useState(false);
  const [previewContactId, setPreviewContactId] = useState<string>("");
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [uploadingReport, setUploadingReport] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showReportPicker, setShowReportPicker] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [testGroupId, setTestGroupId] = useState<string>("");
  const queryClient = useQueryClient();
  const [fileHtml, setFileHtml] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("");
  const [showDiscussions, setShowDiscussions] = useState(false);
  const { data: discussionCount } = useDiscussionCount("campaign", campaignId);

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

  // For test send: all groups + contacts in selected test group
  const { data: allGroups = [] } = useEmailGroups();
  const { data: testGroupContacts = [] } = useEmailContacts(
    testGroupId ? { groupId: testGroupId } : undefined
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

  // Custom token state — seeded from campaign.tokens
  const [customTokens, setCustomTokens] = useState<Record<string, string>>({});
  useEffect(() => {
    if (campaign?.tokens && typeof campaign.tokens === "object") {
      setCustomTokens(campaign.tokens as Record<string, string>);
    }
  }, [campaign?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan HTML for tokens and classify
  const { custom: customTokenKeys } = useMemo(
    () => classifyTokens(extractTokens(rawHtml)),
    [rawHtml]
  );

  // Apply token replacement for preview
  const previewHtml = useMemo(() => {
    if (!rawHtml) return "";
    const systemValues: Record<string, string> = {
      first_name: selectedContact?.first_name || "there",
      subject: campaign?.subject || "",
      unsubscribe_url: "#unsubscribe",
      report_url: campaign?.report_url || customTokens.report_url || "#report-not-uploaded",
    };
    let html = applyTokens(rawHtml, systemValues, customTokens);
    // Inject click interceptor so links post to parent for external opening
    const clickScript = `<script>document.addEventListener('click',function(e){var a=e.target.closest('a');if(a&&a.href&&!a.href.startsWith('#')&&!a.href.startsWith('javascript')){e.preventDefault();window.parent.postMessage({type:'preview-link',url:a.href},'*');}});<\/script>`;
    html = html.replace(/<\/body>/i, clickScript + "</body>");
    return html;
  }, [rawHtml, selectedContact, campaign?.subject, campaign?.report_url, customTokens]);

  // Listen for link clicks from preview iframe and open in external browser
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "preview-link" && typeof e.data.url === "string") {
        import("@tauri-apps/plugin-shell").then(({ open }) => open(e.data.url));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Save custom tokens to DB
  const saveTokens = (next: Record<string, string>) => {
    setCustomTokens(next);
    updateCampaign.mutate({ id: campaignId, updates: { tokens: next } as any });
  };

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
        <div className="flex items-center gap-1">
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
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Discussion panel (replaces content when open) */}
      {showDiscussions ? (
        <div className="flex-1">
          <DiscussionPanel
            entityType="campaign"
            entityId={campaignId}
            onClose={() => setShowDiscussions(false)}
          />
        </div>
      ) : (
      <>
      {/* Details */}
      <div className="px-4 py-4 space-y-4">
        <div className="space-y-2">
          <DetailRow label="Subject" value={campaign.subject} />
          <DetailRow label="From" value={`${campaign.from_name} <${campaign.from_email}>`} />
          <EditableBcc
            value={campaign.bcc_email || ""}
            onSave={(v) => updateCampaign.mutate({ id: campaignId, updates: { bcc_email: v || null } })}
          />
          <DetailRow label="Status" value={statusDef?.label || campaign.status} />
          <EditableGroup
            value={campaign.group_id || ""}
            onSave={(v) => updateCampaign.mutate({ id: campaignId, updates: { group_id: v || null } })}
          />
          <EditableCategory
            value={campaign.category || ""}
            suggestions={existingCategories}
            onSave={(v) => updateCampaign.mutate({ id: campaignId, updates: { category: v || null } })}
          />
          {campaign.content_path && (
            <div>
              <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 block mb-0.5">Content</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(campaign.content_path!);
                  setCopiedPath(true);
                  setTimeout(() => setCopiedPath(false), 1500);
                }}
                className="flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer"
                title={`Click to copy: ${campaign.content_path}`}
              >
                <Copy size={10} className="shrink-0 opacity-40" />
                {copiedPath ? "Copied!" : (campaign.content_path.split("/").pop() || campaign.content_path)}
              </button>
            </div>
          )}
          {/* Report attachment */}
          <div>
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 block mb-0.5">Report</span>
            <button
              onClick={() => campaign.report_url
                ? import("@tauri-apps/plugin-shell").then(({ open }) => open(campaign.report_url!))
                : setShowReportPicker(true)
              }
              className={`text-xs block ${campaign.report_url ? "text-teal-600 dark:text-teal-400 hover:text-teal-700" : "text-zinc-700 dark:text-zinc-300 hover:text-teal-600"} hover:underline decoration-dashed underline-offset-2 cursor-pointer`}
              title={campaign.report_url || campaign.report_path || "Click to select report file"}
            >
              {campaign.report_path ? campaign.report_path.split("/").pop() : "— select file"}
            </button>
            {campaign.report_path && (
              <div className="flex items-center gap-1.5 mt-1">
                {campaign.report_url ? (
                  <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Check size={9} />
                    Uploaded{campaign.report_uploaded_at ? ` ${formatDate(campaign.report_uploaded_at)}` : ""}
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-400">Not uploaded</span>
                )}
                <span className="flex-1" />
                <button
                  onClick={async () => {
                    setUploadingReport(true);
                    setUploadError(null);
                    try {
                      await invoke("email_upload_report", { campaignId, knowledgePath: knowledgePath || "" });
                      queryClient.invalidateQueries({ queryKey: emailKeys.campaign(campaignId) });
                    } catch (e: any) { setUploadError(e?.message || String(e)); }
                    finally { setUploadingReport(false); }
                  }}
                  disabled={uploadingReport}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded transition-colors disabled:opacity-50"
                >
                  {uploadingReport ? (
                    <><Loader2 size={10} className="animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload size={10} /> {campaign.report_url ? "Re-upload" : "Upload"}</>
                  )}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await invoke("email_clear_report", { campaignId });
                      queryClient.invalidateQueries({ queryKey: emailKeys.campaign(campaignId) });
                    } catch (e: any) { setUploadError(e?.message || String(e)); }
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors"
                  title="Remove report and delete from S3"
                >
                  <X size={10} /> Clear
                </button>
              </div>
            )}
            {uploadError && (
              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">{uploadError}</p>
            )}
          </div>
          {/* Custom tokens */}
          {customTokenKeys.map((key) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">{key}</span>
                <div className="flex items-center gap-1">
                  {key === "report_url" && campaign.report_url && !customTokens[key] && (
                    <button
                      onClick={() => saveTokens({ ...customTokens, report_url: campaign.report_url! })}
                      className="text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 hover:underline"
                    >
                      Use report URL
                    </button>
                  )}
                  {customTokens[key] && (
                    <button
                      onClick={() => import("@tauri-apps/plugin-shell").then(({ open }) => open(customTokens[key]))}
                      className="text-teal-600 dark:text-teal-400 hover:text-teal-700"
                      title="Open URL"
                    >
                      <Maximize2 size={10} />
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={customTokens[key] || ""}
                placeholder="Enter URL or value..."
                onChange={(e) => setCustomTokens((prev) => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => saveTokens(customTokens)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTokens(customTokens); }}
                className="w-full text-xs px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-teal-500"
              />
            </div>
          ))}
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
                  const activeRecipients = recipients.filter((r) => r.latestEvent === "pending" || !r.latestEvent);
                  const recipientList = activeRecipients.length > 0
                    ? activeRecipients.map((r) => `  • ${r.firstName || r.email.split("@")[0]} (${r.email})`).join("\n")
                    : recipients.map((r) => `  • ${r.firstName || r.email.split("@")[0]} (${r.email})`).join("\n");
                  const count = activeRecipients.length || recipients.length;
                  if (!confirm(`Send to ${count} recipient${count !== 1 ? "s" : ""}?\n\n${recipientList}\n\nProceed?`)) return;
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
                report_path: campaign.report_path,
                bcc_email: campaign.bcc_email,
                group_id: campaign.group_id,
                tokens: campaign.tokens,
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
            {/* Pick from a group */}
            <div className="space-y-1.5">
              <select
                value={testGroupId}
                onChange={(e) => { setTestGroupId(e.target.value); setTestEmail(""); }}
                className="w-full px-2 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Pick from group...</option>
                {allGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {testGroupId && testGroupContacts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {testGroupContacts.map((c: EmailContact) => (
                    <button
                      key={c.id}
                      onClick={() => setTestEmail(c.email)}
                      className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                        testEmail === c.email
                          ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                          : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600"
                      }`}
                    >
                      {c.first_name || c.email.split("@")[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="or type an email..."
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
            {sendTest.isError && !testResult && (
              <p className="text-[10px] text-red-600">
                {formatError(sendTest.error)}
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

      </>
      )}

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
                sandbox="allow-scripts"
                title={`Preview: ${campaign.name}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Report file picker modal */}
      {showReportPicker && (
        <ReportFilePicker
          basePath={knowledgePath}
          currentPath={campaign.report_path || ""}
          onSelect={(relativePath) => {
            updateCampaign.mutate(
              { id: campaignId, updates: { report_path: relativePath || null, report_url: null, report_uploaded_at: null } },
              { onSuccess: () => setShowReportPicker(false) }
            );
          }}
          onClear={() => {
            updateCampaign.mutate(
              { id: campaignId, updates: { report_path: null, report_url: null, report_uploaded_at: null } },
              { onSuccess: () => setShowReportPicker(false) }
            );
          }}
          onClose={() => setShowReportPicker(false)}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 block mb-0.5">{label}</span>
      <span className="text-xs text-zinc-700 dark:text-zinc-300 block break-words">{value}</span>
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

// ── Report file picker ─────────────────────────────────────────────

function getReportFileIcon(name: string): LucideIcon {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["html", "htm"].includes(ext)) return FileText;
  return FileText;
}

function ReportPickerNode({
  node,
  level,
  basePath,
  onSelect,
}: {
  node: TreeNode;
  level: number;
  basePath: string;
  onSelect: (relativePath: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const indent = 12 + level * 16;

  const needsLazy = node.is_directory && node.children === null;
  const { data: lazyChildren, isLoading: lazyLoading } = useFolderChildren(
    node.path,
    expanded && needsLazy
  );

  if (node.is_directory) {
    const children = node.children ?? lazyChildren ?? [];
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
          style={{ paddingLeft: `${indent}px` }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? <FolderOpen size={14} className="text-amber-500 flex-shrink-0" /> : <Folder size={14} className="text-amber-500 flex-shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && (
          <div>
            {lazyLoading ? (
              <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${indent + 28}px` }}>
                <Loader2 size={12} className="text-zinc-400 animate-spin" />
              </div>
            ) : children.length > 0 ? (
              children
                .filter((c) => !c.name.startsWith("."))
                .sort((a, b) => {
                  if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((child) => (
                  <ReportPickerNode key={child.path} node={child} level={level + 1} basePath={basePath} onSelect={onSelect} />
                ))
            ) : (
              <div className="text-xs text-zinc-400 py-1" style={{ paddingLeft: `${indent + 28}px` }}>Empty</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Only show HTML files
  const ext = node.name.split(".").pop()?.toLowerCase() || "";
  if (!["html", "htm"].includes(ext)) return null;

  const Icon = getReportFileIcon(node.name);
  const relativePath = node.path.startsWith(basePath + "/")
    ? node.path.slice(basePath.length + 1)
    : node.path;

  return (
    <button
      onClick={() => onSelect(relativePath)}
      className="w-full flex items-center gap-1.5 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 hover:text-teal-700 dark:hover:text-teal-300 transition-colors text-left"
      style={{ paddingLeft: `${indent + 16}px` }}
    >
      <Icon size={14} className="flex-shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function ReportFilePicker({
  basePath,
  currentPath,
  onSelect,
  onClear,
  onClose,
}: {
  basePath: string;
  currentPath: string;
  onSelect: (relativePath: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { data: tree, isLoading: treeLoading } = useFileTree(basePath, 3);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Select Report File</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
              <X size={14} />
            </button>
          </div>
          {currentPath && (
            <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 truncate flex-1 mr-2" title={currentPath}>
                Current: {currentPath.split("/").pop()}
              </span>
              <button
                onClick={onClear}
                className="text-[10px] text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium"
              >
                Remove
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto py-1">
            {treeLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="text-zinc-400 animate-spin" />
              </div>
            ) : tree?.children ? (
              tree.children
                .filter((c) => !c.name.startsWith("."))
                .sort((a, b) => {
                  if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((node) => (
                  <ReportPickerNode key={node.path} node={node} level={0} basePath={basePath} onSelect={onSelect} />
                ))
            ) : (
              <p className="text-sm text-zinc-400 text-center py-8">No files found</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EditableCategory({
  value,
  suggestions,
  onSave,
}: {
  value: string;
  suggestions: string[];
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleCommit = () => {
    setEditing(false);
    if (draft.trim() !== value) {
      onSave(draft.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCommit();
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  };

  return (
    <div>
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 block mb-0.5">Category</span>
      {editing ? (
        <>
          <input
            ref={inputRef}
            type="text"
            list="campaign-categories-detail"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Reports, Newsletter"
            className="text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <datalist id="campaign-categories-detail">
            {suggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 hover:underline decoration-dashed underline-offset-2 cursor-text block"
          title={value || "Click to set category"}
        >
          {value || "—"}
        </button>
      )}
    </div>
  );
}

function EditableBcc({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const { data: allContacts = [] } = useEmailContacts();
  const thinkvalContacts = useMemo(
    () => allContacts.filter((c: EmailContact) => c.email.endsWith("@thinkval.com")),
    [allContacts]
  );

  return (
    <div>
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 block mb-0.5">BCC</span>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        className="text-xs text-zinc-700 dark:text-zinc-300 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 w-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="">— none</option>
        {thinkvalContacts.map((c: EmailContact) => (
          <option key={c.id} value={c.email}>
            {c.first_name ? `${c.first_name}` : c.email.split("@")[0]} ({c.email})
          </option>
        ))}
      </select>
    </div>
  );
}

function EditableGroup({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const { data: groups = [] } = useEmailGroups();

  return (
    <div>
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 block mb-0.5">Group</span>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        className="text-xs text-zinc-700 dark:text-zinc-300 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 w-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="">— none</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
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
