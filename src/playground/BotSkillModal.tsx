// BotPlayground: Skill modal with file viewer/editor

import { useState, useMemo } from "react";
import {
  X,
  Loader2,
  BookOpen,
  FileCode,
  Folder,
  ChevronRight,
  FileText,
  Copy,
  Eye,
  Pencil,
  Save,
} from "lucide-react";
import { useListDirectory, useReadFile, useWriteFile } from "../hooks/useFiles";
import { cn } from "../lib/cn";
import { MarkdownViewer } from "../modules/library/MarkdownViewer";
import {
  type SkillStatus,
  SKILL_STATUS_CONFIG,
  parseSkillFrontmatter,
  updateFrontmatterField,
  relativeDate,
} from "./botPlaygroundTypes";

export function SkillModal({
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
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
                    <div className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-10">
                      {(["active", "inactive", "deprecated"] as SkillStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={cn(
                            "w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700",
                            s === currentStatus && "bg-zinc-50 dark:bg-zinc-700"
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
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
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
              <div className="px-5 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
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
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
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
                            ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
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
            <section className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800">
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
            <section className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800">
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
        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
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
        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <FileText size={13} className="text-zinc-400 flex-shrink-0" />
        <span className="text-sm text-zinc-600 dark:text-zinc-400 flex-1 truncate" title={name}>{name}</span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
        )}
        {name.endsWith(".md") && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400">MD</span>
        )}
        <ChevronRight size={12} className={cn("text-zinc-400 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="ml-4 mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-3 flex items-center gap-2 text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : editing ? (
            <div>
              <div className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-1">
                <button
                  onClick={handleSave}
                  disabled={!isDirty || writeFile.isPending}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                    isDirty ? "bg-teal-500 text-white hover:bg-teal-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
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
