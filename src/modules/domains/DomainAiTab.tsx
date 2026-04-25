// DomainAiTab — Single-page view of the domain AI package.
// Top: package status + Generate/Push actions.
// Middle: assigned skills table with per-skill publish status.
// Below: collapsible instructions.md, custom.md, and S3 files sections.

import { formatError } from "@/lib/formatError";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Loader2,
  Sparkles,
  Check,
  Package,
  CloudUpload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  BadgeCheck,
  FileText,
  File,
  Folder,
  FolderOpen,
  Cloud,
  Pencil,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { SectionLoading } from "../../components/ui/DetailStates";
import { useListDirectory, useReadFile, useWriteFile } from "../../hooks/useFiles";
import { MarkdownViewer } from "../library/MarkdownViewer";
import { usePrimaryKnowledgePaths } from "../../hooks/useKnowledgePaths";
import {
  useGenerateAiPackage,
  useSaveDomainAiConfig,
  useSyncAiToS3,
  useS3AiStatus,
  type S3FileStatus,
} from "../../hooks/val-sync";
import { useSkillCheckAll, type SkillCategory } from "../skills/useSkillRegistry";
import { useSkills } from "../../hooks/skills/useSkills";
import { SkillAssignmentGrid } from "../../components/SkillAssignmentGrid";
import { DriftDiffModal, DriftBadge } from "../../components/DriftDiffModal";
import { useQueryClient } from "@tanstack/react-query";

interface DomainAiTabProps {
  aiPath: string;
  domainName: string;
  globalPath: string;
}

type SkillPublishStatus = "published" | "needs_push" | "not_generated";

