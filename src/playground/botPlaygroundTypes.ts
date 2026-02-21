// BotPlayground: Shared types, config constants, and helper functions

import type { LucideIcon } from "lucide-react";

// ============================
// Types
// ============================
export interface BotEntry {
  name: string;
  dirPath: string;
  group: string;
  owner?: string; // team member name for personal bots
}

export interface BotProfile {
  description: string;
  mission: string;
  role: string;
  department: string;
  focus: string;
}

export type DetailView =
  | null
  | { type: "skill"; skillName: string; skillPath: string; title: string }
  | { type: "session"; sessionPath: string; date: string; title: string | null }
  | { type: "commands" };

export type SkillStatus = "active" | "inactive" | "deprecated";

export interface SkillMeta {
  status: SkillStatus;
  lastRevised: string | null;
  updated: string | null;
  command: string | null;
  input: string | null;
  output: string | null;
  sources: string | null;
  writes: string | null;
  tools: string | null;
}

// ============================
// Config
// ============================
export const DEPT_COLORS: Record<string, { dot: string; badge: string; text: string }> = {
  personal: { dot: "bg-zinc-400", badge: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400" },
  eng: { dot: "bg-blue-500", badge: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-400" },
  corp: { dot: "bg-purple-500", badge: "bg-purple-50 dark:bg-purple-900/20", text: "text-purple-700 dark:text-purple-400" },
  ops: { dot: "bg-amber-500", badge: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400" },
  sales: { dot: "bg-green-500", badge: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400" },
  cusops: { dot: "bg-teal-500", badge: "bg-teal-50 dark:bg-teal-900/20", text: "text-teal-700 dark:text-teal-400" },
  acct: { dot: "bg-indigo-500", badge: "bg-indigo-50 dark:bg-indigo-900/20", text: "text-indigo-700 dark:text-indigo-400" },
};

export const GROUP_LABELS: Record<string, string> = {
  personal: "Personal",
  eng: "Engineering",
  corp: "Corporate",
  ops: "Operations",
  sales: "Sales",
  cusops: "Customer Ops",
  acct: "Accounting",
};

export const GROUP_ORDER = ["personal", "eng", "corp", "ops", "sales", "cusops", "acct"];

export const SKILL_STATUS_CONFIG: Record<SkillStatus, { label: string; dot: string; badge: string; text: string }> = {
  active: { label: "Active", dot: "bg-green-500", badge: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400" },
  inactive: { label: "Inactive", dot: "bg-zinc-400", badge: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400" },
  deprecated: { label: "Deprecated", dot: "bg-red-400", badge: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400" },
};

// ============================
// Helpers
// ============================
export function formatBotName(dirName: string): string {
  return dirName
    .replace(/^bot-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function getDeptGroup(dirName: string): string {
  const withoutPrefix = dirName.replace(/^bot-/, "");
  const dash = withoutPrefix.indexOf("-");
  return dash > 0 ? withoutPrefix.substring(0, dash) : withoutPrefix;
}

export function getBotInitials(dirName: string): string {
  const parts = dirName.replace(/^bot-/, "").split("-");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

export function parseBotProfile(content: string | undefined): BotProfile {
  if (!content) return { description: "", mission: "", role: "", department: "", focus: "" };

  const descMatch = content.match(/^#\s+.+\n+([^#|\n].+)/m);
  const description = descMatch?.[1]?.trim() || "";

  const tableMatch = content.match(/\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g);
  let role = "", department = "", focus = "";
  if (tableMatch && tableMatch.length >= 2) {
    const dataRow = tableMatch[1];
    const cells = dataRow.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 3 && !cells[0].startsWith("---")) {
      role = cells[0];
      department = cells[1];
      focus = cells[2];
    }
    if (role.startsWith("---") && tableMatch.length >= 3) {
      const dataRow2 = tableMatch[2];
      const cells2 = dataRow2.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells2.length >= 3) {
        role = cells2[0];
        department = cells2[1];
        focus = cells2[2];
      }
    }
  }

  const missionMatch = content.match(/## Mission\s*\n+([\s\S]*?)(?=\n##|\n---|\Z)/);
  const mission = missionMatch?.[1]?.trim().split("\n")[0] || "";

  return { description, mission, role, department, focus };
}

export function parseSkillFrontmatter(content: string | undefined): SkillMeta {
  if (!content) return { status: "active", lastRevised: null, updated: null, command: null, input: null, output: null, sources: null, writes: null, tools: null };
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch?.[1] || "";
  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"));
    return m?.[1]?.trim() || null;
  };
  const raw = get("status")?.toLowerCase();
  const status: SkillStatus = raw === "inactive" ? "inactive" : raw === "deprecated" ? "deprecated" : "active";
  return {
    status,
    lastRevised: get("last_revised"),
    updated: get("updated"),
    command: get("command"),
    input: get("input"),
    output: get("output"),
    sources: get("sources"),
    writes: get("writes"),
    tools: get("tools"),
  };
}

export function updateFrontmatterField(content: string, key: string, value: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (fmMatch) {
    const yaml = fmMatch[2];
    const fieldRegex = new RegExp(`^${key}:.*$`, "m");
    if (fieldRegex.test(yaml)) {
      const updated = yaml.replace(fieldRegex, `${key}: ${value}`);
      return `${fmMatch[1]}${updated}${fmMatch[3]}${content.slice(fmMatch[0].length)}`;
    }
    // Field doesn't exist — add before closing ---
    return `${fmMatch[1]}${yaml}\n${key}: ${value}${fmMatch[3]}${content.slice(fmMatch[0].length)}`;
  }
  // No frontmatter — prepend
  return `---\n${key}: ${value}\n---\n${content}`;
}

export function relativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr + "T00:00:00");
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function extractDateFromPath(filePath: string): string | null {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// Re-usable prop type for StatPill
export interface StatPillProps {
  icon: LucideIcon;
  label: string;
  count: number;
  color: string;
  clickable: boolean;
}
