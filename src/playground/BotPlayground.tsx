// src/playground/BotPlayground.tsx
// Prototype: Bots module redesign — overview card + drill-down views
// Toggle via Shift+Cmd+X → "Bots" tab

import { useState, useMemo, useEffect } from "react";
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
  Users,
  Copy,
  Eye,
  Pencil,
  Save,
  ArrowUpDown,
  Brain,
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderInput,
  FolderOutput,
} from "lucide-react";
import { useListDirectory, useReadFile, useWriteFile, FileEntry } from "../hooks/useFiles";
import { useQueries } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useBotSettingsStore } from "../stores/botSettingsStore";
import { useViewContextStore } from "../stores/viewContextStore";
import { useFolderFiles, FolderFile } from "../hooks/useFolderFiles";
import { cn } from "../lib/cn";
import { ViewTab } from "../components/ViewTab";
import { MarkdownViewer } from "../modules/library/MarkdownViewer";

// ============================
// Types
// ============================
interface BotEntry {
  name: string;
  dirPath: string;
  group: string;
  owner?: string; // team member name for personal bots
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

type SkillStatus = "active" | "inactive" | "deprecated";

const SKILL_STATUS_CONFIG: Record<SkillStatus, { label: string; dot: string; badge: string; text: string }> = {
  active: { label: "Active", dot: "bg-green-500", badge: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400" },
  inactive: { label: "Inactive", dot: "bg-zinc-400", badge: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-400" },
  deprecated: { label: "Deprecated", dot: "bg-red-400", badge: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400" },
};

interface SkillMeta {
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

function parseSkillFrontmatter(content: string | undefined): SkillMeta {
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

function updateFrontmatterField(content: string, key: string, value: string): string {
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
// Skill Modal
// ============================
function SkillModal({
  skillPath,
  skillName,
  title,
  usage,
  onClose,
}: {
  skillPath: string;
  skillName: string;
  title: string;
  usage?: { invocations: number; mentions: number };
  onClose: () => void;
}) {
  const filePath = `${skillPath}/SKILL.md`;
  const { data: skillMd, isLoading: loadingMd } = useReadFile(filePath);
  const { data: entries = [], isLoading: loadingDir } = useListDirectory(skillPath);
  const [viewMode, setViewMode] = useState<"rendered" | "edit">("rendered");
  const [editContent, setEditContent] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const writeFile = useWriteFile();

  const files = entries.filter((e) => !e.is_directory && !e.name.startsWith("."));
  const folders = entries.filter((e) => e.is_directory && !e.name.startsWith("."));

  const handleCopy = () => {
    if (skillMd) navigator.clipboard.writeText(skillMd);
  };

  const handleEdit = () => {
    setEditContent(skillMd || "");
    setIsDirty(false);
    setViewMode("edit");
  };

  const handleSave = () => {
    writeFile.mutate(
      { path: filePath, content: editContent },
      { onSuccess: () => { setIsDirty(false); setViewMode("rendered"); } }
    );
  };

  const handleClose = () => {
    if (isDirty && !confirm("You have unsaved changes. Discard?")) return;
    onClose();
  };

  // Parse frontmatter
  const summary = useMemo(() => {
    if (!skillMd) return "";
    const match = skillMd.match(/^summary:\s*"?([^"\n]+)"?/m);
    return match?.[1]?.trim() || "";
  }, [skillMd]);

  const { status: currentStatus, lastRevised } = useMemo(() => parseSkillFrontmatter(skillMd), [skillMd]);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const handleStatusChange = (newStatus: SkillStatus) => {
    if (!skillMd) return;
    const today = new Date().toISOString().slice(0, 10);
    let updated = updateFrontmatterField(skillMd, "status", newStatus);
    updated = updateFrontmatterField(updated, "last_revised", today);
    writeFile.mutate({ path: filePath, content: updated });
    setShowStatusMenu(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">&middot;</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{skillName}</span>
                {/* Status badge with dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowStatusMenu(!showStatusMenu)}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                      SKILL_STATUS_CONFIG[currentStatus].badge,
                      SKILL_STATUS_CONFIG[currentStatus].text
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", SKILL_STATUS_CONFIG[currentStatus].dot)} />
                    {SKILL_STATUS_CONFIG[currentStatus].label}
                  </button>
                  {showStatusMenu && (
                    <div className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-10">
                      {(["active", "inactive", "deprecated"] as SkillStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={cn(
                            "w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-zinc-700",
                            s === currentStatus && "bg-slate-50 dark:bg-zinc-700"
                          )}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full", SKILL_STATUS_CONFIG[s].dot)} />
                          <span className="text-zinc-700 dark:text-zinc-300">{SKILL_STATUS_CONFIG[s].label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {lastRevised && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">revised {relativeDate(lastRevised)}</span>
                )}
                {usage && (usage.invocations > 0 || usage.mentions > 0) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 tabular-nums">
                    {usage.invocations > 0 ? `${usage.invocations} invoked` : ""}
                    {usage.invocations > 0 && usage.mentions > 0 ? " · " : ""}
                    {usage.mentions > 0 ? `${usage.mentions} mentioned` : ""}
                  </span>
                )}
                {isDirty && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">Unsaved</span>
                )}
                {writeFile.isPending && (
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Saving...</span>
                )}
              </div>
              {summary && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">{summary}</p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {(loadingMd || loadingDir) && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          )}

          {skillMd !== undefined && (
            <div className="overflow-hidden">
              {/* View toggle bar */}
              <div className="px-5 py-2 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50">
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  {viewMode === "edit" ? "Editing" : "Description"}
                </span>
                <div className="flex items-center gap-0.5">
                  {viewMode === "edit" ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={!isDirty || writeFile.isPending}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                          isDirty
                            ? "bg-teal-500 text-white hover:bg-teal-600"
                            : "bg-slate-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                        )}
                      >
                        <Save size={12} />
                        Save
                      </button>
                      <button
                        onClick={() => { setViewMode("rendered"); setIsDirty(false); }}
                        className="px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setViewMode("rendered")}
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          viewMode === "rendered"
                            ? "bg-slate-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                            : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        )}
                        title="Preview"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={handleEdit}
                        className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={handleCopy}
                        className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Content: rendered, or edit */}
              {viewMode === "rendered" ? (
                <div className="px-6 py-5">
                  <MarkdownViewer content={skillMd} filename="SKILL.md" />
                </div>
              ) : (
                <textarea
                  value={editContent}
                  onChange={(e) => { setEditContent(e.target.value); setIsDirty(true); }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
                  }}
                  className="w-full min-h-[400px] px-5 py-4 text-sm text-zinc-700 dark:text-zinc-300 bg-transparent font-mono leading-relaxed resize-none focus:outline-none"
                  spellCheck={false}
                />
              )}
            </div>
          )}

          {/* Subfolders */}
          {folders.length > 0 && (
            <section className="px-5 py-4 border-t border-slate-100 dark:border-zinc-800">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
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
            <section className="px-5 py-4 border-t border-slate-100 dark:border-zinc-800">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
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
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const { data: content, isLoading } = useReadFile(expanded ? path : undefined);
  const writeFile = useWriteFile();

  const handleEdit = () => {
    setEditContent(content || "");
    setIsDirty(false);
    setEditing(true);
  };

  const handleSave = () => {
    writeFile.mutate(
      { path, content: editContent },
      { onSuccess: () => { setIsDirty(false); setEditing(false); } }
    );
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <FileText size={13} className="text-zinc-400 flex-shrink-0" />
        <span className="text-sm text-zinc-600 dark:text-zinc-400 flex-1 truncate">{name}</span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
        )}
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
          ) : editing ? (
            <div>
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-1">
                <button
                  onClick={handleSave}
                  disabled={!isDirty || writeFile.isPending}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                    isDirty ? "bg-teal-500 text-white hover:bg-teal-600" : "bg-slate-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  <Save size={10} />
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setIsDirty(false); }}
                  className="px-2 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
              <textarea
                value={editContent}
                onChange={(e) => { setEditContent(e.target.value); setIsDirty(true); }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
                }}
                className="w-full min-h-[200px] max-h-[400px] px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 bg-transparent font-mono leading-relaxed resize-none focus:outline-none"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="relative group">
              <button
                onClick={handleEdit}
                className="absolute top-2 right-2 p-1 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit"
              >
                <Pencil size={12} />
              </button>
              <pre className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto">
                {content || "(empty)"}
              </pre>
            </div>
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
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [editContent, setEditContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const writeFile = useWriteFile();

  const handleEdit = () => {
    setEditContent(content || "");
    setIsDirty(false);
    setViewMode("edit");
  };

  const handleSave = () => {
    writeFile.mutate(
      { path: sessionPath, content: editContent },
      { onSuccess: () => { setIsDirty(false); setViewMode("preview"); } }
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <BackButton label="Back to overview" onClick={onBack} />

        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-blue-500" />
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {title || `Session Notes - ${date}`}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                {relativeDate(date)} &middot; {date}
                {isDirty && <span className="ml-2 text-amber-500">Unsaved</span>}
                {writeFile.isPending && <span className="ml-2">Saving...</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {viewMode === "edit" ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={!isDirty || writeFile.isPending}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    isDirty ? "bg-teal-500 text-white hover:bg-teal-600" : "bg-slate-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  <Save size={12} />
                  Save
                </button>
                <button
                  onClick={() => { setViewMode("preview"); setIsDirty(false); }}
                  className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setViewMode("preview")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    viewMode === "preview"
                      ? "bg-slate-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                      : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  )}
                  title="Preview"
                >
                  <Eye size={14} />
                </button>
                <button
                  onClick={handleEdit}
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : viewMode === "edit" ? (
          <div className="mt-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <textarea
              value={editContent}
              onChange={(e) => { setEditContent(e.target.value); setIsDirty(true); }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
              }}
              className="w-full min-h-[500px] px-5 py-4 text-sm text-zinc-700 dark:text-zinc-300 bg-transparent font-mono leading-relaxed resize-none focus:outline-none"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden px-6 py-5">
            <MarkdownViewer content={content || "(empty)"} filename="notes.md" />
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
  skillCategories,
  onSkillClick,
  onSessionClick,
  onCommandsClick,
  skillUsage,
}: {
  bot: BotEntry;
  profile: BotProfile;
  claudeContent: string | undefined;
  isLoading: boolean;
  skillCount: number;
  commandCount: number;
  recentSessions: { date: string; title: string | null; summary: string | null; path: string }[];
  skillList: { name: string; path: string; title: string; summary: string; subfolders: string[]; status: SkillStatus; lastRevised: string | null; updated: string | null; category: string | null; command: string | null; input: string | null; output: string | null; sources: string | null; writes: string | null; tools: string | null }[];
  skillCategories: { id: string; label: string }[];
  skillUsage: Record<string, { invocations: number; mentions: number }>;
  onSkillClick: (skill: { name: string; path: string; title: string }) => void;
  onSessionClick: (session: { path: string; date: string; title: string | null }) => void;
  onCommandsClick: () => void;
}) {
  const colors = DEPT_COLORS[bot.group] || DEPT_COLORS.personal;
  const initials = getBotInitials(bot.name);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(true);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const [skillSort, setSkillSort] = useState<"name" | "usage">("name");
  const [skillFilter, setSkillFilter] = useState<"all" | SkillStatus>("active");
  const [skillTab, setSkillTab] = useState<string>("all");
  const [skillSearch, setSkillSearch] = useState("");

  // Sort and filter skills
  const filteredSkills = useMemo(() => {
    let list = skillFilter === "all" ? skillList : skillList.filter((s) => s.status === skillFilter);
    if (skillTab !== "all") {
      list = list.filter((s) => s.category === skillTab);
    }
    if (skillSearch) {
      const q = skillSearch.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q));
    }
    if (skillSort === "usage") {
      list = [...list].sort((a, b) => {
        const aUse = (skillUsage[a.name]?.invocations || 0) + (skillUsage[a.name]?.mentions || 0);
        const bUse = (skillUsage[b.name]?.invocations || 0) + (skillUsage[b.name]?.mentions || 0);
        return bUse - aUse || a.title.localeCompare(b.title);
      });
    } else {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [skillList, skillUsage, skillSort, skillFilter, skillTab, skillSearch]);

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
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setSkillsExpanded(!skillsExpanded)}
                    className="text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    <ChevronRight size={12} className={cn("transition-transform", skillsExpanded && "rotate-90")} />
                    <Sparkles size={12} className="text-amber-500" />
                    Skills
                    <span className="text-[10px] font-normal tabular-nums ml-1">
                      {skillSearch
                        ? `${filteredSkills.length} result${filteredSkills.length !== 1 ? "s" : ""}`
                        : skillFilter === "all"
                          ? `${skillList.filter((s) => s.status === "active").length} active / ${skillList.length}`
                          : `${filteredSkills.length} ${skillFilter}`}
                    </span>
                  </button>
                  {skillsExpanded && (
                    <div className="flex items-center gap-1 ml-auto">
                      {/* Search */}
                      <div className="relative mr-1">
                        <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={skillSearch}
                          onChange={(e) => setSkillSearch(e.target.value)}
                          className="w-[100px] pl-5 pr-5 py-0.5 text-[10px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500/50 focus:w-[140px] transition-all"
                        />
                        {skillSearch && (
                          <button onClick={() => setSkillSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                            <X size={9} />
                          </button>
                        )}
                      </div>
                      {/* Filter pills */}
                      {(["all", "active", "inactive", "deprecated"] as const).map((f) => {
                        const count = f === "all" ? skillList.length : skillList.filter((s) => s.status === f).length;
                        if (f !== "all" && count === 0) return null;
                        return (
                          <button
                            key={f}
                            onClick={() => setSkillFilter(f)}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors",
                              skillFilter === f
                                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                            )}
                          >
                            {f === "all" ? "All" : SKILL_STATUS_CONFIG[f].label}
                          </button>
                        );
                      })}
                      {/* Sort toggle */}
                      <button
                        onClick={() => setSkillSort(skillSort === "name" ? "usage" : "name")}
                        className={cn(
                          "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ml-1",
                          "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        )}
                        title={`Sort by ${skillSort === "name" ? "usage" : "name"}`}
                      >
                        <ArrowUpDown size={9} />
                        {skillSort === "name" ? "A-Z" : "Usage"}
                      </button>
                    </div>
                  )}
                </div>
                {skillsExpanded && skillCategories.length > 0 && (
                  <div className="flex items-center gap-1 mb-3 border-b border-zinc-200 dark:border-zinc-800">
                    {[{ id: "all", label: "All" }, ...skillCategories].map((cat) => {
                      const count = cat.id === "all"
                        ? (skillFilter === "all" ? skillList : skillList.filter((s) => s.status === skillFilter)).length
                        : (skillFilter === "all" ? skillList : skillList.filter((s) => s.status === skillFilter)).filter((s) => s.category === cat.id).length;
                      if (cat.id !== "all" && count === 0) return null;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSkillTab(cat.id)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                            skillTab === cat.id
                              ? "border-amber-500 text-amber-600 dark:text-amber-400"
                              : "border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          )}
                        >
                          {cat.label}
                          <span className="ml-1 text-[10px] tabular-nums opacity-60">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {skillsExpanded && (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredSkills.map((skill) => {
                      const sc = SKILL_STATUS_CONFIG[skill.status];
                      const usage = skillUsage[skill.name];
                      const totalUses = (usage?.invocations || 0) + (usage?.mentions || 0);
                      return (
                        <button
                          key={skill.name}
                          onClick={() => onSkillClick({ name: skill.name, path: skill.path, title: skill.title })}
                          className={cn(
                            "text-left px-4 py-3 rounded-lg border bg-white dark:bg-zinc-900 hover:shadow-sm transition-all cursor-pointer group",
                            skill.status === "active"
                              ? "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                              : "border-slate-200/60 dark:border-zinc-800/60 opacity-60 hover:opacity-80"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={13} className="text-amber-500 flex-shrink-0" />
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors flex-1">
                              {skill.title}
                            </span>
                            {skill.command && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 font-mono flex-shrink-0">
                                {skill.command}
                              </span>
                            )}
                            {totalUses > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 tabular-nums flex-shrink-0">
                                {totalUses}x
                              </span>
                            )}
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", sc.dot)} title={sc.label} />
                          </div>
                          {skill.summary && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-1.5">{skill.summary}</p>
                          )}
                          {(skill.input || skill.output) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                              {skill.input && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-zinc-500 dark:text-zinc-400">
                                  <ArrowDownToLine size={8} className="text-blue-400" />
                                  {skill.input}
                                </span>
                              )}
                              {skill.output && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-zinc-500 dark:text-zinc-400">
                                  <ArrowUpFromLine size={8} className="text-green-400" />
                                  {skill.output}
                                </span>
                              )}
                            </div>
                          )}
                          {(skill.sources || skill.writes) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                              {skill.sources && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-zinc-400 dark:text-zinc-500">
                                  <FolderInput size={8} className="text-amber-400/70" />
                                  {skill.sources}
                                </span>
                              )}
                              {skill.writes && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-zinc-400 dark:text-zinc-500">
                                  <FolderOutput size={8} className="text-purple-400/70" />
                                  {skill.writes}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1">
                            {usage && (usage.invocations > 0 || usage.mentions > 0) && (
                              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
                                {usage.invocations > 0 ? `${usage.invocations} invoked` : ""}
                                {usage.invocations > 0 && usage.mentions > 0 ? " · " : ""}
                                {usage.mentions > 0 ? `${usage.mentions} mentioned` : ""}
                              </span>
                            )}
                            {(skill.updated || skill.lastRevised) && (
                              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 ml-auto">
                                updated {relativeDate(skill.updated || skill.lastRevised!)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Recent Sessions */}
            <section>
              <button
                onClick={() => setSessionsExpanded(!sessionsExpanded)}
                className="w-full text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <ChevronRight size={12} className={cn("transition-transform", sessionsExpanded && "rotate-90")} />
                <Clock size={12} className="text-blue-500" />
                Recent Sessions
                {recentSessions.length > 0 && (
                  <span className="text-[10px] font-normal tabular-nums ml-1">{recentSessions.length}</span>
                )}
              </button>
              {sessionsExpanded && (
                recentSessions.length === 0 ? (
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
                )
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
                  <pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed line-clamp-[12]">
                    {instructionsPreview}
                  </pre>
                  {claudeContent.length > 300 && (
                    <button
                      onClick={() => setShowInstructionsModal(true)}
                      className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline mt-2"
                    >
                      Show more
                    </button>
                  )}
                </div>
              </div>
            )}
            {showInstructionsModal && claudeContent && (
              <InstructionsModal
                content={claudeContent}
                title="CLAUDE.md"
                onClose={() => setShowInstructionsModal(false)}
              />
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

/** Full-screen modal for instructions content */
function InstructionsModal({
  content,
  title,
  onClose,
}: {
  content: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-purple-500 flex-shrink-0" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5">
            <MarkdownViewer content={content} filename={title} />
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
// Sessions timeline (full-width view)
// ============================
function SessionsTimeline({
  sessions,
  selectedPath,
  onSessionClick,
}: {
  sessions: { date: string; title: string | null; summary: string | null; path: string; owner?: string }[];
  selectedPath: string | null;
  onSessionClick: (s: { date: string; title: string | null; summary: string | null; path: string }) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="w-[280px] flex-shrink-0 h-full border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center justify-center text-zinc-400">
        <div className="text-center">
          <Clock size={24} className="mx-auto mb-2 opacity-20" />
          <p className="text-xs">No sessions yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex-shrink-0 h-full border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 overflow-y-auto">
      <div className="p-2 space-y-0.5">
        {sessions.map((s) => (
          <button
            key={s.path}
            onClick={() => onSessionClick(s)}
            className={cn(
              "w-full text-left px-2.5 py-2 rounded-md transition-colors",
              selectedPath === s.path
                ? "bg-teal-50 dark:bg-teal-950/30"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
            )}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{relativeDate(s.date)}</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">{s.date}</span>
              {s.owner && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 capitalize">{s.owner}</span>
              )}
            </div>
            {s.title && (
              <p className={cn(
                "text-xs font-medium truncate",
                selectedPath === s.path
                  ? "text-teal-700 dark:text-teal-300"
                  : "text-zinc-700 dark:text-zinc-300"
              )}>{s.title}</p>
            )}
            {s.summary && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 line-clamp-1 mt-0.5">{s.summary}</p>
            )}
          </button>
        ))}
      </div>
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
        "w-full text-left flex items-center gap-2 px-2.5 py-1 rounded-md transition-colors",
        isSelected
          ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
      )}
    >
      <div
        className={cn(
          "w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0",
          colors.badge,
          colors.text
        )}
      >
        {initials}
      </div>
      <span className="text-xs font-medium truncate">{formatBotName(bot.name)}</span>
      {bot.owner && (
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex-shrink-0">@{bot.owner}</span>
      )}
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
}: {
  bots: BotEntry[];
  grouped: [string, BotEntry[]][];
  selectedPath: string | null;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (path: string) => void;
}) {
  const filtered = search
    ? bots.filter((b) => {
        const q = search.toLowerCase();
        return formatBotName(b.name).toLowerCase().includes(q) || (b.owner && b.owner.toLowerCase().includes(q));
      })
    : null;

  return (
    <div className="w-[220px] flex-shrink-0 h-full border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex flex-col">
      {/* Search */}
      <div className="p-2.5 pb-1.5">
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
            className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
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

      {/* Bot list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filtered ? (
          filtered.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-4">
              No bots matching "{search}"
            </p>
          ) : (
            <div>
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
          <div className="space-y-2">
            {grouped.map(([group, groupBots]) => (
              <div key={group}>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-2.5 mb-0.5">
                  {GROUP_LABELS[group] || group}
                </p>
                <div>
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
  const teamPath = botsPath || undefined;

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"directory" | "sessions">("directory");
  const [detailView, setDetailView] = useState<DetailView>(null);
  const [sessionDetailView, setSessionDetailView] = useState<{ date: string; title: string | null; summary: string | null; path: string } | null>(null);
  const [skillModal, setSkillModal] = useState<{ skillName: string; skillPath: string; title: string } | null>(null);

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  const selectedBotName = selectedPath?.split("/").pop() ?? null;
  useEffect(() => {
    setViewContext(activeView, activeView === "directory" ? "Bot Directory" : "Recent Sessions");
    setViewDetail(selectedBotName ? `Bot: ${selectedBotName}` : null);
  }, [activeView, selectedBotName, setViewContext, setViewDetail]);

  // Load team directory
  const { data: teamEntries = [], isLoading: loadingTeam } = useListDirectory(teamPath);



  // Scan all member folders for personal bots
  const memberFolders = useMemo(
    () => teamEntries.filter((e) => e.is_directory && !e.name.startsWith("bot-") && !e.name.startsWith("_")),
    [teamEntries]
  );

  const memberQueries = useQueries({
    queries: memberFolders.map((folder) => ({
      queryKey: ["directory", folder.path],
      queryFn: () => invoke<FileEntry[]>("list_directory", { path: folder.path }),
    })),
  });

  // Build bot list
  const allBots = useMemo(() => {
    const teamBots: BotEntry[] = teamEntries
      .filter((e) => e.is_directory && e.name.startsWith("bot-"))
      .map((e) => ({ name: e.name, dirPath: e.path, group: getDeptGroup(e.name) }));

    // Collect personal bots from all member folders
    const allPersonalBots: BotEntry[] = [];
    memberFolders.forEach((folder, i) => {
      const entries = memberQueries[i]?.data || [];
      const bots = entries
        .filter((e) => e.is_directory && e.name.startsWith("bot-"))
        .map((e) => ({ name: e.name, dirPath: e.path, group: "personal", owner: folder.name }));
      allPersonalBots.push(...bots);
    });

    return [...allPersonalBots, ...teamBots].sort((a, b) => {
      const aOrder = GROUP_ORDER.indexOf(a.group);
      const bOrder = GROUP_ORDER.indexOf(b.group);
      if ((aOrder >= 0 ? aOrder : 999) !== (bOrder >= 0 ? bOrder : 999))
        return (aOrder >= 0 ? aOrder : 999) - (bOrder >= 0 ? bOrder : 999);
      return a.name.localeCompare(b.name);
    });
  }, [teamEntries, memberFolders, memberQueries]);

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

  // Read skill categories
  const categoriesPath = skillsDir ? `${skillsDir}/_categories.json` : undefined;
  const { data: categoriesRaw } = useReadFile(categoriesPath);
  const skillCategoriesData = useMemo(() => {
    if (!categoriesRaw) return { categories: [] as { id: string; label: string }[], skills: {} as Record<string, string> };
    try {
      const parsed = JSON.parse(categoriesRaw);
      return { categories: parsed.categories || [], skills: parsed.skills || {} };
    } catch {
      return { categories: [] as { id: string; label: string }[], skills: {} as Record<string, string> };
    }
  }, [categoriesRaw]);

  const skillList = useMemo(() => {
    return skillFolders.map((f, i) => {
      const content = skillContentQueries[i]?.data;
      const subfolders = skillSubfolderQueries[i]?.data || [];
      const titleMatch = content?.match(/^#\s+(.+)$/m);
      const summaryMatch = content?.match(/^summary:\s*"?([^"\n]+)"?/m) || content?.match(/^>\s*(.+)$/m);
      const meta = parseSkillFrontmatter(content);
      return {
        name: f.name,
        path: f.path,
        title: titleMatch?.[1] || f.name,
        summary: summaryMatch?.[1]?.trim() || "",
        subfolders: subfolders.filter((s) => s.is_directory && !s.name.startsWith(".")).map((s) => s.name),
        status: meta.status,
        lastRevised: meta.lastRevised,
        updated: meta.updated,
        category: skillCategoriesData.skills[f.name] || null,
        command: meta.command,
        input: meta.input,
        output: meta.output,
        sources: meta.sources,
        writes: meta.writes,
        tools: meta.tools,
      };
    });
  }, [skillFolders, skillContentQueries, skillSubfolderQueries, skillCategoriesData]);

  // ── Skill Usage Tracking ──
  // Option A: Read JSONL log files from .claude/skill-usage/
  const tvKnowledgeRoot = botsPath ? botsPath.replace(/\/_team\/?$/, "") : null;
  const skillUsageDir = tvKnowledgeRoot ? `${tvKnowledgeRoot}/.claude/skill-usage` : undefined;
  const { data: usageLogFiles = [] } = useListDirectory(skillUsageDir);
  const jsonlFiles = usageLogFiles.filter((f) => f.name.endsWith(".jsonl"));

  const usageLogQueries = useQueries({
    queries: jsonlFiles.map((f) => ({
      queryKey: ["file", f.path],
      queryFn: () => invoke<string>("read_file", { path: f.path }),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Sessions — scoped to the selected bot's owner
  const sessionsPath = useMemo(() => {
    if (!selectedBot) return null;
    if (selectedBot.owner && teamPath) {
      return `${teamPath}/${selectedBot.owner}/sessions`;
    }
    return `${selectedBot.dirPath}/sessions`;
  }, [selectedBot, teamPath]);
  const { data: sessionFiles = [] } = useFolderFiles(sessionsPath, 100);

  const botSessions = useMemo(() => {
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

  // Option B: Scan recent session notes for /skill-name mentions
  const sessionNoteQueries = useQueries({
    queries: botSessions.slice(0, 20).map((s) => ({
      queryKey: ["file", s.path],
      queryFn: () => invoke<string>("read_file", { path: s.path }),
      staleTime: 10 * 60 * 1000,
    })),
  });

  // Aggregate usage counts from both sources
  const skillUsage = useMemo(() => {
    const result: Record<string, { invocations: number; mentions: number }> = {};

    // Option A: Count from JSONL logs
    usageLogQueries.forEach((q) => {
      if (!q.data) return;
      for (const line of q.data.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.skill) {
            if (!result[entry.skill]) result[entry.skill] = { invocations: 0, mentions: 0 };
            result[entry.skill].invocations++;
          }
        } catch { /* skip malformed lines */ }
      }
    });

    // Option B: Count /skill-name mentions in session notes
    const skillNames = skillList.map((s) => s.name);
    sessionNoteQueries.forEach((q) => {
      if (!q.data) return;
      for (const name of skillNames) {
        const regex = new RegExp(`\\/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        const matches = q.data.match(regex);
        if (matches) {
          if (!result[name]) result[name] = { invocations: 0, mentions: 0 };
          result[name].mentions += matches.length;
        }
      }
    });

    return result;
  }, [usageLogQueries, sessionNoteQueries, skillList]);

  // All sessions — aggregated across all member + team bot session folders (for Sessions tab)
  const allSessionSources = useMemo(() => {
    if (!teamPath) return [];
    const sources: { path: string; owner: string }[] = [];
    for (const folder of memberFolders) {
      sources.push({ path: `${folder.path}/sessions`, owner: folder.name });
    }
    for (const entry of teamEntries) {
      if (entry.is_directory && entry.name.startsWith("bot-")) {
        sources.push({ path: `${entry.path}/sessions`, owner: formatBotName(entry.name) });
      }
    }
    return sources;
  }, [teamPath, memberFolders, teamEntries]);

  const allSessionQueries = useQueries({
    queries: allSessionSources.map((src) => ({
      queryKey: ["folder-files", src.path, 100],
      queryFn: () => invoke<FolderFile[]>("get_folder_files", { path: src.path, limit: 100 }).catch(() => [] as FolderFile[]),
    })),
  });

  const allSessions = useMemo(() => {
    const all: { date: string; title: string | null; summary: string | null; path: string; owner?: string }[] = [];
    allSessionSources.forEach((src, i) => {
      const q = allSessionQueries[i];
      if (!q?.data) return;
      for (const f of q.data) {
        if (f.name !== "notes.md") continue;
        const date = extractDateFromPath(f.path);
        if (date) all.push({ date, title: f.title, summary: f.summary, path: f.path, owner: src.owner });
      }
    });
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }, [allSessionSources, allSessionQueries]);

  // Navigation
  const handleSelectBot = (path: string) => {
    setSelectedPath(path);
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
    if (detailView.type === "session") {
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
          recentSessions={botSessions.slice(0, 5)}
          skillList={skillList}
          skillCategories={skillCategoriesData.categories}
          skillUsage={skillUsage}
          onSkillClick={(skill) => setSkillModal({ skillName: skill.name, skillPath: skill.path, title: skill.title })}
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
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab label="Directory" icon={Users} active={activeView === "directory"} onClick={() => { setActiveView("directory"); }} />
        <ViewTab label="Sessions" icon={Clock} active={activeView === "sessions"} onClick={() => { setActiveView("sessions"); setSelectedPath(null); setDetailView(null); setSessionDetailView(null); }} />
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeView === "directory" ? (
          <>
            <BotSidebar
              bots={allBots}
              grouped={grouped}
              selectedPath={selectedPath}
              search={search}
              onSearch={setSearch}
              onSelect={handleSelectBot}
            />
            <div className="flex-1 min-w-0">{content}</div>
          </>
        ) : (
          <>
            <SessionsTimeline
              sessions={allSessions}
              selectedPath={sessionDetailView?.path ?? null}
              onSessionClick={(s) => setSessionDetailView(s)}
            />
            {sessionDetailView ? (
              <div className="flex-1 min-w-0">
                <SessionDetail
                  sessionPath={sessionDetailView.path}
                  date={sessionDetailView.date}
                  title={sessionDetailView.title}
                  onBack={() => setSessionDetailView(null)}
                />
              </div>
            ) : (
              <div className="flex-1 min-w-0 flex items-center justify-center text-zinc-400">
                <div className="text-center">
                  <Clock size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Select a session to view</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Skill modal overlay */}
      {skillModal && (
        <SkillModal
          skillPath={skillModal.skillPath}
          skillName={skillModal.skillName}
          title={skillModal.title}
          usage={skillUsage[skillModal.skillName]}
          onClose={() => setSkillModal(null)}
        />
      )}
    </div>
  );
}
