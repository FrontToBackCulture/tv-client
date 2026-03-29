// src/modules/work/TaskDetailPanel.tsx
// Task detail panel/modal with full editing

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useStatuses,
  useUsers,
  useMilestones,
  useInitiatives,
} from "../../hooks/work";
import { useInitiativeProjects } from "./workViewsShared";
import { useCompanies } from "../../hooks/crm/useCompanies";
import { useContacts } from "../../hooks/crm/useContacts";
import { useViewContextStore } from "../../stores/viewContextStore";
import { formatDateFull as formatDate } from "../../lib/date";
import {
  getTaskIdentifier,
  Priority,
  PriorityLabels,
} from "../../lib/work/types";
import { StatusIcon } from "./StatusIcon";
import {
  X,
  Calendar,
  User,
  Flag,
  Milestone as MilestoneIcon,
  Tag,
  Trash2,
  Clock,
  MessageSquare,
  Building2,
  Target,
  Mail,
  Upload,
  Download,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";
import { EmailsPanel } from "../../components/emails/EmailsPanel";
import { useLinkedEmailCount } from "../../hooks/email/useEntityEmails";
import { useNotionPushTask, useNotionPullTask } from "../../hooks/useNotion";
import { NotionContent } from "./NotionContent";
import { Button, IconButton } from "../../components/ui";
import { DetailLoading } from "../../components/ui/DetailStates";
import { DeleteConfirm } from "../../components/ui/DeleteConfirm";
import { toast } from "../../stores/toastStore";
import { useTaskFieldsStore } from "../../stores/taskFieldsStore";

function AutoResizeTextarea({ minRows = 4, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minRows * 22)}px`;
  }, [minRows]);
  useEffect(() => { resize(); }, [props.value, resize]);
  return <textarea ref={ref} onInput={resize} {...props} />;
}

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}

export function TaskDetailPanel({
  taskId,
  onClose,
  onUpdated,
  onDeleted,
}: TaskDetailPanelProps) {
  const { data: task, isLoading, error: taskError, refetch } = useTask(taskId);
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const pushMutation = useNotionPushTask();
  const pullMutation = useNotionPullTask();

  // Report task to help bot
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    if (task?.title) setViewDetail(`Task: ${task.title}`);
  }, [task, setViewDetail]);

  const projectId = task?.project_id || "";
  const { data: statuses = [] } = useStatuses(projectId);
  const { data: users = [] } = useUsers();
  const { data: milestones = [] } = useMilestones(projectId);
  const { data: companies = [] } = useCompanies();
  const { data: contacts = [] } = useContacts();
  const { data: initiatives = [] } = useInitiatives();
  const { data: initiativeLinks = [] } = useInitiativeProjects();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "emails" | "discussion">("details");
  const { data: discussionCount } = useDiscussionCount("task", taskId);
  const { data: emailCount } = useLinkedEmailCount("task", taskId);
  const projectType = (task as any)?.project?.project_type || "work";
  const enabledTaskFields = useTaskFieldsStore((s) => s.getEnabledFields(projectType));

  // Resolve initiative name for this task's project (must be before early returns — hooks rules)
  const initiativeName = useMemo(() => {
    if (!task?.project_id || !initiatives.length || !initiativeLinks.length) return null;
    const link = initiativeLinks.find(l => l.project_id === task.project_id);
    if (!link) return null;
    return initiatives.find(i => i.id === link.initiative_id)?.name || null;
  }, [task?.project_id, initiatives, initiativeLinks]);

  if (isLoading) return <DetailLoading />;

  if (!task) {
    console.error("[TaskDetailPanel] Task not found for ID:", taskId, taskError?.message);
    return (
      <div className="h-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 gap-3">
        <p className="text-zinc-500">Task not found</p>
        <p className="text-[10px] text-zinc-400 font-mono">{taskId}</p>
        {taskError && <p className="text-[10px] text-red-400">{taskError.message}</p>}
        <button onClick={onClose} className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 px-3 py-1 rounded hover:bg-teal-50 dark:hover:bg-teal-900/20">Dismiss</button>
      </div>
    );
  }

  const identifier = getTaskIdentifier(task);
  const statusType = (task.status?.type || "todo") as import("../../lib/work/types").StatusType;
  const statusColor = task.status?.color || "#6B7280";

  async function handleUpdateField(field: string, value: unknown) {
    try {
      await updateMutation.mutateAsync({
        id: taskId,
        updates: { [field]: value },
      });
      refetch();
      onUpdated?.();
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  }

  async function handleSaveTitle() {
    const trimmed = titleValue.trim();
    setEditingTitle(false);
    if (trimmed && trimmed !== task?.title) {
      await handleUpdateField("title", trimmed);
    }
  }

  async function handleSaveDescription() {
    if (descriptionValue !== task?.description) {
      await handleUpdateField("description", descriptionValue);
    }
    setEditingDescription(false);
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(taskId);
      toast.success("Task deleted");
      onDeleted?.();
      onClose();
    } catch (error) {
      toast.error("Failed to delete task");
      console.error("Failed to delete task:", error);
    }
  }

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusIcon type={statusType} color={statusColor} size={20} />
          <span className="text-sm text-zinc-500 font-mono">{identifier}</span>
          <span
            onClick={() => { navigator.clipboard.writeText(task.id); toast.success("Task ID copied"); }}
            className="text-[10px] text-zinc-300 dark:text-zinc-600 font-mono cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
            title={task.id}
          >
            {task.id.slice(0, 8)}
          </span>
          {initiativeName && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              {initiativeName}
            </span>
          )}
          {initiativeName && task.project && (
            <span className="text-zinc-300 dark:text-zinc-600 text-xs">›</span>
          )}
          {task.project && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: `${task.project.color}20`,
                color: task.project.color || "#6B7280",
              }}
            >
              {task.project.name}
            </span>
          )}
          {task.notion_page_id && (
            <a
              href={`https://notion.so/${task.notion_page_id.replace(/-/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`hover:opacity-75 transition-opacity ${(task as any).source === "notion" ? "text-zinc-800 dark:text-zinc-200" : "text-teal-500 dark:text-teal-400"}`}
              title={(task as any).source === "notion" ? "From Notion — click to open" : "Synced to Notion — click to open"}
            >
              <svg width="14" height="14" viewBox="0 0 100 100" fill="currentColor"><path d="M6.6 12.6c5.1 4.1 7 3.8 16.5 3.1l59.7-3.6c2 0 .3-2-.3-2.2L73.2 3.5c-2.7-2.2-6.5-4.6-13.5-4L8 3.2C4 3.5 3.1 5.6 4.8 7.3zm17.1 14.3v62.7c0 3.4 1.7 4.7 5.5 4.5l65.7-3.8c3.8-.2 4.3-2.6 4.3-5.4V22.6c0-2.8-1.1-4.3-3.5-4l-68.6 4c-2.7.2-3.4 1.5-3.4 4.3zM82 29c.4 1.8 0 3.5-1.8 3.7l-3.2.6v46.3c-2.8 1.5-5.3 2.3-7.5 2.3-3.4 0-4.3-1.1-6.8-4.1L42.3 46.2v30.7l6.6 1.5s0 3.5-4.8 3.5l-13.3.8c-.4-.8 0-2.7 1.3-3l3.5-1V38.3l-4.8-.4c-.4-1.8.6-4.4 3.5-4.6l14.3-.9 21.2 32.5V37l-5.5-.6c-.4-2.2 1.2-3.7 3.2-3.9z"/></svg>
            </a>
          )}
        </div>
        <IconButton icon={X} size={18} label="Close" onClick={onClose} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab("details")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "details"
              ? "border-teal-500 text-teal-600 dark:text-teal-400"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab("emails")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === "emails"
              ? "border-teal-500 text-teal-600 dark:text-teal-400"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <Mail size={13} />
          {(emailCount ?? 0) > 0 && (
            <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded-full">
              {emailCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("discussion")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === "discussion"
              ? "border-teal-500 text-teal-600 dark:text-teal-400"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <MessageSquare size={13} />
          {(discussionCount ?? 0) > 0 && (
            <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded-full">
              {discussionCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {activeTab === "emails" ? (
        <EmailsPanel entityType="task" entityId={taskId} />
      ) : activeTab === "discussion" ? (
        <DiscussionPanel entityType="task" entityId={taskId} />
      ) : (
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Title */}
          <div>
            {editingTitle ? (
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="w-full text-lg font-semibold bg-transparent border-b border-teal-500 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                autoFocus
              />
            ) : (
              <h1
                onClick={() => {
                  setTitleValue(task.title);
                  setEditingTitle(true);
                }}
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 cursor-text hover:bg-zinc-100 dark:hover:bg-zinc-900/50 px-1 -mx-1 rounded"
              >
                {task.title}
              </h1>
            )}
          </div>

          {/* Fields */}
          <div className="space-y-1">
            {/* Status */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500">Status</span>
              <div className="relative flex-1">
                <select
                  value={task.status_id || ""}
                  onChange={(e) => handleUpdateField("status_id", e.target.value)}
                  className="w-full px-2 py-1.5 pr-7 text-sm rounded-md bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 border-none appearance-none cursor-pointer transition-colors"
                >
                  {(() => {
                    const typeLabels: Record<string, string> = { todo: "To-do", in_progress: "In Progress", complete: "Complete" };
                    const typeOrder = ["todo", "in_progress", "complete"];
                    const grouped = statuses.reduce<Record<string, typeof statuses>>((acc, s) => {
                      (acc[s.type] ??= []).push(s);
                      return acc;
                    }, {});
                    const useGroups = statuses.length > 10;
                    if (!useGroups) {
                      return statuses.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ));
                    }
                    return typeOrder.filter(t => grouped[t]?.length).map(type => (
                      <optgroup key={type} label={typeLabels[type] || type}>
                        {grouped[type].map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </optgroup>
                    ));
                  })()}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                <Flag size={12} />
                Priority
              </span>
              <div className="relative flex-1">
                <select
                  value={task.priority ?? Priority.None}
                  onChange={(e) => handleUpdateField("priority", parseInt(e.target.value))}
                  className="w-full px-2 py-1.5 pr-7 text-sm rounded-md bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 border-none appearance-none cursor-pointer transition-colors"
                >
                  {Object.entries(PriorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Assignees */}
            <div className="flex items-start gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0 pt-1">
                <User size={12} />
                Assignees
              </span>
              <div className="flex flex-wrap gap-1">
                {users.map((u) => {
                  const selected = (task.assignees || []).some(a => a.user?.id === u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={async () => {
                        const currentIds = (task.assignees || []).map(a => a.user?.id).filter(Boolean) as string[];
                        const newIds = selected
                          ? currentIds.filter(id => id !== u.id)
                          : [...currentIds, u.id];
                        try {
                          await updateMutation.mutateAsync({
                            id: taskId,
                            updates: {},
                            assignee_ids: newIds,
                          });
                          refetch();
                          onUpdated?.();
                        } catch (err) {
                          console.error("Failed to update assignees:", err);
                        }
                      }}
                      className={`text-xs px-2 py-0.5 rounded-full border transition ${
                        selected
                          ? "bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
                          : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300"
                      }`}
                    >
                      {u.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Milestone */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                <MilestoneIcon size={12} />
                Milestone
              </span>
              <div className="relative flex-1">
                <select
                  value={task.milestone_id || ""}
                  onChange={(e) =>
                    handleUpdateField("milestone_id", e.target.value || null)
                  }
                  className="w-full px-2 py-1.5 pr-7 text-sm rounded-md bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 border-none appearance-none cursor-pointer transition-colors"
                >
                  <option value="">No milestone</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Due Date */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                <Calendar size={12} />
                Due Date
              </span>
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="date"
                  value={task.due_date?.split("T")[0] || ""}
                  onChange={(e) =>
                    handleUpdateField(
                      "due_date",
                      e.target.value ? `${e.target.value}T00:00:00Z` : null
                    )
                  }
                  className="flex-1 px-2 py-1.5 text-sm rounded-md bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 border-none cursor-pointer transition-colors"
                />
                {task.due_date && (
                  <button
                    onClick={() => handleUpdateField("due_date", null)}
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
                    title="Clear due date"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Task Type */}
            {enabledTaskFields.includes("task_type") && (
              <div className="flex items-center gap-3">
                <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                  <Target size={12} />
                  Type
                </span>
                <div className="relative flex-1">
                  <select
                    value={task.task_type || "general"}
                    onChange={(e) => handleUpdateField("task_type", e.target.value)}
                    className="w-full px-2 py-1.5 pr-7 text-sm rounded-md bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 border-none appearance-none cursor-pointer transition-colors"
                  >
                    <option value="general">General</option>
                    <option value="target">Target</option>
                    <option value="prospect">Prospect</option>
                    <option value="follow_up">Follow Up</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Days in Stage */}
            {enabledTaskFields.includes("days_in_stage") && task.task_type_changed_at && task.task_type && task.task_type !== "general" && (() => {
              const days = Math.floor((Date.now() - new Date(task.task_type_changed_at).getTime()) / (1000 * 60 * 60 * 24));
              const color = days > 30 ? "text-red-500" : days > 14 ? "text-amber-500" : "text-zinc-600 dark:text-zinc-300";
              return (
                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                    <Clock size={12} />
                    In Stage
                  </span>
                  <span className={`flex-1 px-2 py-1.5 text-sm font-medium ${color}`}>
                    {days} {days === 1 ? "day" : "days"}
                  </span>
                </div>
              );
            })()}

            {/* Company */}
            {enabledTaskFields.includes("company") && (
              <div className="flex items-center gap-3">
                <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                  <Building2 size={12} />
                  Company
                </span>
                <div className="relative flex-1">
                  <select
                    value={(task as any).company_id || ""}
                    onChange={async (e) => {
                      const val = e.target.value || null;
                      try {
                        await updateMutation.mutateAsync({
                          id: taskId,
                          updates: { company_id: val, contact_id: null },
                        });
                        refetch();
                        onUpdated?.();
                      } catch (error) {
                        console.error("Failed to update company:", error);
                      }
                    }}
                    className="w-full px-2 py-1.5 pr-7 text-sm rounded-md bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 border-none appearance-none cursor-pointer transition-colors"
                  >
                    <option value="">No company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.display_name || c.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Contact */}
            {enabledTaskFields.includes("contact") && (
              <div className="flex items-center gap-3">
                <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                  <User size={12} />
                  Contact
                </span>
                <div className="relative flex-1">
                  <select
                    value={(task as any).contact_id || ""}
                    onChange={(e) => handleUpdateField("contact_id", e.target.value || null)}
                    className="w-full px-2 py-1.5 pr-7 text-sm rounded-md bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 border-none appearance-none cursor-pointer transition-colors"
                  >
                    <option value="">No contact</option>
                    {contacts
                      .filter((c) => !(task as any).company_id || c.company_id === (task as any).company_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Labels */}
            {task.labels && task.labels.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 pt-1">
                  <Tag size={12} />
                  Labels
                </span>
                <div className="flex-1 flex flex-wrap gap-1">
                  {task.labels.map(({ label }) => (
                    <span
                      key={label.id}
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${label.color}20`,
                        color: label.color,
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Created / Updated */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                <Calendar size={12} />
                Created
              </span>
              <span className="flex-1 px-2 py-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                {task.created_at ? formatDate(task.created_at) : "—"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1 flex-shrink-0">
                <Calendar size={12} />
                Updated
              </span>
              <span className="flex-1 px-2 py-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                {task.updated_at ? formatDate(task.updated_at) : "—"}
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Description</h3>
            {editingDescription ? (
              <div>
                <AutoResizeTextarea
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 border-none leading-relaxed resize-none"
                  autoFocus
                  minRows={4}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="ghost" onClick={() => setEditingDescription(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveDescription}>
                    Save
                  </Button>
                </div>
              </div>
            ) : task.notion_page_id ? (
              <div className="px-1 py-1 text-sm text-zinc-700 dark:text-zinc-300">
                <NotionContent description={task.description} />
              </div>
            ) : (
              <div
                onClick={() => {
                  setDescriptionValue(task.description || "");
                  setEditingDescription(true);
                }}
                className="px-1 py-1 text-sm text-zinc-700 dark:text-zinc-300 rounded-md cursor-text hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
              >
                {task.description ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-li:my-0 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="text-zinc-400 dark:text-zinc-600">Add a description...</span>
                )}
              </div>
            )}
          </div>

          {/* Activity */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Activity</h3>
            {task.activity && task.activity.length > 0 ? (
              <div className="space-y-2">
                {[...task.activity].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Clock size={14} className="text-zinc-500 dark:text-zinc-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {activity.action}
                      </span>
                      {activity.actor_name && (
                        <span className="text-zinc-400 dark:text-zinc-600 text-xs ml-1">
                          by {activity.actor_name}
                        </span>
                      )}
                      <span className="text-zinc-400 dark:text-zinc-600 text-xs ml-2">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-zinc-600">No activity yet</p>
            )}
          </div>

          {/* Metadata */}
          <div className="text-xs text-zinc-400 dark:text-zinc-600 space-y-1">
            <p>Created: {formatDate(task.created_at)}</p>
            <p>Updated: {formatDate(task.updated_at)}</p>
            {task.creator && <p>Created by: {task.creator.name}</p>}
          </div>
        </div>
      </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
        <Button
          variant="ghost"
          icon={Trash2}
          onClick={() => setShowDeleteConfirm(true)}
          className="text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20"
        >
          Delete
        </Button>
        <div className="flex items-center gap-2">
          {task.notion_page_id && (
            <a
              href={`https://notion.so/${task.notion_page_id.replace(/-/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <ExternalLink size={14} />
              Notion
            </a>
          )}
          {task.notion_page_id && (
            <Button
              variant="ghost"
              icon={Download}
              onClick={async () => {
                try {
                  await pullMutation.mutateAsync(taskId);
                  toast.success("Synced from Notion");
                  refetch();
                } catch (error: any) {
                  toast.error(error?.message || "Failed to sync from Notion");
                }
              }}
              disabled={pullMutation.isPending}
            >
              {pullMutation.isPending ? "Syncing..." : "Sync from Notion"}
            </Button>
          )}
          <Button
            variant="ghost"
            icon={Upload}
            onClick={async () => {
              try {
                const result = await pushMutation.mutateAsync(taskId);
                toast.success(result.action === "created" ? "Synced to Notion (new page)" : "Synced to Notion");
                refetch();
              } catch (error: any) {
                toast.error(error?.message || "Failed to sync to Notion");
              }
            }}
            disabled={pushMutation.isPending}
          >
            {pushMutation.isPending ? "Syncing..." : "Sync to Notion"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirm
          title="Delete Task"
          message={<>Delete <strong>{identifier}</strong>? This cannot be undone.</>}
          isDeleting={deleteMutation.isPending}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
