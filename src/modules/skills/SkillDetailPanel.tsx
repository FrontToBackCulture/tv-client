// src/modules/skills/SkillDetailPanel.tsx
// Right panel — tabbed view: Overview (rendered markdown), Files, Distribution

import { useState, useMemo, useCallback } from "react";
import {
  X, FileText, FolderOpen, ArrowDownToLine, ArrowUpFromLine,
  CheckCircle2, AlertTriangle, Circle, Loader2, ExternalLink,
  Send, Bot, Boxes, ChevronDown, ChevronRight, BookOpen, Files, GitBranch,
  Tag, Terminal, Globe, LayoutTemplate, PenTool,
} from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import { SectionLoading } from "../../components/ui/DetailStates";
import { cn } from "../../lib/cn";
import { useFileTree, useReadFile, type TreeNode } from "../../hooks/useFiles";
import { useRepository } from "../../stores/repositoryStore";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { ExcalidrawViewer } from "../library/viewers/ExcalidrawViewer";
import {
  type SkillEntry,
  type SkillRegistry,
  type SkillDriftStatus,
  useSkillDistribute,
  useSkillPull,
  useSkillDistributeTo,
  useSkillListBots,
  useSkillRegistryUpdate,
} from "./useSkillRegistry";
import { SKILL_STATUS_CONFIG, type SkillStatus } from "../../playground/botPlaygroundTypes";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SkillDetailPanelProps {
  slug: string;
  skill: SkillEntry;
  registry: SkillRegistry;
  driftStatuses: SkillDriftStatus[];
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}

type DetailTab = "overview" | "diagram" | "templates" | "files" | "distribution";

