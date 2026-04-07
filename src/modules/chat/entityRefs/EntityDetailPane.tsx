// Unified entity detail pane shell — handles header, segmented nav, and footer
// for both tasks and projects/deals. Individual segments render inside.

import { useState, useMemo } from "react";
import { X, MessageCircle, ChevronRight, ChevronDown, Trash2, Clock, Check, FileText, File, Folder, FolderOpen, MessageSquare } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useUpdateTask, useDeleteTask } from "../../../hooks/work/useTasks";
import { useUpdateProject, useDeleteProject } from "../../../hooks/work/useProjects";
import { useStatuses } from "../../../hooks/work/useStatuses";
import { useActivities, useDeleteActivity } from "../../../hooks/crm/useActivities";
import { useDiscussions } from "../../../hooks/useDiscussions";
import { useTasks } from "../../../hooks/work/useTasks";
import { useFileTree, type TreeNode } from "../../../hooks/useFiles";
import { useRepository } from "../../../stores/repositoryStore";
import { cn } from "../../../lib/cn";
import { InlineField } from "./InlineField";
import { FolderPickerField } from "../../../components/ui/FolderPickerField";
import { useEntityRefContext } from "./EntityRefContext";
import type { EntityRef } from "./parseEntityRefs";
import type { ResolvedEntities, ResolvedTask, ResolvedProject } from "./useEntityRefs";

export type Segment = "overview" | "activity" | "tasks" | "files" | "more";

interface Props {
  entityRef: EntityRef;
  entities: ResolvedEntities | undefined;
  onClose: () => void;
  onOpenBotChat: () => void;
}

