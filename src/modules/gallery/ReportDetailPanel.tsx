// Report detail panel — metadata editing, publish controls, AI generation
// Shows alongside the report preview iframe when a report is selected

import { useState, useEffect, useCallback } from "react";
import { Globe, Star, Sparkles, Save, Loader2, Check, Trash2, Upload, ExternalLink, FileText } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../../lib/cn";
import { useSkillLibraryByFile, useUpsertSkillLibraryEntry, useDeleteSkillLibraryEntry } from "../../hooks/gallery/useSkillLibrary";
import { useGenerateReportContent } from "../../hooks/gallery/useGenerateReportContent";
import type { SkillExample } from "./useGallery";

interface ReportDetailPanelProps {
  example: SkillExample;
  htmlContent?: string;
}

export function ReportDetailPanel({ example, htmlContent }: ReportDetailPanelProps) {
  const { data: existing, isLoading } = useSkillLibraryByFile(example.slug, example.file_name);
  const upsert = useUpsertSkillLibraryEntry();
  const remove = useDeleteSkillLibraryEntry();
  const { generate, isGenerating, error: generateError } = useGenerateReportContent();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [writeup, setWriteup] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [solution, setSolution] = useState("analytics");
  const [metrics, setMetrics] = useState("");
  const [sources, setSources] = useState("");
  const [published, setPublished] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

  // Sync from DB when loaded
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setDescription(existing.description ?? "");
      setWriteup(existing.writeup ?? "");
      setCategory(existing.category);
      setSubcategory(existing.subcategory ?? "");
      setSolution(existing.solution ?? "analytics");
      setMetrics((existing.metrics ?? []).join(", "));
      setSources((existing.sources ?? []).join(", "));
      setPublished(existing.published);
      setFeatured(existing.featured);
      setDirty(false);
    } else if (!isLoading) {
      // Default from skill example
      setTitle(example.skill_name);
      setCategory("");
      setDirty(false);
    }
  }, [existing, isLoading, example.skill_name]);

  const markDirty = useCallback(() => {
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    await upsert.mutateAsync({
      skill_slug: example.slug,
      file_name: example.file_name,
      title: title.trim() || example.skill_name,
      description: description.trim() || null,
      writeup: writeup.trim() || null,
      category: category.trim() || "uncategorized",
      subcategory: subcategory.trim() || null,
      solution: solution.trim() || "analytics",
      metrics: metrics ? metrics.split(",").map(s => s.trim()).filter(Boolean) : [],
      sources: sources ? sources.split(",").map(s => s.trim()).filter(Boolean) : [],
      published,
      featured,
    });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [upsert, example, title, description, writeup, category, subcategory, solution, metrics, sources, published, featured]);

  const handleDelete = useCallback(async () => {
    if (!existing) return;
    await remove.mutateAsync(existing.id);
  }, [existing, remove]);

  const handleGenerate = useCallback(async () => {
    if (!htmlContent) return;
    const result = await generate(example.skill_name, htmlContent);
    if (result) {
      setTitle(result.title);
      setDescription(result.description);
      setWriteup(result.writeup);
      setCategory(result.category);
      setSubcategory(result.subcategory);
      setMetrics(result.metrics.join(", "));
      setSources(result.sources.join(", "));
      markDirty();
    }
  }, [htmlContent, example.skill_name, generate, markDirty]);

  const handleUploadToS3 = useCallback(async () => {
    setUploading(true);
    setUploadError(null);
    try {
      const result = await invoke<{ url: string; s3_key: string; size_bytes: number }>("gallery_upload_demo_report", {
        filePath: example.file_path,
        skillSlug: example.slug,
        fileName: example.file_name,
      });
      // Save the report_url to the DB record
      await upsert.mutateAsync({
        skill_slug: example.slug,
        file_name: example.file_name,
        title: title.trim() || example.skill_name,
        description: description.trim() || null,
        writeup: writeup.trim() || null,
        category: category.trim() || "uncategorized",
        subcategory: subcategory.trim() || null,
        solution: solution.trim() || "analytics",
        metrics: metrics ? metrics.split(",").map(s => s.trim()).filter(Boolean) : [],
        sources: sources ? sources.split(",").map(s => s.trim()).filter(Boolean) : [],
        published,
        featured,
        report_url: result.url,
      });
      setDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? (err as { message: string }).message : String(err);
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }, [example, upsert, title, description, writeup, category, subcategory, solution, metrics, sources, published, featured]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  const hasEntry = !!existing;

  // Editable field — shows as text, click to edit
  const EditableText = ({ field, value, onChange, placeholder, multiline }: {
    field: string; value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean;
  }) => {
    if (editingField === field) {
      const inputClass = "w-full px-3 py-2 text-sm rounded-xl border-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition";
      return multiline ? (
        <textarea
          autoFocus
          value={value}
          onChange={e => { onChange(e.target.value); markDirty(); }}
          onBlur={() => setEditingField(null)}
          placeholder={placeholder}
          rows={6}
          className={cn(inputClass, "resize-y")}
        />
      ) : (
        <input
          autoFocus
          value={value}
          onChange={e => { onChange(e.target.value); markDirty(); }}
          onBlur={() => setEditingField(null)}
          onKeyDown={e => { if (e.key === "Enter") setEditingField(null); }}
          placeholder={placeholder}
          className={inputClass}
        />
      );
    }
    return (
      <div
        onClick={() => setEditingField(field)}
        className={cn(
          "text-sm leading-relaxed cursor-text rounded-lg px-1 -mx-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition",
          value ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400 italic"
        )}
      >
        {value || placeholder}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {/* Title — large, like task title */}
      <div className="mb-4">
        {editingField === "title" ? (
          <input
            autoFocus
            value={title}
            onChange={e => { setTitle(e.target.value); markDirty(); }}
            onBlur={() => setEditingField(null)}
            onKeyDown={e => { if (e.key === "Enter") setEditingField(null); }}
            className="w-full text-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-transparent border-b-2 border-teal-400 focus:outline-none pb-1"
          />
        ) : (
          <h2
            onClick={() => setEditingField("title")}
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 cursor-text hover:text-teal-600 transition pb-1"
          >
            {title || example.skill_name}
          </h2>
        )}
      </div>

      {/* Status row — like task metadata */}
      <div className="space-y-2.5 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center">
          <span className="text-xs text-zinc-400 w-24 shrink-0">Status</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPublished(!published); markDirty(); }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition",
                published ? "bg-teal-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              )}
            >
              <Globe size={11} />
              {published ? "Published" : "Draft"}
            </button>
            <button
              onClick={() => { setFeatured(!featured); markDirty(); }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition",
                featured ? "bg-amber-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              )}
            >
              <Star size={11} />
              {featured ? "Featured" : "Not Featured"}
            </button>
          </div>
        </div>

        <div className="flex items-center">
          <span className="text-xs text-zinc-400 w-24 shrink-0">Solution</span>
          <select
            value={solution}
            onChange={e => { setSolution(e.target.value); markDirty(); }}
            className="text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-0 focus:outline-none cursor-pointer hover:text-teal-600"
          >
            <option value="analytics">Analytics</option>
            <option value="ar-automation">AR Automation</option>
            <option value="ap-automation">AP Automation</option>
          </select>
        </div>

        <div className="flex items-center">
          <span className="text-xs text-zinc-400 w-24 shrink-0">Category</span>
          <EditableText field="category" value={category} onChange={setCategory} placeholder="Set category" />
        </div>

        <div className="flex items-center">
          <span className="text-xs text-zinc-400 w-24 shrink-0">Subcategory</span>
          <EditableText field="subcategory" value={subcategory} onChange={setSubcategory} placeholder="Set subcategory" />
        </div>

        <div className="flex items-center">
          <span className="text-xs text-zinc-400 w-24 shrink-0">Metrics</span>
          <EditableText field="metrics" value={metrics} onChange={setMetrics} placeholder="Revenue, Growth %, AOV" />
        </div>

        <div className="flex items-center">
          <span className="text-xs text-zinc-400 w-24 shrink-0">Sources</span>
          <EditableText field="sources" value={sources} onChange={setSources} placeholder="POS, GrabFood" />
        </div>

        <div className="flex items-center">
          <span className="text-xs text-zinc-400 w-24 shrink-0">Demo File</span>
          <div className="flex items-center gap-2">
            <FileText size={12} className="text-zinc-400" />
            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{example.file_name}</span>
            {typeof existing?.report_url === "string" && existing.report_url && (
              <a href={existing.report_url} target="_blank" rel="noopener noreferrer" className="text-teal-500 hover:text-teal-600">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      </div>

      {generateError && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 rounded-lg">{generateError}</p>
      )}

      {/* Description — full text display */}
      <div className="py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Description</span>
          {htmlContent && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-600 font-medium transition disabled:opacity-40"
            >
              {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              AI Generate
            </button>
          )}
        </div>
        <EditableText field="description" value={description} onChange={setDescription} placeholder="Click to add description..." multiline />
      </div>

      {/* Writeup — full text display */}
      <div className="py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Writeup</span>
          {htmlContent && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-600 font-medium transition disabled:opacity-40"
            >
              {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              AI Generate
            </button>
          )}
        </div>
        <EditableText field="writeup" value={writeup} onChange={setWriteup} placeholder="Click to add writeup..." multiline />
      </div>

      {/* Actions */}
      <div className="pt-4 space-y-3">
        {/* S3 Upload */}
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        <button
          onClick={handleUploadToS3}
          disabled={uploading}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all",
            uploading
              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          )}
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Uploading..." : (typeof existing?.report_url === "string" && existing.report_url) ? "Re-upload to S3" : "Upload to S3"}
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!dirty && hasEntry}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all",
            saved
              ? "bg-emerald-500 text-white"
              : dirty
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
          )}
        >
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Saved" : dirty ? "Save Changes" : hasEntry ? "Saved" : "Save"}
        </button>

        {hasEntry && (
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition"
          >
            <Trash2 size={13} />
            Remove
          </button>
        )}
        {upsert.isPending && <div className="flex justify-center"><Loader2 size={14} className="animate-spin text-zinc-400" /></div>}
      </div>
    </div>
  );
}
