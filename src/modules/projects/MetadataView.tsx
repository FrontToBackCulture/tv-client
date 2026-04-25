// MetadataView — AG Grid tables for Companies, Initiatives, Labels, Users
// Double-click row → detail panel on right

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef, ColumnState, ModuleRegistry, AllCommunityModule, CellValueChangedEvent, GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  Search, Download, FileSpreadsheet, Maximize2, X, RotateCcw,
  Building2, Target, Tag, Bot, Trash2, User, Send, FlaskConical, Mail, Handshake,
  Bookmark, ChevronsLeftRight, Columns, Star, Save, WrapText, PanelLeftOpen, PanelLeftClose, Globe, AlertTriangle,
} from "lucide-react";
import { useCollapsiblePanel } from "../../hooks/useCollapsiblePanel";
import { cn } from "../../lib/cn";
import { toSGTDateString } from "../../lib/date";
import { Button } from "../../components/ui";
import { useAppStore } from "../../stores/appStore";
import { toast } from "../../stores/toastStore";
import { groupRowStyles, themeStyles } from "../domains/reviewGridStyles";
import { supabase } from "../../lib/supabase";
import { useCompanies } from "../../hooks/crm/useCompanies";
import { useContacts } from "../../hooks/crm/useContacts";
import { useActivities } from "../../hooks/crm/useActivities";
import { useInitiatives, useLabels, useUsers } from "../../hooks/work";
import { COMPANY_STAGES, ACTIVITY_TYPES } from "../../lib/crm/types";
import { useAllLookupValues } from "../../hooks/useLookupValues";
import { Settings, ChevronRight, RefreshCw, Tags, Plus } from "lucide-react";
import { useApolloRevealPhone } from "../../hooks/apollo/useApollo";
import { useEmailDrafts, useSendDraft, useDeleteDraft, useUpdateDraft, useDraftTracking } from "../../hooks/email/useDrafts";
import {
  useGridLayouts,
  useSaveGridLayout,
  useDeleteGridLayout,
  useSetDefaultGridLayout,
  type GridLayout,
} from "../../hooks/useGridLayouts";

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);
if (typeof window !== "undefined" && import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
}

// ── Inline editable field for detail panel ──────────────────────────────────

