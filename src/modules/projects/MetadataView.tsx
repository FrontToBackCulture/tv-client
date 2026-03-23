// MetadataView — AG Grid tables for Companies, Initiatives, Labels, Users
// Double-click row → detail panel on right

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef, ModuleRegistry, AllCommunityModule, CellValueChangedEvent, GetRowIdParams,
} from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import {
  Search, Download, FileSpreadsheet, Maximize2, X, RotateCcw,
  Building2, Target, Tag, Bot, Trash2, User,
  Bookmark, ChevronsLeftRight, Columns, Star, Save, WrapText,
} from "lucide-react";
import { cn } from "../../lib/cn";
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
import { Settings, FolderOpen, ChevronRight, ChevronDown, Folder, RefreshCw } from "lucide-react";
import { useRepository } from "../../stores/repositoryStore";
import { useFolderChildren } from "../../hooks/useFiles";
import { useApolloRevealPhone } from "../../hooks/apollo/useApollo";

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

function MiniTreeNode({ path, name, level, onSelect }: {
  path: string; name: string; level: number; onSelect: (relativePath: string) => void;
}) {
  const [expanded, setExpanded] = useState(level === 0);
  const { data } = useFolderChildren(path, expanded);
  const { activeRepository } = useRepository();
  const basePath = activeRepository?.path ?? "";
  const dirs = (data ?? []).filter((c: { is_directory: boolean }) => c.is_directory).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

  const relativePath = basePath && path.startsWith(basePath) ? path.slice(basePath.length + 1) : path;

  return (
    <div>
      <button
        className="flex items-center gap-1 w-full text-left px-1 py-0.5 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded text-xs group"
        onClick={() => setExpanded(!expanded)}
        onDoubleClick={() => onSelect(relativePath)}
      >
        {dirs.length > 0 || !expanded ? (
          expanded ? <ChevronDown size={10} className="text-zinc-400 shrink-0" /> : <ChevronRight size={10} className="text-zinc-400 shrink-0" />
        ) : <span className="w-[10px] shrink-0" />}
        <Folder size={12} className="text-zinc-400 shrink-0" />
        <span className="truncate text-zinc-700 dark:text-zinc-300">{name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(relativePath); }}
          className="ml-auto opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 bg-teal-500 text-white rounded transition-opacity shrink-0"
        >
          Select
        </button>
      </button>
      {expanded && dirs.map((d: { path: string; name: string }) => (
        <div key={d.path} style={{ paddingLeft: 12 }}>
          <MiniTreeNode path={d.path} name={d.name} level={level + 1} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}

function FolderPickerField({ value, onSave }: { value: string | null | undefined; onSave: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const ref = useRef<HTMLInputElement>(null);
  const { activeRepository } = useRepository();
  const basePath = activeRepository?.path ?? "";

  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {editing ? (
          <input
            ref={ref}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); if (draft !== String(value ?? "")) onSave(draft); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); if (draft !== String(value ?? "")) onSave(draft); } if (e.key === "Escape") setEditing(false); }}
            className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none flex-1"
          />
        ) : (
          <button
            onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
            className="text-left flex-1 min-h-[20px] cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/20 rounded px-1.5 py-0.5 -mx-1 transition-colors border border-transparent hover:border-teal-200 dark:hover:border-teal-800"
          >
            {value ? <span className="text-zinc-700 dark:text-zinc-300 text-xs">{value}</span> : <span className="text-zinc-300 dark:text-zinc-600 text-xs">—</span>}
          </button>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-teal-500 transition-colors shrink-0"
          title="Browse folders"
        >
          <FolderOpen size={13} />
        </button>
      </div>
      {open && basePath && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-[300px] overflow-auto p-1">
          <MiniTreeNode path={basePath} name={activeRepository?.name ?? "Library"} level={0} onSelect={(p) => { onSave(p); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

// ── Email domains field with auto-populate from contacts ──────────────────

function EmailDomainsField({ value, companyId, contacts, onSave }: {
  value: string | null | undefined;
  companyId: string;
  contacts: { email: string; company_id: string }[];
  onSave: (val: string) => void;
}) {
  const [syncing, setSyncing] = useState(false);

  async function autoPopulate() {
    setSyncing(true);
    try {
      const companyContacts = contacts.filter(c => c.company_id === companyId);
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
        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-teal-500 transition-colors shrink-0 disabled:opacity-50"
        title="Auto-populate from contacts' emails"
      >
        <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

type FieldType = "text" | "textarea" | "select" | "folder_picker" | "email_domains";

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
          {type === "folder_picker" ? (
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

type SubTab = "companies" | "contacts" | "initiatives" | "labels" | "users"
  | "deal_stage" | "deal_solution" | "company_stage" | "activity_type" | "project_status" | "project_health" | "project_type";

// ── Main component ──────────────────────────────────────────────────────────

export function MetadataView() {
  const theme = useAppStore((s) => s.theme);
  const [subTab, setSubTab] = useState<SubTab>("companies");
  const [quickFilter, setQuickFilter] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wrapNotes, setWrapNotes] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [savedLayouts, setSavedLayouts] = useState<Record<string, object>>(() => {
    try { return JSON.parse(localStorage.getItem("tv-desktop-metadata-grid-layouts") || "{}"); } catch { return {}; }
  });
  const [defaultLayoutName, setDefaultLayoutName] = useState<string | null>(() => localStorage.getItem("tv-desktop-metadata-grid-default-layout"));
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

  const selectedCompany = selection?.type === "company" ? companies.find(c => c.id === selection.id) : null;
  const selectedContact = selection?.type === "contact" ? contacts.find(c => c.id === selection.id) : null;
  const selectedInitiative = selection?.type === "initiative" ? initiatives.find(i => i.id === selection.id) : null;
  const selectedLabel = selection?.type === "label" ? labels.find(l => l.id === selection.id) : null;
  const selectedUser = selection?.type === "user" ? users.find(u => u.id === selection.id) : null;
  const selectedLookup = selection?.type === "lookup" ? lookupValues.find(l => l.id === selection.id) : null;

  const activityCompanyId = selectedCompany?.id || (selectedContact ? selectedContact.company_id : null);
  const { data: activities = [] } = useActivities(activityCompanyId ? { companyId: activityCompanyId, limit: 20 } : undefined);

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

  const updateEntity = async (table: string, id: string, field: string, value: any) => {
    await supabase.from(table).update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", id);
    refetchCompanies(); refetchContacts(); refetchInitiatives(); refetchLabels(); refetchUsers(); refetchLookups();
  };

  const deleteEntity = async (table: string, id: string, name: string, deps?: () => Promise<void>) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    if (deps) await deps();
    await supabase.from(table).delete().eq("id", id);
    setSelection(null);
    refetchCompanies(); refetchContacts(); refetchInitiatives(); refetchLabels(); refetchUsers(); refetchLookups();
    toast.info(`"${name}" deleted`);
  };

  // ── Layout management ──────────────────────────────────────────────────

  const STORAGE_KEY = "tv-desktop-metadata-grid-layouts";
  const DEFAULT_KEY = "tv-desktop-metadata-grid-default-layout";

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

  const saveCurrentLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api || !name.trim()) return;
    const layout = { columnState: api.getColumnState(), filterModel: api.getFilterModel(), rowGroupColumns: api.getRowGroupColumns().map((c: any) => c.getColId()), savedAt: new Date().toISOString() };
    const newLayouts = { ...savedLayouts, [name.trim()]: layout };
    setSavedLayouts(newLayouts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayouts));
    setShowSaveDialog(false); setNewLayoutName("");
    toast.success(`Layout "${name.trim()}" saved`);
  }, [savedLayouts]);

  const loadLayout = useCallback((name: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const layout = savedLayouts[name] as any;
    if (!layout) return;
    api.setRowGroupColumns([]);
    api.applyColumnState({ state: layout.columnState, applyOrder: true });
    if (layout.rowGroupColumns?.length) api.setRowGroupColumns(layout.rowGroupColumns);
    if (layout.filterModel) api.setFilterModel(layout.filterModel); else api.setFilterModel(null);
    setShowLayoutMenu(false);
    toast.info(`Layout "${name}" applied`);
  }, [savedLayouts]);

  const deleteLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const n = { ...savedLayouts }; delete n[name];
    setSavedLayouts(n);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(n));
    if (defaultLayoutName === name) { setDefaultLayoutName(null); localStorage.removeItem(DEFAULT_KEY); }
    toast.info(`Layout "${name}" deleted`);
  }, [savedLayouts, defaultLayoutName]);

  const toggleDefaultLayout = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (defaultLayoutName === name) { setDefaultLayoutName(null); localStorage.removeItem(DEFAULT_KEY); }
    else { setDefaultLayoutName(name); localStorage.setItem(DEFAULT_KEY, name); }
  }, [defaultLayoutName]);

  // ── Column defs per sub-tab ─────────────────────────────────────────────

  const companyColumns: ColDef[] = useMemo(() => [
    { field: "name", headerName: "Name", flex: 1, filter: "agTextColumnFilter", editable: true, pinned: "left" },
    { field: "display_name", headerName: "Display Name", width: 150, editable: true },
    { field: "stage", headerName: "Stage", width: 110, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: COMPANY_STAGES.map(s => s.value) },
      cellRenderer: (p: any) => p.value ? <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
        p.value === "client" ? "bg-emerald-50 text-emerald-700" : p.value === "prospect" ? "bg-zinc-100 text-zinc-600" : p.value === "opportunity" ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-500"
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
    { field: "contact_count", headerName: "Contacts", width: 80, type: "numericColumn" },
    { field: "notes", headerName: "Notes", width: 200, editable: true, hide: true },
    { field: "updated_at", headerName: "Updated", width: 100, valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-SG", { month: "short", day: "numeric" }) : "" },
  ], []);

  const companyRows = useMemo(() => companies.map(c => ({
    ...c,
    contact_count: contacts.filter(ct => ct.company_id === c.id).length,
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
    { field: "source", headerName: "Source", width: 80, filter: "agSetColumnFilter",
      cellRenderer: (p: any) => p.value === "apollo" ? <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded font-medium">Apollo</span> : p.value ? <span className="text-zinc-400 text-xs">{p.value}</span> : null,
    },
    { field: "email_status", headerName: "Email Status", width: 100, filter: "agSetColumnFilter",
      cellRenderer: (p: any) => p.value === "verified" ? <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded font-medium">Verified</span> : p.value === "guessed" ? <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded font-medium">Guessed</span> : p.value ? <span className="text-zinc-400 text-xs">{p.value}</span> : null,
    },
    { field: "linkedin_url", headerName: "LinkedIn", width: 180, editable: true, hide: true },
    { field: "notes", headerName: "Notes", width: 200, editable: true, hide: true },
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
        p.value === "active" ? "bg-emerald-50 text-emerald-700" : p.value === "planned" ? "bg-zinc-100 text-zinc-600" : p.value === "completed" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
      )}>{p.value}</span> : null,
    },
    { field: "health", headerName: "Health", width: 90, editable: true, filter: "agSetColumnFilter",
      cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["on_track", "at_risk", "off_track", ""] },
      cellRenderer: (p: any) => p.value ? <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
        p.value === "on_track" ? "bg-emerald-50 text-emerald-700" : p.value === "at_risk" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
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
      cellRenderer: (p: any) => p.value ? <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", p.value === "bot" ? "bg-purple-50 text-purple-600" : "bg-zinc-100 text-zinc-500")}>{p.value}</span> : null,
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
      cellRenderer: (p: any) => p.value ? <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: p.value }} /><span className="text-[10px] text-zinc-500">{p.value}</span></span> : null,
    },
    { field: "icon", headerName: "Icon", width: 100, editable: true },
    { field: "weight", headerName: "Weight", width: 80, editable: true, type: "numericColumn" },
    { field: "sort_order", headerName: "Order", width: 70, editable: true, type: "numericColumn" },
  ], []);

  const isLookupTab = ["deal_stage", "deal_solution", "company_stage", "activity_type", "project_status", "project_health", "project_type"].includes(subTab);
  const currentColumns = subTab === "companies" ? companyColumns : subTab === "contacts" ? contactColumns : subTab === "initiatives" ? initiativeColumns : subTab === "labels" ? labelColumns : isLookupTab ? lookupColumns : userColumns;
  const currentRows = subTab === "companies" ? companyRows : subTab === "contacts" ? contactRows : subTab === "initiatives" ? initiatives : subTab === "labels" ? labels : isLookupTab ? lookupValues.filter(l => l.type === subTab) : users;
  const currentTable = subTab === "companies" ? "crm_companies" : subTab === "contacts" ? "crm_contacts" : subTab === "initiatives" ? "initiatives" : subTab === "labels" ? "labels" : isLookupTab ? "lookup_values" : "users";

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true, cellClass: "text-xs", enableRowGroup: true,
  }), []);

  const getRowId = useCallback((params: GetRowIdParams) => params.data.id, []);

  const handleCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue } = event;
    if (!data || !colDef.field) return;
    if (["contact_count"].includes(colDef.field)) return;
    await supabase.from(currentTable).update({ [colDef.field]: newValue || null, updated_at: new Date().toISOString() }).eq("id", data.id);
    refetchCompanies(); refetchContacts(); refetchInitiatives(); refetchLabels(); refetchUsers(); refetchLookups();
  }, [currentTable]);

  const handleRowDoubleClicked = useCallback((e: any) => {
    if (!e.data) return;
    const type = subTab === "companies" ? "company" : subTab === "contacts" ? "contact" : subTab === "initiatives" ? "initiative" : subTab === "labels" ? "label" : isLookupTab ? "lookup" : "user";
    setSelection({ type, id: e.data.id });
  }, [subTab]);

  const exportToCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({ fileName: `${subTab}-${new Date().toISOString().slice(0, 10)}.csv` });
  }, [subTab]);

  const exportToExcel = useCallback(() => {
    gridRef.current?.api.exportDataAsExcel({ fileName: `${subTab}-${new Date().toISOString().slice(0, 10)}.xlsx`, sheetName: subTab });
  }, [subTab]);

  const themeClass = theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine";

  const tabs: { id: SubTab; label: string; icon: any; count: number }[] = [
    { id: "companies", label: "Companies", icon: Building2, count: companies.length },
    { id: "contacts", label: "Contacts", icon: User, count: contacts.length },
    { id: "initiatives", label: "Initiatives", icon: Target, count: initiatives.length },
    { id: "labels", label: "Labels", icon: Tag, count: labels.length },
    { id: "users", label: "Users", icon: Bot, count: users.length },
    { id: "deal_stage", label: "Deal Stages", icon: Settings, count: lookupValues.filter(l => l.type === "deal_stage").length },
    { id: "deal_solution", label: "Solutions", icon: Settings, count: lookupValues.filter(l => l.type === "deal_solution").length },
    { id: "company_stage", label: "Co. Stages", icon: Settings, count: lookupValues.filter(l => l.type === "company_stage").length },
    { id: "activity_type", label: "Activity Types", icon: Settings, count: lookupValues.filter(l => l.type === "activity_type").length },
    { id: "project_status", label: "Statuses", icon: Settings, count: lookupValues.filter(l => l.type === "project_status").length },
    { id: "project_health", label: "Health", icon: Settings, count: lookupValues.filter(l => l.type === "project_health").length },
    { id: "project_type", label: "Project Types", icon: Settings, count: lookupValues.filter(l => l.type === "project_type").length },
  ];

  const hasSelection = !!selection;

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 flex flex-col" : "h-full flex flex-col"}>
      <style>{groupRowStyles}{themeStyles}{`
        .ag-theme-alpine .ag-cell, .ag-theme-alpine-dark .ag-cell { display: flex; align-items: center; }
      `}</style>

      {/* Description */}
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <p className="text-xs text-zinc-400">
          Reference data shared across projects — companies, contacts, initiatives, labels, and configurable lookup values (deal stages, statuses, etc.).
        </p>
      </div>

      {/* Sub-tab + toolbar */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => { setSubTab(tab.id); setSelection(null); setQuickFilter(""); gridRef.current?.api?.setGridOption("quickFilterText", ""); }}
                className={cn("px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5",
                  subTab === tab.id ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent"
                )}>
                <Icon size={13} />{tab.label} <span className="text-[9px] text-zinc-400">{tab.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder="Filter..." value={quickFilter}
              onChange={(e) => { setQuickFilter(e.target.value); gridRef.current?.api?.setGridOption("quickFilterText", e.target.value); }}
              className="w-48 px-2.5 py-1.5 pl-8 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-teal-500" />
          </div>

          {/* Layouts dropdown */}
          <div className="relative">
            <button onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
              <Bookmark size={13} /> Layouts
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 py-1">
                <button onClick={() => { applyFlatLayout(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"><Columns size={13} /> Flat View</button>
                <button onClick={() => { autoSizeAllColumns(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"><ChevronsLeftRight size={13} /> Auto-fit Columns</button>
                <button onClick={() => { resetLayout(); setShowLayoutMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"><RotateCcw size={13} /> Reset to Default</button>
                <div className="border-t border-zinc-200 dark:border-zinc-700 my-1" />
                <button onClick={() => { setShowLayoutMenu(false); setShowSaveDialog(true); }} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"><span className="text-green-600">+</span> Save current layout...</button>
                {Object.keys(savedLayouts).length > 0 && (
                  <>
                    <div className="border-t border-zinc-200 dark:border-zinc-700 my-1" />
                    <div className="px-3 py-1 text-xs font-medium text-zinc-500">Saved Layouts</div>
                    {Object.keys(savedLayouts).map(name => (
                      <div key={name} onClick={() => loadLayout(name)} className="w-full px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center justify-between cursor-pointer group">
                        <span className="truncate flex items-center gap-1.5">{defaultLayoutName === name && <Star size={11} className="text-amber-500 fill-amber-500" />}{name}</span>
                        <div className="flex items-center gap-0.5">
                          <button onClick={(e) => { e.stopPropagation(); saveCurrentLayout(name); }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-teal-500"><Save size={12} /></button>
                          <button onClick={(e) => toggleDefaultLayout(name, e)} className={cn("p-1 rounded", defaultLayoutName === name ? "text-amber-500" : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500")}><Star size={12} className={defaultLayoutName === name ? "fill-amber-500" : ""} /></button>
                          <button onClick={(e) => deleteLayout(name, e)} className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-500"><X size={12} /></button>
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
              wrapNotes ? "border-teal-500 bg-teal-500/20 text-teal-600" : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            )} title={wrapNotes ? "Truncate text" : "Wrap text"}>
            <WrapText size={13} />
          </button>

          <Button variant="secondary" size="sm" icon={Download} onClick={exportToCsv}>CSV</Button>
          <Button size="sm" icon={FileSpreadsheet} onClick={exportToExcel}>Excel</Button>

          <button onClick={() => setIsFullscreen(!isFullscreen)}
            className={cn("p-1.5 rounded-lg border transition-colors", isFullscreen ? "border-teal-500 bg-teal-500/20 text-teal-600" : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700")}>
            {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Body: grid + optional detail panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Grid */}
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
            animateRows
            enableRangeSelection
            enableBrowserTooltips
            singleClickEdit
            stopEditingWhenCellsLoseFocus
            rowSelection="single"
            suppressRowClickSelection
            headerHeight={32}
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
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Details</span>
                <button onClick={() => setSelection(null)} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={14} /></button>
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
                      { label: "Notes", field: "notes", value: selectedCompany.notes, type: "textarea" },
                    ]} onUpdate={(f, v) => updateEntity("crm_companies", selectedCompany.id, f, v)} companyId={selectedCompany.id} contacts={contacts} />
                    {/* Contacts */}
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Contacts</h3>
                      {(() => {
                        const engagedContactIds = new Set(activities.map(a => a.contact_id).filter(Boolean));
                        const companyContacts = contacts.filter(c => c.company_id === selectedCompany.id);
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
                    {activities.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Activities</h3>
                        {activities.slice(0, 8).map(a => (
                          <div key={a.id} className="text-[11px] mb-1">
                            <span className="text-[9px] px-1 rounded bg-zinc-100 text-zinc-500 mr-1">{ACTIVITY_TYPES.find(t => t.value === a.type)?.label || a.type}</span>
                            {a.subject && <span className="text-zinc-600">{a.subject}</span>}
                          </div>
                        ))}
                      </div>
                    )}
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
                          "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
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
                        value={selectedContact.company_id}
                        onChange={(e) => updateEntity("crm_contacts", selectedContact.id, "company_id", e.target.value)}
                        className="text-xs bg-transparent text-teal-600 dark:text-teal-400 border-none cursor-pointer hover:underline focus:outline-none"
                      >
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.display_name || c.name}</option>
                        ))}
                      </select>
                    </div>
                    {/* Activities */}
                    {activities.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Activities</h3>
                        {activities.slice(0, 8).map(a => (
                          <div key={a.id} className="text-[11px] mb-1">
                            <span className="text-[9px] px-1 rounded bg-zinc-100 text-zinc-500 mr-1">{ACTIVITY_TYPES.find(t => t.value === a.type)?.label || a.type}</span>
                            {a.subject && <span className="text-zinc-600">{a.subject}</span>}
                          </div>
                        ))}
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
                        <span className={cn("text-[9px] px-1.5 rounded-full font-semibold uppercase", selectedUser.type === "bot" ? "bg-purple-50 text-purple-500" : "bg-zinc-100 text-zinc-400")}>{selectedUser.type}</span>
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
                {/* Lookup */}
                {selectedLookup && (
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1 flex items-center gap-2">
                      {selectedLookup.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedLookup.color }} />}
                      {selectedLookup.label}
                    </h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">{selectedLookup.type}</span>
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

      {/* Save Layout Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 w-96 max-w-[90vw] border border-zinc-200 dark:border-zinc-700">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save Layout</h3>
            <input type="text" value={newLayoutName} onChange={(e) => setNewLayoutName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newLayoutName.trim()) saveCurrentLayout(newLayoutName); else if (e.key === "Escape") { setShowSaveDialog(false); setNewLayoutName(""); } }}
              placeholder="Enter layout name..." autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-teal-500 mb-4" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => { setShowSaveDialog(false); setNewLayoutName(""); }}>Cancel</Button>
              <Button size="md" onClick={() => saveCurrentLayout(newLayoutName)} disabled={!newLayoutName.trim()}>Save</Button>
            </div>
          </div>
        </div>
      )}
      {showLayoutMenu && <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />}
    </div>
  );
}
