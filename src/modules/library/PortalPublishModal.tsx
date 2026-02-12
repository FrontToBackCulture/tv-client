// src/modules/library/PortalPublishModal.tsx

import { useState, useEffect, useMemo } from "react";
import { X, Globe, Trash2, RefreshCw } from "lucide-react";
import { cn } from "../../lib/cn";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

const DOMAINS = [
  { slug: "abaavo", name: "Abaavo" },
  { slug: "ca", name: "CA" },
  { slug: "dapaolo", name: "Da Paolo" },
  { slug: "fk", name: "FK" },
  { slug: "grain", name: "Grain" },
  { slug: "jfh", name: "JFH" },
  { slug: "jlm", name: "JLM" },
  { slug: "kc", name: "KC" },
  { slug: "koi", name: "Koi" },
  { slug: "lag", name: "LAG" },
  { slug: "mb", name: "MB" },
  { slug: "mf", name: "MF" },
  { slug: "pgp", name: "PGP" },
  { slug: "psg", name: "PSG" },
  { slug: "saladstop", name: "SaladStop" },
  { slug: "seg", name: "SEG" },
  { slug: "spaespritgroup", name: "Spa Esprit Group" },
  { slug: "ssg", name: "SSG" },
  { slug: "suntec", name: "Suntec" },
  { slug: "teyst", name: "Teyst" },
  { slug: "tif", name: "TIF" },
  { slug: "tv", name: "TV" },
  { slug: "wh", name: "WH" },
];

// Parse frontmatter from markdown
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) fm[key] = val;
  }
  return fm;
}

interface PortalPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  content: string;
  filename: string;
  portalDocId?: string;
  onPublished: (docId: string, domain: string | null, docType: string) => void;
  onDeleted: () => void;
}

export function PortalPublishModal({
  isOpen,
  onClose,
  filePath: _filePath,
  content,
  filename,
  portalDocId,
  onPublished,
  onDeleted,
}: PortalPublishModalProps) {
  const [docType, setDocType] = useState<"domain" | "guide">("domain");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isUpdateMode = !!portalDocId;

  // Extract defaults from frontmatter
  const fm = useMemo(() => parseFrontmatter(content), [content]);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
      setError(null);
      return;
    }
    setTitle(fm.title || filename.replace(/\.md$/, "").replace(/-/g, " "));
    setSummary(fm.summary || "");
    setCategory(fm.category || "");
    setDocType((fm.portal_doc_type as "domain" | "guide") || "domain");
    setSelectedDomain(fm.portal_domain || "");
  }, [isOpen, fm, filename]);

  const handlePublish = async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase not configured. Check environment variables.");
      return;
    }
    if (docType === "domain" && !selectedDomain) {
      setError("Please select a domain.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const record = {
        domain: docType === "domain" ? selectedDomain : null,
        title: title.trim(),
        summary: summary.trim() || null,
        content,
        category: category.trim() || null,
        doc_type: docType,
      };

      if (isUpdateMode) {
        const { error: err } = await supabase
          .from("portal_docs")
          .update(record)
          .eq("id", portalDocId);
        if (err) throw new Error(err.message);
        onPublished(portalDocId, record.domain, docType);
      } else {
        const { data, error: err } = await supabase
          .from("portal_docs")
          .insert(record)
          .select("id")
          .single();
        if (err) throw new Error(err.message);
        onPublished(data.id, record.domain, docType);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!portalDocId) return;

    setLoading(true);
    setError(null);

    try {
      const { error: err } = await supabase
        .from("portal_docs")
        .delete()
        .eq("id", portalDocId);
      if (err) throw new Error(err.message);

      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setLoading(false);
      setConfirmDelete(false);
    }
  };

  if (!isOpen) return null;

  const canSubmit = title.trim() && (docType === "guide" || selectedDomain);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {isUpdateMode ? "Update Portal Document" : "Publish to Portal"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Existing doc ID (update mode) */}
          {isUpdateMode && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800 px-3 py-2 rounded">
              Doc ID: {portalDocId?.slice(0, 8)}...
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
              {error}
            </div>
          )}

          {/* Doc Type */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setDocType("domain")}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs rounded border transition-colors",
                  docType === "domain"
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
                    : "border-slate-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
                )}
              >
                Domain Doc
              </button>
              <button
                onClick={() => setDocType("guide")}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs rounded border transition-colors",
                  docType === "guide"
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
                    : "border-slate-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
                )}
              >
                General Guide
              </button>
            </div>
          </div>

          {/* Domain selector */}
          {docType === "domain" && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Domain
              </label>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select domain...</option>
                {DOMAINS.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name} ({d.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              className="w-full px-3 py-2 text-sm rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Summary <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description for the portal card"
              className="w-full px-3 py-2 text-sm rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Category <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Getting Started, Data Management"
              className="w-full px-3 py-2 text-sm rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Delete confirmation */}
          {isUpdateMode && confirmDelete && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
              <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                Remove this document from the portal? The file itself won't be deleted.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? "Removing..." : "Confirm Remove"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50">
          <div>
            {isUpdateMode && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handlePublish}
              disabled={loading || !canSubmit}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {isUpdateMode ? "Updating..." : "Publishing..."}
                </>
              ) : (
                <>
                  <Globe className="w-3 h-3" />
                  {isUpdateMode ? "Update" : "Publish"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
