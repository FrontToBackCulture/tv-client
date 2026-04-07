// src/stores/projectFieldsStore.ts
// Configurable project detail fields per project type

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createWorkspaceScopedStorage } from "../lib/workspaceScopedStorage";
import { DEAL_STAGES, DEAL_SOLUTIONS } from "../lib/crm/types";

export type FieldType = "text" | "number" | "date" | "select" | "multiselect" | "textarea";

/** A single configurable field on a project */
export interface ProjectFieldDef {
  key: string;        // DB column name or custom_<id> for custom fields
  label: string;      // Display label
  type: FieldType;
  options?: { value: string; label: string }[];
  enabled: boolean;   // Whether to show this field
  builtIn: boolean;   // true = maps to a real DB column, false = stored in custom_fields JSONB
}

/** Stored config per field (overrides for label, type, options) */
export interface FieldOverride {
  label?: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
}

/** Built-in fields available on the projects table */
export const BUILT_IN_FIELDS: { key: string; label: string; type: FieldType; options?: { value: string; label: string }[] }[] = [
  { key: "health", label: "Health", type: "select", options: [
    { value: "on_track", label: "On Track" },
    { value: "at_risk", label: "At Risk" },
    { value: "off_track", label: "Off Track" },
  ]},
  { key: "lead", label: "Lead", type: "text" },
  { key: "target_date", label: "Target Date", type: "date" },
  { key: "priority", label: "Priority", type: "select", options: [
    { value: "0", label: "None" },
    { value: "1", label: "Urgent" },
    { value: "2", label: "High" },
    { value: "3", label: "Medium" },
    { value: "4", label: "Low" },
  ]},
  { key: "summary", label: "Summary", type: "textarea" },
];

/** Deal-specific built-in fields */
export const DEAL_BUILT_IN_FIELDS: { key: string; label: string; type: FieldType; options?: { value: string; label: string }[] }[] = [
  { key: "deal_stage", label: "Stage", type: "select", options: DEAL_STAGES.map(s => ({ value: s.value, label: s.label })) },
  { key: "deal_value", label: "Value", type: "number" },
  { key: "deal_currency", label: "Currency", type: "text" },
  { key: "deal_solution", label: "Solution", type: "multiselect", options: DEAL_SOLUTIONS.map(s => ({ value: s.value, label: s.label })) },
  { key: "deal_expected_close", label: "Expected Close", type: "date" },
  { key: "deal_actual_close", label: "Actual Close", type: "date" },
  { key: "deal_lost_reason", label: "Lost Reason", type: "text" },
  { key: "deal_won_notes", label: "Won Notes", type: "text" },
  { key: "deal_notes", label: "Notes", type: "textarea" },
];

/** Project types that can be configured */
export const PROJECT_TYPES = [
  { key: "work", label: "Work", description: "Engineering and operational projects" },
  { key: "deal", label: "Deal", description: "CRM deals and sales pipeline" },
] as const;

export type ProjectType = typeof PROJECT_TYPES[number]["key"];

/** Default enabled fields per type */
const DEFAULT_CONFIGS: Record<ProjectType, string[]> = {
  work: ["health", "lead", "target_date"],
  deal: ["deal_stage", "deal_value", "deal_currency", "deal_solution", "deal_expected_close", "deal_actual_close", "deal_lost_reason", "deal_won_notes", "deal_notes"],
};

/** Custom field definition (user-created) */
export interface CustomFieldDef {
  key: string;      // e.g. "custom_abc123"
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
}

interface ProjectFieldsState {
  /** Map of project_type -> list of enabled field keys */
  configs: Record<string, string[]>;
  /** Map of project_type -> field key -> overrides (label, type, options) */
  overrides: Record<string, Record<string, FieldOverride>>;
  /** Map of project_type -> custom field definitions */
  customFields: Record<string, CustomFieldDef[]>;
  /** Map of project_type -> list of deleted built-in field keys */
  deletedFields: Record<string, string[]>;
  /** Get enabled field keys for a project type */
  getEnabledFields: (projectType: string) => string[];
  /** Toggle a field on/off for a project type */
  toggleField: (projectType: string, fieldKey: string) => void;
  /** Set all enabled fields for a project type */
  setFields: (projectType: string, fieldKeys: string[]) => void;
  /** Reset a project type to defaults */
  resetToDefaults: (projectType: string) => void;
  /** Update field override (label, type, options) */
  setFieldOverride: (projectType: string, fieldKey: string, override: FieldOverride) => void;
  /** Add a custom field to a project type */
  addCustomField: (projectType: string, field: CustomFieldDef) => void;
  /** Remove a custom field from a project type */
  removeCustomField: (projectType: string, fieldKey: string) => void;
  /** Update a custom field definition */
  updateCustomField: (projectType: string, fieldKey: string, updates: Partial<CustomFieldDef>) => void;
  /** Delete a built-in field (hide from list) */
  deleteBuiltInField: (projectType: string, fieldKey: string) => void;
  /** Restore a deleted built-in field */
  restoreBuiltInField: (projectType: string, fieldKey: string) => void;
  /** Get deleted built-in field keys for a project type */
  getDeletedFields: (projectType: string) => string[];
}

