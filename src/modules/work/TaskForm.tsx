// src/modules/work/TaskForm.tsx
// Modal form for creating/editing tasks — matches task detail view style

import { useState } from "react";
import { useCreateTask, useUpdateTask, useStatuses, useUsers, useMilestones } from "../../hooks/work";
import type { Task, TaskInsert, TaskUpdate } from "../../lib/work/types";
import { Priority, PriorityLabels } from "../../lib/work/types";
import { X, Calendar, User as UserIcon, Flag, Milestone as MilestoneIcon, Loader2, AlertCircle } from "lucide-react";
import { toast } from "../../stores/toastStore";

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
    milestone_id: task?.milestone_id || null,
    due_date: task?.due_date || null,
    requires_review: task?.requires_review || false,
  });
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    (task as any)?.assignees?.map((a: any) => a.user?.id).filter(Boolean) || []
  );
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
          assignee_ids: assigneeIds,
        });
      } else {
        await createMutation.mutateAsync({
          ...formData,
          project_id: projectId,
          status_id: formData.status_id || statuses[0]?.id,
          assignee_ids: assigneeIds,
        } as any);
      }
      toast.success(isEditing ? "Task updated" : "Task created");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {isEditing ? "Edit Task" : "New Task"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-130px)]">
          {error && (
            <div className="mx-6 mt-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-xl text-sm">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Title — large input */}
          <div className="px-6 pt-5 pb-4">
            <input
              autoFocus
              value={formData.title || ""}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="Task title..."
              className="w-full text-lg font-medium text-zinc-900 dark:text-zinc-100 bg-transparent border-0 focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
            />
          </div>

          {/* Metadata rows — label/value like task detail */}
          <div className="px-6 space-y-1 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            {/* Status */}
            <div className="flex items-center py-2">
              <span className="text-xs text-zinc-400 w-28 shrink-0 flex items-center gap-1.5">Status</span>
              <select
                value={formData.status_id || ""}
                onChange={e => setFormData({ ...formData, status_id: e.target.value })}
                className="text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-0 focus:outline-none cursor-pointer hover:text-teal-600 transition"
              >
                {statuses.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="flex items-center py-2">
              <span className="text-xs text-zinc-400 w-28 shrink-0 flex items-center gap-1.5">
                <Flag size={11} /> Priority
              </span>
              <select
                value={formData.priority ?? Priority.None}
                onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-0 focus:outline-none cursor-pointer hover:text-teal-600 transition"
              >
                {Object.entries(PriorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Assignees */}
            <div className="flex items-start py-2">
              <span className="text-xs text-zinc-400 w-28 shrink-0 flex items-center gap-1.5 pt-1">
                <UserIcon size={11} /> Assignees
              </span>
              <div className="flex flex-wrap gap-1">
                {users.map(u => {
                  const selected = assigneeIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setAssigneeIds(
                        selected ? assigneeIds.filter(id => id !== u.id) : [...assigneeIds, u.id]
                      )}
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
            <div className="flex items-center py-2">
              <span className="text-xs text-zinc-400 w-28 shrink-0 flex items-center gap-1.5">
                <MilestoneIcon size={11} /> Milestone
              </span>
              <select
                value={formData.milestone_id || ""}
                onChange={e => setFormData({ ...formData, milestone_id: e.target.value || null })}
                className="text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-0 focus:outline-none cursor-pointer hover:text-teal-600 transition"
              >
                <option value="">No milestone</option>
                {milestones.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div className="flex items-center py-2">
              <span className="text-xs text-zinc-400 w-28 shrink-0 flex items-center gap-1.5">
                <Calendar size={11} /> Due Date
              </span>
              <input
                type="date"
                value={formData.due_date?.split("T")[0] || ""}
                onChange={e => setFormData({ ...formData, due_date: e.target.value ? `${e.target.value}T00:00:00Z` : null })}
                className="text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-0 focus:outline-none cursor-pointer hover:text-teal-600 transition"
              />
            </div>
          </div>

          {/* Description — full width section */}
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Description</span>
            <textarea
              value={formData.description || ""}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              placeholder="Add description..."
              className="w-full mt-2 text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-0 focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600 resize-y leading-relaxed"
            />
          </div>

          {/* Options */}
          <div className="px-6 py-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requires_review || false}
                onChange={e => setFormData({ ...formData, requires_review: e.target.checked })}
                className="rounded border-zinc-300 dark:border-zinc-600 text-teal-500 focus:ring-teal-500"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Requires review before completion</span>
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 transition"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            {isEditing ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
