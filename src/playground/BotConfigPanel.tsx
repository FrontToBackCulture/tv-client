// BotConfigPanel: Structured CLAUDE.md editor with collapsible sections and skills table

import { useState, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  X,
  Search,
  Settings,
  Sparkles,
  Brain,
  Clock,
  Database,
  BookOpen,
  Pencil,
  Check,
  AlertCircle,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useWriteFile } from "../hooks/useFiles";
import { useQueryClient } from "@tanstack/react-query";

// ============================================================
// Types
// ============================================================

interface SkillRow {
  name: string;
  description: string;
  trigger: string;
}

interface ClaudeMdSection {
  id: string;
  title: string;
  icon: typeof Settings;
  raw: string;
  startLine: number; // line index in original content
  endLine: number;
}

interface Props {
  claudeContent: string | undefined;
  claudeMdPath: string;
  /** Skill directories that exist on disk in _skills/ */
  availableSkillDirs: string[];
}

// ============================================================
// Parser: split CLAUDE.md into sections by ## headers
// ============================================================

function parseClaudeMd(content: string): { header: string; sections: ClaudeMdSection[] } {
  const lines = content.split("\n");
  const sections: ClaudeMdSection[] = [];
  let headerEnd = 0;

  // Find first ## header
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      headerEnd = i;
      break;
    }
    if (i === lines.length - 1) headerEnd = lines.length;
  }

  const header = lines.slice(0, headerEnd).join("\n");

  // Collect sections
  let currentStart = -1;
  let currentTitle = "";
  for (let i = headerEnd; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      if (currentStart >= 0) {
        sections.push(makeSection(currentTitle, lines.slice(currentStart, i).join("\n"), currentStart, i));
      }
      currentStart = i;
      currentTitle = lines[i].replace(/^##\s+/, "").trim();
    }
  }
  if (currentStart >= 0) {
    sections.push(makeSection(currentTitle, lines.slice(currentStart).join("\n"), currentStart, lines.length));
  }

  return { header, sections };
}

const SECTION_ICONS: Record<string, typeof Settings> = {
  personality: Brain,
  "session start": Clock,
  "session end": BookOpen,
  skills: Sparkles,
  context: Database,
  "memory management": Database,
};

function sectionIcon(title: string): typeof Settings {
  const key = title.toLowerCase();
  for (const [k, icon] of Object.entries(SECTION_ICONS)) {
    if (key.includes(k)) return icon;
  }
  return Settings;
}

function makeSection(title: string, raw: string, startLine: number, endLine: number): ClaudeMdSection {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    icon: sectionIcon(title),
    raw,
    startLine,
    endLine,
  };
}

// ============================================================
// Parser: extract skills table from section raw content
// ============================================================

function parseSkillsTable(raw: string): { before: string; rows: SkillRow[]; after: string } {
  const lines = raw.split("\n");
  let tableStart = -1;
  let tableEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.includes("**") && tableStart === -1) {
      // Check if this is a data row (contains bold skill name)
      // But first row might be a header — skip header + separator
      // Look backwards for the header
      if (i >= 2 && lines[i - 1]?.trim().startsWith("|---")) {
        tableStart = i - 2; // header row
      } else if (i >= 1 && lines[i - 1]?.trim().startsWith("|")) {
        tableStart = i - 1;
      } else {
        tableStart = i;
      }
    }
    if (tableStart >= 0 && line.startsWith("|") && line.includes("**")) {
      tableEnd = i + 1;
    }
  }

  if (tableStart === -1) return { before: raw, rows: [], after: "" };

  const before = lines.slice(0, tableStart).join("\n");
  const after = lines.slice(tableEnd).join("\n");
  const tableLines = lines.slice(tableStart, tableEnd);

  const rows: SkillRow[] = [];
  for (const line of tableLines) {
    // Skip header and separator
    if (line.trim().startsWith("| Skill") || line.trim().startsWith("| Command") || line.trim().startsWith("|---")) continue;
    // Parse: | **name** | description | trigger |
    const match = line.match(/\|\s*\*\*([^*]+)\*\*\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
    if (match) {
      rows.push({
        name: match[1].trim(),
        description: match[2].trim(),
        trigger: match[3].trim(),
      });
    }
  }

  return { before, rows, after };
}