export function EntityDetailPane({ entityRef, entities, onClose, onOpenBotChat }: Props) {
  const [segment, setSegment] = useState<Segment>("overview");

  // Look in the pre-resolved map first (for entity refs in the current message),
  // then fall back to a direct fetch (for entities opened via sub-task click, etc).
  const mapTask = entityRef.type === "task" ? entities?.tasks.get(entityRef.id) : undefined;
  const mapProject = (entityRef.type === "project" || entityRef.type === "deal")
    ? entities?.projects.get(entityRef.id)
    : undefined;

  const { data: fetchedTask } = useQuery({
    queryKey: ["entity-pane-task", entityRef.id],
    enabled: entityRef.type === "task" && !mapTask,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, task_number, status_id, priority, due_date, completed_at, project_id, status:task_statuses(id, name, type, color), project:projects!tasks_project_id_fkey(id, name, folder_path, identifier_prefix)")
        .eq("id", entityRef.id)
        .maybeSingle();
      return data as ResolvedTask | null;
    },
  });

  const { data: fetchedProject } = useQuery({
    queryKey: ["entity-pane-project", entityRef.id],
    enabled: (entityRef.type === "project" || entityRef.type === "deal") && !mapProject,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select(`
          id, name, status, project_type, identifier_prefix, description, summary, lead, priority, health, color,
          target_date, created_at, updated_at, folder_path, company_id,
          deal_stage, deal_value, deal_currency, deal_expected_close, deal_actual_close, deal_notes,
          deal_solution, deal_tags, deal_contact_ids, deal_proposal_path, deal_order_form_path,
          company:crm_companies(id, name, display_name)
        `)
        .eq("id", entityRef.id)
        .maybeSingle();
      if (!data) return null;
      const d = data as any;
      const company = Array.isArray(d.company) ? d.company[0] ?? null : d.company ?? null;
      return { ...d, company } as ResolvedProject;
    },
  });

  const task = mapTask ?? fetchedTask ?? undefined;
  const project = mapProject ?? fetchedProject ?? undefined;

  const isProject = !!project;

  // Fetch activities for counts + timeline
  const { data: activities = [] } = useActivities(
    task ? { taskId: task.id } : project ? { projectId: project.id } : undefined,
  );
  const { data: discussions = [] } = useDiscussions(
    task ? "task" : "project",
    (task?.id ?? project?.id) ?? "",
  );
  const { data: subTasks = [] } = useTasks(project?.id ?? null);

  if (!task && !project) {
    return <LoadingPane onClose={onClose} />;
  }

  const title = task?.title ?? project?.name ?? "—";
  const typeLabel = project?.project_type === "deal" ? "DEAL" : project ? "PROJECT" : "TASK";
  const lastUpdated = (task as any)?.updated_at ?? (project as any)?.updated_at ?? null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-900 shrink-0">
        <Breadcrumb typeLabel={typeLabel} task={task} project={project} />
        <div className="flex-1" />
        <button
          onClick={onOpenBotChat}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-950/50 border border-purple-200/70 dark:border-purple-900/70 transition-colors"
          title="Chat with bot-mel to update"
        >
          <MessageCircle size={10} />
          Chat to update
        </button>
        <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Title + chips */}
      <EntityTitleBlock task={task} project={project} fallback={title} />

      {/* Segmented nav */}
      <div className="px-4 pb-2 shrink-0">
        <SegmentedNav
          active={segment}
          onChange={setSegment}
          showTasks={isProject}
          counts={{
            activity: activities.length + discussions.length,
            tasks: subTasks.length,
            files: 0,
          }}
        />
      </div>

      {/* Segment content */}
      <div className="flex-1 overflow-y-auto">
        {segment === "overview" && <OverviewSegment task={task} project={project} />}
        {segment === "activity" && <ActivitySegment task={task} project={project} />}
        {segment === "tasks" && isProject && project && <TasksSegment projectId={project.id} />}
        {segment === "files" && <FilesSegment task={task} project={project} />}
        {segment === "more" && <MoreSegment task={task} project={project} onDeleted={onClose} />}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30 shrink-0">
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
          {lastUpdated ? `Updated ${formatRelative(lastUpdated)}` : "—"}
        </span>
        <span className="text-[10px] font-mono text-zinc-300 dark:text-zinc-600">
          {(task?.id ?? project?.id ?? "").slice(0, 8)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title block with editable name
// ---------------------------------------------------------------------------

function EntityTitleBlock({ task, project, fallback }: { task?: ResolvedTask; project?: ResolvedProject; fallback: string }) {
  const updateTask = useUpdateTask();
  const updateProject = useUpdateProject();

  function saveName(val: string) {
    if (task) {
      updateTask.mutate({ id: task.id, updates: { title: val } });
    } else if (project) {
      updateProject.mutate({ id: project.id, updates: { name: val } });
    }
  }

  return (
    <div className="px-5 pt-4 pb-3 shrink-0">
      <InlineField
        value={task?.title ?? project?.name ?? fallback}
        onSave={saveName}
      />
      <KeyChips task={task} project={project} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

function Breadcrumb({ typeLabel, task, project }: {
  typeLabel: string;
  task?: ResolvedTask;
  project?: ResolvedProject;
}) {
  const crumbs: string[] = [typeLabel];
  if (task?.project?.name) crumbs.push(task.project.name);
  else if (project?.name) crumbs.push(project.name);

  return (
    <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 min-w-0">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          {i > 0 && <ChevronRight size={10} className="shrink-0 opacity-50" />}
          <span className="truncate max-w-[140px]">{c}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key chips
// ---------------------------------------------------------------------------

function KeyChips({ task, project }: { task?: ResolvedTask; project?: ResolvedProject }) {
  const chips: { label: string; tone: string }[] = [];

  if (task) {
    const statusType = task.status?.type ?? "todo";
    chips.push({ label: task.status?.name ?? statusType, tone: statusTone(statusType) });
    if (task.priority != null) {
      chips.push({ label: priorityLabel(task.priority), tone: priorityTone(task.priority) });
    }
    if (task.due_date) {
      chips.push({ label: `Due ${formatDate(task.due_date)}`, tone: isOverdue(task.due_date) ? "red" : "zinc" });
    }
  }

  if (project) {
    if (project.deal_stage) {
      chips.push({ label: project.deal_stage, tone: stageTone(project.deal_stage) });
    } else if (project.status) {
      chips.push({ label: project.status, tone: "zinc" });
    }
    if (project.deal_value) {
      chips.push({ label: `SGD ${Number(project.deal_value).toLocaleString()}`, tone: "emerald" });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {chips.map((c, i) => (
        <Chip key={i} tone={c.tone}>{c.label}</Chip>
      ))}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: string }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900/60",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/60",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200/60 dark:border-blue-900/60",
    purple: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200/60 dark:border-purple-900/60",
    red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200/60 dark:border-red-900/60",
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  };
  return (
    <span className={cn("inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border", tones[tone] ?? tones.zinc)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Segmented nav
// ---------------------------------------------------------------------------

function SegmentedNav({
  active,
  onChange,
  showTasks,
  counts,
}: {
  active: Segment;
  onChange: (s: Segment) => void;
  showTasks: boolean;
  counts: { activity: number; tasks: number; files: number };
}) {
  const segments: { key: Segment; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "activity", label: "Activity", count: counts.activity },
    ...(showTasks ? [{ key: "tasks" as const, label: "Tasks", count: counts.tasks }] : []),
    { key: "files", label: "Files", count: counts.files },
    { key: "more", label: "More" },
  ];

  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
      {segments.map(({ key, label, count }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-150",
              isActive
                ? "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
            )}
          >
            <span>{label}</span>
            {count != null && count > 0 && (
              <span className={cn(
                "text-[9px] tabular-nums px-1 rounded",
                isActive ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" : "opacity-60",
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OVERVIEW SEGMENT — editable fields + description + recent activity preview
// ---------------------------------------------------------------------------

function OverviewSegment({ task, project }: { task?: ResolvedTask; project?: ResolvedProject }) {
  if (task) return <TaskOverview task={task} />;
  if (project) return <ProjectOverview project={project} />;
  return null;
}

function TaskOverview({ task }: { task: ResolvedTask }) {
  const { data: statuses = [] } = useStatuses();
  const updateTask = useUpdateTask();

  return (
    <div className="px-5 py-4 space-y-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Status">
          <InlineField
            value={task.status?.id ?? ""}
            type="select"
            options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            displayValue={task.status?.name}
            onSave={(v) => updateTask.mutate({ id: task.id, updates: { status_id: v } })}
          />
        </Field>
        <Field label="Priority">
          <InlineField
            value={task.priority ?? ""}
            type="select"
            options={[
              { value: "", label: "—" },
              { value: "1", label: "Urgent" },
              { value: "2", label: "High" },
              { value: "3", label: "Medium" },
              { value: "4", label: "Low" },
            ]}
            displayValue={task.priority != null ? priorityLabel(task.priority) : undefined}
            onSave={(v) => updateTask.mutate({ id: task.id, updates: { priority: v ? Number(v) : null } })}
          />
        </Field>
        <Field label="Due date">
          <InlineField
            value={task.due_date ?? ""}
            type="date"
            displayValue={task.due_date ? formatDate(task.due_date) : undefined}
            onSave={(v) => updateTask.mutate({ id: task.id, updates: { due_date: v || null } })}
          />
        </Field>
        <Field label="Project">
          <div className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate pl-1.5 py-0.5">
            {task.project?.name ?? "—"}
          </div>
        </Field>
      </div>

      <RecentActivitySection entityType="task" entityId={task.id} />
    </div>
  );
}

function ProjectOverview({ project }: { project: ResolvedProject }) {
  const updateProject = useUpdateProject();
  const isDeal = project.project_type === "deal";

  const save = (patch: Record<string, any>) => updateProject.mutate({ id: project.id, updates: patch as any });

  const currency = project.deal_currency ?? "SGD";
  const valueDisplay = project.deal_value
    ? `${currency} ${Number(project.deal_value).toLocaleString()}`
    : undefined;

  return (
    <div className="px-5 py-4 space-y-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {isDeal ? (
          <>
            <Field label="Stage">
              <InlineField
                value={project.deal_stage ?? ""}
                type="select"
                options={[
                  { value: "", label: "—" },
                  { value: "lead", label: "Lead" },
                  { value: "qualified", label: "Qualified" },
                  { value: "discovery", label: "Discovery" },
                  { value: "proposal", label: "Proposal" },
                  { value: "negotiation", label: "Negotiation" },
                  { value: "won", label: "Won" },
                  { value: "lost", label: "Lost" },
                ]}
                displayValue={project.deal_stage ?? undefined}
                onSave={(v) => save({ deal_stage: v || null })}
              />
            </Field>
            <Field label="Value">
              <InlineField
                value={project.deal_value ?? ""}
                type="number"
                displayValue={valueDisplay}
                onSave={(v) => save({ deal_value: v ? Number(v) : null })}
              />
            </Field>
            <Field label="Currency">
              <InlineField
                value={project.deal_currency ?? "SGD"}
                type="select"
                options={[
                  { value: "SGD", label: "SGD" },
                  { value: "USD", label: "USD" },
                  { value: "MYR", label: "MYR" },
                  { value: "IDR", label: "IDR" },
                  { value: "PHP", label: "PHP" },
                  { value: "THB", label: "THB" },
                  { value: "VND", label: "VND" },
                ]}
                onSave={(v) => save({ deal_currency: v || null })}
              />
            </Field>
            <Field label="Expected close">
              <InlineField
                value={project.deal_expected_close ?? ""}
                type="date"
                displayValue={project.deal_expected_close ? formatDate(project.deal_expected_close) : undefined}
                onSave={(v) => save({ deal_expected_close: v || null })}
              />
            </Field>
            {project.deal_actual_close && (
              <Field label="Actual close">
                <InlineField
                  value={project.deal_actual_close ?? ""}
                  type="date"
                  displayValue={formatDate(project.deal_actual_close)}
                  onSave={(v) => save({ deal_actual_close: v || null })}
                />
              </Field>
            )}
            <Field label="Solution">
              <InlineField
                value={project.deal_solution ?? ""}
                onSave={(v) => save({ deal_solution: v || null })}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Status">
              <InlineField
                value={project.status ?? ""}
                onSave={(v) => save({ status: v || null })}
              />
            </Field>
            <Field label="Priority">
              <InlineField
                value={project.priority ?? ""}
                type="select"
                options={[
                  { value: "", label: "—" },
                  { value: "1", label: "Urgent" },
                  { value: "2", label: "High" },
                  { value: "3", label: "Medium" },
                  { value: "4", label: "Low" },
                ]}
                displayValue={project.priority != null ? priorityLabel(project.priority) : undefined}
                onSave={(v) => save({ priority: v ? Number(v) : null })}
              />
            </Field>
            <Field label="Target date">
              <InlineField
                value={project.target_date ?? ""}
                type="date"
                displayValue={project.target_date ? formatDate(project.target_date) : undefined}
                onSave={(v) => save({ target_date: v || null })}
              />
            </Field>
            <Field label="Health">
              <InlineField
                value={project.health ?? ""}
                type="select"
                options={[
                  { value: "", label: "—" },
                  { value: "on_track", label: "On track" },
                  { value: "at_risk", label: "At risk" },
                  { value: "off_track", label: "Off track" },
                ]}
                onSave={(v) => save({ health: v || null })}
              />
            </Field>
          </>
        )}

        <Field label="Company">
          <div className="text-[12px] text-zinc-700 dark:text-zinc-300 pl-1.5 py-0.5 truncate">
            {project.company?.display_name ?? project.company?.name ?? "—"}
          </div>
        </Field>
        <Field label="Lead">
          <InlineField
            value={project.lead ?? ""}
            onSave={(v) => save({ lead: v || null })}
          />
        </Field>
        <Field label="Identifier">
          <InlineField
            value={project.identifier_prefix ?? ""}
            placeholder="e.g. CPA"
            mono
            onSave={(v) => save({ identifier_prefix: v || null })}
          />
        </Field>
        <Field label="Created">
          <div className="text-[12px] text-zinc-500 dark:text-zinc-400 pl-1.5 py-0.5">
            {project.created_at ? formatDate(project.created_at) : "—"}
          </div>
        </Field>

        <div className="col-span-2">
          <Field label="Description">
            <InlineField
              value={project.description ?? ""}
              type="textarea"
              placeholder="Click to add description..."
              onSave={(v) => save({ description: v || null })}
            />
          </Field>
        </div>

        {isDeal && (
          <div className="col-span-2">
            <Field label="Deal notes">
              <InlineField
                value={project.deal_notes ?? ""}
                type="textarea"
                placeholder="Click to add deal notes..."
                onSave={(v) => save({ deal_notes: v || null })}
              />
            </Field>
          </div>
        )}

        <div className="col-span-2">
          <Field label="Folder path">
            <FolderPickerField
              value={project.folder_path}
              onSave={(v) => save({ folder_path: v || null })}
            />
          </Field>
        </div>
      </div>

      <RecentActivitySection entityType="project" entityId={project.id} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-medium">
        {label}
      </div>
      {children}
    </div>
  );
}

function RecentActivitySection({ entityType, entityId }: { entityType: "task" | "project"; entityId: string }) {
  const { data: activities = [] } = useActivities(
    entityType === "task" ? { taskId: entityId } : { projectId: entityId },
  );
  const recent = activities.slice(0, 3);

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-medium">
        Recent activity
      </div>
      {recent.length === 0 ? (
        <p className="text-[11px] text-zinc-400 italic">No activities yet</p>
      ) : (
        <div className="space-y-1.5">
          {recent.map((a) => (
            <ActivityRow key={a.id} activity={a} compact />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ACTIVITY SEGMENT — merged timeline of activities + discussion
// ---------------------------------------------------------------------------

function ActivitySegment({ task, project }: { task?: ResolvedTask; project?: ResolvedProject }) {
  const entityType = task ? "task" : "project";
  const entityId = (task?.id ?? project?.id) ?? "";
  const { data: activities = [] } = useActivities(
    task ? { taskId: entityId } : { projectId: entityId },
  );
  const { data: discussions = [] } = useDiscussions(entityType, entityId);

  // Merge and sort by time desc
  const timeline = useMemo(() => {
    const items: { id: string; kind: "activity" | "discussion"; date: string; data: any }[] = [];
    for (const a of activities) {
      items.push({ id: a.id, kind: "activity", date: a.activity_date, data: a });
    }
    for (const d of discussions) {
      items.push({ id: d.id, kind: "discussion", date: d.created_at, data: d });
    }
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activities, discussions]);

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
        <Clock size={20} className="text-zinc-300 dark:text-zinc-700 mb-2" />
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-2">
      {timeline.map((item) =>
        item.kind === "activity" ? (
          <ActivityRow key={`a-${item.id}`} activity={item.data} />
        ) : (
          <DiscussionRow key={`d-${item.id}`} discussion={item.data} />
        ),
      )}
    </div>
  );
}

function ActivityRow({ activity, compact }: { activity: any; compact?: boolean }) {
  const deleteActivity = useDeleteActivity();
  const date = new Date(activity.activity_date);
  const dateStr = date.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
  const timeStr = date.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-start gap-2 group py-1">
      <div className={cn(
        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold",
        activity.type === "note" && "bg-blue-50 text-blue-500 dark:bg-blue-950/30",
        activity.type === "meeting" && "bg-purple-50 text-purple-500 dark:bg-purple-950/30",
        activity.type === "call" && "bg-emerald-50 text-emerald-500 dark:bg-emerald-950/30",
        !["note", "meeting", "call"].includes(activity.type) && "bg-zinc-100 text-zinc-500 dark:bg-zinc-800",
      )}>
        {(activity.type || "N").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 capitalize">{activity.type}</span>
          <span className="text-[10px] text-zinc-400">·</span>
          <span className="text-[10px] text-zinc-400">{dateStr} {timeStr}</span>
        </div>
        {activity.subject && <div className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200 mb-0.5">{activity.subject}</div>}
        {!compact && activity.content && (
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{activity.content}</div>
        )}
      </div>
      {!compact && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm("Delete this activity?")) deleteActivity.mutate(activity.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-all"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

function DiscussionRow({ discussion }: { discussion: any }) {
  const date = new Date(discussion.created_at);
  return (
    <div className="flex items-start gap-2 py-1">
      <div className="w-5 h-5 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center flex-shrink-0">
        <MessageSquare size={10} className="text-teal-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{discussion.author}</span>
          <span className="text-[10px] text-zinc-400">·</span>
          <span className="text-[10px] text-zinc-400">
            {date.toLocaleDateString("en-SG", { day: "numeric", month: "short" })} {date.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-3">
          {discussion.body}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TASKS SEGMENT — sub-tasks for projects with inline edit
// ---------------------------------------------------------------------------

function TasksSegment({ projectId }: { projectId: string }) {
  const { data: tasks = [], isLoading } = useTasks(projectId);

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><span className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" /></div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
        <Check size={20} className="text-zinc-300 dark:text-zinc-700 mb-2" />
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">No sub-tasks yet</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-0.5">
      {tasks.map((t: any) => (
        <SubTaskRow key={t.id} task={t} />
      ))}
    </div>
  );
}

function SubTaskRow({ task }: { task: any }) {
  const { data: statuses = [] } = useStatuses();
  const updateTask = useUpdateTask();
  const ctx = useEntityRefContext();

  const ident = task.project?.identifier_prefix && task.task_number != null
    ? `${task.project.identifier_prefix}-${task.task_number}`
    : task.id.slice(0, 6);

  const assignees: any[] = task.assignees ?? [];

  function openTask(e: React.MouseEvent) {
    // Only open if the click wasn't on an interactive control
    const target = e.target as HTMLElement;
    if (target.closest("select, input, button, textarea, [data-stop-open]")) return;
    ctx?.onOpen({ type: "task", id: task.id, label: "" });
  }

  return (
    <div
      onClick={openTask}
      className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors group cursor-pointer"
    >
      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 w-14 shrink-0 truncate">{ident}</span>

      <div data-stop-open className="w-24 shrink-0">
        <select
          value={task.status_id}
          onChange={(e) => updateTask.mutate({ id: task.id, updates: { status_id: e.target.value } })}
          className="w-full text-[10px] bg-transparent border-0 text-zinc-500 dark:text-zinc-400 outline-none hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer truncate"
        >
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <span className="flex-1 text-[12px] text-zinc-800 dark:text-zinc-200 truncate min-w-0">{task.title}</span>

      {/* Assignees — stacked avatars */}
      {assignees.length > 0 && (
        <div className="flex -space-x-1.5 shrink-0">
          {assignees.slice(0, 3).map((a: any, i: number) => {
            const name = a.user?.name ?? a.name ?? "?";
            const initial = name.charAt(0).toUpperCase();
            return (
              <div
                key={i}
                title={name}
                className="w-5 h-5 rounded-full bg-teal-100 dark:bg-teal-900/40 border border-white dark:border-zinc-950 flex items-center justify-center text-[9px] font-semibold text-teal-700 dark:text-teal-300"
              >
                {initial}
              </div>
            );
          })}
          {assignees.length > 3 && (
            <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-white dark:border-zinc-950 flex items-center justify-center text-[9px] font-semibold text-zinc-500">
              +{assignees.length - 3}
            </div>
          )}
        </div>
      )}

      {/* Priority — inline select */}
      <div data-stop-open className="w-20 shrink-0">
        <select
          value={task.priority ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            updateTask.mutate({ id: task.id, updates: { priority: v ? Number(v) : null } });
          }}
          className={cn(
            "w-full text-[9px] font-semibold uppercase tracking-wide bg-transparent border-0 outline-none cursor-pointer text-right",
            task.priority != null ? priorityTextClass(task.priority) : "text-zinc-400",
          )}
        >
          <option value="">—</option>
          <option value="1">Urgent</option>
          <option value="2">High</option>
          <option value="3">Medium</option>
          <option value="4">Low</option>
        </select>
      </div>

      {/* Due date — inline input */}
      <div data-stop-open className="w-24 shrink-0 text-right">
        <input
          type="date"
          value={task.due_date ?? ""}
          onChange={(e) => updateTask.mutate({ id: task.id, updates: { due_date: e.target.value || null } })}
          className={cn(
            "w-full text-[10px] tabular-nums bg-transparent border-0 outline-none cursor-pointer text-right",
            task.due_date && isOverdue(task.due_date) ? "text-red-500" : "text-zinc-400",
          )}
        />
      </div>
    </div>
  );
}

function priorityTextClass(p: number): string {
  return ["text-zinc-400", "text-red-500", "text-amber-500", "text-blue-500", "text-zinc-400"][p] ?? "text-zinc-400";
}

// ---------------------------------------------------------------------------
// FILES SEGMENT — attachments + artifacts
// ---------------------------------------------------------------------------

function FilesSegment({ task, project }: { task?: ResolvedTask; project?: ResolvedProject }) {
  const { activeRepository } = useRepository();
  const knowledgeRoot = activeRepository?.path ?? "";

  // For tasks: project folder / TASK-IDENT. For projects: folder_path.
  const isTask = !!task;
  const baseFolderRel = isTask ? task?.project?.folder_path ?? null : project?.folder_path ?? null;
  const taskIdent = isTask && task?.project?.identifier_prefix && (task as any)?.task_number != null
    ? `${task!.project!.identifier_prefix}-${(task as any).task_number}`
    : null;

  const subfolder = isTask && taskIdent ? `/${taskIdent}` : "";
  const relPath = baseFolderRel ? `${baseFolderRel}${subfolder}` : null;
  const absPath = relPath && knowledgeRoot ? `${knowledgeRoot}/${relPath}` : null;

  if (!relPath) {
    return (
      <div className="px-5 py-4">
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/60">
          <div className="text-[11px] text-amber-700 dark:text-amber-400">
            No folder path set. Set <span className="font-semibold">Folder path</span> in Overview to view files.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 font-medium mb-0.5">
          Folder
        </div>
        <div className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 break-all">
          {relPath}
        </div>
      </div>

      {absPath && <FolderTreeView absPath={absPath} />}
    </div>
  );
}

function FolderTreeView({ absPath }: { absPath: string }) {
  const { data: tree, isLoading, error } = useFileTree(absPath, 4);

  if (isLoading) {
    return <div className="flex justify-center py-4"><span className="w-3 h-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" /></div>;
  }
  if (error || !tree) {
    return (
      <div className="text-center py-6">
        <FileText size={18} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-1.5" />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Folder not found</p>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">Ask bot-mel to create it via "Chat to update"</p>
      </div>
    );
  }

  const children = (tree.children || []).filter((c) => !c.name.startsWith("."));
  if (children.length === 0) {
    return (
      <div className="text-center py-6">
        <Folder size={18} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-1.5" />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Folder is empty</p>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">Use "Chat to update" to save files here</p>
      </div>
    );
  }

  const sorted = [...children].sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-0">
      {sorted.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={0} />
      ))}
    </div>
  );
}

function FileTreeNode({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.is_directory) {
    const children = (node.children || []).filter((c) => !c.name.startsWith("."));
    const sorted = children.sort((a, b) => {
      if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          {expanded ? <ChevronDown size={11} className="text-zinc-400" /> : <ChevronRight size={11} className="text-zinc-400" />}
          {expanded ? <FolderOpen size={12} className="text-amber-500" /> : <Folder size={12} className="text-amber-500" />}
          <span className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate">{node.name}</span>
          {children.length > 0 && (
            <span className="text-[9px] text-zinc-400 tabular-nums">{children.length}</span>
          )}
        </button>
        {expanded && sorted.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-1 rounded text-zinc-600 dark:text-zinc-400"
      style={{ paddingLeft: `${depth * 14 + 18}px` }}
    >
      <File size={11} className="text-zinc-400 shrink-0" />
      <span className="text-[11px] truncate">{node.name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MORE SEGMENT — advanced edit + delete
// ---------------------------------------------------------------------------

function MoreSegment({ task, project, onDeleted }: { task?: ResolvedTask; project?: ResolvedProject; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const deleteTask = useDeleteTask();
  const deleteProject = useDeleteProject();

  async function handleDelete() {
    if (!confirm(`Delete this ${task ? "task" : "project"}? This cannot be undone.`)) return;
    try {
      if (task) await deleteTask.mutateAsync(task.id);
      else if (project) await deleteProject.mutateAsync(project.id);
      queryClient.invalidateQueries();
      onDeleted();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Advanced actions
      </div>
      <div className="pt-4 border-t border-zinc-100 dark:border-zinc-900">
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-[11px] text-red-500 hover:text-red-700 transition-colors"
        >
          <Trash2 size={12} />
          Delete {task ? "task" : "project"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function LoadingPane({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      <div className="flex items-center justify-end px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-900">
        <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <span className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

function isOverdue(iso: string): boolean {
  return new Date(iso) < new Date(new Date().toDateString());
}

function priorityLabel(p: number): string {
  return ["—", "Urgent", "High", "Medium", "Low"][p] ?? "—";
}

function priorityTone(p: number): string {
  return ["zinc", "red", "amber", "blue", "zinc"][p] ?? "zinc";
}

function statusTone(type: string): string {
  switch (type) {
    case "complete": return "emerald";
    case "in_progress": return "blue";
    case "blocked":
    case "waiting": return "amber";
    case "cancelled": return "zinc";
    default: return "zinc";
  }
}

function stageTone(stage: string): string {
  const s = stage.toLowerCase();
  if (s === "won" || s === "closed") return "emerald";
  if (s === "lost") return "red";
  if (s.includes("proposal") || s.includes("negotiation")) return "purple";
  if (s.includes("qualified") || s.includes("discovery")) return "blue";
  return "zinc";
}