export function DomainAiTab({ aiPath, domainName, globalPath }: DomainAiTabProps) {
  const { data: supabaseSkills = [] } = useSkills();

  const AVAILABLE_AI_SKILLS = useMemo(() => {
    return supabaseSkills
      .filter((s) => (s.target === "platform" || s.target === "both") && s.status !== "deleted" && s.status !== "inactive" && s.status !== "deprecated")
      .map((s) => s.slug)
      .sort();
  }, [supabaseSkills]);

  const categories = useMemo<SkillCategory[]>(() => {
    const catSet = new Set<string>();
    for (const s of supabaseSkills) {
      if (s.category) catSet.add(s.category);
    }
    return [...catSet].sort().map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, " ") }));
  }, [supabaseSkills]);

  const skillEntries = useMemo(() => {
    const map: Record<string, { name: string; category: string; description?: string; target?: string; verified?: boolean }> = {};
    for (const s of supabaseSkills) {
      map[s.slug] = { name: s.name, category: s.category, description: s.description, target: s.target, verified: s.verified };
    }
    return map;
  }, [supabaseSkills]);

  const paths = usePrimaryKnowledgePaths();
  const queryClient = useQueryClient();
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [showS3Files, setShowS3Files] = useState(false);
  const [driftModal, setDriftModal] = useState<{ slug: string; name: string; targetPath: string } | null>(null);
  const [showAssignSkills, setShowAssignSkills] = useState(false);

  const { data: driftStatuses = [] } = useSkillCheckAll();
  const domainSkillsRelPath = paths
    ? (() => {
        const repoPath = paths.base;
        const fullSkillsPath = `${aiPath}/skills`;
        return fullSkillsPath.startsWith(repoPath) ? fullSkillsPath.slice(repoPath.length + 1) : null;
      })()
    : null;

  const driftBySlug = useMemo(() => {
    const map = new Map<string, { status: string; source_modified: string; target_modified: string }>();
    if (!domainSkillsRelPath) return map;
    const prefix = domainSkillsRelPath + "/";
    for (const d of driftStatuses) {
      if (d.distribution_path.startsWith(prefix)) {
        map.set(d.slug, { status: d.status, source_modified: d.source_modified, target_modified: d.target_modified });
      }
    }
    return map;
  }, [driftStatuses, domainSkillsRelPath]);

  const centralSkillsPath = paths ? paths.skills : null;
  const templatesPath = paths
    ? `${paths.base}/_team/melvin/bot-mel/skills/ai-project-generator/templates`
    : null;

  const skillsPath = `${aiPath}/skills`;
  const instructionsPath = `${aiPath}/instructions.md`;
  const customPath = `${aiPath}/custom.md`;
  const configPath = `${aiPath}/ai_config.json`;

  const aiDir = useListDirectory(aiPath);
  const skillsDir = useListDirectory(skillsPath);
  const instructionsFile = useReadFile(instructionsPath);
  const customFile = useReadFile(customPath);
  const configFile = useReadFile(configPath);

  const generateMutation = useGenerateAiPackage();
  const saveConfigMutation = useSaveDomainAiConfig();
  const s3SyncMutation = useSyncAiToS3();
  const s3Status = useS3AiStatus(domainName, globalPath);

  const configuredSkills = useMemo(() => {
    if (!configFile.data) return [] as string[];
    try {
      const parsed = JSON.parse(configFile.data);
      return ((parsed.skills ?? []) as string[]).filter((s) => AVAILABLE_AI_SKILLS.includes(s));
    } catch {
      return [] as string[];
    }
  }, [configFile.data, AVAILABLE_AI_SKILLS]);

  const [localSkills, setLocalSkills] = useState<string[] | null>(null);
  const selectedSkills = localSkills ?? configuredSkills;

  const configKey = configuredSkills.join(",");
  const [lastConfigKey, setLastConfigKey] = useState("");
  if (configKey !== lastConfigKey) {
    setLastConfigKey(configKey);
    setLocalSkills(null);
  }

  const handleSkillToggle = useCallback(
    (skill: string) => {
      const current = localSkills ?? configuredSkills;
      const next = current.includes(skill)
        ? current.filter((s) => s !== skill)
        : [...current, skill];
      setLocalSkills(next);
      saveConfigMutation.mutate({ domain: domainName, skills: next });
    },
    [localSkills, configuredSkills, domainName, saveConfigMutation]
  );

  const handleGenerate = useCallback(() => {
    if (!centralSkillsPath || !templatesPath) return;
    generateMutation.mutate(
      { domain: domainName, skillsPath: centralSkillsPath, templatesPath, skills: selectedSkills },
      { onSuccess: () => { configFile.refetch(); skillsDir.refetch(); instructionsFile.refetch(); customFile.refetch(); aiDir.refetch(); } }
    );
  }, [domainName, centralSkillsPath, templatesPath, selectedSkills, generateMutation, configFile, skillsDir, instructionsFile, customFile, aiDir]);

  const locallyGeneratedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const f of skillsDir.data ?? []) {
      if (f.is_directory && !f.name.startsWith(".")) set.add(f.name);
    }
    return set;
  }, [skillsDir.data]);

  const s3FileMap = useMemo(() => {
    const map = new Map<string, S3FileStatus>();
    if (!s3Status.data?.files) return map;
    for (const f of s3Status.data.files) {
      map.set(f.path, f);
    }
    return map;
  }, [s3Status.data]);

  const skillRows = useMemo(() => {
    return selectedSkills.map((slug) => {
      const s3Info = s3FileMap.get(`skills/${slug}/SKILL.md`);
      const inLocal = locallyGeneratedSlugs.has(slug);
      const inS3 = !!s3Info?.in_s3;
      let status: SkillPublishStatus;
      if (inS3) status = "published";
      else if (inLocal) status = "needs_push";
      else status = "not_generated";
      return {
        slug,
        entry: skillEntries[slug],
        drift: driftBySlug.get(slug),
        status,
        lastPublished: s3Info?.s3_last_modified ?? null,
      };
    });
  }, [selectedSkills, locallyGeneratedSlugs, s3FileMap, skillEntries, driftBySlug]);

  const orphanedLocalSlugs = useMemo(() => {
    const assigned = new Set(selectedSkills);
    return [...locallyGeneratedSlugs].filter((s) => !assigned.has(s));
  }, [selectedSkills, locallyGeneratedSlugs]);

  const publishedCount = skillRows.filter((r) => r.status === "published").length;
  const needsPushCount = skillRows.filter((r) => r.status === "needs_push").length;
  const notGeneratedCount = skillRows.filter((r) => r.status === "not_generated").length;

  const lastPushedIso = useMemo(() => {
    if (!s3Status.data?.files) return null;
    let latest: string | null = null;
    for (const f of s3Status.data.files) {
      if (f.s3_last_modified && (!latest || f.s3_last_modified > latest)) {
        latest = f.s3_last_modified;
      }
    }
    return latest;
  }, [s3Status.data]);

  const instructionsS3Info = s3FileMap.get("instructions.md");
  const instructionsInS3 = instructionsS3Info?.in_s3 ?? false;
  const instructionsLocal = !!instructionsFile.data;
  const instructionsNeedsPush = instructionsLocal && !instructionsInS3;
  const instructionsLastPushed = instructionsS3Info?.s3_last_modified ?? null;
  const customContent = (customFile.data ?? "").trim();
  const customLocal = customContent.length > 0;
  // True when generated instructions don't yet contain the latest custom block.
  const customMergedIntoInstructions = customLocal && (instructionsFile.data ?? "").includes(customContent);
  const customNeedsRegenerate = customLocal && !customMergedIntoInstructions;
  const s3InSync = s3Status.data
    ? s3Status.data.local_count === s3Status.data.s3_count && s3Status.data.s3_count > 0
    : false;
  const pushDisabled = s3SyncMutation.isPending || (needsPushCount === 0 && !instructionsNeedsPush && s3InSync);

  const isRefreshing =
    s3Status.isFetching ||
    instructionsFile.isFetching ||
    customFile.isFetching ||
    configFile.isFetching ||
    skillsDir.isFetching ||
    aiDir.isFetching;

  const handleRefresh = useCallback(() => {
    s3Status.refetch();
    instructionsFile.refetch();
    customFile.refetch();
    configFile.refetch();
    skillsDir.refetch();
    aiDir.refetch();
    queryClient.invalidateQueries({ queryKey: ["file"] });
    queryClient.invalidateQueries({ queryKey: ["directory"] });
  }, [s3Status, instructionsFile, customFile, configFile, skillsDir, aiDir, queryClient]);

  if (aiDir.isLoading) {
    return <SectionLoading className="py-12" />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top strip: package status + actions */}
      <div className="flex items-start justify-between gap-6 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">AI Package</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{selectedSkills.length} assigned</span>
            {publishedCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                {publishedCount} published
              </span>
            )}
            {needsPushCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                {needsPushCount} needs push
              </span>
            )}
            {notGeneratedCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-400" />
                {notGeneratedCount} not generated
              </span>
            )}
            {lastPushedIso && <span>Last push {formatRelative(lastPushedIso)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Reload local files + S3 status"
            className="p-2 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !centralSkillsPath || selectedSkills.length === 0}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              !generateMutation.isPending && centralSkillsPath && selectedSkills.length > 0
                ? "bg-violet-600 text-white hover:bg-violet-700"
                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
            )}
          >
            {generateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} />}
            {generateMutation.isPending ? "Generating..." : "Generate Package"}
          </button>
          <button
            onClick={() => s3SyncMutation.mutate({ domain: domainName, globalPath })}
            disabled={pushDisabled}
            title={pushDisabled && !s3SyncMutation.isPending ? "Nothing to push" : undefined}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              !pushDisabled
                ? "bg-teal-600 text-white hover:bg-teal-700"
                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
            )}
          >
            {s3SyncMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
            {s3SyncMutation.isPending ? "Pushing..." : "Push to S3"}
          </button>
        </div>
      </div>

      {(generateMutation.isSuccess || generateMutation.isError || s3SyncMutation.isSuccess) && (
        <div className="px-6 py-2 border-b border-zinc-100 dark:border-zinc-800 text-xs space-y-0.5 flex-shrink-0">
          {generateMutation.isSuccess && (
            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Check size={12} />
              Generated {generateMutation.data.skills_copied.length} skills
              {generateMutation.data.instructions_generated && ", instructions updated"}
            </div>
          )}
          {generateMutation.isError && (
            <div className="text-red-600">{formatError(generateMutation.error)}</div>
          )}
          {s3SyncMutation.isSuccess && (
            <div className="text-green-600 dark:text-green-400">{s3SyncMutation.data.message}</div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {/* Skills */}
        <section className="px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-violet-500" />
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Assigned Skills
              </h3>
              <span className="text-xs text-zinc-400 tabular-nums">{selectedSkills.length}</span>
            </div>
            <button
              onClick={() => setShowAssignSkills(!showAssignSkills)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
                showAssignSkills
                  ? "bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700 text-violet-600"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-violet-300 hover:text-violet-600"
              )}
            >
              <Sparkles size={12} />
              {showAssignSkills ? "Done" : "Assign Skills"}
            </button>
          </div>

          {showAssignSkills && (
            <div className="mb-4">
              <SkillAssignmentGrid
                skills={AVAILABLE_AI_SKILLS}
                skillEntries={skillEntries}
                categories={categories}
                selectedSkills={selectedSkills}
                onToggle={handleSkillToggle}
                variant="cards"
                layout="split"
              />
            </div>
          )}

          {selectedSkills.length === 0 ? (
            <p className="text-xs text-zinc-400 py-4 text-center">
              No skills assigned yet. Click &ldquo;Assign Skills&rdquo; to pick from the registry.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
              {skillRows.map((row) => (
                <SkillRow
                  key={row.slug}
                  row={row}
                  expanded={expandedSkill === row.slug}
                  onToggle={() => setExpandedSkill(expandedSkill === row.slug ? null : row.slug)}
                  onDrift={
                    row.drift?.status === "drifted" && domainSkillsRelPath
                      ? () => setDriftModal({ slug: row.slug, name: row.entry?.name || row.slug, targetPath: domainSkillsRelPath + "/" + row.slug })
                      : undefined
                  }
                  skillFilePath={`${skillsPath}/${row.slug}/SKILL.md`}
                />
              ))}
            </div>
          )}

          {orphanedLocalSlugs.length > 0 && (
            <div className="mt-4 p-3 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                {orphanedLocalSlugs.length} orphaned locally
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500/80">
                Present in the local ai/ folder but not assigned: {orphanedLocalSlugs.join(", ")}. Re-run Generate Package to clean up.
              </p>
            </div>
          )}
        </section>

        {/* Instructions */}
        <section className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800">
          <CollapsibleHeader
            open={showInstructions}
            onToggle={() => setShowInstructions(!showInstructions)}
            icon={<FileText size={14} className="text-purple-500" />}
            title="instructions.md"
            status={
              !instructionsLocal
                ? { tone: "zinc", label: "missing" }
                : instructionsInS3
                ? { tone: "green", label: instructionsLastPushed ? `Published · ${formatRelative(instructionsLastPushed)}` : "Published" }
                : { tone: "amber", label: "Needs push" }
            }
          />
          {showInstructions && (
            <div className="mt-3">
              {instructionsFile.isLoading ? (
                <SectionLoading className="py-8" />
              ) : instructionsLocal ? (
                <MarkdownViewer content={instructionsFile.data} filename="instructions.md" />
              ) : (
                <p className="text-xs text-zinc-400 py-4">
                  No instructions.md found — generate a package to create one.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Custom (author-only, merged into instructions.md on Generate) */}
        <section className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800">
          <CollapsibleHeader
            open={showCustom}
            onToggle={() => setShowCustom(!showCustom)}
            icon={<Pencil size={14} className="text-amber-500" />}
            title="custom.md"
            status={
              !customLocal
                ? { tone: "zinc", label: "empty" }
                : customNeedsRegenerate
                ? { tone: "amber", label: "Regenerate to merge" }
                : { tone: "green", label: "Merged" }
            }
          />
          {showCustom && (
            <div className="mt-3">
              <CustomInstructionsEditor
                path={customPath}
                content={customFile.data}
                isLoading={customFile.isLoading}
              />
            </div>
          )}
        </section>

        {/* S3 files */}
        <section className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800">
          <CollapsibleHeader
            open={showS3Files}
            onToggle={() => setShowS3Files(!showS3Files)}
            icon={<Cloud size={14} className="text-zinc-400" />}
            title={`S3 files (${s3Status.data?.files.length ?? 0})`}
            status={
              !s3Status.data
                ? undefined
                : s3InSync
                ? { tone: "green", label: "In sync" }
                : { tone: "amber", label: `${s3Status.data.local_count} local / ${s3Status.data.s3_count} S3` }
            }
          />
          {showS3Files && s3Status.data && (
            <div className="mt-3">
              <S3FilesView
                files={s3Status.data.files}
                localCount={s3Status.data.local_count}
                s3Count={s3Status.data.s3_count}
              />
            </div>
          )}
        </section>
      </div>

      {driftModal && (
        <DriftDiffModal
          slug={driftModal.slug}
          skillName={driftModal.name}
          targetPath={driftModal.targetPath}
          leftLabel="Current (domain copy)"
          onClose={() => setDriftModal(null)}
          onSynced={() => queryClient.invalidateQueries({ queryKey: ["skill-drift"] })}
        />
      )}
    </div>
  );
}

// ─── Skill Row ──────────────────────────────────────────────────────────────

type SkillRowData = {
  slug: string;
  entry?: { name: string; category: string; description?: string; verified?: boolean };
  drift?: { status: string; source_modified: string; target_modified: string };
  status: SkillPublishStatus;
  lastPublished: string | null;
};

const STATUS_META: Record<SkillPublishStatus, { label: string; textClass: string; dotClass: string }> = {
  published: { label: "Published", textClass: "text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  needs_push: { label: "Needs push", textClass: "text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  not_generated: { label: "Not generated", textClass: "text-zinc-500 dark:text-zinc-400", dotClass: "bg-zinc-400" },
};

function SkillRow({
  row,
  expanded,
  onToggle,
  onDrift,
  skillFilePath,
}: {
  row: SkillRowData;
  expanded: boolean;
  onToggle: () => void;
  onDrift?: () => void;
  skillFilePath: string;
}) {
  const title = row.entry?.name || row.slug;
  const meta = STATUS_META[row.status];

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-zinc-400 flex-shrink-0" />
        )}
        <Sparkles size={13} className="text-violet-500 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{title}</span>
          {row.entry?.verified && <BadgeCheck size={11} className="text-blue-500 flex-shrink-0" />}
          {row.drift && (
            <DriftBadge
              status={row.drift.status}
              targetModified={row.drift.status === "in_sync" ? formatRelative(row.drift.target_modified) : undefined}
              onClick={onDrift ? (e) => { e.stopPropagation(); onDrift(); } : undefined}
            />
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={cn("flex items-center gap-1.5 text-xs", meta.textClass)}>
            <span className={cn("inline-block w-1.5 h-1.5 rounded-full", meta.dotClass)} />
            {meta.label}
          </span>
          <span className="text-xs text-zinc-400 tabular-nums w-20 text-right">
            {row.lastPublished ? formatRelative(row.lastPublished) : "—"}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-8 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800">
          {row.status === "not_generated" ? (
            <p className="text-xs text-zinc-500">
              Not generated locally yet. Click &ldquo;Generate Package&rdquo; to copy this skill into the domain folder.
            </p>
          ) : (
            <SkillPreview filePath={skillFilePath} />
          )}
        </div>
      )}
    </div>
  );
}

function SkillPreview({ filePath }: { filePath: string }) {
  const { data: content, isLoading } = useReadFile(filePath);
  if (isLoading) return <SectionLoading className="py-6" />;
  if (!content) return <p className="text-xs text-zinc-400">Could not load skill file.</p>;
  return <MarkdownViewer content={content} filename="SKILL.md" />;
}

// ─── Collapsible Header ─────────────────────────────────────────────────────

function CollapsibleHeader({
  open,
  onToggle,
  icon,
  title,
  status,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  status?: { tone: "green" | "amber" | "zinc"; label: string };
}) {
  const toneText =
    status?.tone === "green"
      ? "text-green-600 dark:text-green-400"
      : status?.tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : "text-zinc-500 dark:text-zinc-400";
  const toneDot =
    status?.tone === "green"
      ? "bg-green-500"
      : status?.tone === "amber"
      ? "bg-amber-500"
      : "bg-zinc-400";
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 text-left hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
    >
      {open ? <ChevronDown size={12} className="text-zinc-400" /> : <ChevronRight size={12} className="text-zinc-400" />}
      {icon}
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{title}</span>
      {status && (
        <span className={cn("ml-auto flex items-center gap-1.5 text-xs", toneText)}>
          <span className={cn("inline-block w-1.5 h-1.5 rounded-full", toneDot)} />
          {status.label}
        </span>
      )}
    </button>
  );
}

// ─── S3 Files View ──────────────────────────────────────────────────────────

// ─── S3 Files Tree View ─────────────────────────────────────────────────────

type TreeNode = {
  name: string;
  path: string; // full relative path
  children: Map<string, TreeNode>;
  file?: S3FileStatus;
};

function buildTree(files: S3FileStatus[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
        };
        node.children.set(part, child);
      }
      if (isLeaf) child.file = f;
      node = child;
    }
  }
  return root;
}

