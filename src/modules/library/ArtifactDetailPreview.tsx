// src/modules/library/ArtifactDetailPreview.tsx
// Right panel preview for artifact review mode — shows read-only info + editable classification fields
// Same pattern as TableDetailPreview but for queries, dashboards, workflows

import { useState, useEffect, useMemo } from "react";
import {
  X,
  FolderOpen,
  Calendar,
  Hash,
  ChevronDown,
  Tag,
  Clock,
  Workflow,
  LayoutDashboard,
  FileCode,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useClassificationStore } from "../../stores/classificationStore";
import type { ArtifactType, ArtifactRow } from "./ArtifactReviewView";

interface ArtifactDetailPreviewProps {
  artifactType: ArtifactType;
  row: ArtifactRow;
  onClose: () => void;
  onFieldChange?: (field: string, value: string | number | null) => void;
  onNavigate?: (path: string) => void;
}

// TagsInput component — same as TableDetailPreview
function TagsInput({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (val: string) => void;
  suggestions: readonly string[];
}) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const tags = useMemo(
    () => (value ? value.split(",").map((t) => t.trim()).filter(Boolean) : []),
    [value]
  );

  const filteredSuggestions = useMemo(
    () =>
      suggestions
        .filter((s) => !tags.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase()))
        .slice(0, 8),
    [suggestions, tags, inputValue]
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const newTags = [...tags, trimmed].join(", ");
      onChange(newTags);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = tags.filter((t) => t !== tagToRemove).join(", ");
    onChange(newTags);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1 p-1.5 min-h-[32px] rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-teal-900 dark:hover:text-teal-100">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          className="flex-1 min-w-[60px] text-xs bg-transparent outline-none text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-auto">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(suggestion)}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ComboBox component — same as TableDetailPreview
