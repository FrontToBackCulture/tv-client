// src/modules/crm/DealTasks.tsx
// Tasks section for a deal - uses same hook pattern as other CRM data

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDealTasks, DealTaskFull } from "../../hooks/crm";
import { supabase } from "../../lib/supabase";
import { Circle, CheckCircle2, Loader2 } from "lucide-react";
import { formatDateShort as formatDate } from "../../lib/date";

interface DealTasksProps {
  dealId: string;
  dealName: string;
  onTaskCreated?: () => void;
}

// CRM Follow-ups project ID
const CRM_FOLLOWUPS_PROJECT_ID = "4d8cc7b3-7bfd-473d-9b30-ba89f3975346";

const PriorityLabels: Record<number, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

const PriorityColors: Record<number, string> = {
  1: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
  2: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
  3: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  4: "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
};

export function DealTasks({ dealId, dealName, onTaskCreated }: DealTasksProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: 3,
  });

  const queryClient = useQueryClient();

  // Use the same hook pattern as deals, companies, etc.
  const { data: tasks = [], isLoading, refetch } = useDealTasks(dealId);

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: async (taskData: typeof formData) => {
      // First fetch statuses
      const { data: projectStatuses } = await supabase
        .from("task_statuses")
        .select("id, name, type")
        .eq("project_id", CRM_FOLLOWUPS_PROJECT_ID);

      const unstartedStatus = (projectStatuses ?? []).find((s) => s.type === "unstarted");
      if (!unstartedStatus) throw new Error("No unstarted status found");

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: taskData.title.trim(),
          description: taskData.description || `Follow-up for deal: ${dealName}`,
          project_id: CRM_FOLLOWUPS_PROJECT_ID,
          status_id: unstartedStatus.id,
          priority: taskData.priority,
          due_date: taskData.dueDate || null,
          crm_deal_id: dealId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setFormData({ title: "", description: "", dueDate: "", priority: 3 });
      setShowForm(false);
      refetch();
      onTaskCreated?.();
    },
  });

  // Complete task mutation
  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      // First fetch statuses
      const { data: projectStatuses } = await supabase
        .from("task_statuses")
        .select("id, name, type")
        .eq("project_id", CRM_FOLLOWUPS_PROJECT_ID);

      const completedStatus = (projectStatuses ?? []).find((s) => s.type === "completed");
      if (!completedStatus) throw new Error("No completed status found");

      const { error } = await supabase
        .from("tasks")
        .update({ status_id: completedStatus.id })
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
      onTaskCreated?.();
      queryClient.invalidateQueries({ queryKey: ["crm"] });
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 py-3 flex justify-center">
        <Loader2 size={16} className="text-zinc-400 dark:text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Tasks ({tasks.length})
        </h4>
        <button
          onClick={() => setShowForm(true)}
          className="px-2.5 py-1 text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 rounded transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.map((task: DealTaskFull) => {
          const isCompleted = task.status_type === "completed";
          const isCompleting = completeMutation.isPending;

          return (
            <div
              key={task.id}
              className={`px-3 py-2.5 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700/50 ${
                isCompleted ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {/* Complete button */}
                  <button
                    onClick={() => !isCompleted && completeMutation.mutate(task.id)}
                    disabled={isCompleted || isCompleting}
                    className={`mt-0.5 flex-shrink-0 transition-colors ${
                      isCompleted
                        ? "text-green-500 cursor-default"
                        : isCompleting
                        ? "text-zinc-400 dark:text-zinc-600 animate-pulse"
                        : "text-zinc-400 dark:text-zinc-600 hover:text-green-500"
                    }`}
                    title={isCompleted ? "Completed" : "Mark as complete"}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 font-mono">
                        {task.project_prefix}-{task.identifier}
                      </span>
                    </div>
                    <p
                      className={`text-sm font-medium mt-1 ${
                        isCompleted
                          ? "text-zinc-500 line-through"
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 flex-shrink-0">
                  {task.priority > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        PriorityColors[task.priority] || ""
                      }`}
                    >
                      {PriorityLabels[task.priority]}
                    </span>
                  )}
                  {task.due_date && <span>{formatDate(task.due_date)}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && !showForm && (
          <p className="text-sm text-zinc-500 text-center py-6">No tasks</p>
        )}
      </div>

      {/* Create task form */}
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (formData.title.trim()) {
              createMutation.mutate(formData);
            }
          }}
          className="mt-3 p-4 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Follow up with contact..."
                className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-teal-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Additional details..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">
                  Due
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData({ ...formData, dueDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                >
                  <option value={0}>None</option>
                  <option value={1}>Urgent</option>
                  <option value={2}>High</option>
                  <option value={3}>Medium</option>
                  <option value={4}>Low</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormData({ title: "", description: "", dueDate: "", priority: 3 });
              }}
              className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
              disabled={createMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !formData.title.trim()}
              className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