function EditField({ value, onSave, type = "text", options }: {
  value: string | number | boolean | null | undefined;
  onSave: (val: string) => void;
  type?: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const ref = useRef<any>(null);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  if (!editing) {
    return (
      <button onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
        className="text-left w-full min-h-[20px] cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/20 rounded px-1.5 py-0.5 -mx-1 transition-colors border border-transparent hover:border-teal-200 dark:hover:border-teal-800">
        {value != null && value !== "" ? <span className="text-zinc-700 dark:text-zinc-300">{String(value)}</span> : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
      </button>
    );
  }
  const save = () => { setEditing(false); if (draft !== String(value ?? "")) onSave(draft); };
  if (type === "select" && options) {
    return <select ref={ref} value={draft} onChange={(e) => { onSave(e.target.value); setEditing(false); }} onBlur={() => setEditing(false)}
      className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none w-full">
      <option value="">—</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>;
  }
  if (type === "textarea") {
    return <textarea ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
      rows={3} className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none w-full resize-none" />;
  }
  return <input ref={ref} type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
    onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
    className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none w-full" />;
}

// ── Mini folder tree for picker ────────────────────────────────────────────

// FolderPickerField is now shared — see src/components/ui/FolderPickerField.tsx
import { FolderPickerField } from "../../components/ui/FolderPickerField";

// ── Email domains field with auto-populate from contacts ──────────────────

function EmailDomainsField({ value, companyId, contacts, onSave }: {
  value: string | null | undefined;
  companyId: string;
  contacts: { email: string; company_id: string; is_active?: boolean }[];
  onSave: (val: string) => void;
}) {
  const [syncing, setSyncing] = useState(false);

  async function autoPopulate() {
    setSyncing(true);
    try {
      const companyContacts = contacts.filter(c => c.company_id === companyId && c.is_active !== false);
      const domains = new Set<string>();
      for (const c of companyContacts) {
        if (c.email) {
          const domain = c.email.split("@")[1]?.toLowerCase();
          if (domain && !domain.includes("gmail.com") && !domain.includes("yahoo.") && !domain.includes("hotmail.") && !domain.includes("outlook.com") && !domain.includes("icloud.com")) {
            domains.add(domain);
          }
        }
      }
      if (domains.size === 0) {
        toast.error("No corporate email domains found in contacts");
        return;
      }
      const domainArray = Array.from(domains).sort();
      await supabase.from("crm_companies").update({
        email_domains: domainArray,
        updated_at: new Date().toISOString(),
      }).eq("id", companyId);
      onSave(domainArray.join(", "));
      toast.success(`Updated: ${domainArray.join(", ")}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <EditField value={value} onSave={onSave} />
      <button
        onClick={autoPopulate}
        disabled={syncing}
        className="p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-teal-500 transition-colors shrink-0 disabled:opacity-50"
        title="Auto-populate from contacts' emails"
      >
        <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

type FieldType = "text" | "textarea" | "select" | "folder_picker" | "email_domains" | "readonly";

function RequestPhoneButton({ contactId, onSuccess }: { contactId: string; onSuccess: () => void }) {
  const revealPhone = useApolloRevealPhone();
  return (
    <button
      onClick={() => revealPhone.mutate(contactId, { onSuccess })}
      disabled={revealPhone.isPending}
      className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 disabled:opacity-50"
      title="Request phone number from Apollo (1 mobile credit)"
    >
      {revealPhone.isPending ? (
        <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="14" y1="2" x2="14" y2="8"/><line x1="17" y1="5" x2="11" y2="5"/></svg>
      )}
      Request Phone (1 credit)
      {revealPhone.isSuccess && <span className="text-green-500 ml-1">Requested — arriving shortly</span>}
      {revealPhone.isError && <span className="text-red-500 ml-1">{(revealPhone.error as Error)?.message || "Failed"}</span>}
    </button>
  );
}

function FieldGrid({ fields, onUpdate, companyId, contacts }: {
  fields: { label: string; field: string; value: any; type?: FieldType; options?: { value: string; label: string }[] }[];
  onUpdate: (field: string, value: any) => void;
  companyId?: string;
  contacts?: { email: string; company_id: string }[];
}) {
  return (
    <div className="space-y-1 text-xs max-w-lg">
      {fields.map(({ label, field, value, type, options }) => (
        <div key={field} className="grid grid-cols-[120px,1fr] gap-2 items-start">
          <span className="text-zinc-400 py-1">{label}</span>
          {type === "readonly" ? (
            <span className="py-1 text-zinc-600 dark:text-zinc-400">{value || "—"}</span>
          ) : type === "folder_picker" ? (
            <FolderPickerField value={value} onSave={(v) => onUpdate(field, v || null)} />
          ) : type === "email_domains" && companyId && contacts ? (
            <EmailDomainsField value={value} companyId={companyId} contacts={contacts as any} onSave={(v) => onUpdate(field, v || null)} />
          ) : (
            <EditField value={value} type={type as any} options={options} onSave={(v) => onUpdate(field, v || null)} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Sub-tab type ────────────────────────────────────────────────────────────

type SubTab = "companies" | "contacts" | "initiatives" | "labels" | "users" | "partners"
  | "deal_stage" | "deal_solution" | "company_stage" | "activity_type" | "project_status" | "project_health" | "project_type"
  | "domain_type" | "initiative_status" | "task_status_type" | "task_statuses";

// ── Sent email row with tracking ─────────────────────────────────────────────

import type { EmailDraft } from "../../hooks/email/useDrafts";

function SentEmailRow({ email, isExpanded, onToggle }: {
  email: EmailDraft;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { data: tracking } = useDraftTracking(email.id, true);

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left px-2 py-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <ChevronRight size={10} className={cn(
            "text-zinc-400 transition-transform flex-shrink-0",
            isExpanded && "rotate-90"
          )} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{email.subject}</span>
              {email.status === "failed" && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-500 font-medium flex-shrink-0">Failed</span>
              )}
            </div>
            <div className="text-[9px] text-zinc-400 mt-0.5 flex items-center gap-1.5">
              <span>
                {email.sent_at
                  ? new Date(email.sent_at).toLocaleDateString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                  : new Date(email.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" })
                }
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span>{email.to_email}</span>
            </div>
          </div>
          {/* Tracking indicators */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {tracking?.opened && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium" title={`Opened ${tracking.openedAt ? new Date(tracking.openedAt).toLocaleString("en-SG") : ""}`}>
                Opened
              </span>
            )}
            {tracking?.clicks && tracking.clicks.length > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium" title={`${tracking.clicks.length} click(s)`}>
                {tracking.clicks.length} click{tracking.clicks.length !== 1 ? "s" : ""}
              </span>
            )}
            {!tracking?.opened && email.status === "sent" && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 font-medium">
                No open
              </span>
            )}
          </div>
        </div>
      </button>
      {/* Expanded preview + tracking details */}
      {isExpanded && (
        <div className="ml-4 mt-1 mb-2 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
          <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span>From: {email.from_name} &lt;{email.from_email}&gt;</span>
            {tracking?.opened && (
              <span className="text-blue-500">
                Opened {tracking.openedAt ? new Date(tracking.openedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
            )}
          </div>
          <iframe
            srcDoc={email.html_body}
            className="w-full border-0 bg-white dark:bg-zinc-900"
            style={{ height: "300px" }}
            sandbox="allow-same-origin"
            title={`Sent: ${email.subject}`}
          />
          {/* Click tracking details */}
          {tracking?.clicks && tracking.clicks.length > 0 && (
            <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800">
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

// ── Main component ──────────────────────────────────────────────────────────

export function MetadataView() {
  const theme = useAppStore((s) => s.theme);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useCollapsiblePanel("tv-metadata-sidebar-collapsed");
  const [subTab, setSubTab] = useState<SubTab>("companies");
  const [quickFilter, setQuickFilter] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wrapNotes, setWrapNotes] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addDialogLabel, setAddDialogLabel] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  // Supabase-backed shared layouts — one grid_key per sub-tab so each entity
  // grid has its own saved views (layouts are shared across all users).
  const gridKey = `metadata-${subTab}`;
  const { data: layouts = [], isFetched: layoutsFetched } = useGridLayouts(gridKey);
  const saveLayoutMutation = useSaveGridLayout(gridKey);
  const deleteLayoutMutation = useDeleteGridLayout(gridKey);
  const setDefaultMutation = useSetDefaultGridLayout(gridKey);
  const layoutsByName = useMemo(() => {
    const m: Record<string, GridLayout> = {};
    for (const l of layouts) m[l.name] = l;
    return m;
  }, [layouts]);
  const defaultLayout = useMemo(() => layouts.find((l) => l.is_default) ?? null, [layouts]);
  const [activeLayoutName, setActiveLayoutName] = useState<string | null>(null);
  const [layoutModified, setLayoutModified] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);
  const [selection, setSelection] = useState<{ type: string; id: string } | null>(null);
  const [detailWidth, setDetailWidth] = useState(400);
  const dragging = useRef(false);

  const gridRef = useRef<AgGridReact>(null);

  const { data: companies = [], refetch: refetchCompanies } = useCompanies();
  const { data: contacts = [], refetch: refetchContacts } = useContacts();
  const { data: initiatives = [], refetch: refetchInitiatives } = useInitiatives();
  const { data: labels = [], refetch: refetchLabels } = useLabels();
  const { data: users = [], refetch: refetchUsers } = useUsers();

  const { data: lookupValues = [], refetch: refetchLookups } = useAllLookupValues();

  const { data: partners = [], refetch: refetchPartners } = useQuery({
    queryKey: ["partner-access"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partner_access").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: taskStatuses = [], refetch: refetchTaskStatuses } = useQuery({
    queryKey: ["metadata-task-statuses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_statuses")
        .select("*, project:projects!project_id(name, identifier_prefix)")
        .order("project_id")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        project_name: s.project?.name || "",
        project_prefix: s.project?.identifier_prefix || "",
      }));
    },
  });

  const [jobModal, setJobModal] = useState<any | null>(null);
  const selectedCompany = selection?.type === "company" ? companies.find(c => c.id === selection.id) : null;
  const selectedContact = selection?.type === "contact" ? contacts.find(c => c.id === selection.id) : null;
  const selectedInitiative = selection?.type === "initiative" ? initiatives.find(i => i.id === selection.id) : null;
  const selectedLabel = selection?.type === "label" ? labels.find(l => l.id === selection.id) : null;
  const selectedUser = selection?.type === "user" ? users.find(u => u.id === selection.id) : null;
  const selectedPartner = selection?.type === "partner" ? partners.find(p => p.id === selection.id) : null;
  const selectedLookup = selection?.type === "lookup" ? lookupValues.find(l => l.id === selection.id) : null;

  const activityCompanyId = selectedCompany?.id || (selectedContact ? selectedContact.company_id : null);
  const { data: activities = [] } = useActivities(activityCompanyId ? { companyId: activityCompanyId, limit: 20 } : undefined);
  const { data: contactDrafts = [] } = useEmailDrafts(selectedContact?.id);
  const sendDraft = useSendDraft();
  const deleteDraft = useDeleteDraft();
  const updateDraft = useUpdateDraft();
  const [draftTestEmail, setDraftTestEmail] = useState("");
  const [draftTestOpen, setDraftTestOpen] = useState<string | null>(null);
  const [expandedSentEmail, setExpandedSentEmail] = useState<string | null>(null);
  const pendingDrafts = contactDrafts.filter(d => d.status === "draft");
  const sentEmails = contactDrafts.filter(d => d.status === "sent" || d.status === "failed");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { if (isFullscreen) setIsFullscreen(false); else setSelection(null); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isFullscreen]);

  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = detailWidth;
    const move = (ev: MouseEvent) => { if (dragging.current) setDetailWidth(Math.min(700, Math.max(300, startW - (ev.clientX - startX)))); };
    const up = () => { dragging.current = false; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }, [detailWidth]);

  const refetchAll = () => { refetchCompanies(); refetchContacts(); refetchInitiatives(); refetchLabels(); refetchUsers(); refetchLookups(); refetchTaskStatuses(); refetchPartners(); };

  const TABLES_WITHOUT_UPDATED_AT = ["partner_access"];
  const updateEntity = async (table: string, id: string, field: string, value: any) => {
    const payload: any = { [field]: value };
    if (!TABLES_WITHOUT_UPDATED_AT.includes(table)) payload.updated_at = new Date().toISOString();
    await supabase.from(table).update(payload).eq("id", id);
    refetchAll();
  };

  const deleteEntity = async (table: string, id: string, name: string, deps?: () => Promise<void>) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    if (deps) await deps();
    await supabase.from(table).delete().eq("id", id);
    setSelection(null);
    refetchAll();
    toast.info(`"${name}" deleted`);
  };

  // ── Bulk company actions ──────────────────────────────────────────────

  const GENERIC_DOMAINS = new Set(["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "icloud.com", "live.com", "aol.com", "protonmail.com", "me.com", "msn.com", "mail.com", "ymail.com", "googlemail.com", "apollo.import"]);
  const [bulkPopulating, setBulkPopulating] = useState(false);
  const [findingDupes, setFindingDupes] = useState(false);
  const [dupeResults, setDupeResults] = useState<{ nameA: string; stageA: string; nameB: string; stageB: string; matchType: string }[] | null>(null);

  const bulkPopulateDomains = async () => {
    setBulkPopulating(true);
    try {
      const missing = companies.filter(c => !c.email_domains || c.email_domains.length === 0);
      if (missing.length === 0) { toast.info("All companies already have email domains"); return; }
      let updated = 0;
      for (const co of missing) {
        // Try contacts first
        const coContacts = contacts.filter(c => c.company_id === co.id && c.is_active !== false);
        const contactDomains = new Set<string>();
        for (const c of coContacts) {
          if (c.email) {
            const d = c.email.split("@")[1]?.toLowerCase();
            if (d && !GENERIC_DOMAINS.has(d)) contactDomains.add(d);
          }
        }
        let domains = Array.from(contactDomains).sort();
        // Fallback to website
        if (domains.length === 0 && co.website) {
          try {
            const url = new URL(co.website);
            let host = url.hostname.replace(/^www\./, "").replace(/^group\./, "");
            if (host) domains = [host];
          } catch { /* skip invalid URLs */ }
        }
        if (domains.length > 0) {
          await supabase.from("crm_companies").update({ email_domains: domains, updated_at: new Date().toISOString() }).eq("id", co.id);
          updated++;
        }
      }
      refetchCompanies();
      toast.success(`Populated email domains for ${updated} of ${missing.length} companies`);
    } catch (e: any) {
      toast.error(`Bulk populate failed: ${e.message}`);
    } finally {
      setBulkPopulating(false);
    }
  };

  const findDuplicates = async () => {
    setFindingDupes(true);
    setDupeResults(null);
    try {
      const dupes: { nameA: string; stageA: string; nameB: string; stageB: string; matchType: string }[] = [];
      // Check shared email domains
      for (let i = 0; i < companies.length; i++) {
        for (let j = i + 1; j < companies.length; j++) {
          const a = companies[i], b = companies[j];
          const aDomains = a.email_domains ?? [];
          const bDomains = b.email_domains ?? [];
          if (aDomains.length > 0 && bDomains.length > 0 && aDomains.some((d: string) => bDomains.includes(d))) {
            dupes.push({ nameA: a.name, stageA: a.stage ?? "", nameB: b.name, stageB: b.stage ?? "", matchType: "Shared email domain" });
          }
        }
      }
      // Check shared website domain
      const websiteMap = new Map<string, typeof companies[0]>();
      for (const co of companies) {
        if (!co.website) continue;
        try {
          const host = new URL(co.website).hostname.replace(/^www\./, "");
          const existing = websiteMap.get(host);
          if (existing) {
            const already = dupes.some(d => (d.nameA === existing.name && d.nameB === co.name) || (d.nameA === co.name && d.nameB === existing.name));
            if (!already) dupes.push({ nameA: existing.name, stageA: existing.stage ?? "", nameB: co.name, stageB: co.stage ?? "", matchType: "Shared website" });
          } else {
            websiteMap.set(host, co);
          }
        } catch { /* skip */ }
      }
      setDupeResults(dupes);
      if (dupes.length === 0) toast.success("No duplicates found");
      else toast.info(`Found ${dupes.length} potential duplicate(s)`);
    } finally {
      setFindingDupes(false);
    }
  };

  const [findingContactDupes, setFindingContactDupes] = useState(false);
  const [contactDupeResults, setContactDupeResults] = useState<{ nameA: string; emailA: string; companyA: string; nameB: string; emailB: string; companyB: string; matchType: string }[] | null>(null);

  const findContactDuplicates = async () => {
    setFindingContactDupes(true);
    setContactDupeResults(null);
    try {
      const dupes: typeof contactDupeResults & {} = [];
      const activeContacts = contacts.filter(c => c.is_active !== false);
      const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? "Unknown";
      // Same email across contacts
      const emailMap = new Map<string, typeof activeContacts[0]>();
      for (const c of activeContacts) {
        if (!c.email) continue;
        const key = c.email.toLowerCase();
        const existing = emailMap.get(key);
        if (existing) {
          dupes.push({
            nameA: existing.name, emailA: existing.email ?? "", companyA: companyName(existing.company_id!),
            nameB: c.name, emailB: c.email ?? "", companyB: companyName(c.company_id!),
            matchType: existing.company_id === c.company_id ? "Same email, same company" : "Same email, different company",
          });
        } else {
          emailMap.set(key, c);
        }
      }
      // Same name within same company
      const nameKey = (c: typeof activeContacts[0]) => `${c.company_id}::${c.name.toLowerCase().trim()}`;
      const nameMap = new Map<string, typeof activeContacts[0]>();
      for (const c of activeContacts) {
        const key = nameKey(c);
        const existing = nameMap.get(key);
        if (existing && existing.id !== c.id) {
          const already = dupes.some(d => (d.emailA === existing.email && d.emailB === c.email) || (d.emailA === c.email && d.emailB === existing.email));
          if (!already) {
            dupes.push({
              nameA: existing.name, emailA: existing.email ?? "", companyA: companyName(existing.company_id!),
              nameB: c.name, emailB: c.email ?? "", companyB: companyName(c.company_id!),
              matchType: "Same name, same company",
            });
          }
        } else {
          nameMap.set(key, c);
        }
      }
      setContactDupeResults(dupes);
      if (dupes.length === 0) toast.success("No duplicate contacts found");
      else toast.info(`Found ${dupes.length} potential duplicate contact(s)`);
    } finally {
      setFindingContactDupes(false);
    }
  };

  // ── Layout management ──────────────────────────────────────────────────


  const applyFlatLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: [{ colId: "ag-Grid-AutoColumn", hide: true }], applyOrder: false });
  }, []);

  const autoSizeAllColumns = useCallback(() => { gridRef.current?.api.autoSizeAllColumns(); }, []);

  const resetLayout = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.resetColumnState();
    api.setRowGroupColumns([]);
    setQuickFilter("");
    toast.info("Layout reset");
  }, []);

  const saveCurrentLayout = useCallback(async (name: string) => {
    const api = gridRef.current?.api;
    const trimmed = name.trim();
    if (!api || !trimmed) return;
    try {
      await saveLayoutMutation.mutateAsync({
        name: trimmed,
        payload: {
          column_state: api.getColumnState() as unknown[],
          filter_model: (api.getFilterModel() ?? {}) as Record<string, unknown>,
          row_group_columns: api.getRowGroupColumns().map((c: any) => c.getColId()),
        },
      });
      setActiveLayoutName(trimmed);
      setLayoutModified(false);
      setShowSaveDialog(false);
      setNewLayoutName("");
      toast.success(`Layout "${trimmed}" saved`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save layout");
    }
  }, [saveLayoutMutation]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = layoutsByName[name];
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.column_state as ColumnState[], applyOrder: true });
    if (layout.row_group_columns?.length) api.setRowGroupColumns(layout.row_group_columns);
    if (layout.filter_model && Object.keys(layout.filter_model).length) api.setFilterModel(layout.filter_model);
    else api.setFilterModel(null);
    setActiveLayoutName(name);
    setLayoutModified(false);
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [layoutsByName]);

  const deleteLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await deleteLayoutMutation.mutateAsync(layout.id);
      if (activeLayoutName === name) { setActiveLayoutName(null); setLayoutModified(false); }
      toast.info(`Layout "${name}" deleted`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete layout");
    }
  }, [layoutsByName, deleteLayoutMutation, activeLayoutName]);

  const toggleDefaultLayout = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layout = layoutsByName[name];
    if (!layout) return;
    try {
      await setDefaultMutation.mutateAsync({ id: layout.id, makeDefault: !layout.is_default });
      toast.info(layout.is_default ? `"${name}" removed as default` : `"${name}" set as default layout`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update default");
    }
  }, [layoutsByName, setDefaultMutation]);

  // Auto-apply default layout when sub-tab changes (and its layouts resolve)
  const hasAppliedDefault = useRef<string | null>(null);
  const isFirstDataRendered = useRef<string | null>(null);
  const applyDefaultIfReady = useCallback(() => {
    if (hasAppliedDefault.current === subTab) return;
    if (isFirstDataRendered.current !== subTab) return;
    if (!layoutsFetched) return;
    const api = gridRef.current?.api;
    if (!api) return;
    if (defaultLayout) {
      api.applyColumnState({ state: defaultLayout.column_state as ColumnState[], applyOrder: true });
      if (defaultLayout.row_group_columns?.length) api.setRowGroupColumns(defaultLayout.row_group_columns);
      if (defaultLayout.filter_model && Object.keys(defaultLayout.filter_model).length) {
        api.setFilterModel(defaultLayout.filter_model);
      }
      setActiveLayoutName(defaultLayout.name);
      setLayoutModified(false);
    } else {
      api.autoSizeAllColumns(false);
      setActiveLayoutName(null);
      setLayoutModified(false);
    }
    hasAppliedDefault.current = subTab;
  }, [defaultLayout, layoutsFetched, subTab]);

  useEffect(() => { applyDefaultIfReady(); }, [applyDefaultIfReady]);

  // Reset the latch whenever the sub-tab changes — the grid remounts (key={subTab}).
  useEffect(() => {
    hasAppliedDefault.current = null;
    isFirstDataRendered.current = null;
    setActiveLayoutName(null);
    setLayoutModified(false);
    setActiveFilterCount(0);
  }, [subTab]);

  const handleFirstDataRendered = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    isFirstDataRendered.current = subTab;
    applyDefaultIfReady();
  }, [applyDefaultIfReady, subTab]);

  const handleFilterChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const model = api.getFilterModel() ?? {};
    setActiveFilterCount(Object.keys(model).length);
    if (hasAppliedDefault.current === subTab && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName, subTab]);

  const handleLayoutDirty = useCallback(() => {
    if (hasAppliedDefault.current === subTab && activeLayoutName) setLayoutModified(true);
  }, [activeLayoutName, subTab]);

  const clearAllFilters = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    setQuickFilter("");
  }, []);

  // ── Column defs per sub-tab ─────────────────────────────────────────────

  const companyColumns: ColDef[] = useMemo(() => [
    { field: "name", headerName: "Name", flex: 1, filter: "agTextColumnFilter", editable: true, pinned: "left" },
    { field: "display_name", headerName: "Display Name", width: 150, editable: true },
    { field: "stage", headerName: "Stage", width: 110, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: COMPANY_STAGES.map(s => s.value) },
      cellRenderer: (p: any) => p.value ? <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
        p.value === "client" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" : p.value === "prospect" ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" : p.value === "opportunity" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      )}>{p.value}</span> : null,
    },
    { field: "industry", headerName: "Industry", width: 120, editable: true, filter: "agSetColumnFilter" },
    { field: "website", headerName: "Website", width: 180, editable: true },
    { field: "domain_id", headerName: "Domain", width: 120, editable: true },
    { field: "email_domains", headerName: "Email Domains", width: 180, editable: true,
      valueFormatter: (p: any) => p.value ? (Array.isArray(p.value) ? p.value.join(", ") : p.value) : "",
      valueSetter: (p: any) => {
        const val = p.newValue ? p.newValue.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean) : [];
        p.data.email_domains = val;
        return true;
      },
    },
    { field: "source", headerName: "Source", width: 120, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["", "direct", "referral", "inbound", "apollo", "manual", "existing"] },
    },
    { field: "referred_by", headerName: "Referred By", width: 150, editable: true, filter: "agTextColumnFilter" },
    { field: "partner_id", headerName: "Partner", width: 150, editable: true,
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["(none)", ...partners.map(p => p.name)] },
      valueGetter: (p: any) => { const partner = partners.find(pt => pt.id === p.data?.partner_id); return partner ? partner.name : ""; },
      valueSetter: (p: any) => {
        if (!p.newValue || p.newValue === "(none)") { p.data.partner_id = null; return true; }
        const partner = partners.find(pt => pt.name === p.newValue);
        p.data.partner_id = partner ? partner.id : null;
        return true;
      },
    },
    { field: "uen", headerName: "UEN", width: 130, editable: true, filter: "agTextColumnFilter" },
    { field: "outlet_count", headerName: "Outlets", width: 80, editable: true, type: "numericColumn", filter: "agNumberColumnFilter" },
    { field: "research_folder_path", headerName: "Researched", width: 100, filter: "agSetColumnFilter",
      valueGetter: (p: any) => p.data?.research_folder_path ? "Yes" : "No",
      cellRenderer: (p: any) => p.value === "Yes" ? <span className="text-emerald-600 dark:text-emerald-400">✓</span> : null,
    },
    { field: "contact_count", headerName: "Contacts", width: 80, type: "numericColumn" },
    { field: "hiring_signals", headerName: "Hiring Signals", width: 200, hide: true,
      valueGetter: (p: any) => {
        const hs = p.data?.hiring_signals;
        if (!hs) return "";
        const jobs = hs.total_open_jobs || (hs.active_jobs?.length ?? 0);
        if (!jobs) return "";
        const roles = hs.active_jobs?.map((j: any) => j.title).join(", ") || "";
        return `${jobs} job${jobs > 1 ? "s" : ""}: ${roles}`;
      },
    },
    { field: "latest_job_posted", headerName: "Latest Job Posted", width: 120, hide: true,
      valueGetter: (p: any) => {
        const jobs = p.data?.hiring_signals?.active_jobs;
        if (!jobs?.length) return null;
        return jobs.reduce((latest: string, j: any) => j.posted > latest ? j.posted : latest, jobs[0].posted);
      },
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { month: "short", day: "numeric" }) : "",
      comparator: (a: string | null, b: string | null) => {
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        return a.localeCompare(b);
      },
      filter: "agDateColumnFilter",
    },
    { field: "outreach_status", headerName: "Outreach", width: 120, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: [null, "drafting", "contacted", "replied", "meeting_booked"] },
      cellRenderer: (p: any) => {
        if (!p.value) return null;
        const colors: Record<string, string> = {
          drafting: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
          contacted: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
          replied: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
          meeting_booked: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
        };
        return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[p.value] || "text-zinc-400"}`}>{p.value.replace("_", " ")}</span>;
      },
    },
    { field: "notes", headerName: "Notes", width: 200, editable: true, hide: true },
    { field: "created_at", headerName: "Created", width: 100, valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { month: "short", day: "numeric" }) : "" },
    { field: "updated_at", headerName: "Updated", width: 100, valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { month: "short", day: "numeric" }) : "" },
  ], [partners]);

  const companyRows = useMemo(() => companies.map(c => ({
    ...c,
    contact_count: contacts.filter(ct => ct.company_id === c.id && ct.is_active !== false).length,
  })), [companies, contacts]);

  const contactColumns: ColDef[] = useMemo(() => [
    { field: "name", headerName: "Name", flex: 1, filter: "agTextColumnFilter", editable: true, pinned: "left" },
    { field: "email", headerName: "Email", width: 200, editable: true, filter: "agTextColumnFilter" },
    { field: "company_id", headerName: "Company", width: 150, editable: true, filter: "agTextColumnFilter",
      cellEditor: "agSelectCellEditor",
      cellEditorParams: {
        values: companies.map(c => c.id),
        valueListGap: 0,
      },
      refData: Object.fromEntries(companies.map(c => [c.id, c.display_name || c.name])),
      filterValueGetter: (p: any) => p.data?.company_name || "",
    },
    { field: "role", headerName: "Role", width: 130, editable: true, filter: "agSetColumnFilter" },
    { field: "department", headerName: "Department", width: 120, editable: true, filter: "agSetColumnFilter" },
    { field: "phone", headerName: "Phone", width: 120, editable: true },
    { field: "is_primary", headerName: "Primary", width: 80, filter: "agSetColumnFilter",
      cellRenderer: (p: any) => p.value ? <span className="text-teal-500 text-xs font-medium">Yes</span> : <span className="text-zinc-400 text-xs">No</span>,
    },
    { field: "is_active", headerName: "Active", width: 80, filter: "agSetColumnFilter",
      cellRenderer: (p: any) => p.value === false ? <span className="text-red-500 text-xs">No</span> : <span className="text-zinc-400 text-xs">Yes</span>,
    },
    { field: "source", headerName: "Source", width: 80, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: [null, "apollo", "web_search", "manual", "import", "referral"] },
      cellRenderer: (p: any) => p.value === "apollo" ? <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded font-medium">Apollo</span> : p.value ? <span className="text-zinc-400 text-xs">{p.value}</span> : null,
    },
    { field: "email_status", headerName: "Email Status", width: 100, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: [null, "verified", "guessed", "bounced", "unknown"] },
      cellRenderer: (p: any) => p.value === "verified" ? <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded font-medium">Verified</span> : p.value === "guessed" ? <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded font-medium">Guessed</span> : p.value === "bounced" ? <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 rounded font-medium">Bounced</span> : p.value ? <span className="text-zinc-400 text-xs">{p.value}</span> : null,
    },
    { field: "prospect_stage", headerName: "Prospect Stage", width: 120, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: [null, "new", "researched", "drafted", "sent", "opened", "replied"] },
      cellRenderer: (p: any) => {
        if (!p.value) return null;
        const colors: Record<string, string> = {
          new: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
          researched: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
          drafted: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
          sent: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400",
          opened: "bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400",
          replied: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
        };
        return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[p.value] || "text-zinc-400"}`}>{p.value}</span>;
      },
    },
    { field: "linkedin_url", headerName: "LinkedIn", width: 180, editable: true, hide: true },
    { field: "notes", headerName: "Notes", width: 200, editable: true, hide: true },
    { field: "created_at", headerName: "Created", width: 120, filter: "agDateColumnFilter",
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "",
    },
    { field: "updated_at", headerName: "Updated", width: 120, filter: "agDateColumnFilter",
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "",
    },
  ], [companies]);

  const contactRows = useMemo(() => contacts.map(c => ({
    ...c,
    company_name: companies.find(co => co.id === c.company_id)?.name || "",
  })), [contacts, companies]);

  const initiativeColumns: ColDef[] = useMemo(() => [
    { field: "name", headerName: "Name", flex: 1, filter: "agTextColumnFilter", editable: true, pinned: "left" },
    { field: "status", headerName: "Status", width: 100, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["planned", "active", "completed", "paused"] },
      cellRenderer: (p: any) => p.value ? <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
        p.value === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" : p.value === "planned" ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" : p.value === "completed" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400" : "bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
      )}>{p.value}</span> : null,
    },
    { field: "health", headerName: "Health", width: 90, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["on_track", "at_risk", "off_track", ""] },
      cellRenderer: (p: any) => p.value ? <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
        p.value === "on_track" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" : p.value === "at_risk" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400" : "bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-400"
      )}>{p.value}</span> : null,
    },
    { field: "owner", headerName: "Owner", width: 120, editable: true, filter: "agSetColumnFilter" },
    { field: "target_date", headerName: "Target Date", width: 110, editable: true },
    { field: "description", headerName: "Description", width: 250, editable: true, hide: true },
    { field: "color", headerName: "Color", width: 80, editable: true,
      cellRenderer: (p: any) => p.value ? <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: p.value }} />{p.value}</span> : null,
    },
  ], []);

  const labelColumns: ColDef[] = useMemo(() => [
    { field: "name", headerName: "Name", flex: 1, filter: "agTextColumnFilter", editable: true },
    { field: "color", headerName: "Color", width: 100, editable: true,
      cellRenderer: (p: any) => p.value ? <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: p.value }} />{p.value}</span> : null,
    },
    { field: "description", headerName: "Description", flex: 1, editable: true },
  ], []);

  const userColumns: ColDef[] = useMemo(() => [
    { field: "name", headerName: "Name", flex: 1, filter: "agTextColumnFilter", editable: true,
      cellRenderer: (p: any) => (
        <span className="flex items-center gap-2">
          {p.data?.avatar_url ? <img src={p.data.avatar_url} className="w-5 h-5 rounded-full" /> : <User size={14} className="text-zinc-400" />}
          {p.value}
        </span>
      ),
    },
    { field: "type", headerName: "Type", width: 80, filter: "agSetColumnFilter",
      cellRenderer: (p: any) => p.value ? <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", p.value === "bot" ? "bg-purple-50 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400")}>{p.value}</span> : null,
    },
    { field: "email", headerName: "Email", width: 200, editable: true },
    { field: "github_username", headerName: "GitHub", width: 130 },
    { field: "bot_department", headerName: "Department", width: 130, editable: true },
    { field: "last_active_at", headerName: "Last Active", width: 110, valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { month: "short", day: "numeric" }) : "" },
  ], []);

  const lookupColumns: ColDef[] = useMemo(() => [
    { field: "type", headerName: "Type", width: 140, filter: "agSetColumnFilter",
      cellRenderer: (p: any) => p.value ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{p.value}</span> : null,
    },
    { field: "value", headerName: "Value", width: 160, editable: true, filter: "agTextColumnFilter" },
    { field: "label", headerName: "Label", flex: 1, editable: true, filter: "agTextColumnFilter" },
    { field: "color", headerName: "Color", width: 100, editable: true,
      cellRenderer: (p: any) => p.value ? <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: p.value }} /><span className="text-[10px] text-zinc-500 dark:text-zinc-400">{p.value}</span></span> : null,
    },
    { field: "icon", headerName: "Icon", width: 100, editable: true },
    { field: "weight", headerName: "Weight", width: 80, editable: true, type: "numericColumn" },
    { field: "sort_order", headerName: "Order", width: 70, editable: true, type: "numericColumn" },
  ], []);

  const taskStatusColumns: ColDef[] = useMemo(() => [
    { field: "project_prefix", headerName: "Project", width: 100, filter: "agSetColumnFilter" },
    { field: "project_name", headerName: "Project Name", width: 180, filter: "agTextColumnFilter" },
    { field: "name", headerName: "Status Name", flex: 1, editable: true, filter: "agTextColumnFilter" },
    { field: "type", headerName: "Type", width: 120, editable: true, filter: "agSetColumnFilter",
      cellRenderer: (p: any) => p.value ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{p.value}</span> : null,
    },
    { field: "color", headerName: "Color", width: 100, editable: true,
      cellRenderer: (p: any) => p.value ? <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: p.value }} /><span className="text-[10px] text-zinc-500 dark:text-zinc-400">{p.value}</span></span> : null,
    },
    { field: "sort_order", headerName: "Order", width: 70, editable: true, type: "numericColumn" },
  ], []);

  const partnerColumns: ColDef[] = useMemo(() => [
    { field: "name", headerName: "Name", flex: 1, filter: "agTextColumnFilter", editable: true, pinned: "left" },
    { field: "company", headerName: "Company", width: 180, editable: true, filter: "agTextColumnFilter" },
    { field: "email", headerName: "Email", width: 200, editable: true, filter: "agTextColumnFilter" },
    { field: "phone", headerName: "Phone", width: 140, editable: true },
    { field: "active", headerName: "Active", width: 90, editable: true,
      cellRenderer: (p: any) => p.value ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">active</span> : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">inactive</span>,
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: [true, false] },
    },
    { field: "code", headerName: "Code", width: 120, editable: false },
    { field: "last_accessed", headerName: "Last Accessed", width: 130, valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { month: "short", day: "numeric", year: "numeric" }) : "Never" },
    { field: "created_at", headerName: "Created", width: 110, valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { month: "short", day: "numeric" }) : "" },
  ], []);

  const isLookupTab = ["deal_stage", "deal_solution", "company_stage", "activity_type", "project_status", "project_health", "project_type", "domain_type", "initiative_status", "task_status_type"].includes(subTab);
  const isTaskStatusTab = subTab === "task_statuses";
  const currentColumns = isTaskStatusTab ? taskStatusColumns : subTab === "companies" ? companyColumns : subTab === "contacts" ? contactColumns : subTab === "partners" ? partnerColumns : subTab === "initiatives" ? initiativeColumns : subTab === "labels" ? labelColumns : isLookupTab ? lookupColumns : userColumns;
  const currentRows = isTaskStatusTab ? taskStatuses : subTab === "companies" ? companyRows : subTab === "contacts" ? contactRows : subTab === "partners" ? partners : subTab === "initiatives" ? initiatives : subTab === "labels" ? labels : isLookupTab ? lookupValues.filter(l => l.type === subTab) : users;
  const currentTable = isTaskStatusTab ? "task_statuses" : subTab === "companies" ? "crm_companies" : subTab === "contacts" ? "crm_contacts" : subTab === "partners" ? "partner_access" : subTab === "initiatives" ? "initiatives" : subTab === "labels" ? "labels" : isLookupTab ? "lookup_values" : "users";

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true, floatingFilter: true, cellClass: "text-xs", enableRowGroup: true, tooltipShowDelay: 500,
  }), []);

  const getRowId = useCallback((params: GetRowIdParams) => params.data.id, []);

  const handleCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue } = event;
    if (!data || !colDef.field) return;
    if (["contact_count"].includes(colDef.field)) return;
    // For partner_id, valueSetter already converted name→UUID in data.partner_id
    const actualValue = colDef.field === "partner_id" ? data.partner_id : newValue;
    const payload: any = { [colDef.field]: actualValue ?? null };
    if (!TABLES_WITHOUT_UPDATED_AT.includes(currentTable)) payload.updated_at = new Date().toISOString();
    // Auto-fill referred_by when partner_id changes on companies
    if (currentTable === "crm_companies" && colDef.field === "partner_id") {
      const partner = partners.find(p => p.id === actualValue);
      payload.referred_by = partner ? partner.name : null;
    }
    await supabase.from(currentTable).update(payload).eq("id", data.id);
    refetchAll();
  }, [currentTable, partners]);

  const handleRowDoubleClicked = useCallback((e: any) => {
    if (!e.data) return;
    const type = subTab === "companies" ? "company" : subTab === "contacts" ? "contact" : subTab === "partners" ? "partner" : subTab === "initiatives" ? "initiative" : subTab === "labels" ? "label" : isLookupTab || isTaskStatusTab ? "lookup" : "user";
    setSelection({ type, id: e.data.id });
  }, [subTab, isLookupTab, isTaskStatusTab]);

  const exportToCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({ fileName: `${subTab}-${toSGTDateString()}.csv` });
  }, [subTab]);

  const exportToExcel = useCallback(() => {
    gridRef.current?.api.exportDataAsExcel({ fileName: `${subTab}-${toSGTDateString()}.xlsx`, sheetName: subTab });
  }, [subTab]);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  const tabGroups: { label: string; tabs: { id: SubTab; label: string; icon: any; count: number }[] }[] = [
    {
      label: "Entities",
      tabs: [
        { id: "companies", label: "Companies", icon: Building2, count: companies.length },
        { id: "contacts", label: "Contacts", icon: User, count: contacts.length },
        { id: "initiatives", label: "Initiatives", icon: Target, count: initiatives.length },
        { id: "users", label: "Users", icon: Bot, count: users.length },
        { id: "partners", label: "Partners", icon: Handshake, count: partners.length },
      ],
    },
    {
      label: "Lookups",
      tabs: [
        { id: "labels", label: "Labels", icon: Tag, count: labels.length },
        { id: "deal_stage", label: "Deal Stages", icon: Settings, count: lookupValues.filter(l => l.type === "deal_stage").length },
        { id: "deal_solution", label: "Solutions", icon: Settings, count: lookupValues.filter(l => l.type === "deal_solution").length },
        { id: "company_stage", label: "Co. Stages", icon: Settings, count: lookupValues.filter(l => l.type === "company_stage").length },
        { id: "activity_type", label: "Activity Types", icon: Settings, count: lookupValues.filter(l => l.type === "activity_type").length },
        { id: "project_status", label: "Proj. Statuses", icon: Settings, count: lookupValues.filter(l => l.type === "project_status").length },
        { id: "initiative_status", label: "Init. Statuses", icon: Settings, count: lookupValues.filter(l => l.type === "initiative_status").length },
        { id: "task_status_type", label: "Status Types", icon: Settings, count: lookupValues.filter(l => l.type === "task_status_type").length },
        { id: "task_statuses", label: "Task Statuses", icon: Settings, count: taskStatuses.length },
        { id: "project_health", label: "Health", icon: Settings, count: lookupValues.filter(l => l.type === "project_health").length },
        { id: "project_type", label: "Project Types", icon: Settings, count: lookupValues.filter(l => l.type === "project_type").length },
        { id: "domain_type", label: "Domain Types", icon: Tags, count: lookupValues.filter(l => l.type === "domain_type").length },
      ],
    },
  ];

  // Add row handler
  const handleAddRow = useCallback(async () => {
    if (subTab === "partners") {
      // Generate VAL-{random10} code
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const random = Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b => chars[b % chars.length]).join("");
      const code = `VAL-${random}`;
      // SHA-256 hash
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(code));
      const codeHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      const { error } = await supabase.from("partner_access").insert({ name: "New Partner", code, code_hash: codeHash, active: true });
      if (error) { toast.error("Failed to create partner"); return; }
      refetchAll();
      toast.info(`Partner created with code: ${code}`);
      return;
    }
    // For lookup tabs, labels, and task statuses — show inline add dialog
    if (isLookupTab || isTaskStatusTab || subTab === "labels") {
      setAddDialogLabel("");
      setShowAddDialog(true);
      setTimeout(() => addInputRef.current?.focus(), 50);
      return;
    }
  }, [isLookupTab, isTaskStatusTab, subTab]);

  const handleAddConfirm = useCallback(async () => {
    const label = addDialogLabel.trim();
    if (!label) return;
    setShowAddDialog(false);
    setAddDialogLabel("");
    if (isLookupTab) {
      const nextOrder = lookupValues.filter(l => l.type === subTab).length;
      await supabase.from("lookup_values").insert({ type: subTab, value: label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, ""), label, sort_order: nextOrder });
      refetchAll();
    } else if (subTab === "labels") {
      await supabase.from("labels").insert({ name: label, color: "#6b7280" });
      refetchAll();
    } else if (isTaskStatusTab) {
      await supabase.from("task_statuses").insert({ name: label, color: "#6b7280", sort_order: taskStatuses.length });
      refetchAll();
    }
  }, [addDialogLabel, isLookupTab, isTaskStatusTab, subTab, lookupValues, taskStatuses]);

  const handleDeleteSelected = useCallback(async () => {
    const selected = gridRef.current?.api?.getSelectedRows();
    if (!selected?.length) { toast.error("Select a row first"); return; }
    const row = selected[0];
    const name = row.label || row.value || row.name || "this item";
    if (!confirm(`Delete "${name}"?`)) return;
    await supabase.from(currentTable).delete().eq("id", row.id);
    refetchAll();
    toast.info(`"${name}" deleted`);
  }, [currentTable]);

  const hasSelection = !!selection;

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 p-4 flex" : "h-full flex overflow-hidden px-4 py-4"}>
      <style>{groupRowStyles}{themeStyles}{`
        .ag-theme-alpine .ag-cell, .ag-theme-alpine-dark .ag-cell { display: flex; align-items: center; }
      `}</style>

      {/* Body: sidebar + grid + optional detail panel, wrapped in a bordered rounded box */}
      <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
        {/* Vertical tab sidebar */}
        <aside className="flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 overflow-y-auto py-2 transition-all duration-200 rounded-l-md" style={{ width: sidebarCollapsed ? 40 : 160 }}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center">
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                title="Expand panel"
              >
                <PanelLeftOpen size={14} />
              </button>
            </div>
          ) : (
            <nav className="space-y-3 px-2">
              <div className="flex justify-end px-1">
                <button
                  onClick={toggleSidebar}
                  className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  title="Collapse panel"
                >
                  <PanelLeftClose size={12} />
                </button>
              </div>
              {tabGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    {group.label}
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {group.tabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => { setSubTab(tab.id); setSelection(null); setQuickFilter(""); gridRef.current?.api?.setGridOption("quickFilterText", ""); }}
                        className={cn(
                          "w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md transition-colors",
                          subTab === tab.id
                            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        )}
                      >
                        <span className="truncate">{tab.label}</span>
                        <span className="text-[9px] text-zinc-400 ml-1 flex-shrink-0">{tab.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          )}
        </aside>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input type="text" placeholder="Filter..." value={quickFilter}
                  onChange={(e) => { setQuickFilter(e.target.value); gridRef.current?.api?.setGridOption("quickFilterText", e.target.value); }}
                  className="w-48 px-2.5 py-1.5 pl-8 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
              </div>

              {(activeFilterCount > 0 || quickFilter.trim().length > 0) && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors whitespace-nowrap"
                  title="Clear all filters"
                >
                  <span>
                    {activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0)} filter{activeFilterCount + (quickFilter.trim().length > 0 ? 1 : 0) === 1 ? "" : "s"} active
                  </span>
                  <X size={12} />
                </button>
              )}

              {(isLookupTab || isTaskStatusTab || subTab === "partners" || subTab === "labels") && (
                <>
                  <button onClick={handleAddRow}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 border border-teal-200 dark:border-teal-800 transition-colors">
                    <Plus size={13} /> Add
                  </button>
                  <button onClick={handleDeleteSelected}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-zinc-200 dark:border-zinc-800 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </>
              )}
              {subTab === "companies" && (
                <>
                  <button onClick={bulkPopulateDomains} disabled={bulkPopulating}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 border border-teal-200 dark:border-teal-800 transition-colors disabled:opacity-50"
                    title="Auto-populate email domains from contacts and websites for all companies missing them">
                    <Globe size={13} className={bulkPopulating ? "animate-spin" : ""} /> Populate Domains
                  </button>
                  <button onClick={findDuplicates} disabled={findingDupes}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 transition-colors disabled:opacity-50"
                    title="Find companies with shared email domains or websites">
                    <AlertTriangle size={13} className={findingDupes ? "animate-pulse" : ""} /> Find Duplicates
                  </button>
                </>
              )}
              {subTab === "contacts" && (
                <button onClick={findContactDuplicates} disabled={findingContactDupes}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 transition-colors disabled:opacity-50"
                  title="Find contacts with same email or same name within a company">
                  <AlertTriangle size={13} className={findingContactDupes ? "animate-pulse" : ""} /> Find Duplicates
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Layouts dropdown */}
              <div className="relative">
                <button onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                  title={activeLayoutName ? `Current layout: ${activeLayoutName}${layoutModified ? " (modified)" : ""}` : "Layouts"}>
                  <Bookmark size={13} />
                  {activeLayoutName ? (
                    <span className="flex items-center gap-1">
                      <span className="max-w-[120px] truncate">{activeLayoutName}</span>
                      {layoutModified && <span className="text-amber-500" title="Layout has unsaved changes">•</span>}
                    </span>
                  ) : (
                    <span>Layouts</span>
                  )}
                </button>
                {showLayoutMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 py-1">
                    <button onClick={() => { applyFlatLayout(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"><Columns size={13} /> Flat View</button>
                    <button onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"><ChevronsLeftRight size={13} /> Auto-fit Columns</button>
                    <button onClick={() => { resetLayout(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"><RotateCcw size={13} /> Reset to Default</button>
                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                    <button onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center gap-2"><span className="text-green-600">+</span> Save current layout...</button>
                    {layouts.length > 0 && (
                      <>
                        <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                        <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Shared Layouts</div>
                        {layouts.map((layout) => (
                          <div key={layout.id} onClick={() => loadLayout(layout.name)} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between cursor-pointer group">
                            <span className="truncate flex items-center gap-1.5">{layout.is_default && <Star size={11} className="text-amber-500 fill-amber-500" />}{layout.name}</span>
                            <div className="flex items-center gap-0.5">
                              <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(layout.name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500" title="Overwrite with current layout"><Save size={12} /></button>
                              <button onClick={(e) => toggleDefaultLayout(layout.name, e)} className={cn("p-1 rounded", layout.is_default ? "text-amber-500" : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500")} title={layout.is_default ? "Remove as default" : "Set as default"}><Star size={12} className={layout.is_default ? "fill-amber-500" : ""} /></button>
                              <button onClick={(e) => deleteLayout(layout.name, e)} className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-500" title="Delete layout"><X size={12} /></button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <button onClick={() => setWrapNotes(!wrapNotes)}
                className={cn("flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium rounded-lg border transition-colors",
                  wrapNotes ? "border-teal-500 bg-teal-500/20 text-teal-600" : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                )} title={wrapNotes ? "Truncate text" : "Wrap text"}>
                <WrapText size={13} />
              </button>

              <Button variant="secondary" size="sm" icon={Download} onClick={exportToCsv}>CSV</Button>
              <Button size="sm" icon={FileSpreadsheet} onClick={exportToExcel}>Excel</Button>

              <button onClick={() => setIsFullscreen(!isFullscreen)}
                className={cn("p-1.5 rounded-lg border transition-colors", isFullscreen ? "border-teal-500 bg-teal-500/20 text-teal-600" : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700")}>
                {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
          </div>

          {/* Inline add dialog */}
          {showAddDialog && (
            <div className="flex-shrink-0 border-b border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 px-4 py-2">
              <form onSubmit={(e) => { e.preventDefault(); handleAddConfirm(); }} className="flex items-center gap-2">
                <span className="text-xs font-medium text-teal-700 dark:text-teal-300">New {subTab === "labels" ? "label" : isTaskStatusTab ? "status" : "value"}:</span>
                <input
                  ref={addInputRef}
                  type="text"
                  value={addDialogLabel}
                  onChange={(e) => setAddDialogLabel(e.target.value)}
                  placeholder="Enter a name..."
                  className="flex-1 max-w-xs px-2.5 py-1 text-xs rounded-md border border-teal-300 dark:border-teal-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  onKeyDown={(e) => { if (e.key === "Escape") { setShowAddDialog(false); setAddDialogLabel(""); } }}
                />
                <button type="submit" className="px-2.5 py-1 text-xs font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 transition-colors">Add</button>
                <button type="button" onClick={() => { setShowAddDialog(false); setAddDialogLabel(""); }} className="px-2.5 py-1 text-xs font-medium rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancel</button>
              </form>
            </div>
          )}

          {/* Duplicate results banner */}
          {dupeResults && dupeResults.length > 0 && (
            <div className="flex-shrink-0 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> {dupeResults.length} potential duplicate{dupeResults.length !== 1 ? "s" : ""} found
                </span>
                <button onClick={() => setDupeResults(null)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Dismiss</button>
              </div>
              <div className="space-y-1 max-h-32 overflow-auto">
                {dupeResults.map((d, i) => (
                  <div key={i} className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <span className="font-medium">{d.nameA}</span>
                    <span className="text-amber-500 text-[10px]">({d.stageA})</span>
                    <span className="text-zinc-400">&amp;</span>
                    <span className="font-medium">{d.nameB}</span>
                    <span className="text-amber-500 text-[10px]">({d.stageB})</span>
                    <span className="text-zinc-400 ml-auto">{d.matchType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Contact duplicate results banner */}
          {contactDupeResults && contactDupeResults.length > 0 && (
            <div className="flex-shrink-0 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> {contactDupeResults.length} potential duplicate contact{contactDupeResults.length !== 1 ? "s" : ""} found
                </span>
                <button onClick={() => setContactDupeResults(null)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Dismiss</button>
              </div>
              <div className="space-y-1 max-h-32 overflow-auto">
                {contactDupeResults.map((d, i) => (
                  <div key={i} className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <span className="font-medium">{d.nameA}</span>
                    <span className="text-amber-500 text-[10px]">({d.companyA})</span>
                    <span className="text-zinc-400">&amp;</span>
                    <span className="font-medium">{d.nameB}</span>
                    <span className="text-amber-500 text-[10px]">({d.companyB})</span>
                    <span className="text-zinc-400 ml-auto">{d.matchType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Grid */}
          <div className="flex-1 flex overflow-hidden">
            <div className={cn(themeClass, "flex-1 min-h-0 overflow-hidden")} style={{ width: "100%" }}>
          <AgGridReact
            ref={gridRef}
            key={subTab}
            theme="legacy"
            rowData={currentRows}
            columnDefs={currentColumns}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            onCellValueChanged={handleCellValueChanged}
            onRowDoubleClicked={handleRowDoubleClicked}
            quickFilterText={quickFilter}
            onFirstDataRendered={handleFirstDataRendered}
            onFilterChanged={handleFilterChanged}
            onColumnMoved={handleLayoutDirty}
            onColumnResized={handleLayoutDirty}
            onColumnVisible={handleLayoutDirty}
            onColumnPinned={handleLayoutDirty}
            onColumnRowGroupChanged={handleLayoutDirty}
            onSortChanged={handleLayoutDirty}
            animateRows
            enableRangeSelection
            enableBrowserTooltips
            singleClickEdit
            stopEditingWhenCellsLoseFocus
            rowSelection="single"
            suppressRowClickSelection={!isLookupTab && !isTaskStatusTab}
            headerHeight={32}
            floatingFiltersHeight={30}
            rowHeight={34}
            getContextMenuItems={() => ["copy", "copyWithHeaders", "paste", "separator", "export", "separator", "autoSizeAll", "resetColumns"]}
            sideBar={{
              toolPanels: [
                { id: "columns", labelDefault: "Columns", labelKey: "columns", iconKey: "columns", toolPanel: "agColumnsToolPanel" },
                { id: "filters", labelDefault: "Filters", labelKey: "filters", iconKey: "filter", toolPanel: "agFiltersToolPanel" },
              ],
              defaultToolPanel: "",
            }}
            statusBar={{
              statusPanels: [
                { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
                { statusPanel: "agAggregationComponent", align: "right" },
              ],
            }}
            pagination
            paginationPageSize={100}
            paginationPageSizeSelector={[50, 100, 200, 500]}
          />
        </div>

        {/* Detail panel (slides from right) */}
        {hasSelection && (
          <>
            <div onMouseDown={onResizeDown} className="w-1 flex-shrink-0 cursor-col-resize hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors" />
            <div className="flex-shrink-0 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" style={{ width: detailWidth }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Details</span>
                <button onClick={() => setSelection(null)} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"><X size={14} /></button>
              </div>
              <div className="p-4">
                {/* Company */}
                {selectedCompany && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedCompany.display_name || selectedCompany.name}</h2>
                      <button
                        onClick={() => { navigator.clipboard.writeText(selectedCompany.id); toast.success("Company ID copied"); }}
                        className="font-mono text-[10px] text-zinc-300 dark:text-zinc-600 hover:text-teal-500 dark:hover:text-teal-400 transition-colors cursor-pointer"
                        title={selectedCompany.id}
                      >
                        {selectedCompany.id.slice(0, 8)}
                      </button>
                    </div>
                    <FieldGrid fields={[
                      { label: "Name", field: "name", value: selectedCompany.name },
                      { label: "Display Name", field: "display_name", value: selectedCompany.display_name },
                      { label: "Industry", field: "industry", value: selectedCompany.industry },
                      { label: "Website", field: "website", value: selectedCompany.website },
                      { label: "Stage", field: "stage", value: selectedCompany.stage, type: "select", options: COMPANY_STAGES.map(s => ({ value: s.value, label: s.label })) },
                      { label: "Domain ID", field: "domain_id", value: selectedCompany.domain_id },
                      { label: "Email Domains", field: "email_domains", value: Array.isArray((selectedCompany as any).email_domains) ? (selectedCompany as any).email_domains.join(", ") : (selectedCompany as any).email_domains, type: "email_domains" as any },
                      { label: "Client Folder", field: "client_folder_path", value: selectedCompany.client_folder_path, type: "folder_picker" },
                      { label: "Deal Folder", field: "deal_folder_path", value: selectedCompany.deal_folder_path, type: "folder_picker" },
                      { label: "Research Folder", field: "research_folder_path", value: selectedCompany.research_folder_path, type: "folder_picker" },
                      { label: "Source", field: "source", value: selectedCompany.source, type: "select", options: [{ value: "", label: "(none)" }, { value: "direct", label: "Direct" }, { value: "referral", label: "Referral" }, { value: "inbound", label: "Inbound" }, { value: "apollo", label: "Apollo" }, { value: "manual", label: "Manual" }, { value: "existing", label: "Existing" }] },
                      { label: "Referred By", field: "referred_by", value: selectedCompany.referred_by },
                      { label: "Partner", field: "partner_id", value: selectedCompany.partner_id, type: "select", options: [{ value: "", label: "(none)" }, ...partners.map(p => ({ value: p.id, label: p.name }))] },
                      { label: "UEN", field: "uen", value: selectedCompany.uen },
                      { label: "Outlets", field: "outlet_count", value: selectedCompany.outlet_count },
                      { label: "Notes", field: "notes", value: selectedCompany.notes, type: "textarea" },
                    ]} onUpdate={async (f, v) => {
                      await updateEntity("crm_companies", selectedCompany.id, f, v);
                      if (f === "partner_id") {
                        const partner = partners.find(p => p.id === v);
                        await updateEntity("crm_companies", selectedCompany.id, "referred_by", partner ? partner.name : null);
                      }
                    }} companyId={selectedCompany.id as string} contacts={contacts as { email: string; company_id: string }[]} />
                    {/* Hiring Signals */}
                    {(selectedCompany as any).hiring_signals?.active_jobs?.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-2">
                          Hiring Signals ({(selectedCompany as any).hiring_signals.active_jobs.length} open)
                        </h3>
                        <div className="space-y-2">
                          {(selectedCompany as any).hiring_signals.active_jobs.map((job: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => setJobModal(job)}
                              className="w-full text-left rounded-md border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2 hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{job.title}</span>
                                {job.url && (
                                  <a onClick={(e) => e.stopPropagation()} href={job.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-teal-500 hover:text-teal-600 shrink-0">MCF</a>
                                )}
                              </div>
                              <div className="flex gap-3 mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                                {(job.salary_min || job.salary_max) && (
                                  <span>${job.salary_min?.toLocaleString() || "?"} – ${job.salary_max?.toLocaleString() || "?"}</span>
                                )}
                                {job.role_category && <span className="capitalize">{job.role_category}</span>}
                                {job.posted && <span>Posted {job.posted}</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                        {(selectedCompany as any).hiring_signals.last_checked && (
                          <p className="text-[10px] text-zinc-400 mt-2">Last checked: {new Date((selectedCompany as any).hiring_signals.last_checked).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}</p>
                        )}
                      </div>
                    )}
                    {/* Contacts */}
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Contacts</h3>
                      {(() => {
                        const engagedContactIds = new Set(activities.map(a => a.contact_id).filter(Boolean));
                        const companyContacts = contacts.filter(c => c.company_id === selectedCompany.id && c.is_active !== false);
                        // Sort: engaged first, then primary, then alphabetical
                        const sorted = [...companyContacts].sort((a, b) => {
                          const aEngaged = engagedContactIds.has(a.id) ? 1 : 0;
                          const bEngaged = engagedContactIds.has(b.id) ? 1 : 0;
                          if (aEngaged !== bEngaged) return bEngaged - aEngaged;
                          if (a.is_primary && !b.is_primary) return -1;
                          if (!a.is_primary && b.is_primary) return 1;
                          return a.name.localeCompare(b.name);
                        });
                        return sorted.map(c => {
                          const engaged = engagedContactIds.has(c.id);
                          const activityCount = activities.filter(a => a.contact_id === c.id).length;
                          return (
                            <div key={c.id} onClick={() => setSelection({ type: "contact", id: c.id })}
                              className={`flex items-center gap-1.5 text-xs rounded px-1 py-0.5 cursor-pointer ${
                                engaged
                                  ? "text-zinc-800 dark:text-zinc-200 hover:bg-teal-50 dark:hover:bg-teal-950/20"
                                  : "text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                              }`}>
                              <User size={10} className={engaged ? "text-teal-500" : "text-zinc-300 dark:text-zinc-600"} />
                              <span className={engaged ? "font-medium" : ""}>{c.name}</span>
                              {c.is_primary && <span className="text-[8px] px-1 rounded bg-teal-50 dark:bg-teal-950/30 text-teal-500">Primary</span>}
                              {engaged && <span className="text-[8px] px-1 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-500">{activityCount} {activityCount === 1 ? "activity" : "activities"}</span>}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    {/* Activities */}
                    <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Activities</h3>
                      {activities.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 italic">No activities yet</p>
                      ) : activities.slice(0, 8).map(a => (
                        <div key={a.id} className="text-[11px] mb-1">
                          <span className="text-[9px] px-1 rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 mr-1">{ACTIVITY_TYPES.find(t => t.value === a.type)?.label || a.type}</span>
                          {a.subject && <span className="text-zinc-600 dark:text-zinc-300">{a.subject}</span>}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <button onClick={() => deleteEntity("crm_companies", selectedCompany.id, selectedCompany.name, async () => {
                        await supabase.from("crm_activities").delete().eq("company_id", selectedCompany.id);
                        await supabase.from("crm_contacts").delete().eq("company_id", selectedCompany.id);
                        await supabase.from("crm_email_company_links").delete().eq("company_id", selectedCompany.id);
                      })} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={11} /> Delete</button>
                    </div>
                  </div>
                )}
                {/* Contact */}
                {selectedContact && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedContact.name}</h2>
                      <button
                        onClick={() => { navigator.clipboard.writeText(selectedContact.id); toast.success("Contact ID copied"); }}
                        className="font-mono text-[10px] text-zinc-300 dark:text-zinc-600 hover:text-teal-500 dark:hover:text-teal-400 transition-colors cursor-pointer"
                        title={selectedContact.id}
                      >
                        {selectedContact.id.slice(0, 8)}
                      </button>
                      {selectedContact.source === "apollo" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded" title={`Apollo ID: ${selectedContact.source_id || "—"}`}>
                          Apollo
                        </span>
                      )}
                    </div>
                    {selectedContact.role && <p className="text-[11px] text-zinc-500 mb-3">{selectedContact.role}</p>}
                    {selectedContact.email_status && (
                      <p className="text-[10px] mb-2">
                        <span className={`px-1.5 py-0.5 rounded ${
                          selectedContact.email_status === "verified" ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" :
                          selectedContact.email_status === "guessed" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                          "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                        }`}>
                          Email: {selectedContact.email_status}
                        </span>
                      </p>
                    )}
                    <FieldGrid fields={[
                      { label: "Name", field: "name", value: selectedContact.name },
                      { label: "Email", field: "email", value: selectedContact.email },
                      { label: "Phone", field: "phone", value: selectedContact.phone },
                      { label: "Role", field: "role", value: selectedContact.role },
                      { label: "Department", field: "department", value: selectedContact.department },
                      { label: "LinkedIn", field: "linkedin_url", value: selectedContact.linkedin_url },
                      { label: "Primary", field: "is_primary", value: selectedContact.is_primary ? "Yes" : "No", type: "select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
                      { label: "Notes", field: "notes", value: selectedContact.notes, type: "textarea" },
                    ]} onUpdate={(f, v) => { updateEntity("crm_contacts", selectedContact.id, f, f === "is_primary" ? v === "true" : v); }} />
                    {!selectedContact.phone && selectedContact.source_id && (
                      <RequestPhoneButton contactId={selectedContact.id} onSuccess={() => refetchContacts()} />
                    )}
                    <div className="mt-3 text-xs text-zinc-400 flex items-center gap-1">
                      Company:
                      <select
                        value={selectedContact.company_id || ""}
                        onChange={(e) => updateEntity("crm_contacts", selectedContact.id, "company_id", e.target.value || null)}
                        className="text-xs bg-transparent text-teal-600 dark:text-teal-400 border-none cursor-pointer hover:underline focus:outline-none"
                      >
                        <option value="">(no company)</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.display_name || c.name}</option>
                        ))}
                      </select>
                    </div>
                    {/* Activities */}
                    <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Activities</h3>
                      {activities.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 italic">No activities yet</p>
                      ) : activities.slice(0, 8).map(a => (
                        <div key={a.id} className="text-[11px] mb-1">
                          <span className="text-[9px] px-1 rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 mr-1">{ACTIVITY_TYPES.find(t => t.value === a.type)?.label || a.type}</span>
                          {a.subject && <span className="text-zinc-600 dark:text-zinc-300">{a.subject}</span>}
                        </div>
                      ))}
                    </div>
                    {/* Pending Email Drafts */}
                    {pendingDrafts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                          Drafts ({pendingDrafts.length})
                        </h3>
                        <div className="space-y-3">
                          {pendingDrafts.map(draft => (
                            <div key={draft.id} className="rounded-lg overflow-hidden">
                              {/* Header bar */}
                              <div className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800">
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate flex-1 mr-2">{draft.subject}</div>
                                  <button
                                    onClick={() => { if (confirm("Delete this draft?")) deleteDraft.mutate(draft.id); }}
                                    className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex-shrink-0"
                                    title="Delete draft"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                                <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                  To: <span className="text-zinc-600 dark:text-zinc-300">{draft.to_email}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[10px] text-zinc-400 flex-shrink-0">From:</span>
                                  <input
                                    type="text"
                                    defaultValue={draft.from_name}
                                    onBlur={(e) => { if (e.target.value !== draft.from_name) updateDraft.mutate({ draftId: draft.id, updates: { from_name: e.target.value } }); }}
                                    className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 w-24"
                                    title="Sender name"
                                  />
                                  <span className="text-[10px] text-zinc-300 dark:text-zinc-600">&lt;</span>
                                  <input
                                    type="email"
                                    defaultValue={draft.from_email}
                                    onBlur={(e) => { if (e.target.value !== draft.from_email) updateDraft.mutate({ draftId: draft.id, updates: { from_email: e.target.value } }); }}
                                    className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500 flex-1 min-w-0"
                                    title="Sender email"
                                  />
                                  <span className="text-[10px] text-zinc-300 dark:text-zinc-600">&gt;</span>
                                </div>
                              </div>
                              {/* Email preview */}
                              <div className="border border-t-0 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                                <iframe
                                  srcDoc={draft.html_body}
                                  className="w-full border-0"
                                  style={{ height: "300px" }}
                                  sandbox="allow-same-origin"
                                  title={`Preview: ${draft.subject}`}
                                />
                              </div>
                              {/* Actions */}
                              <div className="border border-t-0 border-zinc-200 dark:border-zinc-800 rounded-b-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 space-y-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="email"
                                    placeholder="Test email address..."
                                    value={draftTestOpen === draft.id ? draftTestEmail : ""}
                                    onFocus={() => { setDraftTestOpen(draft.id); if (!draftTestEmail) setDraftTestEmail("melvin@thinkval.ai"); }}
                                    onChange={(e) => { setDraftTestOpen(draft.id); setDraftTestEmail(e.target.value); }}
                                    className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                  />
                                  <button
                                    onClick={() => {
                                      const email = draftTestOpen === draft.id ? draftTestEmail : "melvin@thinkval.ai";
                                      if (email) sendDraft.mutate({ draftId: draft.id, testEmail: email });
                                    }}
                                    disabled={sendDraft.isPending}
                                    className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50 transition-colors whitespace-nowrap"
                                  >
                                    <FlaskConical size={10} /> Send Test
                                  </button>
                                </div>
                                <button
                                  onClick={() => { if (confirm(`Send this email to ${draft.to_email}?`)) sendDraft.mutate({ draftId: draft.id }); }}
                                  disabled={sendDraft.isPending}
                                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
                                >
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
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                          <Mail size={10} className="inline mr-1 -mt-0.5" />
                          Sent Emails ({sentEmails.length})
                        </h3>
                        <div className="space-y-0.5">
                          {sentEmails.map(email => (
                            <SentEmailRow
                              key={email.id}
                              email={email}
                              isExpanded={expandedSentEmail === email.id}
                              onToggle={() => setExpandedSentEmail(expandedSentEmail === email.id ? null : email.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <button onClick={() => deleteEntity("crm_contacts", selectedContact.id, selectedContact.name)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={11} /> Delete</button>
                    </div>
                  </div>
                )}
                {/* Initiative */}
                {selectedInitiative && (
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">{selectedInitiative.name}</h2>
                    <FieldGrid fields={[
                      { label: "Name", field: "name", value: selectedInitiative.name },
                      { label: "Description", field: "description", value: selectedInitiative.description, type: "textarea" },
                      { label: "Owner", field: "owner", value: selectedInitiative.owner },
                      { label: "Status", field: "status", value: selectedInitiative.status, type: "select", options: [{ value: "planned", label: "Planned" }, { value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "paused", label: "Paused" }] },
                      { label: "Health", field: "health", value: selectedInitiative.health, type: "select", options: [{ value: "on_track", label: "On Track" }, { value: "at_risk", label: "At Risk" }, { value: "off_track", label: "Off Track" }] },
                      { label: "Target Date", field: "target_date", value: selectedInitiative.target_date },
                      { label: "Color", field: "color", value: selectedInitiative.color },
                    ]} onUpdate={(f, v) => updateEntity("initiatives", selectedInitiative.id, f, v)} />
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <button onClick={() => deleteEntity("initiatives", selectedInitiative.id, selectedInitiative.name, async () => {
                        await supabase.from("initiative_projects").delete().eq("initiative_id", selectedInitiative.id);
                      })} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={11} /> Delete</button>
                    </div>
                  </div>
                )}
                {/* Label */}
                {selectedLabel && (
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedLabel.color || "#6B7280" }} />{selectedLabel.name}
                    </h2>
                    <FieldGrid fields={[
                      { label: "Name", field: "name", value: selectedLabel.name },
                      { label: "Color", field: "color", value: selectedLabel.color },
                      { label: "Description", field: "description", value: selectedLabel.description, type: "textarea" },
                    ]} onUpdate={(f, v) => updateEntity("labels", selectedLabel.id, f, v)} />
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <button onClick={() => deleteEntity("labels", selectedLabel.id, selectedLabel.name, async () => {
                        await supabase.from("task_labels").delete().eq("label_id", selectedLabel.id);
                      })} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={11} /> Delete</button>
                    </div>
                  </div>
                )}
                {/* User */}
                {selectedUser && (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      {selectedUser.avatar_url && <img src={selectedUser.avatar_url} className="w-8 h-8 rounded-full" />}
                      <div>
                        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedUser.name}</h2>
                        <span className={cn("text-[9px] px-1.5 rounded-full font-semibold uppercase", selectedUser.type === "bot" ? "bg-purple-50 text-purple-500 dark:bg-purple-900/50 dark:text-purple-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-400")}>{selectedUser.type}</span>
                      </div>
                    </div>
                    <FieldGrid fields={[
                      { label: "Name", field: "name", value: selectedUser.name },
                      { label: "Email", field: "email", value: selectedUser.email },
                      { label: "Type", field: "type", value: selectedUser.type, type: "select", options: [{ value: "human", label: "Human" }, { value: "bot", label: "Bot" }] },
                      { label: "GitHub", field: "github_username", value: selectedUser.github_username },
                      { label: "Department", field: "bot_department", value: selectedUser.bot_department },
                    ]} onUpdate={(f, v) => updateEntity("users", selectedUser.id, f, v)} />
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <button onClick={() => deleteEntity("users", selectedUser.id, selectedUser.name)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={11} /> Delete</button>
                    </div>
                  </div>
                )}
                {/* Partner */}
                {selectedPartner && (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <Handshake size={18} className="text-teal-500" />
                      <div>
                        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{selectedPartner.name}</h2>
                        <span className={cn("text-[9px] px-1.5 rounded-full font-semibold uppercase", selectedPartner.active ? "bg-emerald-50 text-emerald-500 dark:bg-emerald-900/50 dark:text-emerald-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-400")}>{selectedPartner.active ? "active" : "inactive"}</span>
                      </div>
                    </div>
                    <FieldGrid fields={[
                      { label: "Name", field: "name", value: selectedPartner.name },
                      { label: "Company", field: "company", value: selectedPartner.company },
                      { label: "Email", field: "email", value: selectedPartner.email },
                      { label: "Phone", field: "phone", value: selectedPartner.phone },
                      { label: "Active", field: "active", value: selectedPartner.active ? "true" : "false", type: "select", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
                      { label: "Code", field: "code", value: selectedPartner.code },
                    ]} onUpdate={(f, v) => updateEntity("partner_access", selectedPartner.id, f, f === "active" ? v === "true" : v)} />
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Referred Companies</h3>
                      {companies.filter(c => c.partner_id === selectedPartner.id).length === 0
                        ? <p className="text-xs text-zinc-400">No companies linked</p>
                        : companies.filter(c => c.partner_id === selectedPartner.id).map(c => (
                          <div key={c.id} onClick={() => { setSubTab("companies"); setSelection({ type: "company", id: c.id }); }}
                            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-teal-500 cursor-pointer py-0.5">{c.display_name || c.name}</div>
                        ))
                      }
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <button onClick={() => deleteEntity("partner_access", selectedPartner.id, selectedPartner.name)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={11} /> Delete</button>
                    </div>
                  </div>
                )}
                {/* Lookup */}
                {selectedLookup && (
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1 flex items-center gap-2">
                      {selectedLookup.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedLookup.color }} />}
                      {selectedLookup.label}
                    </h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-medium">{selectedLookup.type}</span>
                    <div className="mt-3">
                      <FieldGrid fields={[
                        { label: "Value", field: "value", value: selectedLookup.value },
                        { label: "Label", field: "label", value: selectedLookup.label },
                        { label: "Color", field: "color", value: selectedLookup.color },
                        { label: "Icon", field: "icon", value: selectedLookup.icon },
                        { label: "Weight", field: "weight", value: selectedLookup.weight },
                        { label: "Sort Order", field: "sort_order", value: selectedLookup.sort_order },
                      ]} onUpdate={(f, v) => updateEntity("lookup_values", selectedLookup.id, f, f === "weight" || f === "sort_order" ? (parseFloat(v as string) || 0) : v)} />
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <button onClick={() => deleteEntity("lookup_values", selectedLookup.id, selectedLookup.label)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={11} /> Delete</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
          </div>
        </div>
      </div>

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input type="text" value={newLayoutName} onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName); else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); } }}
              placeholder="Enter layout name..." autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 mb-4" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }}>Cancel</Button>
              <Button size="md" onClick={() => saveCurrentLayout(newLayoutName)} disabled={!newLayoutName.trim()}>Save</Button>
            </div>
          </div>
        </div>
      )}
      {showLayoutMenu && <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />}
      {jobModal && <JobDetailsModal job={jobModal} onClose={() => setJobModal(null)} />}
    </div>
  );
}

