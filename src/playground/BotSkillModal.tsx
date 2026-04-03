// BotPlayground: Skill modal with file tree + content viewer

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
  FolderOpen,
} from "lucide-react";
import { useListDirectory, useReadFile, useWriteFile } from "../hooks/useFiles";
import { cn } from "../lib/cn";
import { toSGTDateString } from "../lib/date";
import { MarkdownViewer } from "../modules/library/MarkdownViewer";
import { useSkillRegistry } from "../modules/skills/useSkillRegistry";
import { useUpdateSkill } from "../hooks/skills/useSkills";
import {
  type SkillStatus,
  SKILL_STATUS_CONFIG,
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
  const defaultFile = `${skillPath}/SKILL.md`;
  const { data: entries = [], isLoading: loadingDir } = useListDirectory(skillPath);
  const [selectedFile, setSelectedFile] = useState<string>(defaultFile);
  const [viewMode, setViewMode] = useState<"rendered" | "edit">("rendered");
  const [editContent, setEditContent] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const writeFile = useWriteFile();

  // Read the currently selected file
  const { data: fileContent, isLoading: loadingFile } = useReadFile(selectedFile);

  // Read SKILL.md for frontmatter (always needed for header)
  const { data: skillMd } = useReadFile(defaultFile);

  const files = entries.filter((e) => !e.is_directory && !e.name.startsWith("."));
  const folders = entries.filter((e) => e.is_directory && !e.name.startsWith("."));

  const selectedFileName = selectedFile.split("/").pop() || "";
  const isMarkdown = selectedFileName.endsWith(".md");
  const isHtml = selectedFileName.endsWith(".html");

  const handleCopy = () => {
    if (fileContent) navigator.clipboard.writeText(fileContent);
  };

  const handleEdit = () => {
    setEditContent(fileContent || "");
    setIsDirty(false);
    setViewMode("edit");
  };

  const handleSave = () => {
    writeFile.mutate(
      { path: selectedFile, content: editContent },
      { onSuccess: () => { setIsDirty(false); setViewMode("rendered"); } }
    );
  };

  const handleClose = () => {
    if (isDirty && !confirm("You have unsaved changes. Discard?")) return;
    onClose();
  };

  const handleSelectFile = (path: string) => {
    if (isDirty && !confirm("You have unsaved changes. Discard?")) return;
    setSelectedFile(path);
    setViewMode("rendered");
    setIsDirty(false);
  };

  // Parse summary from SKILL.md
  const summary = useMemo(() => {
    if (!skillMd) return "";
    const match = skillMd.match(/^summary:\s*"?([^"\n]+)"?/m);
    return match?.[1]?.trim() || "";
  }, [skillMd]);

  // Status from central registry (single source of truth)
  const registryQuery = useSkillRegistry();
  const updateSkill = useUpdateSkill();
  const registry = registryQuery.data;
  const regEntry = registry?.skills[skillName];
  const currentStatus: SkillStatus = regEntry?.status ?? "active";
  const lastRevised = regEntry?.last_audited ?? null;
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const handleStatusChange = (newStatus: SkillStatus) => {
    const today = toSGTDateString();
    updateSkill.mutate({ slug: skillName, updates: { status: newStatus, last_audited: today } });
    setShowStatusMenu(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-5xl max-h-full flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
                <span className="text-xs text-zinc-400">&middot;</span>
                <span className="text-xs text-zinc-400">{skillName}</span>
                {/* Status badge */}
                <div className="relative">
                  <button
                    onClick={() => setShowStatusMenu(!showStatusMenu)}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors",
                      SKILL_STATUS_CONFIG[currentStatus].badge,
                      SKILL_STATUS_CONFIG[currentStatus].text
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", SKILL_STATUS_CONFIG[currentStatus].dot)} />
                    {SKILL_STATUS_CONFIG[currentStatus].label}
                  </button>
                  {showStatusMenu && (
                    <div className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg overflow-hidden z-10">
                      {(["active", "test", "review", "draft", "inactive", "deprecated"] as SkillStatus[]).map((s) => (
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
                  <span className="text-xs text-zinc-400">revised {relativeDate(lastRevised)}</span>
                )}
                {usage && (usage.invocations > 0 || usage.mentions > 0) && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 tabular-nums">
                    {usage.invocations > 0 ? `${usage.invocations} invoked` : ""}
                    {usage.invocations > 0 && usage.mentions > 0 ? " · " : ""}
                    {usage.mentions > 0 ? `${usage.mentions} mentioned` : ""}
                  </span>
                )}
                {isDirty && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">Unsaved</span>
                )}
                {writeFile.isPending && (
                  <span className="text-xs text-zinc-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Saving...</span>
                )}
              </div>
              {summary && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">{summary}</p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body: file tree + content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: file tree */}
          <div className="w-[200px] flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/50">
            {loadingDir ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={14} className="animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="py-2">
                {/* Root files */}
                {files.map((f) => (
                  <TreeFileItem
                    key={f.path}
                    name={f.name}
                    path={f.path}
                    isSelected={selectedFile === f.path}
                    onClick={() => handleSelectFile(f.path)}
                    isSkillMd={f.name === "SKILL.md"}
                  />
                ))}
                {/* Folders */}
                {folders.map((f) => (
                  <TreeFolder
                    key={f.path}
                    name={f.name}
                    path={f.path}
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: file content */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* File toolbar */}
            <div className="flex-shrink-0 px-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
              <span className="text-xs font-medium text-zinc-500 truncate">{selectedFileName}</span>
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
                    {isMarkdown && (
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
                    )}
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

            {/* File content */}
            <div className="flex-1 overflow-y-auto">
              {loadingFile ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-zinc-400" />
                </div>
              ) : viewMode === "edit" ? (
                <textarea
                  value={editContent}
                  onChange={(e) => { setEditContent(e.target.value); setIsDirty(true); }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
                  }}
                  className="w-full h-full px-5 py-4 text-sm text-zinc-700 dark:text-zinc-300 bg-transparent font-mono leading-relaxed resize-none focus:outline-none"
                  spellCheck={false}
                />
              ) : isMarkdown && fileContent ? (
                <div className="px-6 py-5">
                  <MarkdownViewer content={fileContent} filename={selectedFileName} />
                </div>
              ) : isHtml && fileContent ? (
                <iframe
                  srcDoc={fileContent}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts"
                />
              ) : (
                <pre className="px-5 py-4 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
                  {fileContent || "(empty)"}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tree components ────────────────────────────────────────────────────────

function TreeFileItem({
  name,
  path: _path,
  isSelected,
  onClick,
  isSkillMd,
}: {
  name: string;
  path: string;
  isSelected: boolean;
  onClick: () => void;
  isSkillMd?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-1.5 px-3 py-1 text-xs transition-colors",
        isSelected
          ? "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium"
          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <FileText size={12} className={cn("flex-shrink-0", isSkillMd ? "text-amber-500" : isSelected ? "text-teal-500" : "text-zinc-400")} />
      <span className="truncate">{name}</span>
    </button>
  );
}

function TreeFolder({
  name,
  path,
  selectedFile,
  onSelectFile,
}: {
  name: string;
  path: string;
  selectedFile: string;
  onSelectFile: (path: string) => void;
}) {
  const isChildSelected = selectedFile.startsWith(path + "/");
  const [expanded, setExpanded] = useState(isChildSelected);
  const { data: entries = [] } = useListDirectory(expanded || isChildSelected ? path : undefined);
  const files = entries.filter((e) => !e.is_directory && !e.name.startsWith("."));
  const subfolders = entries.filter((e) => e.is_directory && !e.name.startsWith("."));

  const Icon = name === "references" ? BookOpen : name === "assets" || name === "templates" ? FileCode : Folder;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full text-left flex items-center gap-1.5 px-3 py-1 text-xs transition-colors",
          "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        )}
      >
        <ChevronRight size={10} className={cn("flex-shrink-0 text-zinc-400 transition-transform", expanded && "rotate-90")} />
        {expanded ? (
          <FolderOpen size={12} className="flex-shrink-0 text-zinc-400" />
        ) : (
          <Icon size={12} className="flex-shrink-0 text-zinc-400" />
        )}
        <span className="truncate font-medium">{name}</span>
        {files.length > 0 && !expanded && (
          <span className="text-[10px] text-zinc-400 ml-auto tabular-nums">{files.length}</span>
        )}
      </button>
      {expanded && (
        <div className="ml-3">
          {files.map((f) => (
            <TreeFileItem
              key={f.path}
              name={f.name}
              path={f.path}
              isSelected={selectedFile === f.path}
              onClick={() => onSelectFile(f.path)}
            />
          ))}
          {subfolders.map((f) => (
            <TreeFolder
              key={f.path}
              name={f.name}
              path={f.path}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
          {files.length === 0 && subfolders.length === 0 && (
            <p className="px-3 py-1 text-[10px] text-zinc-400">(empty)</p>
          )}
        </div>
      )}
    </div>
  );
}
