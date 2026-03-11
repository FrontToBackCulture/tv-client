// Gallery module types — report skill library + question library

import type { Database } from "../supabase-types";

// Report Skill Library
export type ReportSkill = Database["public"]["Tables"]["report_skill_library"]["Row"];
export type ReportSkillInsert = Database["public"]["Tables"]["report_skill_library"]["Insert"];
export type ReportSkillUpdate = Database["public"]["Tables"]["report_skill_library"]["Update"];

// Question Library
export type Question = Database["public"]["Tables"]["question_library"]["Row"];
export type QuestionInsert = Database["public"]["Tables"]["question_library"]["Insert"];
export type QuestionUpdate = Database["public"]["Tables"]["question_library"]["Update"];
