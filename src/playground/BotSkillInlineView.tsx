// BotPlayground: Inline skill detail view with file tree + content viewer
// Replaces the modal — renders inline in the bot overview right panel

import { useState, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  FileText,
  FolderOpen,
  ChevronDown,
  Loader2,
  Eye,
  Pencil,
  Copy,
  Save,
  PenTool,
} from "lucide-react";
import { useFileTree, useReadFile, useWriteFile, type TreeNode } from "../hooks/useFiles";
import { cn } from "../lib/cn";
import { toSGTDateString } from "../lib/date";
import { MarkdownViewer } from "../modules/library/MarkdownViewer";
import { ExcalidrawViewer } from "../modules/library/viewers/ExcalidrawViewer";
import { IconButton } from "../components/ui";
import { useSkillRegistry } from "../modules/skills/useSkillRegistry";
import { useUpdateSkill } from "../hooks/skills/useSkills";
import {
  type SkillStatus,
  SKILL_STATUS_CONFIG,
  relativeDate,
} from "./botPlaygroundTypes";

interface Props {
  skillPath: string;
  skillName: string;
  title: string;
  usage?: { invocations: number; mentions: number };
  onBack: () => void;
}

export function BotSkillInlineView({ skillPath, skillName, title, usage, onBack }: Props) {
  // File tree
  const { data: tree, isLoading: loadingTree } = useFileTree(skillPath, 3);
  const defaultPath = `${skillPath}/SKILL.md`;
  const [selectedPath, setSelectedPath] = useState<string>(defaultPath);
  const [viewMode, setViewMode] = useState<"rendered" | "edit">("rendered");
  const [editContent, setEditContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const writeFile = useWriteFile();

  // Read selected file
  const { data: fileContent, isLoading: loadingFile } = useReadFile(selectedPath);

  // Read SKILL.md for summary
  const { data: skillMd } = useReadFile(defaultPath);
  const summary = useMemo(() => {
    if (!skillMd) return "";
    const match = skillMd.match(/^summary:\s*"?([^"\n]+)"?/m);
    return match?.[1]?.trim() || "";
  }, [skillMd]);

  // Status from registry
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

  const handleSelectFile = useCallback((path: string) => {
    if (isDirty && !confirm("You have unsaved changes. Discard?")) return;
    setSelectedPath(path);
    setViewMode("rendered");
    setIsDirty(false);
  }, [isDirty]);

  const handleEdit = () => {
    setEditContent(fileContent || "");
    setIsDirty(false);
    setViewMode("edit");
  };

  const handleSave = () => {
    writeFile.mutate(
      { path: selectedPath, content: editContent },
      { onSuccess: () => { setIsDirty(false); setViewMode("rendered"); } }
    );
  };

  const handleCopy = () => {
    if (fileContent) navigator.clipboard.writeText(fileContent);
  };

  const handleBack = () => {
    if (isDirty && !confirm("You have unsaved changes. Discard?")) return;
    onBack();
  };

  const selectedFileName = selectedPath.split("/").pop() || "";
  const isMarkdown = selectedFileName.endsWith(".md");
  const isHtml = selectedFileName.endsWith(".html");
  const isExcalidraw = selectedFileName.endsWith(".excalidraw");

  // Sidebar width
  const [sidebarWidth, setSidebarWidth] = useState(180);
  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: PointerEvent) => {
      setSidebarWidth(Math.max(120, Math.min(300, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }, [sidebarWidth]);

  // HTML iframe sizing
  const iframeSrcDoc = useMemo(() => {
    if (!fileContent || !isHtml) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    if (fileContent.includes("</head>")) return fileContent.replace("</head>", `${overrideStyle}</head>`);
    return overrideStyle + fileContent;
  }, [fileContent, isHtml]);

  const [iframeHeight, setIframeHeight] = useState(500);
  const iframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    iframe.addEventListener("load", () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) setIframeHeight(doc.body.scrollHeight + 20);
      } catch { /* cross-origin */ }
    });
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
            >
              <ChevronLeft size={14} />
              Back
            </button>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {title}
            </span>
            <span className="text-xs text-zinc-400 font-mono flex-shrink-0">
              {skillName}
            </span>
            {/* Status badge */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium transition-colors",
                  SKILL_STATUS_CONFIG[currentStatus].badge,
                  SKILL_STATUS_CONFIG[currentStatus].text,
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", SKILL_STATUS_CONFIG[currentStatus].dot)} />
                {SKILL_STATUS_CONFIG[currentStatus].label}
                <ChevronDown size={8} />
              </button>
              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-50">
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
                </>
              )}
            </div>
            {lastRevised && (
              <span className="text-xs text-zinc-400 flex-shrink-0">revised {relativeDate(lastRevised)}</span>
            )}
            {usage && (usage.invocations > 0 || usage.mentions > 0) && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 tabular-nums flex-shrink-0">
                {usage.invocations > 0 ? `${usage.invocations} invoked` : ""}
                {usage.invocations > 0 && usage.mentions > 0 ? " · " : ""}
                {usage.mentions > 0 ? `${usage.mentions} mentioned` : ""}
              </span>
            )}
          </div>
        </div>
        {summary && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1 ml-[60px]">{summary}</p>
        )}
      </div>

      {/* Body: tree + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: file tree */}
        <div
          className="flex-shrink-0 overflow-y-auto border-r border-zinc-100 dark:border-zinc-800/50 py-1"
          style={{ width: sidebarWidth }}
        >
          {loadingTree ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={14} className="animate-spin text-zinc-400" />
            </div>
          ) : tree?.children ? (
            tree.children.map((node) => (
              <FileTreeRow
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                onSelect={(file) => handleSelectFile(file.path)}
              />
            ))
          ) : null}
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={handleResizePointerDown}
          className="w-1.5 flex-shrink-0 cursor-col-resize hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors touch-none"
        />

        {/* Right: content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex-shrink-0 px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
            <span className="text-xs text-zinc-500 font-mono truncate">{selectedFileName}</span>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {viewMode === "edit" ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty || writeFile.isPending}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                      isDirty ? "bg-teal-500 text-white hover:bg-teal-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
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
                    <IconButton icon={Eye} label="Preview" size={14} onClick={() => setViewMode("rendered")} className="text-zinc-400" />
                  )}
                  {!isExcalidraw && (
                    <IconButton icon={Pencil} label="Edit" size={14} onClick={handleEdit} className="text-zinc-400" />
                  )}
                  <IconButton icon={Copy} label="Copy" size={14} onClick={handleCopy} className="text-zinc-400" />
                </>
              )}
              {isDirty && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 ml-1">Unsaved</span>
              )}
            </div>
          </div>

          {/* Content */}
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
                <MarkdownViewer content={fileContent} filename={selectedFileName} basePath={skillPath} />
              </div>
            ) : isExcalidraw && fileContent ? (
              <ExcalidrawViewer content={fileContent} filename={selectedFileName} />
            ) : isHtml && fileContent ? (
              <iframe
                ref={iframeRef}
                srcDoc={iframeSrcDoc}
                className="w-full border-0"
                sandbox="allow-same-origin allow-scripts"
                title={selectedFileName}
                style={{ height: iframeHeight }}
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
  );
}