export const useProjectFieldsStore = create<ProjectFieldsState>()(
  persist(
    (set, get) => ({
      configs: { ...DEFAULT_CONFIGS },
      overrides: {},
      customFields: {},
      deletedFields: {},

      getEnabledFields: (projectType: string) => {
        return get().configs[projectType] ?? DEFAULT_CONFIGS[projectType as ProjectType] ?? [];
      },

      toggleField: (projectType: string, fieldKey: string) => {
        const current = get().getEnabledFields(projectType);
        const updated = current.includes(fieldKey)
          ? current.filter((k) => k !== fieldKey)
          : [...current, fieldKey];
        set({ configs: { ...get().configs, [projectType]: updated } });
      },

      setFields: (projectType: string, fieldKeys: string[]) => {
        set({ configs: { ...get().configs, [projectType]: fieldKeys } });
      },

      resetToDefaults: (projectType: string) => {
        const defaults = DEFAULT_CONFIGS[projectType as ProjectType] ?? [];
        set({
          configs: { ...get().configs, [projectType]: defaults },
          overrides: { ...get().overrides, [projectType]: {} },
          customFields: { ...get().customFields, [projectType]: [] },
          deletedFields: { ...get().deletedFields, [projectType]: [] },
        });
      },

      setFieldOverride: (projectType: string, fieldKey: string, override: FieldOverride) => {
        const current = get().overrides[projectType] ?? {};
        const existing = current[fieldKey] ?? {};
        set({
          overrides: {
            ...get().overrides,
            [projectType]: { ...current, [fieldKey]: { ...existing, ...override } },
          },
        });
      },

      addCustomField: (projectType: string, field: CustomFieldDef) => {
        const current = get().customFields[projectType] ?? [];
        const enabled = get().getEnabledFields(projectType);
        set({
          customFields: { ...get().customFields, [projectType]: [...current, field] },
          configs: { ...get().configs, [projectType]: [...enabled, field.key] },
        });
      },

      removeCustomField: (projectType: string, fieldKey: string) => {
        const current = get().customFields[projectType] ?? [];
        const enabled = get().getEnabledFields(projectType);
        const overrides = { ...(get().overrides[projectType] ?? {}) };
        delete overrides[fieldKey];
        set({
          customFields: { ...get().customFields, [projectType]: current.filter((f) => f.key !== fieldKey) },
          configs: { ...get().configs, [projectType]: enabled.filter((k) => k !== fieldKey) },
          overrides: { ...get().overrides, [projectType]: overrides },
        });
      },

      updateCustomField: (projectType: string, fieldKey: string, updates: Partial<CustomFieldDef>) => {
        const current = get().customFields[projectType] ?? [];
        set({
          customFields: {
            ...get().customFields,
            [projectType]: current.map((f) => f.key === fieldKey ? { ...f, ...updates } : f),
          },
        });
      },

      deleteBuiltInField: (projectType: string, fieldKey: string) => {
        const deleted = get().deletedFields[projectType] ?? [];
        const enabled = get().getEnabledFields(projectType);
        set({
          deletedFields: { ...get().deletedFields, [projectType]: [...deleted, fieldKey] },
          configs: { ...get().configs, [projectType]: enabled.filter((k) => k !== fieldKey) },
        });
      },

      restoreBuiltInField: (projectType: string, fieldKey: string) => {
        const deleted = get().deletedFields[projectType] ?? [];
        set({
          deletedFields: { ...get().deletedFields, [projectType]: deleted.filter((k) => k !== fieldKey) },
        });
      },

      getDeletedFields: (projectType: string) => {
        return get().deletedFields[projectType] ?? [];
      },
    }),
    {
      name: "tv-client-project-fields",
      storage: createJSONStorage(() => createWorkspaceScopedStorage()),
    }
  )
);

/** Get the full field definitions for a project type (all available, with enabled flag and overrides applied) */
export function getFieldDefsForType(projectType: string): ProjectFieldDef[] {
  const state = useProjectFieldsStore.getState();
  const enabledKeys = state.getEnabledFields(projectType);
  const overrides = state.overrides[projectType] ?? {};
  const customFields = state.customFields[projectType] ?? [];
  const deletedKeys = state.getDeletedFields(projectType);

  // Built-in fields (exclude deleted)
  let builtInFields: { key: string; label: string; type: FieldType; options?: { value: string; label: string }[] }[];
  switch (projectType) {
    case "deal":
      builtInFields = [...BUILT_IN_FIELDS, ...DEAL_BUILT_IN_FIELDS];
      break;
    default:
      builtInFields = BUILT_IN_FIELDS;
  }

  const result: ProjectFieldDef[] = builtInFields
    .filter((f) => !deletedKeys.includes(f.key))
    .map((f) => {
      const ov = overrides[f.key];
      return {
        key: f.key,
        label: ov?.label ?? f.label,
        type: ov?.type ?? f.type,
        options: ov?.options ?? f.options,
        enabled: enabledKeys.includes(f.key),
        builtIn: true,
      };
    });

  // Custom fields
  for (const cf of customFields) {
    result.push({
      key: cf.key,
      label: cf.label,
      type: cf.type,
      options: cf.options,
      enabled: enabledKeys.includes(cf.key),
      builtIn: false,
    });
  }

  return result;
}

/** Field type display config */
export const FIELD_TYPE_CONFIG: Record<FieldType, { label: string; color: string }> = {
  text: { label: "Text", color: "#6B7280" },
  number: { label: "Number", color: "#3B82F6" },
  date: { label: "Date", color: "#8B5CF6" },
  select: { label: "Select", color: "#F59E0B" },
  multiselect: { label: "Multi Select", color: "#F97316" },
  textarea: { label: "Text Area", color: "#10B981" },
};
