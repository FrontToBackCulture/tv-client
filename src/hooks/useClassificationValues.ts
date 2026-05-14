// src/hooks/useClassificationValues.ts
// Source-of-truth hook for classification controlled vocabularies (Layer 2).
//
// Reads from Supabase `lookup_values` table and reshapes into the camelCase
// ClassificationField map that AG Grid editors consume. Replaces the
// localStorage-backed Zustand classificationStore as the canonical reader.
//
// The bundled defaults from src/lib/classificationValues.ts are retained as a
// fallback so the UI keeps working before the seed migration runs and during
// the first paint while the query is in flight.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type {
  ClassificationField,
  ClassificationValues,
} from "../stores/classificationStore";
import {
  DATA_CATEGORY,
  DATA_SUB_CATEGORY,
  DATA_TYPE,
  USAGE_STATUS,
  ACTION,
  DATA_SOURCE,
  SOURCE_SYSTEM,
  TAGS,
  SOLUTION,
  SITEMAP_GROUP_1,
  SITEMAP_GROUP_2,
} from "../lib/classificationValues";

// Bundled defaults — loaded into the result on first paint and as a network
// fallback. Kept in sync with the seed migration `seed_classification_lookup_values`.
const DEFAULTS: ClassificationValues = {
  dataCategory: [...DATA_CATEGORY],
  dataSubCategory: [...DATA_SUB_CATEGORY],
  dataType: [...DATA_TYPE],
  usageStatus: [...USAGE_STATUS],
  action: [...ACTION],
  dataSource: [...DATA_SOURCE],
  sourceSystem: [...SOURCE_SYSTEM],
  tags: [...TAGS],
  solution: [...SOLUTION],
  sitemapGroup1: [...SITEMAP_GROUP_1],
  sitemapGroup2: [...SITEMAP_GROUP_2],
};

// snake_case `lookup_values.type` ↔ camelCase ClassificationField.
const TYPE_TO_FIELD: Record<string, ClassificationField> = {
  data_category: "dataCategory",
  data_sub_category: "dataSubCategory",
  data_type: "dataType",
  usage_status: "usageStatus",
  action: "action",
  data_source: "dataSource",
  source_system: "sourceSystem",
  solution: "solution",
  sitemap_group_1: "sitemapGroup1",
  sitemap_group_2: "sitemapGroup2",
  tag: "tags",
};

const FIELD_TO_TYPE: Record<ClassificationField, string> = Object.entries(
  TYPE_TO_FIELD,
).reduce((acc, [type, field]) => {
  acc[field] = type;
  return acc;
}, {} as Record<ClassificationField, string>);

const CLASSIFICATION_TYPES = Object.keys(TYPE_TO_FIELD);
const CLASSIFICATION_KEY = ["classification-values"];

/** Fetch all classification controlled vocabularies in one query. */
export function useClassificationValues() {
  return useQuery({
    queryKey: CLASSIFICATION_KEY,
    queryFn: async (): Promise<ClassificationValues> => {
      const { data, error } = await supabase
        .from("lookup_values")
        .select("type, value, sort_order")
        .in("type", CLASSIFICATION_TYPES)
        .order("sort_order");

      if (error) throw new Error(`Failed to load classification values: ${error.message}`);

      const result: ClassificationValues = {
        dataCategory: [],
        dataSubCategory: [],
        dataType: [],
        usageStatus: [],
        action: [],
        dataSource: [],
        sourceSystem: [],
        tags: [],
        solution: [],
        sitemapGroup1: [],
        sitemapGroup2: [],
      };

      for (const row of data ?? []) {
        const field = TYPE_TO_FIELD[row.type as string];
        if (!field) continue;
        result[field].push(row.value as string);
      }

      // Fall back to bundled defaults for any field with no Supabase rows
      // (defends against partial seed runs during local dev).
      for (const f of Object.keys(result) as ClassificationField[]) {
        if (result[f].length === 0) result[f] = [...DEFAULTS[f]];
      }
      return result;
    },
    // Vocabularies change rarely; keep cached for the session.
    staleTime: 10 * 60 * 1000,
    placeholderData: DEFAULTS,
  });
}

/** Convenience: returns the values map (or bundled defaults during first paint). */
export function useClassificationMap(): ClassificationValues {
  const { data } = useClassificationValues();
  return data ?? DEFAULTS;
}

/** Add a new value to a classification field. Inserts into lookup_values and
 *  invalidates the cache so dropdowns refresh. No-op if the (type, value) pair
 *  already exists (handled by the unique constraint). */
export function useAddClassificationValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ field, value }: { field: ClassificationField; value: string }) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      const type = FIELD_TO_TYPE[field];
      if (!type) throw new Error(`Unknown classification field: ${field}`);

      // Append at the end (sort_order = max + 1) so existing ordering is preserved.
      const { data: maxRow } = await supabase
        .from("lookup_values")
        .select("sort_order")
        .eq("type", type)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder = (maxRow?.sort_order ?? 0) + 1;

      const { error } = await supabase
        .from("lookup_values")
        .upsert(
          { type, value: trimmed, label: trimmed, sort_order: nextOrder },
          { onConflict: "type,value" },
        );
      if (error) throw new Error(`Failed to add classification value: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLASSIFICATION_KEY });
    },
  });
}

/** Remove a value from a classification field. */
export function useRemoveClassificationValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ field, value }: { field: ClassificationField; value: string }) => {
      const type = FIELD_TO_TYPE[field];
      if (!type) throw new Error(`Unknown classification field: ${field}`);
      const { error } = await supabase
        .from("lookup_values")
        .delete()
        .eq("type", type)
        .eq("value", value);
      if (error) throw new Error(`Failed to remove classification value: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLASSIFICATION_KEY });
    },
  });
}

/** Bulk-add values (skips existing). Used by AI Analyze flows that produce
 *  many new tags/categories at once. */
export function useAddClassificationValues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ field, values }: { field: ClassificationField; values: string[] }) => {
      const type = FIELD_TO_TYPE[field];
      if (!type) throw new Error(`Unknown classification field: ${field}`);
      const cleaned = Array.from(
        new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)),
      );
      if (cleaned.length === 0) return;

      const { data: maxRow } = await supabase
        .from("lookup_values")
        .select("sort_order")
        .eq("type", type)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextOrder = (maxRow?.sort_order ?? 0) + 1;

      const rows = cleaned.map((v) => ({
        type,
        value: v,
        label: v,
        sort_order: nextOrder++,
      }));
      const { error } = await supabase
        .from("lookup_values")
        .upsert(rows, { onConflict: "type,value" });
      if (error) throw new Error(`Failed to bulk-add classification values: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLASSIFICATION_KEY });
    },
  });
}