type FolderStats = {
  fileCount: number;
  localOk: number;
  s3Ok: number;
  latestModified: string | null;
};

function aggregate(node: TreeNode): FolderStats {
  if (node.file) {
    return {
      fileCount: 1,
      localOk: node.file.in_local ? 1 : 0,
      s3Ok: node.file.in_s3 ? 1 : 0,
      latestModified: node.file.s3_last_modified ?? null,
    };
  }
  const stats: FolderStats = { fileCount: 0, localOk: 0, s3Ok: 0, latestModified: null };
  for (const child of node.children.values()) {
    const s = aggregate(child);
    stats.fileCount += s.fileCount;
    stats.localOk += s.localOk;
    stats.s3Ok += s.s3Ok;
    if (s.latestModified && (!stats.latestModified || s.latestModified > stats.latestModified)) {
      stats.latestModified = s.latestModified;
    }
  }
  return stats;
}

function sortChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    const aFolder = !a.file;
    const bFolder = !b.file;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-SG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function S3FilesView({ files, localCount, s3Count }: { files: S3FileStatus[]; localCount: number; s3Count: number }) {
  const tree = useMemo(() => buildTree(files), [files]);
  // Default: top-level expanded so the user sees the structure; deeper folders collapsed.
  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    for (const child of tree.children.values()) {
      if (!child.file) set.add(child.path);
    }
    return set;
  }, [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<string>();
    const walk = (n: TreeNode) => {
      for (const c of n.children.values()) {
        if (!c.file) {
          all.add(c.path);
          walk(c);
        }
      }
    };
    walk(tree);
    setExpanded(all);
  }, [tree]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-400">
          {localCount} local, {s3Count} in S3{localCount === s3Count && s3Count > 0 ? " · in sync" : ""}.
        </p>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <button onClick={expandAll} className="hover:text-zinc-600 dark:hover:text-zinc-200">Expand all</button>
          <button onClick={collapseAll} className="hover:text-zinc-600 dark:hover:text-zinc-200">Collapse all</button>
        </div>
      </div>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
        <div className="grid grid-cols-[1fr_64px_64px_140px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <span>File</span>
          <span className="text-center">Local</span>
          <span className="text-center">S3</span>
          <span className="text-right">S3 Last Modified</span>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sortChildren(tree).map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isFolder = !node.file;
  const isOpen = isFolder && expanded.has(node.path);
  const stats = isFolder ? aggregate(node) : null;
  const indent = { paddingLeft: `${0.75 + depth * 1}rem` };

  if (isFolder) {
    const allLocal = stats!.localOk === stats!.fileCount;
    const allS3 = stats!.s3Ok === stats!.fileCount;
    return (
      <>
        <button
          onClick={() => onToggle(node.path)}
          className="w-full grid grid-cols-[1fr_64px_64px_140px] gap-2 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors items-center"
          style={indent}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            {isOpen ? (
              <ChevronDown size={11} className="text-zinc-400 flex-shrink-0" />
            ) : (
              <ChevronRight size={11} className="text-zinc-400 flex-shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen size={13} className="text-amber-500 flex-shrink-0" />
            ) : (
              <Folder size={13} className="text-amber-500 flex-shrink-0" />
            )}
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate">{node.name}</span>
            <span className="text-[10px] text-zinc-400 flex-shrink-0">{stats!.fileCount}</span>
          </span>
          <span className="text-center text-[11px] tabular-nums">
            {allLocal ? (
              <CheckCircle2 size={12} className="inline text-green-500" />
            ) : (
              <span className="text-red-500">{stats!.localOk}/{stats!.fileCount}</span>
            )}
          </span>
          <span className="text-center text-[11px] tabular-nums">
            {allS3 ? (
              <CheckCircle2 size={12} className="inline text-green-500" />
            ) : (
              <span className="text-amber-500">{stats!.s3Ok}/{stats!.fileCount}</span>
            )}
          </span>
          <span className="text-right text-[11px] text-zinc-400">{formatStamp(stats!.latestModified)}</span>
        </button>
        {isOpen &&
          sortChildren(node).map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
      </>
    );
  }

  const f = node.file!;
  return (
    <div className="grid grid-cols-[1fr_64px_64px_140px] gap-2 px-3 py-1.5 items-center" style={indent}>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="w-[11px] flex-shrink-0" />
        <File size={12} className="text-zinc-400 flex-shrink-0" />
        <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 truncate" title={f.path}>{node.name}</span>
      </span>
      <span className="text-center">
        {f.in_local ? (
          <CheckCircle2 size={12} className="inline text-green-500" />
        ) : (
          <AlertCircle size={12} className="inline text-red-400" />
        )}
      </span>
      <span className="text-center">
        {f.in_s3 ? (
          <CheckCircle2 size={12} className="inline text-green-500" />
        ) : (
          <AlertCircle size={12} className="inline text-zinc-300 dark:text-zinc-600" />
        )}
      </span>
      <span className="text-right text-[11px] text-zinc-400">{formatStamp(f.s3_last_modified)}</span>
    </div>
  );
}

