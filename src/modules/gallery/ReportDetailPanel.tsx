// Report detail panel — metadata editing, publish controls, AI generation
// Shows alongside the report preview iframe when a report is selected

import { useState, useEffect, useCallback } from "react";
import { Globe, Star, Sparkles, Save, Loader2, Check, Trash2, Tags, Upload, ExternalLink, FileText } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/ui";
import { cn } from "../../lib/cn";
import { useReportSkillByFile, useUpsertReportSkill, useDeleteReportSkill } from "../../hooks/gallery/useReportSkills";
import { useGenerateReportContent } from "../../hooks/gallery/useGenerateReportContent";
import type { SkillExample } from "./useGallery";

interface ReportDetailPanelProps {
  example: SkillExample;
  htmlContent?: string;
}

export function ReportDetailPanel({ example, htmlContent }: ReportDetailPanelProps) {
  const { data: existing, isLoading } = useReportSkillByFile(example.slug, example.file_name);
  const upsert = useUpsertReportSkill();
  const remove = useDeleteReportSkill();
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

  return (
    <div className="space-y-4">
      {/* Publish toggles */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setPublished(!published); markDirty(); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
            published
              ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30"
              : "bg-zinc-50 dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-teal-300"
          )}
        >
          <Globe size={12} />
          {published ? "Published" : "Unpublished"}
        </button>
        <button
          onClick={() => { setFeatured(!featured); markDirty(); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
            featured
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
              : "bg-zinc-50 dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-amber-300"
          )}
        >
          <Star size={12} />
          {featured ? "Featured" : "Not Featured"}
        </button>
      </div>

      {/* Title */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Title</label>
        <input
          value={title}
          onChange={e => { setTitle(e.target.value); markDirty(); }}
          placeholder={example.skill_name}
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      {/* Generate error */}
      {generateError && (
        <p className="text-[11px] text-red-500">{generateError}</p>
      )}

      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Description</label>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !htmlContent}
            className="flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-600 transition disabled:opacity-40"
            title="Generate all fields with AI"
          >
            {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            {isGenerating ? "Generating..." : "AI Generate All"}
          </button>
        </div>
        <textarea
          value={description}
          onChange={e => { setDescription(e.target.value); markDirty(); }}
          placeholder="1-2 line summary of what this report shows..."
          rows={2}
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
        />
      </div>

      {/* Writeup */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Writeup</label>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !htmlContent}
            className="flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-600 transition disabled:opacity-40"
            title="Generate all fields with AI"
          >
            {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            {isGenerating ? "Generating..." : "AI Generate All"}
          </button>
        </div>
        <textarea
          value={writeup}
          onChange={e => { setWriteup(e.target.value); markDirty(); }}
          placeholder="2-3 paragraph writeup for the website library page..."
          rows={5}
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
        />
      </div>

      {/* Solution + Category + Subcategory */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Solution</label>
          <select
            value={solution}
            onChange={e => { setSolution(e.target.value); markDirty(); }}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="analytics">Analytics</option>
            <option value="ar-automation">AR Automation</option>
            <option value="ap-automation">AP Automation</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            <Tags size={10} className="inline mr-1" />
            Category
          </label>
          <input
            value={category}
            onChange={e => { setCategory(e.target.value); markDirty(); }}
            placeholder="e.g. delivery, analytics"
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Subcategory</label>
          <input
            value={subcategory}
            onChange={e => { setSubcategory(e.target.value); markDirty(); }}
            placeholder="e.g. grab, seg"
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Metrics + Sources (comma-separated) */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Metrics (comma-separated)</label>
        <input
          value={metrics}
          onChange={e => { setMetrics(e.target.value); markDirty(); }}
          placeholder="Revenue, Growth %, AOV, Order Count"
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Sources (comma-separated)</label>
        <input
          value={sources}
          onChange={e => { setSources(e.target.value); markDirty(); }}
          placeholder="POS, GrabFood, Deliveroo"
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      {/* Demo File + S3 Upload */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <FileText size={12} className="text-zinc-400" />
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Demo File</span>
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-300 font-mono truncate" title={example.file_name}>
          {example.file_name}
        </p>
        {typeof existing?.report_url === "string" && existing.report_url && (
          <a
            href={existing.report_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-teal-500 hover:text-teal-600 transition truncate"
          >
            <ExternalLink size={10} className="shrink-0" />
            {existing.report_url.replace(/^https?:\/\/[^/]+\//, "")}
          </a>
        )}
        {uploadError && (
          <p className="text-[10px] text-red-500">{uploadError}</p>
        )}
        <Button
          size="sm"
          icon={uploading ? Loader2 : Upload}
          onClick={handleUploadToS3}
          disabled={uploading}
          className={cn(uploading && "[&_svg]:animate-spin")}
        >
          {uploading ? "Uploading..." : (typeof existing?.report_url === "string" && existing.report_url) ? "Re-upload to S3" : "Upload to S3"}
        </Button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <Button
          size="sm"
          icon={saved ? Check : Save}
          onClick={handleSave}
          disabled={!dirty && hasEntry}
          className={cn(
            saved && "!bg-emerald-500 !text-white !border-emerald-500",
          )}
        >
          {saved ? "Saved" : dirty ? "Save" : hasEntry ? "Saved" : "Save"}
        </Button>
        {hasEntry && (
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            onClick={handleDelete}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          >
            Remove
          </Button>
        )}
        {upsert.isPending && <Loader2 size={12} className="animate-spin text-zinc-400" />}
      </div>
    </div>
  );
}
