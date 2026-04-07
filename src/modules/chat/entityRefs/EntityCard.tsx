// Inline entity card — renders a task/project/deal reference as a compact pill
// with status dot, label, title, and a chevron. Click opens the action sheet.

import { ChevronDown, CheckCircle2, Circle, AlertCircle, Clock, Briefcase, Building2 } from "lucide-react";
import type { EntityRef } from "./parseEntityRefs";
import type { ResolvedEntities } from "./useEntityRefs";
import { cn } from "../../../lib/cn";

interface Props {
  entityRef: EntityRef;
  entities: ResolvedEntities | undefined;
  onOpen: (ref: EntityRef) => void;
}

export function EntityCard({ entityRef, entities, onOpen }: Props) {
  if (entityRef.type === "task") {
    const task = entities?.tasks.get(entityRef.id);
    if (!task) {
      return <EntityCardSkeleton label={entityRef.label ?? "Task"} />;
    }
    return <TaskCard entityRef={entityRef} task={task} onOpen={onOpen} />;
  }

  if (entityRef.type === "project" || entityRef.type === "deal") {
    const project = entities?.projects.get(entityRef.id);
    if (!project) {
      return <EntityCardSkeleton label={entityRef.label ?? entityRef.type} />;
    }
    return <ProjectCard entityRef={entityRef} project={project} onOpen={onOpen} />;
  }

  if (entityRef.type === "company") {
    const company = entities?.companies.get(entityRef.id);
    if (!company) {
      return <EntityCardSkeleton label={entityRef.label ?? "Company"} />;
    }
    return <CompanyCard entityRef={entityRef} company={company} onOpen={onOpen} />;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------

function TaskCard({
  entityRef,
  task,
  onOpen,
}: {
  entityRef: EntityRef;
  task: NonNullable<ReturnType<ResolvedEntities["tasks"]["get"]>>;
  onOpen: (r: EntityRef) => void;
}) {
  const statusType = task.status?.type ?? "todo";
  const statusLabel = entityRef.label ?? task.status?.name ?? statusType;
  const accent = statusAccent(statusType);

  return (
    <button
      onClick={() => onOpen(entityRef)}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-md text-xs font-medium align-baseline transition-all border",
        "hover:shadow-sm hover:-translate-y-px active:translate-y-0",
        accent.bg,
        accent.border,
        accent.text,
      )}
      title={`${statusLabel} · ${task.title}`}
    >
      <StatusIcon type={statusType} className={cn("w-3 h-3", accent.icon)} />
      <span className={cn("uppercase tracking-wide text-[9px] font-bold", accent.label)}>
        {statusLabel}
      </span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <span className="max-w-[220px] truncate">{task.title}</span>
      <ChevronDown size={10} className="opacity-50" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Project / deal card
// ---------------------------------------------------------------------------

function ProjectCard({
  entityRef,
  project,
  onOpen,
}: {
  entityRef: EntityRef;
  project: NonNullable<ReturnType<ResolvedEntities["projects"]["get"]>>;
  onOpen: (r: EntityRef) => void;
}) {
  const isDeal = project.project_type === "deal";
  const stage = entityRef.label ?? (isDeal ? project.deal_stage : project.status) ?? "active";
  const accent = stageAccent(stage);

  return (
    <button
      onClick={() => onOpen(entityRef)}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-md text-xs font-medium align-baseline transition-all border",
        "hover:shadow-sm hover:-translate-y-px active:translate-y-0",
        accent.bg,
        accent.border,
        accent.text,
      )}
      title={`${stage} · ${project.name}`}
    >
      <Briefcase size={10} className={accent.icon} />
      <span className={cn("uppercase tracking-wide text-[9px] font-bold", accent.label)}>
        {stage}
      </span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <span className="max-w-[220px] truncate">{project.name}</span>
      <ChevronDown size={10} className="opacity-50" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Company card
// ---------------------------------------------------------------------------

function CompanyCard({
  entityRef,
  company,
  onOpen,
}: {
  entityRef: EntityRef;
  company: NonNullable<ReturnType<ResolvedEntities["companies"]["get"]>>;
  onOpen: (r: EntityRef) => void;
}) {
  return (
    <button
      onClick={() => onOpen(entityRef)}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-md text-xs font-medium align-baseline transition-all border bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 hover:shadow-sm hover:-translate-y-px"
    >
      <Building2 size={10} className="text-indigo-500" />
      <span className="max-w-[220px] truncate">{company.display_name || company.name}</span>
      <ChevronDown size={10} className="opacity-50" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton (entity data not loaded yet)
// ---------------------------------------------------------------------------

function EntityCardSkeleton({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 my-0.5 rounded-md text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700 align-baseline">
      <Circle size={10} className="animate-pulse" />
      <span>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Styling helpers — status → color
// ---------------------------------------------------------------------------

function StatusIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "complete":
      return <CheckCircle2 className={className} />;
    case "in_progress":
      return <Clock className={className} />;
    case "blocked":
    case "waiting":
      return <AlertCircle className={className} />;
    default:
      return <Circle className={className} />;
  }
}

function statusAccent(type: string) {
  switch (type) {
    case "complete":
      return {
        bg: "bg-emerald-50 dark:bg-emerald-950/30",
        border: "border-emerald-200 dark:border-emerald-900",
        text: "text-emerald-700 dark:text-emerald-300",
        icon: "text-emerald-500",
        label: "text-emerald-600 dark:text-emerald-400",
      };
    case "in_progress":
      return {
        bg: "bg-blue-50 dark:bg-blue-950/30",
        border: "border-blue-200 dark:border-blue-900",
        text: "text-blue-700 dark:text-blue-300",
        icon: "text-blue-500",
        label: "text-blue-600 dark:text-blue-400",
      };
    case "blocked":
    case "waiting":
      return {
        bg: "bg-amber-50 dark:bg-amber-950/30",
        border: "border-amber-200 dark:border-amber-900",
        text: "text-amber-700 dark:text-amber-300",
        icon: "text-amber-500",
        label: "text-amber-600 dark:text-amber-400",
      };
    case "cancelled":
      return {
        bg: "bg-zinc-50 dark:bg-zinc-900",
        border: "border-zinc-200 dark:border-zinc-800",
        text: "text-zinc-500 dark:text-zinc-400",
        icon: "text-zinc-400",
        label: "text-zinc-500 dark:text-zinc-400",
      };
    default:
      return {
        bg: "bg-zinc-50 dark:bg-zinc-900",
        border: "border-zinc-200 dark:border-zinc-800",
        text: "text-zinc-700 dark:text-zinc-300",
        icon: "text-zinc-500",
        label: "text-zinc-600 dark:text-zinc-400",
      };
  }
}

function stageAccent(stage: string) {
  const lower = stage.toLowerCase();
  if (lower === "won" || lower === "done") {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-900",
      text: "text-emerald-700 dark:text-emerald-300",
      icon: "text-emerald-500",
      label: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (lower === "lost" || lower === "cancelled") {
    return {
      bg: "bg-rose-50 dark:bg-rose-950/30",
      border: "border-rose-200 dark:border-rose-900",
      text: "text-rose-700 dark:text-rose-300",
      icon: "text-rose-500",
      label: "text-rose-600 dark:text-rose-400",
    };
  }
  return {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-200 dark:border-purple-900",
    text: "text-purple-700 dark:text-purple-300",
    icon: "text-purple-500",
    label: "text-purple-600 dark:text-purple-400",
  };
}