// ─── Custom Instructions Editor ─────────────────────────────────────────────

function CustomInstructionsEditor({
  path,
  content,
  isLoading,
}: {
  path: string;
  content: string | undefined;
  isLoading: boolean;
}) {
  const [draft, setDraft] = useState(content ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const writeFile = useWriteFile();

  // Sync draft when the file content arrives or changes externally.
  useEffect(() => {
    setDraft(content ?? "");
  }, [content]);

  const dirty = draft !== (content ?? "");

  const handleSave = useCallback(() => {
    writeFile.mutate(
      { path, content: draft },
      { onSuccess: () => setSavedAt(Date.now()) }
    );
  }, [writeFile, path, draft]);

  if (isLoading) return <SectionLoading className="py-6" />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Author-only file — never overwritten by Generate. Its contents are appended to
        <code className="mx-1 px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px]">instructions.md</code>
        under a &ldquo;Custom Instructions&rdquo; section the next time you click Generate Package.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add domain-specific guidance here. e.g. tone, taboo topics, things to always include in answers."
        className="w-full min-h-[480px] font-mono text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 resize-y"
      />
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-400">
          {writeFile.isError && <span className="text-red-500">{formatError(writeFile.error)}</span>}
          {!writeFile.isError && savedAt && !dirty && <span className="text-green-600 dark:text-green-400">Saved</span>}
          {dirty && <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || writeFile.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            dirty && !writeFile.isPending
              ? "bg-violet-600 text-white hover:bg-violet-700"
              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
          )}
        >
          {writeFile.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {writeFile.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