const statusConfig: Record<string, { icon: typeof CheckCircle2; label: string; color: string }> = {
  in_sync: { icon: CheckCircle2, label: "In sync", color: "text-emerald-500" },
  source_updated: { icon: AlertTriangle, label: "Source updated", color: "text-amber-500" },
  target_modified: { icon: AlertTriangle, label: "Target modified", color: "text-amber-500" },
  not_distributed: { icon: Circle, label: "Not distributed", color: "text-zinc-400" },
  missing: { icon: Circle, label: "Missing", color: "text-red-400" },
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function SkillDetailPanel({ slug, skill, registry, driftStatuses, onClose, onOpenFile }: SkillDetailPanelProps) {
  const { activeRepository } = useRepository();
  const skillPath = activeRepository ? `${activeRepository.path}/_skills/${slug}` : undefined;
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const registryUpdate = useSkillRegistryUpdate();

  // Read recursive file tree
  const { data: tree } = useFileTree(skillPath, 3);

  // Flatten tree for counting and finding files
  const allFiles = useMemo(() => {
    if (!tree?.children) return [];
    return flattenTree(tree.children);
  }, [tree]);

  // Determine which markdown to show: README.md if it exists, else SKILL.md
  const readmePath = useMemo(() => {
    if (!skillPath || !tree?.children) return undefined;
    const hasReadme = tree.children.some(f => f.name === "README.md");
    if (hasReadme) return `${skillPath}/README.md`;
    const hasSkill = tree.children.some(f => f.name === "SKILL.md");
    if (hasSkill) return `${skillPath}/SKILL.md`;
    return undefined;
  }, [skillPath, tree]);

  const { data: markdownContent } = useReadFile(readmePath);

  // Find example/template files (html, md in templates/ or playbooks/, output files)
  const exampleFiles = useMemo(() => {
    return allFiles.filter(f => {
      if (f.is_directory) return false;
      const rel = skillPath ? f.path.replace(skillPath + "/", "") : f.name;
      // Templates, playbooks, example outputs
      if (rel.startsWith("templates/") || rel.startsWith("playbooks/") || rel.startsWith("demo/") || rel.startsWith("examples/")) return true;
      // Standalone html/example files (not README or SKILL)
      if (f.name.endsWith(".html") && f.name !== "index.html") return true;
      if (f.name.startsWith("example") || f.name.startsWith("output") || f.name.startsWith("sample")) return true;
      return false;
    });
  }, [allFiles, skillPath]);

  // Find diagram files (.excalidraw)
  const diagramFiles = useMemo(() => {
    return allFiles.filter(f => !f.is_directory && f.name.endsWith(".excalidraw"));
  }, [allFiles]);

  const fileCount = allFiles.length;
  const distCount = skill.distributions.length;

  const handleStatusChange = (newStatus: SkillStatus) => {
    const updated: SkillRegistry = {
      ...registry,
      updated: new Date().toISOString(),
      skills: {
        ...registry.skills,
        [slug]: { ...skill, status: newStatus },
      },
    };
    registryUpdate.mutate(updated);
    setShowStatusMenu(false);
  };

  const currentStatus = skill.status as SkillStatus;
  const statusCfg = SKILL_STATUS_CONFIG[currentStatus] ?? SKILL_STATUS_CONFIG.active;

  return (
    <div className="h-full flex flex-col">
      {/* ── Header: name + status + metadata chips ── */}
      <div className="flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50">
        {/* Top row: title + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {skill.name}
            </span>
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium transition-colors",
                  statusCfg.badge,
                  statusCfg.text,
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
                {statusCfg.label}
                <ChevronDown size={8} />
              </button>
              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-50">
                    {(["active", "test", "review", "draft", "inactive", "deprecated"] as SkillStatus[]).map((s) => {
                      const cfg = SKILL_STATUS_CONFIG[s];
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={cn(
                            "w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700",
                            s === currentStatus && "bg-zinc-50 dark:bg-zinc-700"
                          )}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                          <span className="text-zinc-700 dark:text-zinc-300">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {/* Metadata chips */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
          <MetaChip icon={Tag} label={skill.category} />
          <MetaChip icon={skill.target === "bot" ? Bot : Boxes} label={skill.target} />
          {skill.command && <MetaChip icon={Terminal} label={skill.command} mono />}
          {skill.domain && <MetaChip icon={Globe} label={skill.domain} />}
          {skill.verified && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <CheckCircle2 size={10} />
              verified{skill.rating != null && ` · ${skill.rating}/10`}
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 px-4">
          <TabBtn active={activeTab === "overview"} onClick={() => setActiveTab("overview")} icon={BookOpen} label="Overview" />
          {diagramFiles.length > 0 && (
            <TabBtn active={activeTab === "diagram"} onClick={() => setActiveTab("diagram")} icon={PenTool} label="Diagram" badge={diagramFiles.length} />
          )}
          {exampleFiles.length > 0 && (
            <TabBtn active={activeTab === "templates"} onClick={() => setActiveTab("templates")} icon={LayoutTemplate} label="Templates" badge={exampleFiles.length} />
          )}
          <TabBtn active={activeTab === "files"} onClick={() => setActiveTab("files")} icon={Files} label="Files" badge={fileCount} />
          <TabBtn active={activeTab === "distribution"} onClick={() => setActiveTab("distribution")} icon={GitBranch} label="Distribution" badge={distCount} />
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "overview" && (
          <OverviewTab
            markdownContent={markdownContent}
            basePath={skillPath}
            slug={slug}
            description={skill.description}
          />
        )}
        {activeTab === "diagram" && (
          <DiagramTab
            diagramFiles={diagramFiles}
            skillPath={skillPath}
          />
        )}
        {activeTab === "templates" && (
          <TemplatesTab
            exampleFiles={exampleFiles}
            skillPath={skillPath}
            onOpenFile={onOpenFile}
          />
        )}
        {activeTab === "files" && (
          <FilesTab tree={tree} skillPath={skillPath} onOpenFile={onOpenFile} />
        )}
        {activeTab === "distribution" && (
          <DistributionTab
            slug={slug}
            skill={skill}
            driftStatuses={driftStatuses}
            skillPath={skillPath}
            onOpenFile={onOpenFile}
          />
        )}
      </div>
    </div>
  );
}

// ─── Shared Sub-components ───────────────────────────────────────────────────

function MetaChip({ icon: Icon, label, mono }: { icon: typeof Tag; label: string; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
      <Icon size={10} className="flex-shrink-0" />
      <span className={mono ? "font-mono" : ""}>{label}</span>
    </span>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, badge }: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-2 text-xs border-b-2 transition-colors",
        active
          ? "border-teal-500 text-teal-600 dark:text-teal-400 font-medium"
          : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      )}
    >
      <Icon size={13} />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="text-xs text-zinc-400">{badge}</span>
      )}
    </button>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ markdownContent, basePath, slug, description }: {
  markdownContent: string | undefined;
  basePath: string | undefined;
  slug: string;
  description: string;
}) {
  if (!markdownContent) {
    return (
      <div className="px-4 py-6 text-center">
        <BookOpen size={24} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{description}</p>
        <p className="text-xs text-zinc-400">
          Add a README.md to <code className="font-mono">_skills/{slug}/</code> for a richer overview.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <MarkdownViewer content={markdownContent} basePath={basePath} />
    </div>
  );
}

// ─── Diagram Tab ────────────────────────────────────────────────────────────

function DiagramTab({ diagramFiles, skillPath }: {
  diagramFiles: TreeNode[];
  skillPath: string | undefined;
}) {
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(
    () => diagramFiles[0] ?? null
  );

  const { data: fileContent } = useReadFile(selectedFile?.path);

  return (
    <div className="flex flex-col h-full">
      {/* File selector if multiple diagrams */}
      {diagramFiles.length > 1 && (
        <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50 overflow-x-auto">
          {diagramFiles.map((f) => {
            const rel = skillPath ? f.path.replace(skillPath + "/", "") : f.name;
            const isSelected = selectedFile?.path === f.path;
            return (
              <button
                key={f.path}
                onClick={() => setSelectedFile(f)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs whitespace-nowrap transition-colors",
                  isSelected
                    ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 font-medium"
                    : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                <PenTool size={12} className="flex-shrink-0" />
                {rel.replace(".excalidraw", "")}
              </button>
            );
          })}
        </div>
      )}

      {/* Render area */}
      <div className="flex-1 overflow-auto">
        {selectedFile && fileContent ? (
          <ExcalidrawViewer content={fileContent} filename={selectedFile.name} />
        ) : selectedFile ? (
          <SectionLoading className="py-6" />
        ) : (
          <div className="px-4 py-6 text-center text-xs text-zinc-400">
            No diagram selected
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Templates Tab ──────────────────────────────────────────────────────────

function TemplatesTab({ exampleFiles, skillPath, onOpenFile }: {
  exampleFiles: TreeNode[];
  skillPath: string | undefined;
  onOpenFile?: (path: string) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(
    () => exampleFiles[0] ?? null
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["customer", "template"]));

  const { data: fileContent } = useReadFile(selectedFile?.path);

  // Inject CSS override so HTML content reflows to fit the panel width
  const iframeSrcDoc = useMemo(() => {
    if (!fileContent || !selectedFile?.name.endsWith(".html")) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    // Inject before </head> if present, otherwise prepend
    if (fileContent.includes("</head>")) {
      return fileContent.replace("</head>", `${overrideStyle}</head>`);
    }
    return overrideStyle + fileContent;
  }, [fileContent, selectedFile]);

  const [iframeHeight, setIframeHeight] = useState(500);

  const iframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          setIframeHeight(doc.body.scrollHeight + 20);
        }
      } catch { /* cross-origin safety */ }
    };
    iframe.addEventListener("load", handleLoad);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* File selector bar — grouped by folder */}
      <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50 overflow-x-auto flex-nowrap">
        {(() => {
          // Group files by category based on parent folder
          const byCategory = new Map<string, TreeNode[]>();

          for (const f of exampleFiles) {
            const rel = skillPath ? f.path.replace(skillPath + "/", "") : f.name;
            let cat = "other";
            if (rel.startsWith("examples/")) cat = "customer";
            else if (rel.startsWith("demo/")) cat = "demo";
            else if (rel.startsWith("templates/") || rel.startsWith("playbooks/")) cat = "template";
            else if (f.name.includes("template") || f.name.includes("Template")) cat = "template";
            else if (f.name.startsWith("sample") || f.name.startsWith("example") || f.name.startsWith("output")) cat = "demo";
            if (!byCategory.has(cat)) byCategory.set(cat, []);
            byCategory.get(cat)!.push(f);
          }

          const categoryConfig: Record<string, { label: string; color: string }> = {
            customer: { label: "Customer", color: "text-emerald-500" },
            demo: { label: "Demo", color: "text-amber-500" },
            template: { label: "Template", color: "text-violet-500" },
            other: { label: "", color: "text-zinc-400" },
          };

          const order = ["customer", "demo", "template", "other"];
          return order.filter(k => byCategory.has(k)).map(cat => {
            const cfg = categoryConfig[cat];
            const files = byCategory.get(cat)!;
            const isCollapsed = collapsedGroups.has(cat);
            const toggleCollapse = () => {
              setCollapsedGroups(prev => {
                const next = new Set(prev);
                if (next.has(cat)) next.delete(cat);
                else next.add(cat);
                return next;
              });
            };
            return (
              <div key={cat} className="flex items-center gap-1">
                {cfg.label && (
                  <button
                    onClick={toggleCollapse}
                    className={cn("flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wider mr-1 hover:opacity-70 transition-opacity", cfg.color)}
                  >
                    {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                    {cfg.label}
                    {isCollapsed && <span className="text-xs font-normal normal-case tracking-normal opacity-60 ml-0.5">({files.length})</span>}
                  </button>
                )}
                <div className={cn("flex items-center gap-1 overflow-hidden transition-all duration-150", isCollapsed ? "max-w-0 opacity-0" : "max-w-[2000px] opacity-100")}>
                  {files.map((f) => {
                    const isSelected = selectedFile?.path === f.path;
                    return (
                      <button
                        key={f.path}
                        onClick={() => setSelectedFile(f)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs whitespace-nowrap transition-colors",
                          isSelected
                            ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 font-medium"
                            : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-700 dark:hover:text-zinc-300"
                        )}
                      >
                        <FileText size={12} className="flex-shrink-0" />
                        {f.name}
                      </button>
                    );
                  })}
                </div>
                <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1 last:hidden" />
              </div>
            );
          });
        })()}
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto">
        {!selectedFile && (
          <div className="px-4 py-6 text-center text-xs text-zinc-400">
            Select a file to preview
          </div>
        )}

        {selectedFile && !fileContent && (
          <SectionLoading className="py-6" />
        )}

        {selectedFile && fileContent && (
          <>
            {selectedFile.name.endsWith(".html") ? (
              <iframe
                ref={iframeRef}
                srcDoc={iframeSrcDoc}
                className="w-full border-0"
                sandbox="allow-same-origin allow-scripts"
                title={selectedFile.name}
                style={{ height: iframeHeight }}
              />
            ) : selectedFile.name.endsWith(".md") ? (
              <div className="px-4 py-3">
                <MarkdownViewer content={fileContent} basePath={skillPath} />
              </div>
            ) : (
              /* Raw text preview for .sh, .sql, .json, etc. */
              <pre className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap overflow-auto">
                {fileContent}
              </pre>
            )}

            {/* Open file button */}
            {onOpenFile && (
              <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800/50">
                <Button
                  variant="ghost"
                  icon={ExternalLink}
                  onClick={() => onOpenFile(selectedFile.path)}
                  className="text-xs"
                >
                  Open in editor
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Files Tab ───────────────────────────────────────────────────────────────

function FilesTab({ tree, skillPath }: {
  tree: TreeNode | undefined;
  skillPath: string | undefined;
  onOpenFile?: (path: string) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null);
  const { data: fileContent } = useReadFile(selectedFile?.path);

  const iframeSrcDoc = useMemo(() => {
    if (!fileContent || !selectedFile?.name.endsWith(".html")) return undefined;
    const overrideStyle = `<style>body,body>*{max-width:100%!important;width:100%!important;box-sizing:border-box!important}body{margin:0!important;padding:1rem!important;overflow-x:hidden!important}img,table,pre{max-width:100%!important}</style>`;
    if (fileContent.includes("</head>")) {
      return fileContent.replace("</head>", `${overrideStyle}</head>`);
    }
    return overrideStyle + fileContent;
  }, [fileContent, selectedFile]);

  const [iframeHeight, setIframeHeight] = useState(500);

  const iframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          setIframeHeight(doc.body.scrollHeight + 20);
        }
      } catch { /* cross-origin safety */ }
    };
    iframe.addEventListener("load", handleLoad);
  }, []);

  if (!tree?.children || tree.children.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-zinc-400">
        No files
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* File tree */}
      <div className={cn(
        "flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800/50 py-1",
        selectedFile && "max-h-[200px] overflow-y-auto"
      )}>
        {tree.children.map((node) => (
          <FileTreeRow
            key={node.path}
            node={node}
            depth={0}
            skillPath={skillPath}
            selectedPath={selectedFile?.path}
            onSelect={(file) => setSelectedFile(file)}
          />
        ))}
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto">
        {!selectedFile && (
          <div className="px-4 py-6 text-center text-xs text-zinc-400">
            Click a file to preview
          </div>
        )}

        {selectedFile && !fileContent && (
          <SectionLoading className="py-6" />
        )}

        {selectedFile && fileContent && (
          <>
            {selectedFile.name.endsWith(".html") ? (
              <iframe
                ref={iframeRef}
                srcDoc={iframeSrcDoc}
                className="w-full border-0"
                sandbox="allow-same-origin allow-scripts"
                title={selectedFile.name}
                style={{ height: iframeHeight }}
              />
            ) : selectedFile.name.endsWith(".md") ? (
              <div className="px-4 py-3">
                <MarkdownViewer content={fileContent} basePath={skillPath} />
              </div>
            ) : selectedFile.name.endsWith(".excalidraw") ? (
              <ExcalidrawViewer content={fileContent} filename={selectedFile.name} />
            ) : (
              <pre className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap overflow-auto">
                {fileContent}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FileTreeRow({ node, depth, skillPath, selectedPath, onSelect }: {
  node: TreeNode;
  depth: number;
  skillPath: string | undefined;
  selectedPath?: string;
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
          "w-full flex items-center gap-2 py-1.5 text-left transition-colors",
          isSelected
            ? "bg-teal-50 dark:bg-teal-900/30"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        )}
        style={{ paddingLeft: `${16 + depth * 16}px`, paddingRight: 16 }}
      >
        {node.is_directory ? (
          <>
            <ChevronDown
              size={12}
              className={cn(
                "text-zinc-400 flex-shrink-0 transition-transform",
                !expanded && "-rotate-90"
              )}
            />
            <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
          </>
        ) : (
          <>
            <span className="w-3 flex-shrink-0" />
            <FileText size={14} className={cn("flex-shrink-0", isSelected ? "text-teal-600" : "text-zinc-400")} />
          </>
        )}
        <span className={cn(
          "text-xs truncate",
          isSelected ? "text-teal-700 dark:text-teal-400 font-medium" : "text-zinc-700 dark:text-zinc-300"
        )}>{node.name}</span>
      </button>
      {expanded && hasChildren && node.children!.map((child) => (
        <FileTreeRow key={child.path} node={child} depth={depth + 1} skillPath={skillPath} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children) result.push(...flattenTree(node.children));
  }
  return result;
}

// ─── Distribution Tab ────────────────────────────────────────────────────────

function DistributionTab({ slug, skill, driftStatuses, skillPath, onOpenFile }: {
  slug: string;
  skill: SkillEntry;
  driftStatuses: SkillDriftStatus[];
  skillPath: string | undefined;
  onOpenFile?: (path: string) => void;
}) {
  const { data: bots = [] } = useSkillListBots();
  const distribute = useSkillDistribute();
  const distributeTo = useSkillDistributeTo();
  const pull = useSkillPull();
  const [actionSlug, setActionSlug] = useState<string | null>(null);
  const [showDistributeMenu, setShowDistributeMenu] = useState(false);

  const handleDistributeAll = async () => {
    setActionSlug("distribute");
    try { await distribute.mutateAsync(slug); } finally { setActionSlug(null); }
  };

  const handleDistributeToBot = async (botSkillsPath: string) => {
    setActionSlug("distribute-to");
    setShowDistributeMenu(false);
    try { await distributeTo.mutateAsync({ slug, targetPath: botSkillsPath, distType: "bot" }); } finally { setActionSlug(null); }
  };

  // Platform distribution removed — _skills/ is now the single source, no 0_Platform/skills/ copy needed

  const handlePull = async (targetPath: string) => {
    setActionSlug(`pull:${targetPath}`);
    try { await pull.mutateAsync({ slug, targetPath }); } finally { setActionSlug(null); }
  };

  const handlePush = async (targetPath: string, distType: "bot" | "platform") => {
    setActionSlug(`push:${targetPath}`);
    try { await distributeTo.mutateAsync({ slug, targetPath, distType }); } finally { setActionSlug(null); }
  };

  // Merge registered distributions with discovered-but-unregistered copies
  const registeredPaths = new Set(skill.distributions.map(d => d.path));
  const discoveredDrifts = driftStatuses.filter(
    d => d.slug === slug && !registeredPaths.has(d.distribution_path)
  );

  // All distribution entries: registered + discovered
  const allDistributions = useMemo(() => {
    const registered = skill.distributions.map(d => ({
      path: d.path,
      type: d.type,
      isRegistered: true,
    }));
    const discovered = discoveredDrifts.map(d => ({
      path: d.distribution_path,
      type: d.distribution_path.startsWith("0_Platform/") ? "platform" : "bot",
      isRegistered: false,
    }));
    return [...registered, ...discovered];
  }, [skill.distributions, discoveredDrifts, slug]);

  // For "Distribute to..." menu: which bots/platform already have this skill
  const distributedBotPaths = new Set(
    allDistributions
      .filter(d => d.type === "bot")
      .map(d => { const p = d.path.split("/"); p.pop(); return p.join("/"); })
  );
  return (
    <div>
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
        {allDistributions.filter(d => d.isRegistered).length > 0 && (
          <Button
            onClick={handleDistributeAll}
            disabled={actionSlug !== null}
            loading={actionSlug === "distribute"}
            icon={ArrowDownToLine}
          >
            Distribute All
          </Button>
        )}

        <div className="relative">
          <Button
            variant="secondary"
            onClick={() => setShowDistributeMenu(!showDistributeMenu)}
            disabled={actionSlug !== null}
            loading={actionSlug === "distribute-to"}
            icon={Send}
            iconRight={ChevronDown}
          >
            Distribute to...
          </Button>

          {showDistributeMenu && (
            <DistributeMenu
              bots={bots}
              distributedBotPaths={distributedBotPaths}
              onSelectBot={handleDistributeToBot}
              onClose={() => setShowDistributeMenu(false)}
            />
          )}
        </div>

        {onOpenFile && skillPath && (
          <Button
            variant="secondary"
            icon={ExternalLink}
            onClick={() => onOpenFile(`${skillPath}/SKILL.md`)}
          >
            Edit SKILL.md
          </Button>
        )}
      </div>

      {/* Distribution targets */}
      {allDistributions.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {allDistributions.map((dist) => {
            const drift = driftStatuses.find(d => d.distribution_path === dist.path);
            const cfg = statusConfig[drift?.status || "not_distributed"];
            const StatusIcon = cfg.icon;

            const distType = dist.type === "platform" ? "platform" as const : "bot" as const;
            const isPushing = actionSlug === `push:${dist.path}`;
            const isPulling = actionSlug === `pull:${dist.path}`;
            const isBusy = actionSlug !== null;
            const notInSync = drift?.status && drift.status !== "in_sync";

            return (
              <div key={dist.path} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <StatusIcon size={14} className={cfg.color} />
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{cfg.label}</span>
                  <span className="text-xs px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                    {dist.type}
                  </span>
                  {!dist.isRegistered && (
                    <span className="text-xs px-1 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                      discovered
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 font-mono ml-[22px]">{dist.path}</p>

                {/* Action buttons: push + pull */}
                <div className="mt-1.5 ml-[22px] flex items-center gap-3">
                  <button
                    onClick={() => handlePush(dist.path, distType)}
                    disabled={isBusy}
                    className={cn(
                      "flex items-center gap-1 text-xs disabled:opacity-50",
                      notInSync
                        ? "text-teal-600 hover:text-teal-500"
                        : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    )}
                  >
                    {isPushing ? <Loader2 size={11} className="animate-spin" /> : <ArrowDownToLine size={11} />}
                    Push to target
                  </button>
                  <button
                    onClick={() => handlePull(dist.path)}
                    disabled={isBusy}
                    className={cn(
                      "flex items-center gap-1 text-xs disabled:opacity-50",
                      drift?.status === "target_modified"
                        ? "text-amber-600 hover:text-amber-500"
                        : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    )}
                  >
                    {isPulling ? <Loader2 size={11} className="animate-spin" /> : <ArrowUpFromLine size={11} />}
                    Pull to source
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-zinc-400">
          No targets yet. Use "Distribute to..." to push this skill to a bot or platform.
        </div>
      )}
    </div>
  );
}

// ─── Distribute Menu ─────────────────────────────────────────────────────────

function DistributeMenu({
  bots,
  distributedBotPaths,
  onSelectBot,
  onClose,
}: {
  bots: { name: string; label: string; skills_path: string; has_skills_dir: boolean }[];
  distributedBotPaths: Set<string>;
  onSelectBot: (skillsPath: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-xl py-1">
        <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Bots</div>
        {bots.map((bot) => {
          const alreadyDistributed = distributedBotPaths.has(bot.skills_path);
          return (
            <button
              key={bot.skills_path}
              onClick={() => onSelectBot(bot.skills_path)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left"
            >
              <Bot size={14} className="text-zinc-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-zinc-700 dark:text-zinc-300">{bot.label}</span>
                {!bot.has_skills_dir && <span className="ml-1 text-xs text-zinc-400">(no skills/ yet)</span>}
              </div>
              {alreadyDistributed && <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />}
            </button>
          );
        })}
        {bots.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">No bots found</p>}
      </div>
    </>
  );
}
