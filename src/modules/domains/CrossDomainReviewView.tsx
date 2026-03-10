// src/modules/domains/CrossDomainReviewView.tsx
// Cross-domain review: reads from Supabase domain_artifacts table (single query, instant).
// Supports editing — writes to both filesystem (via folderPath) and Supabase.

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, AlertTriangle } from "lucide-react";
import { ReviewGrid } from "../library/ReviewGrid";
import { fetchCrossDomainArtifacts, upsertArtifactFields } from "../../lib/domainArtifacts";
import { EDITABLE_FIELDS, FIELD_TO_STORE, RESOURCE_LABEL } from "../library/reviewTypes";
import type { ReviewResourceType, ReviewRow } from "../library/reviewTypes";
import { useClassificationStore } from "../../stores/classificationStore";

interface CrossDomainReviewViewProps {
  resourceType: ReviewResourceType;
}

export function CrossDomainReviewView({ resourceType }: CrossDomainReviewViewProps) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modifiedRows, setModifiedRows] = useState<Map<string, Partial<ReviewRow>>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const addClassificationValue = useClassificationStore((s) => s.addValue);
  const addClassificationValues = useClassificationStore((s) => s.addValues);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setModifiedRows(new Map());

    fetchCrossDomainArtifacts(resourceType)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [resourceType]);

  // Build a lookup from row key to row data (for folderPath resolution)
  const rowsByKey = new Map<string, ReviewRow>();
  const isTable = resourceType === "table";
  for (const row of rows) {
    const key = isTable ? row.name : row.folderName;
    // In cross-domain mode, key is prefixed with domain
    const crossKey = row.domain ? `${row.domain}::${key}` : key;
    rowsByKey.set(crossKey, row);
  }

  const handleCellEdited = useCallback((key: string, field: string, newValue: unknown) => {
    setModifiedRows((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(key) || {};
      newMap.set(key, { ...existing, [field]: newValue });
      return newMap;
    });

    // Sync classification values to store
    const storeField = FIELD_TO_STORE[field];
    if (storeField && typeof newValue === "string" && newValue) {
      if (storeField === "tags") {
        const tags = newValue.split(",").map((t: string) => t.trim()).filter(Boolean);
        addClassificationValues("tags", tags);
      } else {
        addClassificationValue(storeField, newValue);
      }
    }
  }, [addClassificationValue, addClassificationValues]);

  // Save: write to filesystem first, then sync to Supabase
  const handleSave = useCallback(async () => {
    if (modifiedRows.size === 0) return;
    setIsSaving(true);

    const savedKeys: string[] = [];

    try {
      for (const [key, changes] of modifiedRows.entries()) {
        // key format in cross-domain mode: "domain::resourceId"
        const row = rowsByKey.get(key);
        if (!row || !row.folderPath) {
          console.warn(`Cannot save ${key}: no folderPath available`);
          continue;
        }

        // folderPath already points to the individual item folder
        const resourceId = isTable ? row.name : row.folderName;
        const analysisPath = `${row.folderPath}/definition_analysis.json`;

        // Read existing file or create new structure
        let analysis: Record<string, unknown> = {};
        try {
          const content = await invoke<string>("read_file", { path: analysisPath });
          analysis = JSON.parse(content);
        } catch { /* File doesn't exist, will create new */ }

        // Merge changes
        for (const [field, value] of Object.entries(changes)) {
          if (field === "dataType") {
            if (!analysis.classification) analysis.classification = {};
            (analysis.classification as Record<string, unknown>).dataType = value;
          } else if (field === "summaryShort") {
            if (!analysis.summary) analysis.summary = {};
            (analysis.summary as Record<string, unknown>).short = value;
          } else if (field === "summaryFull") {
            if (!analysis.summary) analysis.summary = {};
            (analysis.summary as Record<string, unknown>).full = value;
          } else if (field === "includeSitemap") {
            analysis.includeSitemap = value === true || value === "true";
          } else if (EDITABLE_FIELDS.has(field)) {
            analysis[field] = value;
          }
        }

        await invoke("write_file", {
          path: analysisPath,
          content: JSON.stringify(analysis, null, 2),
        });

        savedKeys.push(key);

        // Sync to Supabase (fire-and-forget)
        if (row.domain) {
          upsertArtifactFields(row.domain, resourceType, resourceId, changes as Partial<ReviewRow>).catch((e) => {
            console.warn(`Failed to sync ${key} to Supabase:`, e);
          });
        }
      }

      setModifiedRows(new Map());
      showToast(`Saved changes to ${savedKeys.length} item(s)`, "success");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to save changes";
      showToast(errorMsg, "error");
    } finally {
      setIsSaving(false);
    }
  }, [modifiedRows, rowsByKey, resourceType, isTable, showToast]);

  // Auto-save with debounce (2 seconds after last change)
  useEffect(() => {
    if (modifiedRows.size === 0) return;
    const timer = setTimeout(() => { handleSave(); }, 2000);
    return () => clearTimeout(timer);
  }, [modifiedRows, handleSave]);

  const domainCount = new Set(rows.map((r) => r.domain)).size;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={24} className="mx-auto mb-3 text-teal-500 animate-spin" />
          <p className="text-sm text-zinc-500">
            Loading {RESOURCE_LABEL[resourceType]}...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-zinc-400">
            No {RESOURCE_LABEL[resourceType].toLowerCase()} found
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Run a rebuild to populate from filesystem
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {RESOURCE_LABEL[resourceType]} — All Domains
            </h2>
            <p className="text-sm text-zinc-500">
              {rows.length} {RESOURCE_LABEL[resourceType].toLowerCase()} across {domainCount} domains
            </p>
          </div>
          {modifiedRows.size > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-500">
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : null}
              {modifiedRows.size} unsaved change{modifiedRows.size !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden">
        <ReviewGrid
          resourceType={resourceType}
          folderPath=""
          domainName="All Domains"
          reviewMode={true}
          externalRows={rows}
          crossDomain
          onCellEdited={handleCellEdited}
          modifiedRows={modifiedRows}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm shadow-lg z-50 ${
          toast.type === "success"
            ? "bg-teal-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
