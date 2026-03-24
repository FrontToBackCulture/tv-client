// Prospect detail panel — contact info, stage, drafts, sent history + tracking

import { useState, useEffect } from "react";
import { X, Send, FlaskConical, Trash2, Mail, ChevronRight, ExternalLink, UserMinus } from "lucide-react";
import { cn } from "../../lib/cn";
import { toast } from "../../stores/toastStore";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { crmKeys } from "../../hooks/crm/keys";
import { useEmailDrafts, useSendDraft, useDeleteDraft, useUpdateDraft, useDraftTracking } from "../../hooks/email/useDrafts";
import { useUpdateProspectStage } from "../../hooks/prospecting";
import { PROSPECT_STAGES, StageBadge, type ProspectStage } from "./ProspectingComponents";
import type { EmailDraft } from "../../hooks/email/useDrafts";

interface ProspectDetailPanelProps {
  contactId: string;
  onClose: () => void;
}

// ── Sent email row with tracking ──────────────────────────

function SentEmailRow({ email, isExpanded, onToggle }: {
  email: EmailDraft;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { data: tracking } = useDraftTracking(email.id, true);

  return (
    <div>
      <button onClick={onToggle} className="w-full text-left px-2 py-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group">
        <div className="flex items-center gap-2">
          <ChevronRight size={10} className={cn("text-zinc-400 transition-transform flex-shrink-0", isExpanded && "rotate-90")} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{email.subject}</div>
            <div className="text-[9px] text-zinc-400 mt-0.5">
              {email.sent_at
                ? new Date(email.sent_at).toLocaleDateString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                : new Date(email.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {tracking?.opened && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                title={tracking.openedAt ? `Opened ${new Date(tracking.openedAt).toLocaleString("en-SG")}` : ""}>
                Opened
              </span>
            )}
            {tracking?.clicks && tracking.clicks.length > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                {tracking.clicks.length} click{tracking.clicks.length !== 1 ? "s" : ""}
              </span>
            )}
            {!tracking?.opened && email.status === "sent" && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 font-medium">No open</span>
            )}
            {email.status === "failed" && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 font-medium">Failed</span>
            )}
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="ml-4 mt-1 mb-2 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
          <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] text-zinc-400 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
            <span>From: {email.from_name} &lt;{email.from_email}&gt;</span>
            {tracking?.opened && (
              <span className="text-blue-500">
                Opened {tracking.openedAt ? new Date(tracking.openedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
            )}
          </div>
          <iframe srcDoc={email.html_body} className="w-full border-0 bg-white dark:bg-zinc-900" style={{ height: "300px" }} sandbox="allow-same-origin" title={email.subject} />
          {tracking?.clicks && tracking.clicks.length > 0 && (
            <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700">
              <div className="text-[9px] font-medium text-zinc-400 mb-1">Link Clicks</div>
              {tracking.clicks.map((click, i) => (
                <div key={i} className="text-[9px] text-zinc-500 flex items-center gap-2 py-0.5">
                  <span className="text-zinc-400">{new Date(click.at).toLocaleDateString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <a href={click.url} target="_blank" rel="noopener noreferrer" className="text-teal-500 hover:text-teal-600 truncate">{click.url}</a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main detail panel ──────────────────────────

export function ProspectDetailPanel({ contactId, onClose }: ProspectDetailPanelProps) {
  const { data: contact, isLoading } = useQuery({
    queryKey: [...crmKeys.contact(contactId), "with-company"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("*, crm_companies(name, display_name)")
        .eq("id", contactId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: allDrafts = [] } = useEmailDrafts(contactId);
  const sendDraft = useSendDraft();
  const deleteDraft = useDeleteDraft();
  const updateDraft = useUpdateDraft();
  const updateStage = useUpdateProspectStage();

  const [draftTestEmail, setDraftTestEmail] = useState("");
  const [draftTestOpen, setDraftTestOpen] = useState<string | null>(null);
  const [expandedSent, setExpandedSent] = useState<string | null>(null);

  const pendingDrafts = allDrafts.filter(d => d.status === "draft");
  const sentEmails = allDrafts.filter(d => d.status === "sent" || d.status === "failed");

  // Auto-advance stage when draft is sent
  useEffect(() => {
    if (contact && sentEmails.length > 0 && contact.prospect_stage === "drafted") {
      updateStage.mutate({ contactId, stage: "sent" });
    }
  }, [sentEmails.length, contact?.prospect_stage]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xs text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!contact) return null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{contact.name}</h2>
            <button
              onClick={() => { navigator.clipboard.writeText(contact.id); toast.success("Contact ID copied"); }}
              className="font-mono text-[10px] text-zinc-300 dark:text-zinc-600 hover:text-teal-500 dark:hover:text-teal-400 transition-colors cursor-pointer"
              title={contact.id}
            >
              {contact.id.slice(0, 8)}
            </button>
          </div>
          <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={14} />
          </button>
        </div>
        {contact.role && <p className="text-[11px] text-zinc-500">{contact.role}</p>}
        <div className="flex items-center gap-2 mt-2">
          <select
            value={contact.prospect_stage || "new"}
            onChange={(e) => updateStage.mutate({ contactId, stage: e.target.value as ProspectStage })}
            className="text-[10px] px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {PROSPECT_STAGES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <StageBadge stage={contact.prospect_stage} />
          <button
            onClick={() => {
              if (confirm(`Remove ${contact.name} from pipeline?`)) {
                updateStage.mutate({ contactId, stage: null });
                onClose();
              }
            }}
            className="ml-auto p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Remove from pipeline"
          >
            <UserMinus size={14} />
          </button>
        </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Contact info */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Contact</div>
          <div className="grid grid-cols-[70px_1fr] gap-y-1 text-[11px]">
            <span className="text-zinc-400">Email</span>
            <a href={`mailto:${contact.email}`} className="text-teal-600 dark:text-teal-400 hover:underline truncate">{contact.email}</a>
            {contact.phone && <>
              <span className="text-zinc-400">Phone</span>
              <span className="text-zinc-700 dark:text-zinc-300">{contact.phone}</span>
            </>}
            <span className="text-zinc-400">Company</span>
            <span className="text-zinc-700 dark:text-zinc-300">{contact.crm_companies?.display_name || contact.crm_companies?.name || "—"}</span>
            {contact.linkedin_url && <>
              <span className="text-zinc-400">LinkedIn</span>
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 truncate">
                Profile <ExternalLink size={9} />
              </a>
            </>}
            {contact.email_status && <>
              <span className="text-zinc-400">Email status</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded w-fit",
                contact.email_status === "verified" ? "bg-green-100 dark:bg-green-900/30 text-green-600" :
                contact.email_status === "guessed" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" :
                "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              )}>{contact.email_status}</span>
            </>}
          </div>
        </div>

        {/* Pending Drafts */}
        {pendingDrafts.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Drafts ({pendingDrafts.length})
            </div>
            <div className="space-y-3">
              {pendingDrafts.map(draft => (
                <div key={draft.id} className="rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate flex-1 mr-2">{draft.subject}</div>
                      <button onClick={() => { if (confirm("Delete this draft?")) deleteDraft.mutate(draft.id); }}
                        className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex-shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="text-[10px] text-zinc-400">To: <span className="text-zinc-600 dark:text-zinc-300">{draft.to_email}</span></div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-zinc-400 flex-shrink-0">From:</span>
                      <input type="text" defaultValue={draft.from_name}
                        onBlur={(e) => { if (e.target.value !== draft.from_name) updateDraft.mutate({ draftId: draft.id, updates: { from_name: e.target.value } }); }}
                        className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 w-24" />
                      <span className="text-[10px] text-zinc-300 dark:text-zinc-600">&lt;</span>
                      <input type="email" defaultValue={draft.from_email}
                        onBlur={(e) => { if (e.target.value !== draft.from_email) updateDraft.mutate({ draftId: draft.id, updates: { from_email: e.target.value } }); }}
                        className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 flex-1 min-w-0" />
                      <span className="text-[10px] text-zinc-300 dark:text-zinc-600">&gt;</span>
                    </div>
                  </div>
                  <div className="border border-t-0 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <iframe srcDoc={draft.html_body} className="w-full border-0" style={{ height: "300px" }} sandbox="allow-same-origin" title={draft.subject} />
                  </div>
                  <div className="border border-t-0 border-zinc-200 dark:border-zinc-700 rounded-b-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="email" placeholder="Test email address..."
                        value={draftTestOpen === draft.id ? draftTestEmail : ""}
                        onFocus={() => { setDraftTestOpen(draft.id); if (!draftTestEmail) setDraftTestEmail(contact.email); }}
                        onChange={(e) => { setDraftTestOpen(draft.id); setDraftTestEmail(e.target.value); }}
                        className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                      <button onClick={() => {
                          const email = draftTestOpen === draft.id ? draftTestEmail : contact.email;
                          if (email) sendDraft.mutate({ draftId: draft.id, testEmail: email });
                        }} disabled={sendDraft.isPending}
                        className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                        <FlaskConical size={10} /> Send Test
                      </button>
                    </div>
                    <button onClick={() => { if (confirm(`Send to ${draft.to_email}?`)) sendDraft.mutate({ draftId: draft.id }); }}
                      disabled={sendDraft.isPending}
                      className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 transition-colors">
                      <Send size={12} /> Send to {draft.to_email}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sent Emails */}
        {sentEmails.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              <Mail size={10} className="inline mr-1 -mt-0.5" />
              Sent ({sentEmails.length})
            </div>
            <div className="space-y-0.5">
              {sentEmails.map(email => (
                <SentEmailRow
                  key={email.id}
                  email={email}
                  isExpanded={expandedSent === email.id}
                  onToggle={() => setExpandedSent(expandedSent === email.id ? null : email.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {pendingDrafts.length === 0 && sentEmails.length === 0 && (
          <div className="text-center py-8 text-xs text-zinc-400">
            No emails yet — draft one via bot to get started
          </div>
        )}
      </div>
    </div>
  );
}
