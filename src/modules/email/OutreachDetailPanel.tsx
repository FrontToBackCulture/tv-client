// src/modules/email/OutreachDetailPanel.tsx
// Detail panel for reviewing an outreach email draft — shows AI context, email preview,
// approve/skip/edit actions, and tracking data after send.

import { useState } from "react";
import { X, Send, SkipForward, ChevronDown, ChevronRight, ExternalLink, Pencil, TestTube, Linkedin, Check, Copy, Trash2 } from "lucide-react";
import { useOutreachDrafts, useApproveOutreach, useSkipOutreach } from "../../hooks/email";
import { useDeleteDraft } from "../../hooks/email/useDrafts";
import { supabase } from "../../lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { outreachKeys } from "../../hooks/email/useOutreachDrafts";
import { useApproveLinkedIn, useUpdateLinkedInMsg } from "../../hooks/email/useOutreachDrafts";
import { useUpdateDraft, useDraftTracking } from "../../hooks/email/useDrafts";
import { cn } from "../../lib/cn";
import type { OutreachDraft } from "../../hooks/email/useOutreachDrafts";

// ─── Panel ───────────────────────────────────────────────────────────────────

interface OutreachDetailPanelProps {
  draftId: string;
  onClose: () => void;
}

export function OutreachDetailPanel({ draftId, onClose }: OutreachDetailPanelProps) {
  const { data: drafts = [] } = useOutreachDrafts();
  const draft = drafts.find((d) => d.id === draftId) as OutreachDraft | undefined;

  const approve = useApproveOutreach();
  const skip = useSkipOutreach();
  const updateDraft = useUpdateDraft();
  const deleteDraft = useDeleteDraft();

  const approveLinkedIn = useApproveLinkedIn();
  const updateLinkedInMsg = useUpdateLinkedInMsg();

  const [showContext, setShowContext] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingLinkedIn, setEditingLinkedIn] = useState(false);
  const [editLinkedInMsg, setEditLinkedInMsg] = useState("");
  const [copiedLinkedIn, setCopiedLinkedIn] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [testEmail, setTestEmail] = useState("melvin@thinkval.ai");
  const [showTestSend, setShowTestSend] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const { data: tracking } = useDraftTracking(
    draftId,
    draft?.status === "approved" || draft?.status === "sent"
  );

  const queryClient = useQueryClient();

  const markEmailSent = useMutation({
    mutationFn: async () => {
      await supabase.from("email_drafts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", draftId);
      if (draft?.contact_id) {
        await supabase.from("crm_contacts").update({ prospect_stage: "sent" }).eq("id", draft.contact_id);
      }
      if (draft?.company_id) {
        await supabase.from("crm_companies").update({ outreach_status: "contacted" }).eq("id", draft.company_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });

  const cloneAndTest = useMutation({
    mutationFn: async (toEmail: string) => {
      if (!draft) throw new Error("No draft");
      const { data: clone, error: cloneErr } = await supabase
        .from("email_drafts")
        .insert({
          contact_id: draft.contact_id,
          company_id: draft.company_id,
          to_email: toEmail,
          subject: `[TEST] ${draft.subject}`,
          html_body: draft.html_body,
          from_name: draft.from_name,
          from_email: draft.from_email,
          draft_type: "outreach",
          context: { ...(draft.context || {}), is_test_clone: true, original_draft_id: draftId },
        })
        .select()
        .single();
      if (cloneErr) throw cloneErr;
      await approve.mutateAsync(clone.id);
      return clone;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
      setShowTestSend(false);
    },
  });

  if (!draft) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-zinc-400">
        Draft not found
      </div>
    );
  }

  const contactName = draft.crm_contacts?.name || draft.to_email;
  const companyName = draft.crm_companies?.name;
  const isPending = draft.status === "draft";
  const linkedInMsg = draft.crm_contacts?.linkedin_connect_msg;
  const linkedInStatus = draft.crm_contacts?.linkedin_connect_status;
  const contactId = draft.contact_id;

  const handleApprove = async () => {
    await approve.mutateAsync(draftId);
    setConfirmApprove(false);
  };

  const handleSkip = async () => {
    await skip.mutateAsync(draftId);
  };

  const handleStartEdit = () => {
    setEditSubject(draft.subject);
    setEditBody(draft.html_body);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    await updateDraft.mutateAsync({
      draftId,
      updates: { subject: editSubject, html_body: editBody },
    });
    setEditing(false);
  };

  const handleApproveLinkedIn = async () => {
    if (!contactId) return;
    await approveLinkedIn.mutateAsync({ contactId, status: "approved" });
  };

  const handleSaveLinkedIn = async () => {
    if (!contactId) return;
    await updateLinkedInMsg.mutateAsync({ contactId, msg: editLinkedInMsg });
    setEditingLinkedIn(false);
  };

  const handleCopyLinkedIn = () => {
    if (linkedInMsg) {
      navigator.clipboard.writeText(linkedInMsg);
      setCopiedLinkedIn(true);
      setTimeout(() => setCopiedLinkedIn(false), 2000);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("en-SG", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Send size={14} className="flex-shrink-0 text-zinc-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
              {contactName}
            </h2>
            {companyName && (
              <p className="text-[10px] text-zinc-400 truncate">{companyName}</p>
            )}
          </div>
        </div>
        <button onClick={async () => { await deleteDraft.mutateAsync(draftId); onClose(); }} className="p-1 text-zinc-400 hover:text-red-500 rounded transition-colors" title="Delete draft">
          <Trash2 size={14} />
        </button>
        <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Content — flex column to let preview grow */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 p-4 pb-2 space-y-4">
          {/* Status + metadata */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={draft.status} />
              <span className="text-[10px] text-zinc-400">{formatDate(draft.created_at)}</span>
            </div>
            <div className="space-y-1">
              <DetailRow label="To" value={draft.to_email} />
              <DetailRow label="From" value={`${draft.from_name} <${draft.from_email}>`} />
            </div>
          </div>

          {/* AI Context */}
          {draft.context && Object.keys(draft.context).length > 0 && (
            <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <button
                onClick={() => setShowContext(!showContext)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
              >
                {showContext ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                AI Research Context
              </button>
              {showContext && (
                <div className="px-3 pb-3 space-y-1.5">
                  {Object.entries(draft.context).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 uppercase">
                        {key.replace(/_/g, " ")}
                      </span>
                      <p className="text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Email preview — fills remaining height */}
        <div className="flex-1 mx-4 mb-2 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col min-h-0">
          {/* Subject */}
          <div className="flex-shrink-0 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            {editing ? (
              <input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="w-full text-[11px] font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            ) : (
              <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                {draft.subject}
              </p>
            )}
          </div>

          {/* Body — grows to fill */}
          {editing ? (
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="flex-1 w-full text-[11px] font-mono bg-white dark:bg-zinc-950 border-0 p-3 text-zinc-700 dark:text-zinc-300 focus:outline-none resize-none"
            />
          ) : (
            <iframe
              srcDoc={draft.html_body}
              className="flex-1 w-full border-0 bg-white"
              sandbox="allow-same-origin"
            />
          )}
        </div>

        {/* LinkedIn connect message */}
        {linkedInMsg && (
          <div className="flex-shrink-0 mx-4 mb-2 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50 dark:bg-blue-950/20 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-1.5">
                <Linkedin size={12} className="text-blue-600" />
                <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">LinkedIn Connect</span>
              </div>
              <div className="flex items-center gap-1">
                {linkedInStatus && (
                  <span className={cn("text-[8px] px-1.5 py-0.5 rounded-full font-medium",
                    linkedInStatus === "draft" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                    linkedInStatus === "approved" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" :
                    "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                  )}>
                    {linkedInStatus}
                  </span>
                )}
                <span className="text-[9px] text-zinc-400">{linkedInMsg.length}/300</span>
              </div>
            </div>
            <div className="px-3 py-2">
              {editingLinkedIn ? (
                <div className="space-y-2">
                  <textarea
                    value={editLinkedInMsg}
                    onChange={(e) => setEditLinkedInMsg(e.target.value.slice(0, 300))}
                    rows={3}
                    maxLength={300}
                    className="w-full text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveLinkedIn} disabled={updateLinkedInMsg.isPending}
                      className="px-2.5 py-1 text-[10px] font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                      Save
                    </button>
                    <button onClick={() => setEditingLinkedIn(false)}
                      className="px-2.5 py-1 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{linkedInMsg}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    {linkedInStatus === "draft" && (
                      <button onClick={handleApproveLinkedIn} disabled={approveLinkedIn.isPending}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                        <Check size={10} /> Approve
                      </button>
                    )}
                    {linkedInStatus === "approved" && (
                      <button onClick={async () => { if (contactId) await approveLinkedIn.mutateAsync({ contactId, status: "sent" }); }}
                        disabled={approveLinkedIn.isPending}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
                        <Check size={10} /> Mark Sent
                      </button>
                    )}
                    <button onClick={handleCopyLinkedIn}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
                      <Copy size={10} /> {copiedLinkedIn ? "Copied!" : "Copy"}
                    </button>
                    {linkedInStatus !== "sent" && (
                      <button onClick={() => { setEditLinkedInMsg(linkedInMsg); setEditingLinkedIn(true); }}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
                        <Pencil size={10} /> Edit
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions — fixed at bottom */}
        <div className="flex-shrink-0 px-4 pb-4 space-y-2">
          {/* Actions */}
          {isPending && (
            <div className="space-y-2">
              {editing ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={updateDraft.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {/* Approve → Outlook */}
                  {confirmApprove ? (
                    <div className="flex items-center gap-2 p-2 bg-teal-50 dark:bg-teal-950/20 rounded-lg">
                      <p className="flex-1 text-[10px] text-teal-700 dark:text-teal-400">
                        Push to Outlook as draft?
                      </p>
                      <button
                        onClick={handleApprove}
                        disabled={approve.isPending}
                        className="px-2.5 py-1 text-[10px] font-semibold bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50"
                      >
                        {approve.isPending ? "Pushing..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmApprove(false)}
                        className="px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmApprove(true)}
                      className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-md bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                    >
                      <Send size={12} />
                      Approve &rarr; Outlook
                    </button>
                  )}

                  {/* Secondary actions row */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartEdit}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <Pencil size={10} />
                      Edit
                    </button>
                    <button
                      onClick={() => setShowTestSend(!showTestSend)}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <TestTube size={10} />
                      Clone &amp; Test
                    </button>
                    <button
                      onClick={handleSkip}
                      disabled={skip.isPending}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <SkipForward size={10} />
                      Skip
                    </button>
                  </div>

                  {/* Clone & test input */}
                  {showTestSend && (
                    <div className="flex gap-2 items-center">
                      <input
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="melvin@thinkval.ai"
                        className="flex-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <button
                        onClick={() => cloneAndTest.mutate(testEmail)}
                        disabled={cloneAndTest.isPending || !testEmail}
                        className="px-2.5 py-1.5 text-[10px] font-semibold bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-md hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
                      >
                        {cloneAndTest.isPending ? "Cloning..." : "Clone & Send"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Mark as sent (after approved → pushed to Outlook) */}
          {draft.status === "approved" && (
            <button
              onClick={() => markEmailSent.mutate()}
              disabled={markEmailSent.isPending}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Check size={12} />
              {markEmailSent.isPending ? "Updating..." : "Mark Email as Sent"}
            </button>
          )}

          {/* Tracking section (after approval/send) */}
          {(draft.status === "approved" || draft.status === "sent") && tracking && (
            <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <div className="px-3 py-2 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Tracking
              </div>
              <div className="px-3 pb-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400 w-12">Open</span>
                  {tracking.opened ? (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                      Opened {tracking.openedAt && `at ${formatDate(tracking.openedAt)}`}
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-400">Not opened yet</span>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-zinc-400 w-12 mt-0.5">Clicks</span>
                  {tracking.clicks.length > 0 ? (
                    <div className="space-y-1">
                      {tracking.clicks.map((click, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <ExternalLink size={8} className="text-purple-500 flex-shrink-0" />
                          <span className="text-[10px] text-zinc-600 dark:text-zinc-300 truncate max-w-[200px]">
                            {click.url}
                          </span>
                          <span className="text-[9px] text-zinc-400">
                            {formatDate(click.at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-zinc-400">No clicks yet</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 w-10 flex-shrink-0">{label}</span>
      <span className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Pending Review" },
    approved: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "In Outlook" },
    sent: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Sent" },
    failed: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Failed" },
    skipped: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400", label: "Skipped" },
  };
  const c = config[status] || config.draft;
  return (
    <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-medium", c.bg, c.text)}>
      {c.label}
    </span>
  );
}
