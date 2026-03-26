// src/components/emails/EmailsPanel.tsx
// Universal email panel — attach to any entity (project, task, company, contact)
// Shows linked emails + scan button to discover and attach new ones

import { useState, useMemo } from "react";
import { Mail, Search, X, Unlink, Loader2, Send } from "lucide-react";
import {
  useLinkedEmails,
  useScanEmails,
  useLinkEmails,
  useUnlinkEmail,
  type LinkedEmail,
} from "../../hooks/email/useEntityEmails";
import { EmailDetailPanel } from "./EmailDetailPanel";
import { toast } from "../../stores/toastStore";

interface EmailsPanelProps {
  entityType: "project" | "task" | "company" | "contact";
  entityId: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function MatchBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const labels: Record<string, { label: string; color: string }> = {
    auto_contact: { label: "Contact", color: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/30" },
    auto_domain: { label: "Domain", color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30" },
    auto_campaign: { label: "Campaign", color: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30" },
    auto_keyword: { label: "Keyword", color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30" },
    manual: { label: "Manual", color: "text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-800" },
  };
  const config = labels[method] || labels.manual;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config!.color}`}>
      {config!.label}
    </span>
  );
}

function EmailRow({ email, onUnlink, onClick }: { email: LinkedEmail; onUnlink: (id: string) => void; onClick: () => void }) {
  return (
    <div
      className="group flex items-start gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="mt-0.5">
        {email.email_type === "campaign" ? (
          <Send size={13} className="text-purple-400" />
        ) : (
          <Mail size={13} className="text-zinc-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
            {email.subject || "(no subject)"}
          </span>
          <MatchBadge method={email.match_method} />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
          <span className="truncate">
            {email.from_name || email.from_email}
            {email.to_emails?.length > 0 && (
              <span className="text-zinc-300 dark:text-zinc-600">
                {" → "}
                {email.to_emails.slice(0, 2).map(r => r.name || r.email).join(", ")}
                {email.to_emails.length > 2 && ` +${email.to_emails.length - 2}`}
              </span>
            )}
          </span>
          <span className="shrink-0">{formatDate(email.received_at)}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onUnlink(email.id); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-300 hover:text-red-500 transition-all"
        title="Unlink email"
      >
        <Unlink size={12} />
      </button>
    </div>
  );
}

export function EmailsPanel({ entityType, entityId }: EmailsPanelProps) {
  const { data: linkedEmails, isLoading } = useLinkedEmails(entityType, entityId);
  const { data: scanResults, refetch: runScan, isFetching: isScanning } = useScanEmails(entityType, entityId);
  const linkMutation = useLinkEmails();
  const unlinkMutation = useUnlinkEmail();

  const [showScan, setShowScan] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lookbackMonths, setLookbackMonths] = useState(3);
  const [selectedEmail, setSelectedEmail] = useState<LinkedEmail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter linked emails by search query
  const filteredEmails = useMemo(() => {
    if (!linkedEmails) return [];
    if (!searchQuery.trim()) return linkedEmails;
    const q = searchQuery.toLowerCase();
    return linkedEmails.filter(
      (e) =>
        (e.subject || "").toLowerCase().includes(q) ||
        (e.from_name || "").toLowerCase().includes(q) ||
        (e.from_email || "").toLowerCase().includes(q)
    );
  }, [linkedEmails, searchQuery]);

  async function handleScan() {
    setShowScan(true);
    setSelected(new Set());
    await runScan();
  }

  async function handleLinkSelected() {
    const candidates = (scanResults ?? []).filter(
      (c) => selected.has(c.email_id) && !c.already_linked
    );
    if (!candidates.length) return;

    try {
      await linkMutation.mutateAsync({
        emails: candidates,
        entityType,
        entityId,
      });
      toast.success(`Linked ${candidates.length} emails`);
      setShowScan(false);
      setSelected(new Set());
    } catch {
      toast.error("Failed to link emails");
    }
  }

  async function handleLinkAll() {
    const candidates = (scanResults ?? []).filter((c) => !c.already_linked);
    if (!candidates.length) return;

    try {
      await linkMutation.mutateAsync({
        emails: candidates,
        entityType,
        entityId,
      });
      toast.success(`Linked ${candidates.length} emails`);
      setShowScan(false);
    } catch {
      toast.error("Failed to link emails");
    }
  }

  async function handleUnlink(linkId: string) {
    try {
      await unlinkMutation.mutateAsync(linkId);
      toast.success("Email unlinked");
    } catch {
      toast.error("Failed to unlink email");
    }
  }

  function toggleSelect(emailId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }

  // Filter scan results by lookback period and exclude already-linked
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);
  const newCandidates = (scanResults ?? []).filter(
    (c) =>
      !c.already_linked &&
      (!c.received_at || new Date(c.received_at) >= cutoffDate)
  );

  const correspondenceEmails = filteredEmails.filter((e) => e.email_type === "correspondence");
  const campaignEmails = filteredEmails.filter((e) => e.email_type === "campaign");

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {linkedEmails?.length ?? 0} linked emails
          {searchQuery && ` (${filteredEmails.length} shown)`}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={lookbackMonths}
            onChange={(e) => setLookbackMonths(parseInt(e.target.value))}
            className="text-[10px] px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          >
            <option value={1}>Last 1 month</option>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={999}>All time</option>
          </select>
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400 dark:hover:bg-teal-900/50 transition-colors disabled:opacity-50"
          >
            {isScanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Scan
          </button>
        </div>
      </div>

      {/* Search bar — only show when there are enough emails */}
      {(linkedEmails?.length ?? 0) > 0 && (
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search emails..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scan results overlay */}
      {showScan && (
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {isScanning
                ? "Scanning..."
                : `${newCandidates.length} new matches found`}
            </span>
            <div className="flex items-center gap-2">
              {newCandidates.length > 0 && (
                <>
                  <button
                    onClick={handleLinkSelected}
                    disabled={selected.size === 0 || linkMutation.isPending}
                    className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-30 transition-colors"
                  >
                    Link Selected ({selected.size})
                  </button>
                  <button
                    onClick={handleLinkAll}
                    disabled={linkMutation.isPending}
                    className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-30 transition-colors"
                  >
                    Link All ({newCandidates.length})
                  </button>
                </>
              )}
              <button
                onClick={() => setShowScan(false)}
                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Candidate list */}
          <div className="max-h-64 overflow-auto">
            {isScanning ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-zinc-400" />
              </div>
            ) : newCandidates.length === 0 ? (
              <p className="text-center text-xs text-zinc-400 py-6">
                No new emails found for this {entityType}
              </p>
            ) : (
              newCandidates.map((c) => (
                <label
                  key={c.email_id}
                  className="flex items-start gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.email_id)}
                    onChange={() => toggleSelect(c.email_id)}
                    className="mt-1 rounded border-zinc-300 dark:border-zinc-600 text-teal-600 focus:ring-teal-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {c.subject || "(no subject)"}
                      </span>
                      <MatchBadge method={c.match_method} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                      <span>{c.from_name || c.from_email}</span>
                      <span>{formatDate(c.received_at)}</span>
                      {c.email_type === "campaign" && (
                        <span className="flex items-center gap-0.5">
                          <Send size={10} /> EDM
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {/* Linked emails list — grouped by type */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : !filteredEmails.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-500">
            <Mail size={32} className="mb-2 opacity-40" />
            {searchQuery ? (
              <p className="text-sm">No emails matching "{searchQuery}"</p>
            ) : (
              <>
                <p className="text-sm">No emails linked</p>
                <p className="text-xs mt-1">Click "Scan Emails" to find matches</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Correspondence section */}
            {correspondenceEmails.length > 0 && (
              <div>
                <div className="sticky top-0 z-10 flex items-center gap-1.5 px-4 py-1.5 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800/50">
                  <Mail size={11} className="text-zinc-400" />
                  <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    Correspondence
                  </span>
                  <span className="text-[10px] text-zinc-300 dark:text-zinc-600">
                    ({correspondenceEmails.length})
                  </span>
                </div>
                {correspondenceEmails.map((email) => (
                  <EmailRow key={email.id} email={email} onUnlink={handleUnlink} onClick={() => setSelectedEmail(email)} />
                ))}
              </div>
            )}

            {/* Campaigns section */}
            {campaignEmails.length > 0 && (
              <div>
                <div className="sticky top-0 z-10 flex items-center gap-1.5 px-4 py-1.5 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800/50">
                  <Send size={11} className="text-purple-400" />
                  <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    Campaigns
                  </span>
                  <span className="text-[10px] text-zinc-300 dark:text-zinc-600">
                    ({campaignEmails.length})
                  </span>
                </div>
                {campaignEmails.map((email) => (
                  <EmailRow key={email.id} email={email} onUnlink={handleUnlink} onClick={() => setSelectedEmail(email)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail slide-over */}
      <EmailDetailPanel
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </div>
  );
}