function JobDetailsModal({ job, onClose }: { job: any; onClose: () => void }) {
  const { data: posting, isLoading } = useQuery({
    queryKey: ["mcf-job-posting", job.url, job.title],
    queryFn: async () => {
      if (job.url) {
        const { data } = await supabase.schema("public_data").from("mcf_job_postings")
          .select("*").eq("job_details_url", job.url).maybeSingle();
        if (data) return data;
      }
      const { data } = await supabase.schema("public_data").from("mcf_job_postings")
        .select("*").eq("title", job.title).order("new_posting_date", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const p: any = posting || {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{job.title}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              {(job.salary_min || job.salary_max) && (
                <span>${job.salary_min?.toLocaleString() || "?"} – ${job.salary_max?.toLocaleString() || "?"}</span>
              )}
              {job.role_category && <span className="capitalize">{job.role_category}</span>}
              {job.posted && <span>Posted {job.posted}</span>}
              {job.url && <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-teal-500 hover:text-teal-600">View on MCF ↗</a>}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto text-xs text-zinc-700 dark:text-zinc-300 space-y-3">
          {isLoading && <div className="text-zinc-400">Loading full posting…</div>}
          {!isLoading && !posting && <div className="text-zinc-400">No matching posting found in mcf_job_postings.</div>}
          {posting && (
            <>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                {p.employment_types?.length > 0 && <Field label="Employment">{p.employment_types.join(", ")}</Field>}
                {p.position_levels?.length > 0 && <Field label="Level">{p.position_levels.join(", ")}</Field>}
                {p.minimum_years_experience != null && <Field label="Min experience">{p.minimum_years_experience} yrs</Field>}
                {p.number_of_vacancies != null && <Field label="Vacancies">{p.number_of_vacancies}</Field>}
                {p.categories?.length > 0 && <Field label="Categories">{p.categories.join(", ")}</Field>}
                {p.seniority && <Field label="Seniority">{p.seniority}</Field>}
                {p.industry_tag && <Field label="Industry">{p.industry_tag}</Field>}
                {p.finance_function && <Field label="Finance function">{p.finance_function}</Field>}
                {p.new_posting_date && <Field label="Posted">{p.new_posting_date}</Field>}
                {p.expiry_date && <Field label="Expires">{p.expiry_date}</Field>}
                {(p.address_street || p.address_postal_code) && <Field label="Location">{[p.address_block, p.address_street, p.address_postal_code].filter(Boolean).join(" ")}</Field>}
                {p.total_views != null && <Field label="Views">{p.total_views}</Field>}
                {p.total_applications != null && <Field label="Applications">{p.total_applications}</Field>}
              </div>
              {p.description && (
                <div>
                  <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Description</div>
                  <div className="whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: p.description }} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-400 uppercase tracking-wider">{label}</div>
      <div className="text-zinc-700 dark:text-zinc-300">{children}</div>
    </div>
  );
}