function skillsTableToMarkdown(rows: SkillRow[]): string {
  if (rows.length === 0) return "";
  const lines = [
    "| Skill | Description | Trigger |",
    "|-------|-------------|---------|",
  ];
  for (const row of rows) {
    lines.push(`| **${row.name}** | ${row.description} | ${row.trigger} |`);
  }
  return lines.join("\n");
}

// ============================================================
// Reassemble CLAUDE.md from header + sections
// ============================================================

function reassembleClaudeMd(header: string, sections: ClaudeMdSection[]): string {
  const parts = [header.trimEnd()];
  for (const section of sections) {
    parts.push("", section.raw.trimEnd());
  }
  return parts.join("\n") + "\n";
}

// ============================================================
// Sub-components
// ============================================================

function CollapsibleSection({
  section,
  expanded,
  onToggle,
  onUpdate,
}: {
  section: ClaudeMdSection;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (raw: string) => void;
}) {
  const Icon = section.icon;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.raw);

  const lineCount = section.raw.split("\n").length;

  const handleEdit = () => {
    setDraft(section.raw);
    setEditing(true);
  };

  const handleSave = () => {
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(section.raw);
    setEditing(false);
  };

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-zinc-400 flex-shrink-0" />
        )}
        <Icon size={14} className="text-zinc-500 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex-1 text-left">
          {section.title}
        </span>
        <span className="text-xs text-zinc-400 tabular-nums">{lineCount} lines</span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          {editing ? (
            <div className="p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full h-[400px] text-xs font-mono bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-teal-500 resize-y"
                onKeyDown={(e) => {
                  if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSave();
                  }
                  if (e.key === "Escape") handleCancel();
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-500 text-white text-xs font-medium hover:bg-teal-600 transition-colors"
                >
                  <Check size={12} />
                  Apply
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
                <span className="text-xs text-zinc-400 ml-auto">Cmd+S to apply, Esc to cancel</span>
              </div>
            </div>
          ) : (
            <div className="relative group">
              <pre className="px-4 py-3 text-xs font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                {section.raw}
              </pre>
              <button
                onClick={handleEdit}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                title="Edit section"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Skills Table Editor
// ============================================================

function SkillsTableEditor({
  rows,
  onUpdate,
  availableSkillDirs,
}: {
  rows: SkillRow[];
  onUpdate: (rows: SkillRow[]) => void;
  availableSkillDirs: string[];
}) {
  const [search, setSearch] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<SkillRow | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  // Skills in the table
  const indexedNames = useMemo(() => new Set(rows.map((r) => r.name)), [rows]);

  // Skills on disk but not in the table
  const unindexedSkills = useMemo(() => {
    return availableSkillDirs.filter((d) => !indexedNames.has(d)).sort();
  }, [availableSkillDirs, indexedNames]);

  // Filtered rows for display
  const filteredRows = useMemo(() => {
    if (!search) return rows.map((r, i) => ({ ...r, originalIndex: i }));
    const q = search.toLowerCase();
    return rows
      .map((r, i) => ({ ...r, originalIndex: i }))
      .filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.trigger.toLowerCase().includes(q));
  }, [rows, search]);

  // Filtered unindexed for add picker
  const filteredUnindexed = useMemo(() => {
    if (!addSearch) return unindexedSkills;
    const q = addSearch.toLowerCase();
    return unindexedSkills.filter((s) => s.toLowerCase().includes(q));
  }, [unindexedSkills, addSearch]);

  const handleDelete = (idx: number) => {
    const updated = rows.filter((_, i) => i !== idx);
    onUpdate(updated);
  };

  const handleStartEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditDraft({ ...rows[idx] });
  };

  const handleSaveEdit = () => {
    if (editingIdx === null || !editDraft) return;
    const updated = [...rows];
    updated[editingIdx] = editDraft;
    onUpdate(updated);
    setEditingIdx(null);
    setEditDraft(null);
  };

  const handleCancelEdit = () => {
    setEditingIdx(null);
    setEditDraft(null);
  };

  const handleAdd = (skillName: string) => {
    const newRow: SkillRow = {
      name: skillName,
      description: "",
      trigger: `"${skillName.replace(/^(analyzing|generating|building|creating|checking|managing|exploring|tracking|writing|curating|reporting|troubleshooting|auditing|diagnosing|guiding|tracing)-?/, "")}"`,
    };
    onUpdate([...rows, newRow]);
    setShowAddPicker(false);
    setAddSearch("");
    // Auto-edit the new row
    setEditingIdx(rows.length);
    setEditDraft(newRow);
  };

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-zinc-400 tabular-nums">{rows.length} skills indexed</span>
        {unindexedSkills.length > 0 && (
          <span className="text-xs text-amber-500 flex items-center gap-1">
            <AlertCircle size={10} />
            {unindexedSkills.length} on disk not indexed
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <div className="relative">
            <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[120px] pl-5 pr-5 py-0.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:border-teal-500 focus:w-[160px] transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X size={9} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowAddPicker(!showAddPicker)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
              showAddPicker
                ? "bg-teal-50 dark:bg-teal-900/20 text-teal-600 border border-teal-300 dark:border-teal-700"
                : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700 hover:border-teal-300 hover:text-teal-600"
            )}
          >
            <Plus size={11} />
            Add
          </button>
        </div>
      </div>

      {/* Add skill picker */}
      {showAddPicker && unindexedSkills.length > 0 && (
        <div className="mb-3 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
              Add skill from _skills/ directory
            </span>
            <div className="relative ml-auto">
              <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search..."
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                autoFocus
                className="w-[140px] pl-5 pr-2 py-0.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:border-teal-500 transition-all"
              />
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {filteredUnindexed.map((skill) => (
              <button
                key={skill}
                onClick={() => handleAdd(skill)}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-zinc-600 dark:text-zinc-400 hover:bg-teal-100 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 transition-colors flex items-center gap-2"
              >
                <Plus size={10} className="text-teal-500 flex-shrink-0" />
                <span className="font-mono">{skill}</span>
              </button>
            ))}
            {filteredUnindexed.length === 0 && (
              <p className="text-xs text-zinc-400 py-2 text-center">No matching skills</p>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[200px_1fr_200px_32px] gap-0 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Name</span>
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Description</span>
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Trigger</span>
          <span />
        </div>

        {/* Table rows */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50 max-h-[500px] overflow-y-auto">
          {filteredRows.map((row) => {
            const isEditing = editingIdx === row.originalIndex;
            const isOnDisk = availableSkillDirs.includes(row.name);
            return (
              <div
                key={row.originalIndex}
                className={cn(
                  "grid grid-cols-[200px_1fr_200px_32px] gap-0 px-3 items-center group",
                  isEditing ? "py-2 bg-amber-50/50 dark:bg-amber-900/10" : "py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                )}
              >
                {isEditing && editDraft ? (
                  <>
                    <input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      className="text-xs font-mono bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-teal-500 mr-2"
                    />
                    <input
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                      className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-teal-500 mr-2"
                    />
                    <input
                      value={editDraft.trigger}
                      onChange={(e) => setEditDraft({ ...editDraft, trigger: e.target.value })}
                      className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-1 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-teal-500 mr-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                    />
                    <div className="flex items-center gap-0.5">
                      <button onClick={handleSaveEdit} className="p-0.5 text-teal-500 hover:text-teal-600" title="Save">
                        <Check size={12} />
                      </button>
                      <button onClick={handleCancelEdit} className="p-0.5 text-zinc-400 hover:text-zinc-600" title="Cancel">
                        <X size={12} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 min-w-0">
                      {!isOnDisk && (
                        <span title="Skill directory not found in _skills/" className="flex-shrink-0">
                          <AlertCircle size={10} className="text-red-400" />
                        </span>
                      )}
                      <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate" title={row.name}>
                        {row.name}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate pr-2" title={row.description}>
                      {row.description}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate font-mono" title={row.trigger}>
                      {row.trigger}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(row.originalIndex)}
                        className="p-0.5 text-zinc-400 hover:text-teal-500 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDelete(row.originalIndex)}
                        className="p-0.5 text-zinc-400 hover:text-red-500 transition-colors"
                        title="Remove from index"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function BotConfigPanel({ claudeContent, claudeMdPath, availableSkillDirs }: Props) {
  const writeFile = useWriteFile();
  const queryClient = useQueryClient();

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["skills"]));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  // Parse the CLAUDE.md content
  const parsed = useMemo(() => {
    if (!claudeContent) return null;
    return parseClaudeMd(claudeContent);
  }, [claudeContent]);

  // Working copy of sections (mutable state)
  const [workingSections, setWorkingSections] = useState<ClaudeMdSection[] | null>(null);
  const [workingHeader, setWorkingHeader] = useState<string | null>(null);

  // Initialize working copy when parsed changes
  const sections = workingSections ?? parsed?.sections ?? [];
  const header = workingHeader ?? parsed?.header ?? "";

  // Find the Skills section
  const skillsSectionIdx = sections.findIndex((s) => s.title.toLowerCase() === "skills");
  const skillsSection = skillsSectionIdx >= 0 ? sections[skillsSectionIdx] : null;

  // Parse skills table from skills section
  const skillsTableData = useMemo(() => {
    if (!skillsSection) return null;
    return parseSkillsTable(skillsSection.raw);
  }, [skillsSection]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateSection = useCallback((idx: number, raw: string) => {
    setWorkingSections((prev) => {
      const current = prev ?? parsed?.sections ?? [];
      const updated = [...current];
      updated[idx] = { ...updated[idx], raw };
      return updated;
    });
    setDirty(true);
    setSaveStatus("idle");
  }, [parsed]);

  const updateSkillRows = useCallback((rows: SkillRow[]) => {
    if (skillsSectionIdx < 0 || !skillsTableData) return;
    const newTable = skillsTableToMarkdown(rows);
    const newRaw = [skillsTableData.before.trimEnd(), "", newTable, "", skillsTableData.after.trimStart()].join("\n");
    updateSection(skillsSectionIdx, `## Skills\n\n${newRaw.trim()}`);
  }, [skillsSectionIdx, skillsTableData, updateSection]);

  const handleSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const content = reassembleClaudeMd(header, sections);
      await writeFile.mutateAsync({ path: claudeMdPath, content });
      queryClient.invalidateQueries({ queryKey: ["file", claudeMdPath] });
      setDirty(false);
      setSaveStatus("saved");
      // Reset working copy so it picks up fresh parsed data on next render
      setWorkingSections(null);
      setWorkingHeader(null);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save CLAUDE.md:", err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [dirty, header, sections, writeFile, claudeMdPath, queryClient]);

  if (!claudeContent || !parsed) {
    return (
      <div className="py-12 text-center">
        <Settings size={24} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
        <p className="text-sm text-zinc-400">No CLAUDE.md found</p>
      </div>
    );
  }

  // Separate skills section from other sections for special rendering
  const otherSections = sections.filter((_, i) => i !== skillsSectionIdx);

  return (
    <div className="space-y-3">
      {/* Save bar */}
      {dirty && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400 flex-1">
            Unsaved changes to CLAUDE.md
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            <Save size={12} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
      {saveStatus === "saved" && !dirty && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <Check size={14} className="text-green-500" />
          <span className="text-xs text-green-700 dark:text-green-400">Saved successfully</span>
        </div>
      )}

      {/* Skills table — hero section, always visible */}
      {skillsTableData && skillsTableData.rows.length > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
            <Sparkles size={14} className="text-amber-500" />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Skills Index</span>
            <span className="text-xs text-zinc-400 tabular-nums ml-auto">{skillsTableData.rows.length} entries</span>
          </div>
          <div className="p-3">
            <SkillsTableEditor
              rows={skillsTableData.rows}
              onUpdate={updateSkillRows}
              availableSkillDirs={availableSkillDirs}
            />
          </div>
        </div>
      )}

      {/* Other sections — collapsible */}
      {otherSections.map((section) => {
        const realIdx = sections.indexOf(section);
        return (
          <CollapsibleSection
            key={section.id}
            section={section}
            expanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            onUpdate={(raw) => updateSection(realIdx, raw)}
          />
        );
      })}
    </div>
  );
}
