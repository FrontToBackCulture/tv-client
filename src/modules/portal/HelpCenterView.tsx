// src/modules/portal/HelpCenterView.tsx

import { useState, useEffect } from "react";
import {
  Plus,
  X,
  Trash2,
  Save,
  Eye,
  EyeOff,
  FileText,
  ChevronDown,
} from "lucide-react";
import {
  usePortalDocs,
  useCreateDoc,
  useUpdateDoc,
  useDeleteDoc,
  usePortalSites,
} from "../../hooks/usePortal";
import { cn } from "../../lib/cn";

interface HelpCenterViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  detailWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function HelpCenterView({
  selectedId,
  onSelect,
  detailWidth,
  onResizeStart,
}: HelpCenterViewProps) {
  const { data: docs } = usePortalDocs();
  const { data: sites } = usePortalSites();
  const createDoc = useCreateDoc();

  // Helper to resolve site IDs to names
  const siteLabel = (targetSites: string[]) => {
    if (!targetSites.length) return "All sites";
    return targetSites
      .map((id) => sites?.find((s) => s.id === id)?.name || id.slice(0, 8))
      .join(", ");
  };

  const handleCreate = async () => {
    try {
      const doc = await createDoc.mutateAsync({
        title: "New Article",
        content: "",
        is_widget_visible: false,
      });
      onSelect(doc.id);
    } catch (err) {
      console.error("[portal] Failed to create doc:", err);
    }
  };

  return (
    <>
      {/* List panel */}
      <div
        className="flex flex-col border-r border-slate-200 dark:border-zinc-800 overflow-hidden"
        style={{
          flex: selectedId ? `0 0 ${100 - detailWidth}%` : "1 1 auto",
        }}
      >
        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-zinc-800">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {docs?.length ?? 0} articles
          </span>
          <button
            onClick={handleCreate}
            disabled={createDoc.isPending}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-teal-600 text-white hover:bg-teal-500 transition-colors"
          >
            <Plus size={12} />
            New Article
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {(!docs || docs.length === 0) && (
            <div className="flex flex-col items-center justify-center p-6 text-center mt-8">
              <FileText
                size={40}
                className="text-zinc-300 dark:text-zinc-700 mb-3"
              />
              <p className="text-sm text-zinc-500">No help articles</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
                Create articles for your customer help center
              </p>
            </div>
          )}

          {docs?.map((doc) => (
            <button
              key={doc.id}
              onClick={() => onSelect(doc.id)}
              className={cn(
                "w-full text-left px-3 py-3 border-b border-slate-100 dark:border-zinc-800/50 transition-colors",
                "hover:bg-slate-50 dark:hover:bg-zinc-900/50",
                selectedId === doc.id &&
                  "bg-teal-50 dark:bg-teal-500/10 border-l-2 border-l-teal-500"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {doc.title || "Untitled"}
                    </span>
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        doc.is_widget_visible ? "bg-green-500" : "bg-zinc-300"
                      )}
                      title={doc.is_widget_visible ? "Visible" : "Hidden"}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {doc.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 capitalize">
                        {doc.category}
                      </span>
                    )}
                    {doc.doc_type && (
                      <span className="text-[10px] text-zinc-400 capitalize">
                        {doc.doc_type}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-400">
                      {doc.view_count} views
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      doc.target_sites.length === 0
                        ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    )}>
                      {siteLabel(doc.target_sites)}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div
          className="relative flex flex-col overflow-hidden"
          style={{ flex: `0 0 ${detailWidth}%` }}
        >
          <div
            onMouseDown={onResizeStart}
            className="absolute top-0 -left-1 w-3 h-full cursor-col-resize z-10 group"
          >
            <div className="w-0.5 h-full mx-auto bg-transparent group-hover:bg-teal-500/60 transition-colors" />
          </div>

          <DocDetail id={selectedId} onClose={() => onSelect(null)} />
        </div>
      )}
    </>
  );
}

// ── Detail Editor ──

const inputClass =
  "w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500";

function DocDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: docs } = usePortalDocs();
  const updateDoc = useUpdateDoc();
  const deleteDoc = useDeleteDoc();
  const doc = docs?.find((d) => d.id === id);

  const [form, setForm] = useState({
    title: "",
    summary: "",
    content: "",
    category: "",
    doc_type: "article",
    tags: "",
    is_widget_visible: false,
    sort_order: 0,
    target_sites: [] as string[],
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setForm({
      title: doc.title,
      summary: doc.summary || "",
      content: doc.content,
      category: doc.category || "",
      doc_type: doc.doc_type || "article",
      tags: (doc.tags || []).join(", "),
      is_widget_visible: doc.is_widget_visible,
      sort_order: doc.sort_order,
      target_sites: doc.target_sites,
    });
    setDirty(false);
  }, [doc]);

  if (!doc) return null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await updateDoc.mutateAsync({
        id,
        title: form.title,
        summary: form.summary || null,
        content: form.content,
        category: form.category || null,
        doc_type: form.doc_type || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        is_widget_visible: form.is_widget_visible,
        sort_order: form.sort_order,
        target_sites: form.target_sites,
      });
      setDirty(false);
    } catch (err) {
      console.error("[portal] Failed to update doc:", err);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc.mutateAsync(id);
      onClose();
    } catch (err) {
      console.error("[portal] Failed to delete doc:", err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Edit Article
          </span>
          {dirty && (
            <span className="text-[10px] text-amber-500 font-medium">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSave}
            disabled={!dirty || updateDoc.isPending}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
              dirty
                ? "bg-teal-600 text-white hover:bg-teal-500"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
            )}
          >
            <Save size={12} />
            {updateDoc.isPending ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleDelete}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-400 hover:text-red-500"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-400"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Title">
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Summary">
          <input
            type="text"
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="Brief description shown in article list"
            className={inputClass}
          />
        </Field>

        <Field label="Content (Markdown)">
          <textarea
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
            rows={16}
            className={inputClass + " resize-none font-mono text-xs"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <input
              type="text"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. getting-started, documentation"
              className={inputClass}
            />
          </Field>

          <Field label="Doc Type">
            <select
              value={form.doc_type}
              onChange={(e) => set("doc_type", e.target.value)}
              className={inputClass}
            >
              <option value="article">Article</option>
              <option value="guide">Guide</option>
              <option value="faq">FAQ</option>
              <option value="tutorial">Tutorial</option>
            </select>
          </Field>
        </div>

        <Field label="Tags (comma-separated)">
          <input
            type="text"
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="e.g. data-dictionary, reference"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sort Order">
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", parseInt(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>

          <Field label="Visible in Widget">
            <div className="flex items-center gap-2 py-1">
              <ToggleSwitch
                value={form.is_widget_visible}
                onChange={(v) => set("is_widget_visible", v)}
              />
              <span className="text-xs text-zinc-500">
                {form.is_widget_visible ? (
                  <span className="flex items-center gap-1">
                    <Eye size={12} /> Visible
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <EyeOff size={12} /> Hidden
                  </span>
                )}
              </span>
            </div>
          </Field>
        </div>

        <Field label="Site Targeting">
          <SiteTargeting
            value={form.target_sites}
            onChange={(sites) => set("target_sites", sites)}
          />
        </Field>
      </div>
    </div>
  );
}

// ── Shared Components ──

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "w-9 h-5 rounded-full transition-colors relative",
        value ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-600"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
          value ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function SiteTargeting({
  value,
  onChange,
}: {
  value: string[];
  onChange: (sites: string[]) => void;
}) {
  const { data: sites } = usePortalSites();
  const [open, setOpen] = useState(false);

  if (!sites?.length) return null;

  const toggleSite = (siteId: string) => {
    if (value.includes(siteId)) {
      onChange(value.filter((s) => s !== siteId));
    } else {
      onChange([...value, siteId]);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
      >
        <span>
          {value.length === 0
            ? "All sites"
            : value
                .map((id) => sites.find((s) => s.id === id)?.name || id)
                .join(", ")}
        </span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md shadow-lg z-20 py-1">
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => toggleSite(site.id)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2"
            >
              <span
                className={cn(
                  "w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px]",
                  value.includes(site.id)
                    ? "bg-teal-500 border-teal-500 text-white"
                    : "border-zinc-300 dark:border-zinc-600"
                )}
              >
                {value.includes(site.id) && "✓"}
              </span>
              {site.name}
            </button>
          ))}
          <button
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 border-t border-slate-100 dark:border-zinc-800 mt-1"
          >
            Clear (all sites)
          </button>
        </div>
      )}
    </div>
  );
}