// ─── File Tree ───────────────────────────────────────────────────────────────

function FileTreeRow({ node, depth, selectedPath, onSelect }: {
  node: TreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (file: TreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.is_directory && node.children && node.children.length > 0;
  const isSelected = !node.is_directory && selectedPath === node.path;

  return (
    <>
      <button
        onClick={() => {
          if (node.is_directory) setExpanded(!expanded);
          else onSelect(node);
        }}
        className={cn(
          "w-full flex items-center gap-1.5 py-1 text-left transition-colors",
          isSelected
            ? "bg-teal-50 dark:bg-teal-900/30"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        )}
        style={{ paddingLeft: `${12 + depth * 14}px`, paddingRight: 8 }}
      >
        {node.is_directory ? (
          <>
            <ChevronDown
              size={10}
              className={cn("text-zinc-400 flex-shrink-0 transition-transform", !expanded && "-rotate-90")}
            />
            <FolderOpen size={13} className="text-amber-500 flex-shrink-0" />
          </>
        ) : (
          <>
            <span className="w-2.5 flex-shrink-0" />
            <FileIcon name={node.name} isSelected={isSelected} />
          </>
        )}
        <span className={cn(
          "text-xs truncate",
          isSelected ? "text-teal-700 dark:text-teal-400 font-medium" : "text-zinc-700 dark:text-zinc-300"
        )}>
          {node.name.endsWith(".excalidraw") ? node.name.replace(".excalidraw", "") + "..." : node.name}
        </span>
      </button>
      {expanded && hasChildren && node.children!.map((child) => (
        <FileTreeRow key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </>
  );
}

function FileIcon({ name, isSelected }: { name: string; isSelected: boolean }) {
  if (name.endsWith(".excalidraw")) {
    return <PenTool size={13} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-violet-400")} />;
  }
  if (name.endsWith(".md")) {
    return <FileText size={13} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-blue-400")} />;
  }
  if (name.endsWith(".html")) {
    return <FileText size={13} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-orange-400")} />;
  }
  return <FileText size={13} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-zinc-400")} />;
}