function ComboBox({
  value,
  onChange,
  options,
  placeholder = "Select...",
}: {
  value: string;
  onChange: (val: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filteredOptions = useMemo(
    () => options.filter((opt) => opt.toLowerCase().includes(inputValue.toLowerCase())),
    [options, inputValue]
  );

  const handleSelect = (opt: string) => {
    onChange(opt);
    setInputValue(opt);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setInputValue("");
    setIsOpen(true);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false);
      if (inputValue !== value) {
        onChange(inputValue.trim());
      }
    }, 150);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full text-xs px-2 py-1.5 pr-6 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
      />
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-auto">
          {value && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-zinc-700 text-zinc-500 italic border-b border-slate-100 dark:border-zinc-700"
            >
              Clear selection
            </button>
          )}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <button
                key={opt}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(opt)}
                className={cn(
                  "w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-zinc-700",
                  opt === value
                    ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                    : "text-zinc-800 dark:text-zinc-200"
                )}
              >
                {opt}
              </button>
            ))
          ) : inputValue.trim() ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(inputValue.trim())}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-zinc-700 text-teal-600 dark:text-teal-400"
            >
              Add &quot;{inputValue.trim()}&quot;
            </button>
          ) : !value ? (
            <div className="px-3 py-1.5 text-xs text-zinc-400">Type to search or add new</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Icon per artifact type
function ArtifactIcon({ type }: { type: ArtifactType }) {
  switch (type) {
    case "query":
      return <FileCode size={16} className="text-yellow-500" />;
    case "dashboard":
      return <LayoutDashboard size={16} className="text-purple-500" />;
    case "workflow":
      return <Workflow size={16} className="text-blue-500" />;
  }
}

export function ArtifactDetailPreview({
  artifactType,
  row,
  onClose,
  onFieldChange,
  onNavigate,
}: ArtifactDetailPreviewProps) {
  const classificationStore = useClassificationStore();

  const handleChange = (field: string) => (value: string) => {
    onFieldChange?.(field, value || null);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ArtifactIcon type={artifactType} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {row.name}
            </h3>
            <p className="text-[11px] text-zinc-500 font-mono truncate">{row.folderName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onNavigate && (
            <button
              onClick={() => onNavigate(row.folderPath)}
              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              title="Open folder"
            >
              <FolderOpen size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Read-only info */}
        <section>
          <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Info</h4>
          <div className="space-y-1.5">
            <InfoRow icon={<Hash size={12} />} label="ID" value={row.id} />
            {row.createdDate && (
              <InfoRow icon={<Calendar size={12} />} label="Created" value={formatDate(row.createdDate)} />
            )}
            {row.updatedDate && (
              <InfoRow icon={<Calendar size={12} />} label="Updated" value={formatDate(row.updatedDate)} />
            )}

            {/* Type-specific info */}
            {artifactType === "query" && (
              <>
                {row.category && <InfoRow icon={<Tag size={12} />} label="Category" value={row.category} />}
                {row.tableName && <InfoRow icon={<Hash size={12} />} label="Table" value={row.tableName} />}
                {row.fieldCount != null && <InfoRow icon={<Hash size={12} />} label="Fields" value={String(row.fieldCount)} />}
              </>
            )}
            {artifactType === "dashboard" && (
              <>
                {row.category && <InfoRow icon={<Tag size={12} />} label="Category" value={row.category} />}
                {row.widgetCount != null && <InfoRow icon={<LayoutDashboard size={12} />} label="Widgets" value={String(row.widgetCount)} />}
                {row.creatorName && <InfoRow icon={<Hash size={12} />} label="Creator" value={row.creatorName} />}
              </>
            )}
            {artifactType === "workflow" && (
              <>
                {row.isScheduled != null && <InfoRow icon={<Clock size={12} />} label="Scheduled" value={row.isScheduled ? "Yes" : "No"} />}
                {row.cronExpression && <InfoRow icon={<Clock size={12} />} label="Cron" value={row.cronExpression} />}
                {row.pluginCount != null && <InfoRow icon={<Workflow size={12} />} label="Plugins" value={String(row.pluginCount)} />}
                {row.description && <InfoRow icon={<Hash size={12} />} label="Description" value={row.description} />}
              </>
            )}
          </div>
        </section>

        {/* Classification section */}
        <section>
          <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Classification</h4>
          <div className="space-y-2.5">
            <FieldGroup label="Data Type">
              <ComboBox
                value={row.dataType || ""}
                onChange={handleChange("dataType")}
                options={classificationStore.values.dataType}
                placeholder="Select data type..."
              />
            </FieldGroup>

            <FieldGroup label="Category">
              <ComboBox
                value={row.dataCategory || ""}
                onChange={handleChange("dataCategory")}
                options={classificationStore.values.dataCategory}
                placeholder="Select category..."
              />
            </FieldGroup>

            <FieldGroup label="Sub-Category">
              <ComboBox
                value={row.dataSubCategory || ""}
                onChange={handleChange("dataSubCategory")}
                options={classificationStore.values.dataSubCategory}
                placeholder="Select sub-category..."
              />
            </FieldGroup>

            <FieldGroup label="Usage Status">
              <ComboBox
                value={row.usageStatus || ""}
                onChange={handleChange("usageStatus")}
                options={classificationStore.values.usageStatus}
                placeholder="Select usage status..."
              />
            </FieldGroup>

            <FieldGroup label="Action">
              <ComboBox
                value={row.action || ""}
                onChange={handleChange("action")}
                options={classificationStore.values.action}
                placeholder="Select action..."
              />
            </FieldGroup>

            <FieldGroup label="Data Source">
              <ComboBox
                value={row.dataSource || ""}
                onChange={handleChange("dataSource")}
                options={classificationStore.values.dataSource}
                placeholder="Select data source..."
              />
            </FieldGroup>

            <FieldGroup label="Source System">
              <ComboBox
                value={row.sourceSystem || ""}
                onChange={handleChange("sourceSystem")}
                options={classificationStore.values.sourceSystem}
                placeholder="Select source system..."
              />
            </FieldGroup>

            <FieldGroup label="Tags">
              <TagsInput
                value={row.tags || ""}
                onChange={handleChange("tags")}
                suggestions={classificationStore.values.tags}
              />
            </FieldGroup>
          </div>
        </section>

        {/* Portal / Sitemap section */}
        <section>
          <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Portal</h4>
          <div className="space-y-2.5">
            <FieldGroup label="Include in Sitemap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.includeSitemap ?? false}
                  onChange={(e) => onFieldChange?.("includeSitemap", e.target.checked as unknown as string)}
                  className="rounded border-slate-300 dark:border-zinc-700 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">Show on client portal</span>
              </label>
            </FieldGroup>

            <FieldGroup label="Sitemap Group 1">
              <ComboBox
                value={row.sitemapGroup1 || ""}
                onChange={handleChange("sitemapGroup1")}
                options={classificationStore.values.sitemapGroup1 || []}
                placeholder="Select group..."
              />
            </FieldGroup>

            <FieldGroup label="Sitemap Group 2">
              <ComboBox
                value={row.sitemapGroup2 || ""}
                onChange={handleChange("sitemapGroup2")}
                options={classificationStore.values.sitemapGroup2 || []}
                placeholder="Select sub-group..."
              />
            </FieldGroup>

            <FieldGroup label="Solution">
              <ComboBox
                value={row.solution || ""}
                onChange={handleChange("solution")}
                options={classificationStore.values.solution || []}
                placeholder="Select solution..."
              />
            </FieldGroup>

            <FieldGroup label="Resource URL">
              <input
                type="text"
                value={row.resourceUrl || ""}
                onChange={(e) => onFieldChange?.("resourceUrl", e.target.value || null)}
                placeholder="https://domain.thinkval.io/..."
                className="w-full text-xs px-2 py-1.5 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
              />
            </FieldGroup>
          </div>
        </section>

        {/* Naming & Summary */}
        <section>
          <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Naming & Summary</h4>
          <div className="space-y-2.5">
            <FieldGroup label="Suggested Name">
              <input
                type="text"
                value={row.suggestedName || ""}
                onChange={(e) => onFieldChange?.("suggestedName", e.target.value || null)}
                placeholder="Suggested name..."
                className="w-full text-xs px-2 py-1.5 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
              />
            </FieldGroup>

            <FieldGroup label="Summary (Short)">
              <textarea
                value={row.summaryShort || ""}
                onChange={(e) => onFieldChange?.("summaryShort", e.target.value || null)}
                placeholder="Brief summary..."
                rows={2}
                className="w-full text-xs px-2 py-1.5 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 resize-none"
              />
            </FieldGroup>

            <FieldGroup label="Summary (Full)">
              <textarea
                value={row.summaryFull || ""}
                onChange={(e) => onFieldChange?.("summaryFull", e.target.value || null)}
                placeholder="Detailed summary..."
                rows={4}
                className="w-full text-xs px-2 py-1.5 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 resize-none"
              />
            </FieldGroup>
          </div>
        </section>
      </div>
    </div>
  );
}

// Helper components
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-400 flex-shrink-0">{icon}</span>
      <span className="text-zinc-500 w-20 flex-shrink-0">{label}</span>
      <span className="text-zinc-800 dark:text-zinc-200 truncate">{value}</span>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function formatDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}
