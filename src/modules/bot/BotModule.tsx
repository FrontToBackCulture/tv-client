// src/modules/bot/BotModule.tsx
// Bot management module — inspect bot CLAUDE.md files + session timeline

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Bot,
  Loader2,
  FileText,
  User,
  Clock,
  ChevronLeft,
  Calendar,
  Tag,
  Shield,
  Plus,
  X,
  FolderOpen,
  Terminal as TerminalIcon,
  Zap,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useQueries } from "@tanstack/react-query";
import { useListDirectory, useReadFile, useWriteFile } from "../../hooks/useFiles";
import { open } from "@tauri-apps/plugin-dialog";
import { useFolderFiles, FolderFile } from "../../hooks/useFolderFiles";
import { useBotSettingsStore } from "../../stores/botSettingsStore";
import { useAuth } from "../../stores/authStore";
import { MarkdownEditor } from "../library/MarkdownEditor";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { cn } from "../../lib/cn";

interface BotEntry {
  name: string;
  dirPath: string;
  group: string;
}

// Format bot directory name for display: "bot-eng-analyst" → "Eng Analyst"
function formatBotName(dirName: string): string {
  return dirName
    .replace(/^bot-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Group prefix from bot name
function getDeptGroup(dirName: string): string {
  const withoutPrefix = dirName.replace(/^bot-/, "");
  const dash = withoutPrefix.indexOf("-");
  return dash > 0 ? withoutPrefix.substring(0, dash) : withoutPrefix;
}

// Extract date from session file path: .../sessions/2026-01-26/notes.md → "2026-01-26"
function extractDateFromPath(filePath: string): string | null {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// Session types: daily notes vs weekly/monthly summaries
type SessionType = "daily" | "weekly" | "monthly";

// Month abbreviation to number for summary filename parsing
const MONTH_ABBR: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

// Extract date from summary filename
// Weekly: "2026-W02-Jan-06-12.md" → "2026-01-06"
// Monthly: "2026-01-monthly.md" → "2026-01-01"
function extractSummaryDate(filePath: string): string | null {
  const name = filePath.split("/").pop()?.replace(".md", "") || "";
  const weeklyMatch = name.match(/^(\d{4})-W\d{2}-([A-Z][a-z]{2})-(\d{2})/);
  if (weeklyMatch) {
    const mm = MONTH_ABBR[weeklyMatch[2]];
    if (mm) return `${weeklyMatch[1]}-${mm}-${weeklyMatch[3]}`;
  }
  const monthlyMatch = name.match(/^(\d{4}-\d{2})-monthly/);
  if (monthlyMatch) return `${monthlyMatch[1]}-01`;
  return null;
}

// Detect session type from file path
function detectSessionType(filePath: string): SessionType {
  if (!filePath.includes("/summaries/")) return "daily";
  const name = filePath.split("/").pop() || "";
  if (name.includes("monthly")) return "monthly";
  return "weekly";
}

// Format date for display: "2026-01-26" → "Jan 26, 2026"
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Relative date label: "Today", "Yesterday", "3 days ago", or the formatted date
function relativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr + "T00:00:00");
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(dateStr);
}

// Parse "## Bot: bot-name - Topic" headings from markdown content
// Handles both directory names (bot-sales-exec) and display names (Sales Creative)
function parseBotSections(
  content: string
): { bot: string; topic: string }[] {
  const matches = content.matchAll(/^## Bot:\s*(.+?)(?:\s*[-–—]\s*(.+))?$/gm);
  return Array.from(matches).map((m) => ({
    bot: m[1].trim(),
    topic: (m[2] || "").trim(),
  }));
}

// Normalize a bot name to slug form: "Sales Creative" → "bot-sales-creative"
function toBotSlug(name: string): string {
  let slug = name.toLowerCase().trim().replace(/\s+/g, "-");
  if (!slug.startsWith("bot-")) slug = `bot-${slug}`;
  return slug;
}

// Alias map for historical session bot names → current bot directory names
// Old sessions used display names that can't be fuzzy-matched to current bots
const BOT_ALIASES: Record<string, string> = {
  "morning sod": "bot-ops-sre",
  "fuel sme": "bot-eng-analyst",
  "deal desk": "bot-sales-exec",
  "platform health manager": "bot-ops-sre",
  "sales creative": "bot-corp-designer",
  "bot-sales-creative": "bot-corp-designer",
  "bot-tools-developer": "bot-eng-developer",
};

// Find the best matching current bot for a session bot name
function findBestMatchBot(
  sessionBotName: string,
  currentBots: BotEntry[]
): BotEntry | null {
  if (currentBots.length === 0) return null;

  // 0. Check alias map for historical display names
  const aliasTarget = BOT_ALIASES[sessionBotName.toLowerCase().trim()];
  if (aliasTarget) {
    const aliased = currentBots.find((b) => b.name === aliasTarget);
    if (aliased) return aliased;
  }

  const slug = toBotSlug(sessionBotName);

  // 1. Exact match on directory name
  const exact = currentBots.find((b) => b.name === slug);
  if (exact) return exact;

  // 2. Exact match on directory name without bot- prefix
  const exact2 = currentBots.find((b) => b.name === sessionBotName.toLowerCase().trim());
  if (exact2) return exact2;

  // 3. Department prefix match (first segment after bot-)
  const slugParts = slug.replace(/^bot-/, "").split("-");
  const dept = slugParts[0];
  const deptMatches = currentBots.filter((b) => getDeptGroup(b.name) === dept);
  if (deptMatches.length === 1) return deptMatches[0];

  // 4. If multiple dept matches, score by shared keywords
  if (deptMatches.length > 1) {
    const keywords = new Set(slugParts);
    let best = deptMatches[0];
    let bestScore = 0;
    for (const bot of deptMatches) {
      const botParts = bot.name.replace(/^bot-/, "").split("-");
      const score = botParts.filter((p) => keywords.has(p)).length;
      if (score > bestScore) {
        bestScore = score;
        best = bot;
      }
    }
    return best;
  }

  // 5. Keyword match across all bots
  const keywords = new Set(slugParts);
  let best: BotEntry | null = null;
  let bestScore = 0;
  for (const bot of currentBots) {
    const botParts = bot.name.replace(/^bot-/, "").split("-");
    const score = botParts.filter((p) => keywords.has(p)).length;
    if (score > bestScore) {
      bestScore = score;
      best = bot;
    }
  }
  if (best && bestScore > 0) return best;

  return null;
}

// Parse tags from YAML frontmatter
function parseFrontmatterTags(content: string): string[] {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  const tagsMatch = fmMatch[1].match(
    /^tags:\s*\[([^\]]*)\]/m
  );
  if (!tagsMatch) return [];
  return tagsMatch[1]
    .split(",")
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

interface SessionEntry {
  file: FolderFile;
  date: string;
  type: SessionType;
}

const groupLabels: Record<string, string> = {
  personal: "Personal",
  eng: "Engineering",
  corp: "Corporate",
  ops: "Operations",
  sales: "Sales",
  cusops: "Customer Ops",
  acct: "Accounting",
};

const groupOrder = [
  "personal",
  "eng",
  "corp",
  "ops",
  "sales",
  "cusops",
  "acct",
];

type MainView = "config" | "sessions" | "permissions" | "commands";

interface BotPermissions {
  additionalDirectories: string[];
  allow: string[];
  deny: string[];
}

// Preserve the full settings.json so we don't lose unknown keys on save
interface SettingsJson {
  permissions?: {
    additionalDirectories?: string[];
    allow?: string[];
    deny?: string[];
  };
  [key: string]: unknown;
}

const EMPTY_PERMISSIONS: BotPermissions = { additionalDirectories: [], allow: [], deny: [] };

function parsePermissions(raw: string | undefined): BotPermissions {
  if (!raw) return EMPTY_PERMISSIONS;
  try {
    const parsed: SettingsJson = JSON.parse(raw);
    const perms = parsed.permissions || {};
    return {
      additionalDirectories: Array.isArray(perms.additionalDirectories) ? perms.additionalDirectories : [],
      allow: Array.isArray(perms.allow) ? perms.allow : [],
      deny: Array.isArray(perms.deny) ? perms.deny : [],
    };
  } catch {
    return EMPTY_PERMISSIONS;
  }
}

// Parse the raw settings JSON to preserve unknown keys on save
function parseSettingsJson(raw: string | undefined): SettingsJson {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── Permissions Editor (simplified UI) ──────────────

// Extract command from "Bash(npm run *)" → "npm run *"
function extractCommand(entry: string): string | null {
  const m = entry.match(/^Bash\((.+)\)$/);
  return m ? m[1] : null;
}

// Check if an allow entry is a bare tool name (not a pattern)
function isBareTool(entry: string): boolean {
  return /^[A-Z][a-zA-Z]*$/.test(entry);
}

// Get command strings from permission entries (only Bash(...) patterns)
function getCommands(entries: string[]): string[] {
  return entries
    .map(extractCommand)
    .filter((c): c is string => c !== null);
}

// Get bare tool names from entries
function getToolNames(entries: string[]): string[] {
  return entries.filter(isBareTool);
}

// Get entries that are neither bare tools nor Bash() commands (MCP tools, WebFetch, Skill, etc.)
function getOtherEntries(entries: string[]): string[] {
  return entries.filter((e) => !isBareTool(e) && !extractCommand(e));
}

// Tool presets — bare tool names that Claude Code recognizes
const TOOL_PRESETS = [
  { label: "Bash", value: "Bash", desc: "Run shell commands" },
  { label: "Read", value: "Read", desc: "Read files" },
  { label: "Edit", value: "Edit", desc: "Edit files" },
  { label: "Write", value: "Write", desc: "Create files" },
  { label: "Glob", value: "Glob", desc: "Find files by pattern" },
  { label: "Grep", value: "Grep", desc: "Search file contents" },
  { label: "Task", value: "Task", desc: "Run sub-agents" },
];

// Common command presets
const COMMAND_PRESETS = [
  { label: "npm run", value: "npm run *" },
  { label: "npm test", value: "npm test*" },
  { label: "npx tsc", value: "npx tsc*" },
  { label: "cargo check", value: "cargo check" },
  { label: "cargo test", value: "cargo test*" },
  { label: "git status", value: "git status" },
  { label: "git diff", value: "git diff*" },
  { label: "git log", value: "git log*" },
  { label: "git add", value: "git add*" },
  { label: "git commit", value: "git commit*" },
];

const BLOCK_PRESETS = [
  { label: "rm -rf", value: "rm -rf *" },
  { label: "git push", value: "git push*" },
  { label: "git push --force", value: "git push --force*" },
  { label: "git reset --hard", value: "git reset --hard*" },
];

interface PermissionsEditorProps {
  permissions: BotPermissions;
  inherited: BotPermissions;
  onSave: (updated: BotPermissions) => void;
  botName: string;
}

function PermissionsEditor({
  permissions,
  inherited,
  onSave,
  botName,
}: PermissionsEditorProps) {
  const [cmdInput, setCmdInput] = useState("");
  const [blockInput, setBlockInput] = useState("");

  // Inherited (read-only, from team settings)
  const inheritedFolders = inherited.additionalDirectories;
  const inheritedTools = useMemo(() => getToolNames(inherited.allow), [inherited.allow]);
  const inheritedCommands = useMemo(() => getCommands(inherited.allow), [inherited.allow]);

  // Bot-specific (editable)
  const folders = permissions.additionalDirectories;
  const tools = useMemo(() => getToolNames(permissions.allow), [permissions.allow]);
  const commands = useMemo(() => getCommands(permissions.allow), [permissions.allow]);

  // "Other" entries — split by inherited vs bot
  const otherAllowedInherited = useMemo(() => getOtherEntries(inherited.allow), [inherited.allow]);
  const otherAllowedBot = useMemo(() => getOtherEntries(permissions.allow), [permissions.allow]);
  const otherDeniedInherited = useMemo(() => getOtherEntries(inherited.deny), [inherited.deny]);
  const otherDeniedBot = useMemo(() => getOtherEntries(permissions.deny), [permissions.deny]);
  const blockedCommands = useMemo(() => getCommands(permissions.deny), [permissions.deny]);
  const inheritedBlockedCommands = useMemo(() => getCommands(inherited.deny), [inherited.deny]);

  // Add a folder to additionalDirectories
  const handleAddFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select folder to give this bot access to",
      });
      if (selected && typeof selected === "string") {
        const path = selected.replace(/\/+$/, "");
        if (folders.includes(path)) return;
        onSave({
          ...permissions,
          additionalDirectories: [...folders, path],
        });
      }
    } catch (e) {
      console.error("Folder picker error:", e);
    }
  }, [folders, permissions, onSave]);

  // Remove a folder from additionalDirectories
  const removeFolder = useCallback(
    (folderPath: string) => {
      onSave({
        ...permissions,
        additionalDirectories: folders.filter((f) => f !== folderPath),
      });
    },
    [folders, permissions, onSave]
  );

  // Toggle a bare tool name
  const toggleTool = useCallback(
    (tool: string) => {
      if (tools.includes(tool)) {
        onSave({
          ...permissions,
          allow: permissions.allow.filter((e) => e !== tool),
        });
      } else {
        onSave({
          ...permissions,
          allow: [...permissions.allow, tool],
        });
      }
    },
    [tools, permissions, onSave]
  );

  // Add an allowed command
  const addCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || commands.includes(trimmed)) return;
      onSave({
        ...permissions,
        allow: [...permissions.allow, `Bash(${trimmed})`],
      });
    },
    [commands, permissions, onSave]
  );

  // Remove an allowed command
  const removeCommand = useCallback(
    (cmd: string) => {
      onSave({
        ...permissions,
        allow: permissions.allow.filter((e) => extractCommand(e) !== cmd),
      });
    },
    [permissions, onSave]
  );

  // Add a blocked command
  const addBlock = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || blockedCommands.includes(trimmed)) return;
      onSave({
        ...permissions,
        deny: [...permissions.deny, `Bash(${trimmed})`],
      });
    },
    [blockedCommands, permissions, onSave]
  );

  // Remove a blocked command
  const removeBlock = useCallback(
    (cmd: string) => {
      onSave({
        ...permissions,
        deny: permissions.deny.filter((e) => extractCommand(e) !== cmd),
      });
    },
    [permissions, onSave]
  );

  // Check if a preset is already enabled
  const isPresetOn = useCallback(
    (cmd: string) => commands.includes(cmd),
    [commands]
  );
  const isBlockOn = useCallback(
    (cmd: string) => blockedCommands.includes(cmd),
    [blockedCommands]
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {botName}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Choose what this bot can do without asking you each time
          </p>
        </div>

        {/* ── Folders ────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <FolderOpen size={15} className="text-blue-500" />
                Folder Access
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Folders this bot can read and edit files in
              </p>
            </div>
            <button
              onClick={handleAddFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
            >
              <Plus size={14} />
              Add Folder
            </button>
          </div>

          {folders.length === 0 && inheritedFolders.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-lg py-6 text-center">
              <FolderOpen size={24} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm text-zinc-400">No folders added yet</p>
              <p className="text-xs text-zinc-400 mt-1">
                Click "Add Folder" to let this bot access a directory
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Inherited folders (greyed, non-editable) */}
              {inheritedFolders.map((f) => (
                <div
                  key={`inherited-${f}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/60 opacity-60"
                >
                  <FolderOpen size={14} className="text-zinc-400 flex-shrink-0" />
                  <span className="text-sm text-zinc-400 dark:text-zinc-500 font-mono truncate flex-1" title={f}>
                    {f}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-600 flex-shrink-0">
                    Inherited
                  </span>
                </div>
              ))}
              {/* Bot-specific folders (editable) */}
              {folders.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 group"
                >
                  <FolderOpen size={14} className="text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 font-mono truncate flex-1" title={f}>
                    {f}
                  </span>
                  <button
                    onClick={() => removeFolder(f)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-all"
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Tool Access ────────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-1">
            <Shield size={15} className="text-purple-500" />
            Tool Access
          </h3>
          <p className="text-xs text-zinc-400 mb-3">
            Tools this bot can use without asking each time
          </p>

          <div className="flex flex-wrap gap-1.5">
            {TOOL_PRESETS.map((t) => {
              const isInherited = inheritedTools.includes(t.value);
              const isBotLevel = tools.includes(t.value);
              const on = isInherited || isBotLevel;
              return (
                <button
                  key={t.value}
                  onClick={() => !isInherited && toggleTool(t.value)}
                  disabled={isInherited}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-lg border transition-colors",
                    isInherited
                      ? "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/50 text-zinc-400 dark:text-zinc-500 cursor-not-allowed opacity-60"
                      : on
                        ? "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-400"
                        : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-purple-300 dark:hover:border-purple-700"
                  )}
                  title={isInherited ? `${t.desc} (inherited from team)` : t.desc}
                >
                  {on ? "✓ " : ""}{t.label}
                  {isInherited && <span className="ml-1 text-[9px] opacity-75">inherited</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Allowed Commands ────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-1">
            <TerminalIcon size={15} className="text-green-500" />
            Allowed Commands
          </h3>
          <p className="text-xs text-zinc-400 mb-3">
            Commands this bot can run without asking. Use * as a wildcard.
          </p>

          {/* Preset toggles */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {COMMAND_PRESETS.map((p) => {
              const isInherited = inheritedCommands.includes(p.value);
              const on = isPresetOn(p.value) || isInherited;
              return (
                <button
                  key={p.value}
                  onClick={() => !isInherited && (isPresetOn(p.value) ? removeCommand(p.value) : addCommand(p.value))}
                  disabled={isInherited}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full border transition-colors",
                    isInherited
                      ? "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/50 text-zinc-400 dark:text-zinc-500 cursor-not-allowed opacity-60"
                      : on
                        ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800 text-green-700 dark:text-green-400"
                        : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-green-300 dark:hover:border-green-700"
                  )}
                  title={isInherited ? "Inherited from team" : undefined}
                >
                  {on ? "✓ " : ""}{p.label}
                </button>
              );
            })}
          </div>

          {/* Custom command input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && cmdInput.trim()) {
                  addCommand(cmdInput);
                  setCmdInput("");
                }
              }}
              placeholder="Type a custom command, e.g. python script.py"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
            <button
              onClick={() => {
                if (cmdInput.trim()) {
                  addCommand(cmdInput);
                  setCmdInput("");
                }
              }}
              disabled={!cmdInput.trim()}
              className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-30 transition-colors"
            >
              Add
            </button>
          </div>

          {/* Custom (non-preset) commands list — inherited first, then bot-specific */}
          {(() => {
            const inheritedCustom = inheritedCommands.filter((c) => !COMMAND_PRESETS.some((p) => p.value === c));
            const botCustom = commands.filter((c) => !COMMAND_PRESETS.some((p) => p.value === c));
            if (inheritedCustom.length === 0 && botCustom.length === 0) return null;
            return (
              <div className="mt-3 space-y-1">
                {inheritedCustom.map((cmd) => (
                  <div
                    key={`inherited-${cmd}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/60 opacity-60"
                  >
                    <TerminalIcon size={12} className="text-zinc-400 flex-shrink-0" />
                    <code className="text-sm text-zinc-400 dark:text-zinc-500 flex-1 truncate" title={cmd}>
                      {cmd}
                    </code>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 flex-shrink-0">
                      Inherited
                    </span>
                  </div>
                ))}
                {botCustom.map((cmd) => (
                  <div
                    key={cmd}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 group"
                  >
                    <TerminalIcon size={12} className="text-green-500 flex-shrink-0" />
                    <code className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate" title={cmd}>
                      {cmd}
                    </code>
                    <button
                      onClick={() => removeCommand(cmd)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-all"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </section>

        {/* ── Blocked Commands ────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-1">
            <Shield size={15} className="text-red-500" />
            Blocked Commands
          </h3>
          <p className="text-xs text-zinc-400 mb-3">
            Commands this bot should never run
          </p>

          {/* Block preset toggles */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {BLOCK_PRESETS.map((p) => {
              const isInherited = inheritedBlockedCommands.includes(p.value);
              const on = isBlockOn(p.value) || isInherited;
              return (
                <button
                  key={p.value}
                  onClick={() => !isInherited && (isBlockOn(p.value) ? removeBlock(p.value) : addBlock(p.value))}
                  disabled={isInherited}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full border transition-colors",
                    isInherited
                      ? "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/50 text-zinc-400 dark:text-zinc-500 cursor-not-allowed opacity-60"
                      : on
                        ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400"
                        : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-red-300 dark:hover:border-red-700"
                  )}
                  title={isInherited ? "Inherited from team" : undefined}
                >
                  {on ? "✓ " : ""}{p.label}
                </button>
              );
            })}
          </div>

          {/* Custom block input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={blockInput}
              onChange={(e) => setBlockInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && blockInput.trim()) {
                  addBlock(blockInput);
                  setBlockInput("");
                }
              }}
              placeholder="Type a command to block"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
            <button
              onClick={() => {
                if (blockInput.trim()) {
                  addBlock(blockInput);
                  setBlockInput("");
                }
              }}
              disabled={!blockInput.trim()}
              className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-30 transition-colors"
            >
              Block
            </button>
          </div>

          {/* Custom (non-preset) blocked commands — inherited first, then bot-specific */}
          {(() => {
            const inheritedCustom = inheritedBlockedCommands.filter((c) => !BLOCK_PRESETS.some((p) => p.value === c));
            const botCustom = blockedCommands.filter((c) => !BLOCK_PRESETS.some((p) => p.value === c));
            if (inheritedCustom.length === 0 && botCustom.length === 0) return null;
            return (
              <div className="mt-3 space-y-1">
                {inheritedCustom.map((cmd) => (
                  <div
                    key={`inherited-${cmd}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/60 opacity-60"
                  >
                    <Shield size={12} className="text-zinc-400 flex-shrink-0" />
                    <code className="text-sm text-zinc-400 dark:text-zinc-500 flex-1 truncate" title={cmd}>
                      {cmd}
                    </code>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 flex-shrink-0">
                      Inherited
                    </span>
                  </div>
                ))}
                {botCustom.map((cmd) => (
                  <div
                    key={cmd}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 group"
                  >
                    <Shield size={12} className="text-red-500 flex-shrink-0" />
                    <code className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate" title={cmd}>
                      {cmd}
                    </code>
                    <button
                      onClick={() => removeBlock(cmd)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-all"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </section>

        {/* ── Other Permissions (MCP tools, WebFetch, Skill, etc.) ── */}
        {(otherAllowedInherited.length > 0 || otherAllowedBot.length > 0 || otherDeniedInherited.length > 0 || otherDeniedBot.length > 0) && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-1">
              <Shield size={15} className="text-zinc-500" />
              Other Permissions
            </h3>
            <p className="text-xs text-zinc-400 mb-3">
              MCP tools, web access, skills, and other configured permissions
            </p>

            <div className="space-y-1">
              {/* Inherited allowed */}
              {otherAllowedInherited.map((entry) => (
                <div
                  key={`inherited-allow-${entry}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/60 opacity-60"
                >
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
                    allow
                  </span>
                  <code className="text-xs text-zinc-400 dark:text-zinc-500 truncate flex-1" title={entry}>
                    {entry}
                  </code>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-600 flex-shrink-0">
                    Inherited
                  </span>
                </div>
              ))}
              {/* Bot-specific allowed */}
              {otherAllowedBot.map((entry) => (
                <div
                  key={`bot-allow-${entry}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
                >
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                    allow
                  </span>
                  <code className="text-xs text-zinc-600 dark:text-zinc-400 truncate flex-1" title={entry}>
                    {entry}
                  </code>
                </div>
              ))}
              {/* Inherited denied */}
              {otherDeniedInherited.map((entry) => (
                <div
                  key={`inherited-deny-${entry}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/60 opacity-60"
                >
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
                    deny
                  </span>
                  <code className="text-xs text-zinc-400 dark:text-zinc-500 truncate flex-1" title={entry}>
                    {entry}
                  </code>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-600 flex-shrink-0">
                    Inherited
                  </span>
                </div>
              ))}
              {/* Bot-specific denied */}
              {otherDeniedBot.map((entry) => (
                <div
                  key={`bot-deny-${entry}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
                >
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                    deny
                  </span>
                  <code className="text-xs text-zinc-600 dark:text-zinc-400 truncate flex-1" title={entry}>
                    {entry}
                  </code>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export function BotModule() {
  const botsPath = useBotSettingsStore((s) => s.botsPath);
  const user = useAuth((s) => s.user);
  const teamPath = botsPath || undefined;

  const { data: teamEntries = [], isLoading: loadingTeam } =
    useListDirectory(teamPath);

  // Detect user's personal folder via GitHub auth or sessionsPath
  const storedSessionsPath = useBotSettingsStore((s) => s.sessionsPath);

  const personalFolderPath = useMemo(() => {
    // 1. Try deriving from sessionsPath (e.g. _team/melvin/sessions → _team/melvin)
    if (storedSessionsPath) {
      const normalized = storedSessionsPath.replace(/\/+$/, "");
      if (normalized.endsWith("/sessions")) {
        return normalized.slice(0, -"/sessions".length);
      }
      // sessionsPath might be the personal folder itself
      const lastSegment = normalized.split("/").pop() || "";
      if (!lastSegment.startsWith("bot-") && lastSegment !== "sessions") {
        return normalized;
      }
    }

    // 2. Try matching GitHub user login/name against team folders
    if (user) {
      const candidates = [
        user.login?.toLowerCase(),
        user.name?.split(" ")[0]?.toLowerCase(),
      ].filter(Boolean) as string[];

      const memberFolders = teamEntries.filter(
        (e) =>
          e.is_directory &&
          !e.name.startsWith("bot-") &&
          !e.name.startsWith("_")
      );
      const match = memberFolders.find((f) =>
        candidates.includes(f.name.toLowerCase())
      );
      if (match) return match.path;
    }

    return null;
  }, [teamEntries, user, storedSessionsPath]);

  // Personal bots
  const { data: personalEntries = [] } = useListDirectory(
    personalFolderPath || undefined
  );

  // All bots (team + personal)
  const allBots = useMemo(() => {
    const teamBots: BotEntry[] = teamEntries
      .filter((e) => e.is_directory && e.name.startsWith("bot-"))
      .map((e) => ({
        name: e.name,
        dirPath: e.path,
        group: getDeptGroup(e.name),
      }));
    const myBots: BotEntry[] = personalEntries
      .filter((e) => e.is_directory && e.name.startsWith("bot-"))
      .map((e) => ({
        name: e.name,
        dirPath: e.path,
        group: "personal",
      }));
    return [...myBots, ...teamBots].sort((a, b) => {
      const aOrder = groupOrder.indexOf(a.group);
      const bOrder = groupOrder.indexOf(b.group);
      if ((aOrder >= 0 ? aOrder : 999) !== (bOrder >= 0 ? bOrder : 999))
        return (aOrder >= 0 ? aOrder : 999) - (bOrder >= 0 ? bOrder : 999);
      return a.name.localeCompare(b.name);
    });
  }, [teamEntries, personalEntries]);

  // Group bots for sidebar
  const grouped = useMemo(() => {
    const groups: Record<string, BotEntry[]> = {};
    for (const bot of allBots) {
      if (!groups[bot.group]) groups[bot.group] = [];
      groups[bot.group].push(bot);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = groupOrder.indexOf(a);
      const bi = groupOrder.indexOf(b);
      return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
    });
  }, [allBots]);

  // Bot selection
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedBot = allBots.find((b) => b.dirPath === selectedPath);

  // CLAUDE.md for selected bot
  const claudeMdPath = selectedPath ? `${selectedPath}/CLAUDE.md` : undefined;
  const { data: claudeContent, isLoading: loadingFile } =
    useReadFile(claudeMdPath);

  // Auto-save state for CLAUDE.md editing
  const [claudeSaveStatus, setClaudeSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const claudeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const claudeLastSavedRef = useRef<string>("");

  // Reset save state when selected bot changes
  useEffect(() => {
    setClaudeSaveStatus("saved");
    claudeLastSavedRef.current = claudeContent || "";
    if (claudeSaveTimeoutRef.current) {
      clearTimeout(claudeSaveTimeoutRef.current);
    }
  }, [claudeMdPath, claudeContent]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (claudeSaveTimeoutRef.current) {
        clearTimeout(claudeSaveTimeoutRef.current);
      }
    };
  }, []);

  const saveClaudeContent = useCallback(async (contentToSave: string) => {
    if (!claudeMdPath || contentToSave === claudeLastSavedRef.current) return;
    setClaudeSaveStatus("saving");
    try {
      await invoke("write_file", { path: claudeMdPath, content: contentToSave });
      claudeLastSavedRef.current = contentToSave;
      setClaudeSaveStatus("saved");
    } catch {
      setClaudeSaveStatus("unsaved");
    }
  }, [claudeMdPath]);

  const handleClaudeContentChange = useCallback((newContent: string) => {
    if (claudeSaveTimeoutRef.current) {
      clearTimeout(claudeSaveTimeoutRef.current);
    }
    if (newContent !== claudeLastSavedRef.current) {
      setClaudeSaveStatus("unsaved");
    }
    claudeSaveTimeoutRef.current = setTimeout(() => {
      saveClaudeContent(newContent);
    }, 1000);
  }, [saveClaudeContent]);

  const displayPath = useMemo(() => {
    if (!selectedBot || !teamPath) return null;
    return selectedBot.dirPath.replace(teamPath + "/", "") + "/CLAUDE.md";
  }, [selectedBot, teamPath]);

  // ── Commands (slash commands) ─────────────────────────
  const commandsDir = selectedPath ? `${selectedPath}/.claude/commands` : undefined;
  const { data: commandEntries = [] } = useListDirectory(commandsDir);

  const commandFiles = useMemo(
    () =>
      commandEntries
        .filter((e) => !e.is_directory && e.name.endsWith(".md"))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [commandEntries]
  );

  // Batch-read command files to extract titles
  const commandContentQueries = useQueries({
    queries: commandFiles.map((f) => ({
      queryKey: ["file", f.path],
      queryFn: () => invoke<string>("read_file", { path: f.path }),
      staleTime: 10 * 60 * 1000,
    })),
  });

  const commandList = useMemo(() => {
    return commandFiles.map((f, i) => {
      const content = commandContentQueries[i]?.data;
      const slug = f.name.replace(/\.md$/, "");
      // Parse title from first # heading
      const titleMatch = content?.match(/^#\s+(.+)$/m);
      // Parse first paragraph after the heading as description
      const descMatch = content?.match(/^#\s+.+\n+([^#\n].+)/m);
      return {
        slug,
        name: `/${slug}`,
        title: titleMatch?.[1] || slug,
        description: descMatch?.[1]?.trim() || "",
        path: f.path,
      };
    });
  }, [commandFiles, commandContentQueries]);

  // Selected command for detail view
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
  const { data: commandContent, isLoading: loadingCommand } = useReadFile(
    selectedCommand || undefined
  );

  // ── Permissions ─────────────────────────────────────
  // Read from three sources: team settings.json, bot settings.json, bot settings.local.json
  const teamSettingsPath = teamPath ? `${teamPath}/.claude/settings.json` : undefined;
  const botSettingsPath = selectedPath ? `${selectedPath}/.claude/settings.json` : undefined;
  const botLocalSettingsPath = selectedPath ? `${selectedPath}/.claude/settings.local.json` : undefined;

  const { data: teamSettingsRaw } = useReadFile(teamSettingsPath);
  const { data: botSettingsRaw } = useReadFile(botSettingsPath);
  const { data: botLocalSettingsRaw } = useReadFile(botLocalSettingsPath);

  // Inherited permissions (team-level — read-only)
  const inheritedPermissions = useMemo(
    () => parsePermissions(teamSettingsRaw),
    [teamSettingsRaw]
  );

  // Bot-specific permissions (editable — merged from bot settings.json + settings.local.json)
  const botPermissions = useMemo(() => {
    const botProject = parsePermissions(botSettingsRaw);
    const botLocal = parsePermissions(botLocalSettingsRaw);
    return {
      additionalDirectories: [...new Set([...botProject.additionalDirectories, ...botLocal.additionalDirectories])],
      allow: [...new Set([...botProject.allow, ...botLocal.allow])],
      deny: [...new Set([...botProject.deny, ...botLocal.deny])],
    };
  }, [botSettingsRaw, botLocalSettingsRaw]);

  const writeFile = useWriteFile();

  // Save to settings.local.json (most bots use this; creates .claude/ dir if needed)
  const savePermissions = useCallback(
    async (updated: BotPermissions) => {
      if (!botLocalSettingsPath) return;
      // Preserve unknown keys in existing settings.local.json
      const existing = parseSettingsJson(botLocalSettingsRaw);
      const newSettings: SettingsJson = {
        ...existing,
        permissions: {
          ...(existing.permissions || {}),
          additionalDirectories: updated.additionalDirectories.length > 0 ? updated.additionalDirectories : undefined,
          allow: updated.allow.length > 0 ? updated.allow : undefined,
          deny: updated.deny.length > 0 ? updated.deny : undefined,
        },
      };
      // Clean up empty permissions object
      const perms = newSettings.permissions!;
      if (!perms.additionalDirectories && !perms.allow && !perms.deny) {
        delete newSettings.permissions;
      }
      const content = JSON.stringify(newSettings, null, 2) + "\n";
      await writeFile.mutateAsync({ path: botLocalSettingsPath, content });
    },
    [botLocalSettingsPath, botLocalSettingsRaw, writeFile]
  );

  // ── Sessions ──────────────────────────────────────
  const sessionsPath = storedSessionsPath
    || (personalFolderPath ? `${personalFolderPath}/sessions` : null);

  const { data: sessionFiles = [], isLoading: loadingSessions } =
    useFolderFiles(sessionsPath, 100);

  // Parse session entries with dates, sorted most recent first
  // Includes daily notes (notes.md) and summaries (files in /summaries/ folder)
  const sessions: SessionEntry[] = useMemo(
    () => {
      const daily: SessionEntry[] = sessionFiles
        .filter((f) => f.name === "notes.md")
        .map((f) => ({ file: f, date: extractDateFromPath(f.path) || "", type: "daily" as SessionType }));

      const summaries: SessionEntry[] = sessionFiles
        .filter((f) => f.path.includes("/summaries/") && f.name.endsWith(".md"))
        .map((f) => ({
          file: f,
          date: extractSummaryDate(f.path) || "",
          type: detectSessionType(f.path),
        }));

      return [...daily, ...summaries]
        .filter((s) => s.date)
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    [sessionFiles]
  );

  // Batch-read session contents to map each session → bots referenced
  const sessionContentQueries = useQueries({
    queries: sessions.map((s) => ({
      queryKey: ["file", s.file.path],
      queryFn: () => invoke<string>("read_file", { path: s.file.path }),
      staleTime: 10 * 60 * 1000,
    })),
  });

  // Map session path → set of matched bot dirPaths
  const sessionBotMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    sessions.forEach((s, i) => {
      const content = sessionContentQueries[i]?.data;
      if (!content) return;
      const parsed = parseBotSections(content);
      const matchedPaths = new Set<string>();
      for (const p of parsed) {
        const matched = findBestMatchBot(p.bot, allBots);
        if (matched) matchedPaths.add(matched.dirPath);
      }
      map.set(s.file.path, matchedPaths);
    });
    return map;
  }, [sessions, sessionContentQueries, allBots]);

  // Filter sessions by selected bot
  // Summaries (weekly/monthly) always show — they're cross-bot context
  const filteredSessions = useMemo(() => {
    if (!selectedPath) return sessions;
    return sessions.filter((s) => {
      if (s.type !== "daily") return true;
      const botPaths = sessionBotMap.get(s.file.path);
      return botPaths?.has(selectedPath);
    });
  }, [sessions, selectedPath, sessionBotMap]);

  // View state
  const [mainView, setMainView] = useState<MainView>("config");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  // Read selected session content
  const { data: sessionContent, isLoading: loadingSession } =
    useReadFile(selectedSession || undefined);

  // Parse bot sections + tags from loaded session content, matched to current bots
  const sessionBots = useMemo(() => {
    if (!sessionContent) return [];
    const parsed = parseBotSections(sessionContent);
    return parsed.map((p) => {
      const matched = findBestMatchBot(p.bot, allBots);
      return {
        ...p,
        matchedName: matched ? formatBotName(matched.name) : p.bot,
        matchedPath: matched?.dirPath || null,
      };
    });
  }, [sessionContent, allBots]);
  const sessionTags = useMemo(
    () => (sessionContent ? parseFrontmatterTags(sessionContent) : []),
    [sessionContent]
  );

  const sidebarWidth = 220;

  return (
    <div className="h-full flex bg-white dark:bg-zinc-950">
      {/* ── Sidebar ────────────────────────────── */}
      <aside
        className="flex-shrink-0 border-r border-slate-200 dark:border-zinc-800 flex flex-col overflow-hidden"
        style={{ width: sidebarWidth }}
      >
        <div className="px-3 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2">
          <Bot size={16} className="text-teal-600 dark:text-teal-400" />
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Bots
          </span>
          <span className="text-xs text-zinc-400 ml-auto">
            {allBots.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {!teamPath ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-400">
              <p>No bots path configured</p>
              <p className="text-xs mt-2 text-zinc-500">
                Set your bots directory in Settings
              </p>
            </div>
          ) : loadingTeam ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-zinc-400" />
            </div>
          ) : allBots.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-400">
              No bots found
            </div>
          ) : (
            grouped.map(([group, groupBots]) => (
              <div key={group} className="mb-1">
                <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                  {group === "personal" && (
                    <User
                      size={10}
                      className="text-zinc-400 dark:text-zinc-500"
                    />
                  )}
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {groupLabels[group] || group}
                  </span>
                </div>
                {groupBots.map((bot) => (
                  <button
                    key={bot.dirPath}
                    onClick={() => {
                      setSelectedPath(bot.dirPath);
                      setSelectedSession(null);
                      setSelectedCommand(null);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm transition-colors",
                      "hover:bg-slate-100 dark:hover:bg-zinc-800/60",
                      selectedPath === bot.dirPath
                        ? "bg-slate-100 dark:bg-zinc-800 text-teal-700 dark:text-teal-400 font-medium"
                        : "text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    {formatBotName(bot.name)}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main content ───────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="flex items-center border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
          <button
            onClick={() => {
              setMainView("config");
              setSelectedSession(null);
            }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              mainView === "config"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            Config
          </button>
          <button
            onClick={() => {
              setMainView("sessions");
              setSelectedSession(null);
            }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
              mainView === "sessions"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            <Clock size={14} />
            Sessions
            {filteredSessions.length > 0 && (
              <span className="text-xs text-zinc-400 ml-0.5">
                {filteredSessions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setMainView("permissions");
              setSelectedSession(null);
            }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
              mainView === "permissions"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            <Shield size={14} />
            Permissions
          </button>

          <button
            onClick={() => {
              setMainView("commands");
              setSelectedSession(null);
              setSelectedCommand(null);
            }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
              mainView === "commands"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            <Zap size={14} />
            Commands
            {commandList.length > 0 && (
              <span className="text-xs text-zinc-400 ml-0.5">
                {commandList.length}
              </span>
            )}
          </button>

          {/* Show selected bot name or file path in tab bar */}
          {mainView === "config" && selectedBot && (
            <span className="ml-auto mr-4 flex items-center gap-2 text-xs text-zinc-400 font-mono truncate">
              {displayPath}
              <span className={
                claudeSaveStatus === "saving" ? "text-zinc-500" :
                claudeSaveStatus === "unsaved" ? "text-amber-500" :
                "text-zinc-500 dark:text-zinc-600"
              }>
                {claudeSaveStatus === "saving" ? "Saving..." :
                 claudeSaveStatus === "unsaved" ? "Unsaved" :
                 "Saved"}
              </span>
            </span>
          )}
          {mainView === "sessions" && selectedBot && (
            <span className="ml-auto mr-4 text-xs text-zinc-400 truncate">
              Filtered by {formatBotName(selectedBot.name)}
            </span>
          )}
        </div>

        {/* ── Config view ──────────────────── */}
        {mainView === "config" && (
          <>
            {selectedBot ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                {loadingFile ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2
                      size={24}
                      className="animate-spin text-zinc-400"
                    />
                  </div>
                ) : claudeContent ? (
                  <div className="flex-1 overflow-hidden">
                    <MarkdownEditor
                      key={claudeMdPath}
                      content={claudeContent}
                      onChange={handleClaudeContentChange}
                    />
                  </div>
                ) : (
                  <div className="text-center py-16 text-zinc-400 dark:text-zinc-500">
                    <FileText size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No CLAUDE.md found for this bot</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
                <div className="text-center">
                  <Bot size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    Select a bot to view its configuration
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Sessions view ────────────────── */}
        {mainView === "sessions" && !selectedSession && (
          <div className="flex-1 overflow-y-auto">
            {!sessionsPath ? (
              <div className="flex items-center justify-center h-full text-zinc-400">
                <div className="text-center">
                  <Clock size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    No sessions path configured
                  </p>
                  <p className="text-xs mt-1 text-zinc-500">
                    Set your sessions directory in Settings, or ensure your team folder matches your login name
                  </p>
                </div>
              </div>
            ) : loadingSessions ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-zinc-400" />
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-400">
                <div className="text-center">
                  <Clock size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {selectedBot
                      ? `No sessions found for ${formatBotName(selectedBot.name)}`
                      : "No sessions found"}
                  </p>
                  {selectedBot && sessions.length > 0 && (
                    <button
                      onClick={() => setSelectedPath(null)}
                      className="text-xs mt-2 text-teal-600 dark:text-teal-400 hover:underline"
                    >
                      Show all sessions
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto px-6 py-4">
                {/* Filtering indicator */}
                {selectedBot && (
                  <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500">
                    <Bot size={12} className="text-teal-500" />
                    <span>
                      Showing sessions for{" "}
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {formatBotName(selectedBot.name)}
                      </span>
                    </span>
                    <button
                      onClick={() => setSelectedPath(null)}
                      className="ml-auto text-teal-600 dark:text-teal-400 hover:underline"
                    >
                      Show all
                    </button>
                  </div>
                )}

                {/* Timeline */}
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[19px] top-2 bottom-2 w-px bg-slate-200 dark:bg-zinc-800" />

                  <div className="space-y-3">
                    {filteredSessions.map((s) => (
                      <button
                        key={s.file.path}
                        onClick={() => setSelectedSession(s.file.path)}
                        className="w-full text-left flex gap-3 group"
                      >
                        {/* Timeline dot — color varies by type */}
                        <div className="flex-shrink-0 w-10 flex items-start justify-center pt-3">
                          <div className={cn(
                            "w-2.5 h-2.5 rounded-full transition-colors",
                            s.type === "weekly"
                              ? "bg-blue-300 dark:bg-blue-700 group-hover:bg-blue-500"
                              : s.type === "monthly"
                              ? "bg-violet-300 dark:bg-violet-700 group-hover:bg-violet-500"
                              : "bg-slate-300 dark:bg-zinc-700 group-hover:bg-teal-500"
                          )} />
                        </div>

                        {/* Card — accent border for summaries */}
                        <div className={cn(
                          "flex-1 border rounded-lg p-3 transition-colors",
                          s.type === "weekly"
                            ? "border-blue-200 dark:border-blue-900 border-l-2 border-l-blue-400 dark:border-l-blue-600 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
                            : s.type === "monthly"
                            ? "border-violet-200 dark:border-violet-900 border-l-2 border-l-violet-400 dark:border-l-violet-600 hover:border-violet-300 dark:hover:border-violet-800 hover:bg-violet-50/50 dark:hover:bg-violet-950/20"
                            : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-900/50"
                        )}>
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar
                              size={12}
                              className="text-zinc-400 flex-shrink-0"
                            />
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              {relativeDate(s.date)}
                            </span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-600">
                              {s.date}
                            </span>
                            {s.type !== "daily" && (
                              <span className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                s.type === "weekly"
                                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                  : "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                              )}>
                                {s.type === "weekly" ? "Weekly" : "Monthly"}
                              </span>
                            )}
                          </div>

                          {s.file.title && (
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-0.5">
                              {s.file.title
                                .replace(/^Session Notes?\s*[-–—]\s*/i, "")
                                .replace(/^Weekly Summary\s*[-–—]\s*/i, "")
                                .replace(/^Monthly Rollup\s*[-–—]\s*/i, "")
                                || s.file.title}
                            </p>
                          )}

                          {s.file.summary && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                              {s.file.summary}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Permissions view ────────────── */}
        {mainView === "permissions" && (
          <>
            {selectedBot ? (
              <PermissionsEditor
                permissions={botPermissions}
                inherited={inheritedPermissions}
                onSave={savePermissions}
                botName={formatBotName(selectedBot.name)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
                <div className="text-center">
                  <Shield size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    Select a bot to manage its permissions
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Commands view ──────────────── */}
        {mainView === "commands" && !selectedCommand && (
          <>
            {selectedBot ? (
              <div className="flex-1 overflow-y-auto">
                {commandList.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-400">
                    <div className="text-center">
                      <Zap size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No commands defined for this bot</p>
                      <p className="text-xs mt-1 text-zinc-500">
                        Commands live in .claude/commands/ inside the bot directory
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto px-6 py-4">
                    <div className="space-y-2">
                      {commandList.map((cmd) => (
                        <button
                          key={cmd.slug}
                          onClick={() => setSelectedCommand(cmd.path)}
                          className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors group"
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <code className="text-sm font-semibold text-teal-700 dark:text-teal-400">
                              {cmd.name}
                            </code>
                          </div>
                          {cmd.title !== cmd.slug && (
                            <p className="text-sm text-zinc-700 dark:text-zinc-300">
                              {cmd.title}
                            </p>
                          )}
                          {cmd.description && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                              {cmd.description}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
                <div className="text-center">
                  <Zap size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    Select a bot to view its commands
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Command detail view ──────────── */}
        {mainView === "commands" && selectedCommand && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setSelectedCommand(null)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <code className="text-sm font-semibold text-teal-700 dark:text-teal-400">
                /{selectedCommand.split("/").pop()?.replace(".md", "")}
              </code>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingCommand ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-zinc-400" />
                </div>
              ) : commandContent ? (
                <MarkdownViewer content={commandContent} />
              ) : (
                <div className="text-center py-16 text-zinc-400">
                  <p className="text-sm">Could not load command</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Session detail view ──────────── */}
        {mainView === "sessions" && selectedSession && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Back + meta header */}
            <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setSelectedSession(null)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>

              {sessionBots.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {sessionBots.map((b, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (b.matchedPath) {
                          setSelectedPath(b.matchedPath);
                          setMainView("config");
                          setSelectedSession(null);
                        }
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full",
                        b.matchedPath
                          ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 cursor-pointer"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-default"
                      )}
                      title={b.matchedPath ? `View ${b.matchedName} config` : `${b.bot} (no matching bot found)`}
                    >
                      <Bot size={10} />
                      {b.matchedName}
                    </button>
                  ))}
                </div>
              )}

              {sessionTags.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap ml-auto">
                  <Tag
                    size={10}
                    className="text-zinc-400 flex-shrink-0"
                  />
                  {sessionTags.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Session content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingSession ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2
                    size={24}
                    className="animate-spin text-zinc-400"
                  />
                </div>
              ) : sessionContent ? (
                <MarkdownViewer content={sessionContent} />
              ) : (
                <div className="text-center py-16 text-zinc-400">
                  <p className="text-sm">Could not load session</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
