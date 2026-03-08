// src/modules/library/PortalPublishModal.tsx

import { useState, useEffect, useMemo } from "react";
import { X, Globe, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { Button, IconButton, FormField, Input, Select } from "../../components/ui";
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
  filePath,
  content,
  filename,
  portalDocId,
  onPublished,
  onDeleted,
}: PortalPublishModalProps) {
  const [docType, setDocType] = useState<"domain" | "guide" | "report">("domain");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isUpdateMode = !!portalDocId;

  // Detect file type from filename
  const detectedFileType = useMemo(() => {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html" as const;
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel" as const;
    return "markdown" as const;
  }, [filename]);

  const isReportFile = detectedFileType === "html" || detectedFileType === "excel";

  // Extract defaults from frontmatter
  const fm = useMemo(() => parseFrontmatter(content), [content]);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
      setError(null);
      return;
    }
    const cleanName = filename.replace(/\.(md|html?|xlsx?)$/i, "").replace(/-/g, " ");
    setTitle(fm.title || fm.name || cleanName);
    setSummary(fm.summary || fm.description || "");
    setCategory(fm.category || "");
    if (isReportFile) {
      setDocType("report");
    } else {
      setDocType((fm.portal_doc_type as "domain" | "guide" | "report") || "domain");
    }
    setSelectedDomain(fm.portal_domain || "");
  }, [isOpen, fm, filename, isReportFile]);

  const handlePublish = async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase not configured. Check environment variables.");
      return;
    }
    if ((docType === "domain" || docType === "report") && !selectedDomain) {
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
      let publishContent = content;
      let fileUrl: string | null = null;
      let fileType: string | null = null;

      if (docType === "report") {
        if (detectedFileType === "excel") {
          fileType = "excel";
          // Read binary via Tauri command and upload original to Supabase Storage
          const base64 = await invoke<string>("read_file_binary", { path: filePath });
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const storagePath = `${selectedDomain}/${Date.now()}-${filename}`;
          const { error: uploadErr } = await supabase.storage
            .from("portal-reports")
            .upload(storagePath, bytes, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

          const { data: urlData } = supabase.storage
            .from("portal-reports")
            .getPublicUrl(storagePath);
          fileUrl = urlData.publicUrl;

          // No HTML preview needed — portal uses Office Online viewer via fileUrl
          publishContent = "";
        } else if (detectedFileType === "html") {
          fileType = "html";
          publishContent = content;
        }
      }

      const record: Record<string, unknown> = {
        domain: docType === "guide" ? null : selectedDomain,
        title: title.trim(),
        summary: summary.trim() || null,
        content: publishContent,
        category: category.trim() || null,
        doc_type: docType,
        file_url: fileUrl,
        file_type: fileType,
      };

      if (isUpdateMode) {
        const { error: err } = await supabase
          .from("portal_docs")
          .update(record)
          .eq("id", portalDocId);
        if (err) throw new Error(err.message);
        onPublished(portalDocId, record.domain as string | null, docType);
      } else {
        const { data, error: err } = await supabase
          .from("portal_docs")
          .insert(record)
          .select("id")
          .single();
        if (err) throw new Error(err.message);
        onPublished(data.id, record.domain as string | null, docType);
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
      // Check if there's a file_url to clean up from storage
      const { data: docData } = await supabase
        .from("portal_docs")
        .select("file_url")
        .eq("id", portalDocId)
        .single();

      if (docData?.file_url) {
        // Extract storage path from public URL
        const urlParts = docData.file_url.split("/portal-reports/");
        if (urlParts[1]) {
          await supabase.storage.from("portal-reports").remove([urlParts[1]]);
        }
      }

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {isUpdateMode ? "Update Portal Document" : "Publish to Portal"}
            </h3>
          </div>
          <IconButton
            icon={X}
            label="Close"
            onClick={onClose}
          />
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Existing doc ID (update mode) */}
          {isUpdateMode && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 rounded">
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
          <FormField label="Type">
            <div className="flex gap-2">
              <button
                onClick={() => setDocType("domain")}
                disabled={isReportFile}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs rounded border transition-colors",
                  docType === "domain"
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800",
                  isReportFile && "opacity-40 cursor-not-allowed"
                )}
              >
                Domain Doc
              </button>
              <button
                onClick={() => setDocType("report")}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs rounded border transition-colors",
                  docType === "report"
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
              >
                Report
              </button>
              <button
                onClick={() => setDocType("guide")}
                disabled={isReportFile}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs rounded border transition-colors",
                  docType === "guide"
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800",
                  isReportFile && "opacity-40 cursor-not-allowed"
                )}
              >
                General Guide
              </button>
            </div>
          </FormField>

          {/* Domain selector */}
          {(docType === "domain" || docType === "report") && (
            <FormField label="Domain">
              <Select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
              >
                <option value="">Select domain...</option>
                {DOMAINS.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name} ({d.slug})
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          {/* Title */}
          <FormField label="Title">
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
            />
          </FormField>

          {/* Summary */}
          <FormField label="Summary (optional)">
            <Input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description for the portal card"
            />
          </FormField>

          {/* Category */}
          <FormField label="Category (optional)">
            <Input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Getting Started, Data Management"
            />
          </FormField>

          {/* Delete confirmation */}
          {isUpdateMode && confirmDelete && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
              <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                Remove this document from the portal? The file itself won't be deleted.
              </p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={handleDelete} disabled={loading}>
                  {loading ? "Removing..." : "Confirm Remove"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <div>
            {isUpdateMode && !confirmDelete && (
              <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)} disabled={loading} className="text-red-500 hover:text-red-600">
                Remove
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={loading || !canSubmit}
              loading={loading}
              icon={loading ? undefined : Globe}
            >
              {isUpdateMode ? (loading ? "Updating..." : "Update") : (loading ? "Publishing..." : "Publish")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
