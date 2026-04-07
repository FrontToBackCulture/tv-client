// src/stores/skillTypesStore.ts
// User-configurable skill type options for the skills grid

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createWorkspaceScopedStorage } from "../lib/workspaceScopedStorage";

export interface SkillTypeOption {
  value: string;
  label: string;
  color: string; // Tailwind classes e.g. "bg-blue-600 text-white"
}

const DEFAULT_SKILL_TYPES: SkillTypeOption[] = [
  { value: "report", label: "report", color: "bg-blue-600 text-white" },
  { value: "diagnostic", label: "diagnostic", color: "bg-amber-600 text-white" },
  { value: "chat", label: "chat", color: "bg-violet-600 text-white" },
];

interface SkillTypesStore {
  types: SkillTypeOption[];
  addType: (opt: SkillTypeOption) => void;
  updateType: (value: string, updates: Partial<Omit<SkillTypeOption, "value">>) => void;
  removeType: (value: string) => void;
  reorderTypes: (types: SkillTypeOption[]) => void;
  resetToDefaults: () => void;
}

export const useSkillTypesStore = create<SkillTypesStore>()(
  persist(
    (set) => ({
      types: DEFAULT_SKILL_TYPES,

      addType: (opt) =>
        set((s) => ({
          types: s.types.some((t) => t.value === opt.value)
            ? s.types
            : [...s.types, opt],
        })),

      updateType: (value, updates) =>
        set((s) => ({
          types: s.types.map((t) =>
            t.value === value ? { ...t, ...updates } : t
          ),
        })),

      removeType: (value) =>
        set((s) => ({ types: s.types.filter((t) => t.value !== value) })),

      reorderTypes: (types) => set({ types }),

      resetToDefaults: () => set({ types: DEFAULT_SKILL_TYPES }),
    }),
    {
      name: "tv-skill-types",
      storage: createJSONStorage(() => createWorkspaceScopedStorage()),
    }
  )
);
