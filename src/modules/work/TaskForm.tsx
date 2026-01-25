// src/modules/work/TaskForm.tsx
// Modal form for creating/editing tasks

import { useState } from "react";
import { useCreateTask, useUpdateTask, useStatuses, useUsers, useMilestones } from "../../hooks/useWork";
import type { Task, TaskInsert, TaskUpdate } from "../../lib/work/types";
import { Priority, PriorityLabels } from "../../lib/work/types";
import { X, Calendar, User as UserIcon, Flag, Milestone as MilestoneIcon } from "lucide-react";

interface TaskFormProps {
  task?: Task;
  projectId: string;
  defaultStatusId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function TaskForm({
  task,
  projectId,
  defaultStatusId,
  onClose,
  onSaved,
}: TaskFormProps) {
  const { data: statuses = [] } = useStatuses(projectId);
  const { data: users = [] } = useUsers();
  const { data: milestones = [] } = useMilestones(projectId);

  const [formData, setFormData] = useState<Partial<TaskInsert | TaskUpdate>>({
    title: task?.title || "",
    description: task?.description || "",
    status_id: task?.status_id || defaultStatusId || statuses[0]?.id || "",
    priority: task?.priority ?? Priority.None,
    assignee_id: task?.assignee_id || null,
    milestone_id: task?.milestone_id || null,
    due_date: task?.due_date || null,
    requires_review: task?.requires_review || false,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();

  const isEditing = !!task;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title?.trim()) {
      setError("Title is required");
      return;
    }

    setError(null);

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: task.id,
          updates: formData as TaskUpdate,
        });
      } else {
        await createMutation.mutateAsync({
          ...formData,
          project_id: projectId,
          status_id: formData.status_id || statuses[0]?.id,
        } as Omit<TaskInsert, "task_number">);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {isEditing ? "Edit Task" : "New Task"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-130px)]"
        >
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title || ""}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="Task title..."
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Description
            </label>
            <textarea
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              placeholder="Add description..."
            />
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Status
              </label>
              <select
                value={formData.status_id || ""}
                onChange={(e) => setFormData({ ...formData, status_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                <Flag size={14} className="inline mr-1" />
                Priority
              </label>
              <select
                value={formData.priority ?? Priority.None}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                {Object.entries(PriorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee & Milestone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                <UserIcon size={14} className="inline mr-1" />
                Assignee
              </label>
              <select
                value={formData.assignee_id || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    assignee_id: e.target.value || null,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                <MilestoneIcon size={14} className="inline mr-1" />
                Milestone
              </label>
              <select
                value={formData.milestone_id || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    milestone_id: e.target.value || null,
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
              >
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              <Calendar size={14} className="inline mr-1" />
              Due Date
            </label>
            <input
              type="date"
              value={formData.due_date?.split("T")[0] || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  due_date: e.target.value ? `${e.target.value}T00:00:00Z` : null,
                })
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Requires Review */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.requires_review || false}
              onChange={(e) =>
                setFormData({ ...formData, requires_review: e.target.checked })
              }
              className="rounded border-slate-400 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-teal-500 focus:ring-teal-500"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Requires review before completion
            </span>
          </label>
        </form>

        <div className="p-4 border-t border-slate-200 dark:border-zinc-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
