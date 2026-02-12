// src/stores/classificationStore.ts
// Editable classification values for data models, persisted to localStorage.
// Initialized from static defaults, grows as AI Analyze and manual edits add new values.

import { create } from "zustand";
import { persist } from "zustand/middleware";
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

/** All classification field names */
export type ClassificationField =
  | "dataCategory"
  | "dataSubCategory"
  | "dataType"
  | "usageStatus"
  | "action"
  | "dataSource"
  | "sourceSystem"
  | "tags"
  | "solution"
  | "sitemapGroup1"
  | "sitemapGroup2";

/** Map of field name to its values array */
export type ClassificationValues = Record<ClassificationField, string[]>;

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

interface ClassificationState {
  values: ClassificationValues;

  /** Add a single value to a field (no-op if already exists) */
  addValue: (field: ClassificationField, value: string) => void;

  /** Add multiple values to a field (skips existing) */
  addValues: (field: ClassificationField, newValues: string[]) => void;

  /** Remove a value from a field */
  removeValue: (field: ClassificationField, value: string) => void;

  /** Reset a single field to defaults */
  resetField: (field: ClassificationField) => void;

  /** Reset all fields to defaults */
  resetAll: () => void;

  /** Get sorted values for a field (for display) */
  getSorted: (field: ClassificationField) => string[];

  /** Get dropdown values with empty string first (for AG Grid editors) */
  getDropdownValues: (field: ClassificationField) => string[];
}

export const useClassificationStore = create<ClassificationState>()(
  persist(
    (set, get) => ({
      values: { ...DEFAULTS },

      addValue: (field, value) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        set((state) => {
          if (state.values[field].includes(trimmed)) return state;
          return {
            values: {
              ...state.values,
              [field]: [...state.values[field], trimmed].sort(),
            },
          };
        });
      },

      addValues: (field, newValues) => {
        set((state) => {
          const existing = new Set(state.values[field]);
          const toAdd = newValues
            .map((v) => v.trim())
            .filter((v) => v && !existing.has(v));
          if (toAdd.length === 0) return state;
          return {
            values: {
              ...state.values,
              [field]: [...state.values[field], ...toAdd].sort(),
            },
          };
        });
      },

      removeValue: (field, value) => {
        set((state) => ({
          values: {
            ...state.values,
            [field]: state.values[field].filter((v) => v !== value),
          },
        }));
      },

      resetField: (field) => {
        set((state) => ({
          values: {
            ...state.values,
            [field]: [...DEFAULTS[field]],
          },
        }));
      },

      resetAll: () => {
        set({ values: { ...DEFAULTS } });
      },

      getSorted: (field) => {
        return [...get().values[field]].sort();
      },

      getDropdownValues: (field) => {
        return ["", ...get().values[field]];
      },
    }),
    {
      name: "tv-classification-values",
      merge: (persisted, current) => {
        const p = persisted as Partial<ClassificationState> | undefined;
        const c = current as ClassificationState;
        if (!p || !p.values) return c;
        // Ensure every field from DEFAULTS exists — fills in new fields added after
        // the user's localStorage was last written.
        const mergedValues = { ...DEFAULTS } as ClassificationValues;
        for (const key of Object.keys(DEFAULTS) as ClassificationField[]) {
          if (Array.isArray(p.values[key])) {
            mergedValues[key] = p.values[key];
          }
        }
        return { ...c, values: mergedValues };
      },
    }
  )
);
