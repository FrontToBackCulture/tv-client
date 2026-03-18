// src/modules/work/TaskDetailPanel.tsx
// Task detail panel/modal with full editing

import { useState, useEffect } from "react";
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useStatuses,
  useUsers,
  useMilestones,
} from "../../hooks/work";
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
} from "lucide-react";
import { DiscussionPanel } from "../../components/discussions/DiscussionPanel";
import { useDiscussionCount } from "../../hooks/useDiscussions";
import { Button, IconButton } from "../../components/ui";
import { DetailLoading, DetailNotFound } from "../../components/ui/DetailStates";
import { DeleteConfirm } from "../../components/ui/DeleteConfirm";
import { toast } from "../../stores/toastStore";

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
  const { data: task, isLoading, refetch } = useTask(taskId);
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  // Report task to help bot
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    if (task?.title) setViewDetail(`Task: ${task.title}`);
  }, [task, setViewDetail]);

  const projectId = task?.project_id || "";
  const { data: statuses = [] } = useStatuses(projectId);
  const { data: users = [] } = useUsers();
  const { data: milestones = [] } = useMilestones(projectId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "discussion">("details");
  const { data: discussionCount } = useDiscussionCount("task", taskId);

  if (isLoading) return <DetailLoading />;

  if (!task) return <DetailNotFound message="Task not found" />;

  const identifier = getTaskIdentifier(task);
  const statusType = (task.status?.type || "unstarted") as import("../../lib/work/types").StatusType;
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
    if (titleValue.trim() && titleValue !== task?.title) {
      await handleUpdateField("title", titleValue.trim());
    }
    setEditingTitle(false);
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
      {activeTab === "discussion" ? (
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
          <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-3 space-y-3">
            {/* Status */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500">Status</span>
              <select
                value={task.status_id || ""}
                onChange={(e) => handleUpdateField("status_id", e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                <Flag size={12} />
                Priority
              </span>
              <select
                value={task.priority ?? Priority.None}
                onChange={(e) => handleUpdateField("priority", parseInt(e.target.value))}
                className="flex-1 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                {Object.entries(PriorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                <User size={12} />
                Assignee
              </span>
              <select
                value={task.assignee_id || ""}
                onChange={(e) =>
                  handleUpdateField("assignee_id", e.target.value || null)
                }
                className="flex-1 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Milestone */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                <MilestoneIcon size={12} />
                Milestone
              </span>
              <select
                value={task.milestone_id || ""}
                onChange={(e) =>
                  handleUpdateField("milestone_id", e.target.value || null)
                }
                className="flex-1 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                <Calendar size={12} />
                Due Date
              </span>
              <input
                type="date"
                value={task.due_date?.split("T")[0] || ""}
                onChange={(e) =>
                  handleUpdateField(
                    "due_date",
                    e.target.value ? `${e.target.value}T00:00:00Z` : null
                  )
                }
                className="flex-1 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              />
            </div>

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
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Description</h3>
            {editingDescription ? (
              <div>
                <textarea
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                  autoFocus
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
            ) : (
              <div
                onClick={() => {
                  setDescriptionValue(task.description || "");
                  setEditingDescription(true);
                }}
                className="min-h-[100px] px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900/50 rounded border border-zinc-200 dark:border-zinc-800 cursor-text hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors whitespace-pre-wrap"
              >
                {task.description || (
                  <span className="text-zinc-500 dark:text-zinc-600">Add a description...</span>
                )}
              </div>
            )}
          </div>

          {/* Activity */}
          {task.activity && task.activity.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Activity</h3>
              <div className="space-y-2">
                {task.activity.slice(0, 5).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Clock size={14} className="text-zinc-500 dark:text-zinc-600 mt-0.5" />
                    <div>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {activity.action}
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-600 text-xs ml-2">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
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
