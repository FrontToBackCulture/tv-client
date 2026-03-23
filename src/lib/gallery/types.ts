// Skill library types — unified table for reports, diagnostics, and chat skills

import type { Database } from "../supabase-types";

// Skill Library (unified: report, diagnostic, chat)
export type SkillLibraryItem = Database["public"]["Tables"]["skill_library"]["Row"];
export type SkillLibraryInsert = Database["public"]["Tables"]["skill_library"]["Insert"];
export type SkillLibraryUpdate = Database["public"]["Tables"]["skill_library"]["Update"];

export type SkillLibraryType = "report" | "diagnostic" | "chat";

// Legacy aliases for gradual migration (remove once all consumers are updated)
export type ReportSkill = SkillLibraryItem;
export type ReportSkillInsert = SkillLibraryInsert;
export type ReportSkillUpdate = SkillLibraryUpdate;
