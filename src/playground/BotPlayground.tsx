// src/playground/BotPlayground.tsx
// Prototype: Bots module redesign — overview card + drill-down views
// Toggle via Shift+Cmd+X → "Bots" tab

import { useState, useMemo } from "react";
import {
  Bot,
  Search,
  X,
  Clock,
  Sparkles,
  Zap,
  Loader2,
  BookOpen,
  FileCode,
  Folder,
  ArrowLeft,
  ChevronRight,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { useListDirectory, useReadFile } from "../hooks/useFiles";
import { useQueries } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useBotSettingsStore } from "../stores/botSettingsStore";
import { useAuth } from "../stores/authStore";
import { useFolderFiles } from "../hooks/useFolderFiles";
import { cn } from "../lib/cn";

// ============================
// Types
// ============================
interface BotEntry {
  name: string;
  dirPath: string;
  group: string;
}

interface BotProfile {
  description: string;
  mission: string;
  role: string;
  department: string;
  focus: string;
}

type DetailView =
  | null
  | { type: "skill"; skillName: string; skillPath: string; title: string }
  | { type: "session"; sessionPath: string; date: string; title: string | null }
  | { type: "commands" };

// ============================
// Config
// ============================
const DEPT_COLORS: Record<string, { dot: string; badge: string; text: string }> = {
  personal: { dot: "bg-zinc-400", badge: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400" },
  eng: { dot: "bg-blue-500", badge: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-400" },
  corp: { dot: "bg-purple-500", badge: "bg-purple-50 dark:bg-purple-900/20", text: "text-purple-700 dark:text-purple-400" },
  ops: { dot: "bg-amber-500", badge: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400" },
  sales: { dot: "bg-green-500", badge: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400" },
  cusops: { dot: "bg-teal-500", badge: "bg-teal-50 dark:bg-teal-900/20", text: "text-teal-700 dark:text-teal-400" },
  acct: { dot: "bg-indigo-500", badge: "bg-indigo-50 dark:bg-indigo-900/20", text: "text-indigo-700 dark:text-indigo-400" },
};

const GROUP_LABELS: Record<string, string> = {
  personal: "Personal",
  eng: "Engineering",
  corp: "Corporate",
  ops: "Operations",
  sales: "Sales",
  cusops: "Customer Ops",
  acct: "Accounting",
};

const GROUP_ORDER = ["personal", "eng", "corp", "ops", "sales", "cusops", "acct"];

// ============================
// Helpers
// ============================
function formatBotName(dirName: string): string {
  return dirName
    .replace(/^bot-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getDeptGroup(dirName: string): string {
  const withoutPrefix = dirName.replace(/^bot-/, "");
  const dash = withoutPrefix.indexOf("-");
  return dash > 0 ? withoutPrefix.substring(0, dash) : withoutPrefix;
}

function getBotInitials(dirName: string): string {
  const parts = dirName.replace(/^bot-/, "").split("-");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function parseBotProfile(content: string | undefined): BotProfile {
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

function relativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr + "T00:00:00");
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function extractDateFromPath(filePath: string): string | null {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// ============================
// Back button
// ============================
function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mb-4"
    >
      <ArrowLeft size={14} />
      <span>{label}</span>
    </button>
  );
}

// ============================
// Skill Detail View
// ============================
function SkillDetail({
  skillPath,
  title,
  onBack,
}: {
  skillPath: string;
  title: string;
  onBack: () => void;
}) {
  const { data: skillMd, isLoading: loadingMd } = useReadFile(`${skillPath}/SKILL.md`);
  const { data: entries = [], isLoading: loadingDir } = useListDirectory(skillPath);

  const files = entries.filter((e) => !e.is_directory && !e.name.startsWith("."));
  const folders = entries.filter((e) => e.is_directory && !e.name.startsWith("."));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <BackButton label="Back to overview" onClick={onBack} />

        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-amber-500" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>
        </div>

        {(loadingMd || loadingDir) && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        )}

        {/* SKILL.md content */}
        {skillMd && (
          <div className="mt-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-2">
              <FileText size={12} className="text-zinc-400" />
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">SKILL.md</span>
            </div>
            <pre className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
              {skillMd}
            </pre>
          </div>
        )}

        {/* Subfolders */}
        {folders.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Folders
            </h2>
            <div className="space-y-1">
              {folders.map((f) => (
                <SkillSubfolder key={f.path} path={f.path} name={f.name} />
              ))}
            </div>
          </section>
        )}

        {/* Root files (non-SKILL.md) */}
        {files.filter((f) => f.name !== "SKILL.md").length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Files
            </h2>
            <div className="space-y-1">
              {files
                .filter((f) => f.name !== "SKILL.md")
                .map((f) => (
                  <SkillFileRow key={f.path} path={f.path} name={f.name} />
                ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SkillSubfolder({ path, name }: { path: string; name: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: entries = [] } = useListDirectory(expanded ? path : undefined);
  const files = entries.filter((e) => !e.is_directory && !e.name.startsWith("."));
  const icon = name === "templates" ? FileCode : name === "playbooks" ? BookOpen : Folder;
  const Icon = icon;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
      >
        <Icon size={14} className="text-zinc-400 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-1">{name}</span>
        <ChevronRight size={14} className={cn("text-zinc-400 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && files.length > 0 && (
        <div className="ml-4 mt-1 space-y-1">
          {files.map((f) => (
            <SkillFileRow key={f.path} path={f.path} name={f.name} />
          ))}
        </div>
      )}
      {expanded && files.length === 0 && entries.length > 0 && (
        <p className="ml-6 mt-1 text-[11px] text-zinc-400">No files</p>
      )}
    </div>
  );
}

function SkillFileRow({ path, name }: { path: string; name: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: content, isLoading } = useReadFile(expanded ? path : undefined);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <FileText size={13} className="text-zinc-400 flex-shrink-0" />
        <span className="text-sm text-zinc-600 dark:text-zinc-400 flex-1 truncate">{name}</span>
        {name.endsWith(".md") && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-400">MD</span>
        )}
        <ChevronRight size={12} className={cn("text-zinc-400 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="ml-4 mt-1 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-3 flex items-center gap-2 text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : (
            <pre className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto">
              {content || "(empty)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ============================
// Session Detail View
// ============================
function SessionDetail({
  sessionPath,
  date,
  title,
  onBack,
}: {
  sessionPath: string;
  date: string;
  title: string | null;
  onBack: () => void;
}) {
  const { data: content, isLoading } = useReadFile(sessionPath);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <BackButton label="Back to overview" onClick={onBack} />

        <div className="flex items-center gap-3 mb-1">
          <Clock size={16} className="text-blue-500" />
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {title || `Session Notes - ${date}`}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              {relativeDate(date)} &middot; {date}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <pre className="px-5 py-4 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
              {content || "(empty)"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================
// Command List View
// ============================
function CommandListView({
  commandsDir,
  onBack,
}: {
  commandsDir: string;
  onBack: () => void;
}) {
  const { data: entries = [], isLoading } = useListDirectory(commandsDir);
  const commands = entries.filter((e) => !e.is_directory && e.name.endsWith(".md"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <BackButton label="Back to overview" onClick={onBack} />

        <div className="flex items-center gap-2 mb-1">
          <Zap size={16} className="text-teal-500" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Commands</h1>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          {commands.length} slash command{commands.length !== 1 ? "s" : ""} defined
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : commands.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-lg">
            <Zap size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
            <p className="text-xs text-zinc-400">No commands defined</p>
          </div>
        ) : (
          <div className="space-y-2">
            {commands.map((cmd) => (
              <CommandRow key={cmd.path} path={cmd.path} name={cmd.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommandRow({ path, name }: { path: string; name: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: content, isLoading } = useReadFile(expanded ? path : undefined);
  const cmdName = name.replace(/\.md$/, "");

  return (
    <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        <Zap size={13} className="text-teal-500 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-1">/{cmdName}</span>
        <MoreHorizontal size={14} className="text-zinc-400" />
      </button>
      {expanded && (
        <div className="border-t border-slate-100 dark:border-zinc-800">
          {isLoading ? (
            <div className="px-4 py-3 flex items-center gap-2 text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : (
            <pre className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto">
              {content || "(empty)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ============================
// Bot Overview — two-column layout
// ============================
function BotOverview({
  bot,
  profile,
  claudeContent,
  isLoading,
  skillCount,
  commandCount,
  recentSessions,
  skillList,
  onSkillClick,
  onSessionClick,
  onCommandsClick,
}: {
  bot: BotEntry;
  profile: BotProfile;
  claudeContent: string | undefined;
  isLoading: boolean;
  skillCount: number;
  commandCount: number;
  recentSessions: { date: string; title: string | null; summary: string | null; path: string }[];
  skillList: { name: string; path: string; title: string; summary: string; subfolders: string[] }[];
  onSkillClick: (skill: { name: string; path: string; title: string }) => void;
  onSessionClick: (session: { path: string; date: string; title: string | null }) => void;
  onCommandsClick: () => void;
}) {
  const colors = DEPT_COLORS[bot.group] || DEPT_COLORS.personal;
  const initials = getBotInitials(bot.name);
  const [showFullInstructions, setShowFullInstructions] = useState(false);

  // Truncate CLAUDE.md for preview
  const instructionsPreview = useMemo(() => {
    if (!claudeContent) return "";
    const lines = claudeContent.split("\n");
    // Skip frontmatter-like header (title line)
    const start = lines.findIndex((l) => l.startsWith("## ") || (l.trim() && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("---")));
    const meaningful = lines.slice(Math.max(0, start)).join("\n").trim();
    return meaningful.length > 300 ? meaningful.slice(0, 300) + "..." : meaningful;
  }, [claudeContent]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="px-6 pb-6">
      {/* ── Profile Header — full width ──── */}
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden mb-6">
          <div className={cn("h-1.5", colors.dot.replace("bg-", "bg-gradient-to-r from-").replace("-500", "-400") + " to-" + colors.dot.replace("bg-", "").replace("-500", "-600"))} />
          <div className="px-5 py-4">
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0",
                colors.badge, colors.text
              )}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatBotName(bot.name)}
                  </h1>
                  <span className={cn("px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full", colors.badge, colors.text)}>
                    {profile.department || GROUP_LABELS[bot.group] || bot.group}
                  </span>
                </div>
                {profile.description && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{profile.description}</p>
                )}
                {profile.role && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    {profile.role}{profile.focus ? ` — ${profile.focus}` : ""}
                  </p>
                )}
              </div>
            </div>
            {profile.mission && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{profile.mission}</p>
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={() => { if (skillCount > 0) onSkillClick(skillList[0]); }} className="focus:outline-none">
                <StatPill icon={Sparkles} label="Skills" count={skillCount} color="text-amber-500" clickable={skillCount > 0} />
              </button>
              <button onClick={onCommandsClick} className="focus:outline-none">
                <StatPill icon={Zap} label="Commands" count={commandCount} color="text-teal-500" clickable={commandCount > 0} />
              </button>
              <StatPill icon={Clock} label="Sessions" count={recentSessions.length} color="text-blue-500" clickable={false} />
            </div>
          </div>
        </div>

        {/* ── Two-column body ──────────────── */}
        <div className="flex gap-6">
          {/* Left column: Skills + Sessions */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Skills */}
            {skillList.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-amber-500" />
                  Skills
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {skillList.map((skill) => (
                    <button
                      key={skill.name}
                      onClick={() => onSkillClick({ name: skill.name, path: skill.path, title: skill.title })}
                      className="text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles size={13} className="text-amber-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          {skill.title}
                        </span>
                      </div>
                      {skill.summary && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2">{skill.summary}</p>
                      )}
                      {skill.subfolders.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {skill.subfolders.map((sub) => (
                            <span key={sub} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                              {sub === "templates" ? <FileCode size={8} /> : sub === "playbooks" ? <BookOpen size={8} /> : <Folder size={8} />}
                              {sub}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Sessions */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                <Clock size={12} className="text-blue-500" />
                Recent Sessions
              </h2>
              {recentSessions.length === 0 ? (
                <div className="py-6 text-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-lg">
                  <Clock size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-xs text-zinc-400">No sessions yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {recentSessions.slice(0, 5).map((s) => (
                    <button
                      key={s.path}
                      onClick={() => onSessionClick(s)}
                      className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all cursor-pointer group"
                    >
                      <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-700 mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{relativeDate(s.date)}</span>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-600">{s.date}</span>
                        </div>
                        {s.title && (
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{s.title}</p>
                        )}
                        {s.summary && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">{s.summary}</p>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-700 mt-1 flex-shrink-0 group-hover:text-zinc-500 transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right column: Instructions + Commands */}
          <div className="w-[320px] flex-shrink-0 space-y-4">
            {/* Instructions (CLAUDE.md preview) */}
            {claudeContent && (
              <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Instructions</span>
                  <span className="text-[10px] text-zinc-400">CLAUDE.md</span>
                </div>
                <div className="px-4 py-3">
                  <pre className={cn(
                    "text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed",
                    !showFullInstructions && "line-clamp-[12]"
                  )}>
                    {showFullInstructions ? claudeContent : instructionsPreview}
                  </pre>
                  {claudeContent.length > 300 && (
                    <button
                      onClick={() => setShowFullInstructions(!showFullInstructions)}
                      className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline mt-2"
                    >
                      {showFullInstructions ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Commands */}
            {commandCount > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Commands</span>
                  <span className="text-[10px] text-zinc-400 tabular-nums">{commandCount}</span>
                </div>
                <button
                  onClick={onCommandsClick}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors flex items-center gap-2 group"
                >
                  <Zap size={13} className="text-teal-500" />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1">
                    {commandCount} slash command{commandCount !== 1 ? "s" : ""} defined
                  </span>
                  <ChevronRight size={12} className="text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                </button>
              </div>
            )}

            {/* Bot metadata */}
            <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Details</span>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {profile.department && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Department</span>
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{profile.department}</span>
                  </div>
                )}
                {profile.role && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Role</span>
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{profile.role}</span>
                  </div>
                )}
                {profile.focus && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Focus</span>
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{profile.focus}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">Directory</span>
                  <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[180px]">{bot.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

function StatPill({ icon: Icon, label, count, color, clickable }: { icon: typeof Clock; label: string; count: number; color: string; clickable: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800",
      clickable && "hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer transition-colors"
    )}>
      <Icon size={13} className={color} />
      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{count}</span>
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
}

// ============================
// Bot Sidebar
// ============================
function BotSidebarItem({
  bot,
  isSelected,
  onSelect,
}: {
  bot: BotEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const colors = DEPT_COLORS[bot.group] || DEPT_COLORS.personal;
  const initials = getBotInitials(bot.name);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors",
        isSelected
          ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
      )}
    >
      <div
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0",
          colors.badge,
          colors.text
        )}
      >
        {initials}
      </div>
      <span className="text-[13px] font-medium truncate">{formatBotName(bot.name)}</span>
    </button>
  );
}

function BotSidebar({
  bots,
  grouped,
  selectedPath,
  search,
  onSearch,
  onSelect,
  showSessions,
  onToggleSessions,
  sessionCount,
}: {
  bots: BotEntry[];
  grouped: [string, BotEntry[]][];
  selectedPath: string | null;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (path: string) => void;
  showSessions: boolean;
  onToggleSessions: () => void;
  sessionCount: number;
}) {
  const filtered = search
    ? bots.filter((b) =>
        formatBotName(b.name).toLowerCase().includes(search.toLowerCase())
      )
    : null;

  return (
    <div className="w-[240px] flex-shrink-0 h-full border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex flex-col">
      {/* Search */}
      <div className="p-3 pb-2">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            placeholder="Search bots..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Sessions link */}
      <div className="px-3 pb-2">
        <button
          onClick={onToggleSessions}
          className={cn(
            "w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
            showSessions
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
              : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400"
          )}
        >
          <Clock size={14} />
          <span className="flex-1">Sessions</span>
          {sessionCount > 0 && (
            <span className="text-[10px] tabular-nums text-zinc-400">
              {sessionCount}
            </span>
          )}
        </button>
      </div>

      <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-3" />

      {/* Bot list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filtered ? (
          filtered.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-4">
              No bots matching "{search}"
            </p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((bot) => (
                <BotSidebarItem
                  key={bot.dirPath}
                  bot={bot}
                  isSelected={bot.dirPath === selectedPath}
                  onSelect={() => onSelect(bot.dirPath)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {grouped.map(([group, groupBots]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 mb-1">
                  {GROUP_LABELS[group] || group}
                </p>
                <div className="space-y-0.5">
                  {groupBots.map((bot) => (
                    <BotSidebarItem
                      key={bot.dirPath}
                      bot={bot}
                      isSelected={bot.dirPath === selectedPath}
                      onSelect={() => onSelect(bot.dirPath)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================
// Main BotPlayground
// ============================
export function BotPlayground() {
  const botsPath = useBotSettingsStore((s) => s.botsPath);
  const storedSessionsPath = useBotSettingsStore((s) => s.sessionsPath);
  const user = useAuth((s) => s.user);
  const teamPath = botsPath || undefined;

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const [detailView, setDetailView] = useState<DetailView>(null);

  // Load team directory
  const { data: teamEntries = [], isLoading: loadingTeam } = useListDirectory(teamPath);

  // Detect personal folder
  const personalFolderPath = useMemo(() => {
    if (storedSessionsPath) {
      const normalized = storedSessionsPath.replace(/\/+$/, "");
      if (normalized.endsWith("/sessions")) return normalized.slice(0, -"/sessions".length);
    }
    if (user) {
      const candidates = [user.login?.toLowerCase(), user.name?.split(" ")[0]?.toLowerCase()].filter(Boolean) as string[];
      const memberFolders = teamEntries.filter((e) => e.is_directory && !e.name.startsWith("bot-") && !e.name.startsWith("_"));
      const match = memberFolders.find((f) => candidates.includes(f.name.toLowerCase()));
      if (match) return match.path;
    }
    return null;
  }, [teamEntries, user, storedSessionsPath]);

  const { data: personalEntries = [] } = useListDirectory(personalFolderPath || undefined);

  // Build bot list
  const allBots = useMemo(() => {
    const teamBots: BotEntry[] = teamEntries
      .filter((e) => e.is_directory && e.name.startsWith("bot-"))
      .map((e) => ({ name: e.name, dirPath: e.path, group: getDeptGroup(e.name) }));
    const myBots: BotEntry[] = personalEntries
      .filter((e) => e.is_directory && e.name.startsWith("bot-"))
      .map((e) => ({ name: e.name, dirPath: e.path, group: "personal" }));
    return [...myBots, ...teamBots].sort((a, b) => {
      const aOrder = GROUP_ORDER.indexOf(a.group);
      const bOrder = GROUP_ORDER.indexOf(b.group);
      if ((aOrder >= 0 ? aOrder : 999) !== (bOrder >= 0 ? bOrder : 999))
        return (aOrder >= 0 ? aOrder : 999) - (bOrder >= 0 ? bOrder : 999);
      return a.name.localeCompare(b.name);
    });
  }, [teamEntries, personalEntries]);

  const grouped = useMemo(() => {
    const groups: Record<string, BotEntry[]> = {};
    for (const bot of allBots) {
      if (!groups[bot.group]) groups[bot.group] = [];
      groups[bot.group].push(bot);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
    });
  }, [allBots]);

  const selectedBot = allBots.find((b) => b.dirPath === selectedPath);

  // CLAUDE.md for selected bot
  const claudeMdPath = selectedPath ? `${selectedPath}/CLAUDE.md` : undefined;
  const { data: claudeContent, isLoading: loadingClaude } = useReadFile(claudeMdPath);
  const profile = useMemo(() => parseBotProfile(claudeContent), [claudeContent]);

  // Commands for selected bot
  const commandsDir = selectedPath ? `${selectedPath}/.claude/commands` : undefined;
  const { data: commandEntries = [] } = useListDirectory(commandsDir);
  const commandCount = commandEntries.filter((e) => !e.is_directory && e.name.endsWith(".md")).length;

  // Skills for selected bot
  const skillsDir = selectedPath ? `${selectedPath}/skills` : undefined;
  const { data: skillEntries = [] } = useListDirectory(skillsDir);
  const skillFolders = skillEntries.filter((e) => e.is_directory);

  // Batch-read skill SKILL.md files
  const skillContentQueries = useQueries({
    queries: skillFolders.map((f) => ({
      queryKey: ["file", `${f.path}/SKILL.md`],
      queryFn: () => invoke<string>("read_file", { path: `${f.path}/SKILL.md` }),
      staleTime: 10 * 60 * 1000,
    })),
  });

  // Read skill subfolders
  const skillSubfolderQueries = useQueries({
    queries: skillFolders.map((f) => ({
      queryKey: ["dir", f.path],
      queryFn: () => invoke<{ name: string; path: string; is_directory: boolean }[]>("list_directory", { path: f.path }),
      staleTime: 10 * 60 * 1000,
    })),
  });

  const skillList = useMemo(() => {
    return skillFolders.map((f, i) => {
      const content = skillContentQueries[i]?.data;
      const subfolders = skillSubfolderQueries[i]?.data || [];
      const titleMatch = content?.match(/^#\s+(.+)$/m);
      const summaryMatch = content?.match(/^summary:\s*"?([^"\n]+)"?/m) || content?.match(/^>\s*(.+)$/m);
      return {
        name: f.name,
        path: f.path,
        title: titleMatch?.[1] || f.name,
        summary: summaryMatch?.[1]?.trim() || "",
        subfolders: subfolders.filter((s) => s.is_directory && !s.name.startsWith(".")).map((s) => s.name),
      };
    });
  }, [skillFolders, skillContentQueries, skillSubfolderQueries]);

  // Sessions
  const sessionsPath = storedSessionsPath || (personalFolderPath ? `${personalFolderPath}/sessions` : null);
  const { data: sessionFiles = [] } = useFolderFiles(sessionsPath, 100);

  const sessions = useMemo(() => {
    return sessionFiles
      .filter((f) => f.name === "notes.md")
      .map((f) => ({
        date: extractDateFromPath(f.path) || "",
        title: f.title,
        summary: f.summary,
        path: f.path,
      }))
      .filter((s) => s.date)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sessionFiles]);

  // Navigation
  const handleSelectBot = (path: string) => {
    setSelectedPath(path);
    setShowSessions(false);
    setDetailView(null);
  };

  const handleBackToOverview = () => setDetailView(null);

  if (loadingTeam) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!teamPath) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950 text-zinc-400">
        <div className="text-center">
          <Bot size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No bots path configured</p>
          <p className="text-xs mt-1 text-zinc-500">Set your bots directory in Settings</p>
        </div>
      </div>
    );
  }

  // Determine right-panel content
  let content: React.ReactNode;

  if (detailView && selectedBot) {
    if (detailView.type === "skill") {
      content = <SkillDetail skillPath={detailView.skillPath} title={detailView.title} onBack={handleBackToOverview} />;
    } else if (detailView.type === "session") {
      content = <SessionDetail sessionPath={detailView.sessionPath} date={detailView.date} title={detailView.title} onBack={handleBackToOverview} />;
    } else if (detailView.type === "commands" && commandsDir) {
      content = <CommandListView commandsDir={commandsDir} onBack={handleBackToOverview} />;
    }
  } else if (selectedBot) {
    content = (
      <div className="h-full overflow-y-auto pt-6">
        <BotOverview
          bot={selectedBot}
          profile={profile}
          claudeContent={claudeContent}
          isLoading={loadingClaude}
          skillCount={skillList.length}
          commandCount={commandCount}
          recentSessions={sessions.slice(0, 5)}
          skillList={skillList}
          onSkillClick={(skill) => setDetailView({ type: "skill", skillName: skill.name, skillPath: skill.path, title: skill.title })}
          onSessionClick={(session) => setDetailView({ type: "session", sessionPath: session.path, date: session.date, title: session.title })}
          onCommandsClick={() => setDetailView({ type: "commands" })}
        />
      </div>
    );
  } else {
    // No bot selected — show welcome
    content = (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <div className="text-center">
          <Bot size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Select a bot to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-white dark:bg-zinc-950">
      <BotSidebar
        bots={allBots}
        grouped={grouped}
        selectedPath={selectedPath}
        search={search}
        onSearch={setSearch}
        onSelect={handleSelectBot}
        showSessions={showSessions}
        onToggleSessions={() => {
          setShowSessions(!showSessions);
          setSelectedPath(null);
          setDetailView(null);
        }}
        sessionCount={sessions.length}
      />
      <div className="flex-1 min-w-0">{content}</div>
    </div>
  );
}
