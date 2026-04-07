// src/stores/taskFieldsStore.ts
// Configurable task list/detail fields per project type (work vs deal)

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createWorkspaceScopedStorage } from "../lib/workspaceScopedStorage";

/** Task field definition */
export interface TaskFieldDef {
  key: string;
  label: string;
  context: "list" | "detail" | "both";  // where the field appears
  enabled: boolean;
}

/** Common task fields (shown for all project types) */
export const COMMON_TASK_FIELDS: { key: string; label: string; context: "list" | "detail" | "both" }[] = [
  { key: "status", label: "Status", context: "both" },
  { key: "title", label: "Title", context: "list" },
  { key: "priority", label: "Priority", context: "both" },
  { key: "assignee", label: "Assignee", context: "both" },
  { key: "due_date", label: "Due Date", context: "both" },
  { key: "milestone", label: "Milestone", context: "detail" },
  { key: "company", label: "Company", context: "both" },
  { key: "labels", label: "Labels", context: "detail" },
];

/** Deal-specific task fields */
export const DEAL_TASK_FIELDS: { key: string; label: string; context: "list" | "detail" | "both" }[] = [
  { key: "task_type", label: "Type", context: "both" },
  { key: "contact", label: "Contact", context: "both" },
  { key: "referral", label: "Referral", context: "list" },
  { key: "days_in_stage", label: "Days in Stage", context: "both" },
];

/** Default enabled fields per project type */
const DEFAULT_TASK_CONFIGS: Record<string, string[]> = {
  work: ["status", "title", "priority", "assignee", "due_date", "milestone", "company", "labels"],
  deal: ["status", "title", "task_type", "company", "contact", "referral", "days_in_stage", "priority", "assignee", "due_date", "milestone", "labels"],
};

interface TaskFieldsState {
  configs: Record<string, string[]>;
  getEnabledFields: (projectType: string) => string[];
  toggleField: (projectType: string, fieldKey: string) => void;
  resetToDefaults: (projectType: string) => void;
}

export const useTaskFieldsStore = create<TaskFieldsState>()(
  persist(
    (set, get) => ({
      configs: {},

      getEnabledFields: (projectType: string) => {
        return get().configs[projectType] ?? DEFAULT_TASK_CONFIGS[projectType] ?? DEFAULT_TASK_CONFIGS.work;
      },

      toggleField: (projectType: string, fieldKey: string) => {
        const current = get().getEnabledFields(projectType);
        const updated = current.includes(fieldKey)
          ? current.filter((k) => k !== fieldKey)
          : [...current, fieldKey];
        set({ configs: { ...get().configs, [projectType]: updated } });
      },

      resetToDefaults: (projectType: string) => {
        const defaults = DEFAULT_TASK_CONFIGS[projectType] ?? DEFAULT_TASK_CONFIGS.work;
        set({ configs: { ...get().configs, [projectType]: defaults } });
      },
    }),
    {
      name: "tv-client-task-fields",
      storage: createJSONStorage(() => createWorkspaceScopedStorage()),
    }
  )
);

/** Get all available task field definitions for a project type */
export function getTaskFieldDefs(projectType: string): TaskFieldDef[] {
  const state = useTaskFieldsStore.getState();
  const enabledKeys = state.getEnabledFields(projectType);

  const allFields = projectType === "deal"
    ? [...COMMON_TASK_FIELDS, ...DEAL_TASK_FIELDS]
    : COMMON_TASK_FIELDS;

  return allFields.map((f) => ({
    key: f.key,
    label: f.label,
    context: f.context,
    enabled: enabledKeys.includes(f.key),
  }));
}
