// src/modules/work/TaskForm.tsx
// Modal form for creating/editing tasks

import { useState } from "react";
import { useCreateTask, useUpdateTask, useStatuses, useUsers, useMilestones } from "../../hooks/work";
import type { Task, TaskInsert, TaskUpdate } from "../../lib/work/types";
import { Priority, PriorityLabels } from "../../lib/work/types";
import { Calendar, User as UserIcon, Flag, Milestone as MilestoneIcon } from "lucide-react";
import { FormModal } from "../../components/ui/FormModal";
import { FormField, Input, Select, Textarea, CheckboxField } from "../../components/ui";
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
      toast.success(isEditing ? "Task updated" : "Task created");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    }
  }

  return (
    <FormModal
      title={isEditing ? "Edit Task" : "New Task"}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? "Save Changes" : "Create Task"}
      isSaving={isSaving}
      error={error}
    >
      {/* Title */}
      <FormField label="Title" required>
        <Input
          type="text"
          value={formData.title || ""}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Task title..."
          autoFocus
        />
      </FormField>

      {/* Description */}
      <FormField label="Description">
        <Textarea
          value={formData.description || ""}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
          placeholder="Add description..."
        />
      </FormField>

      {/* Status & Priority */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Status">
          <Select
            value={formData.status_id || ""}
            onChange={(e) => setFormData({ ...formData, status_id: e.target.value })}
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Priority" icon={Flag}>
          <Select
            value={formData.priority ?? Priority.None}
            onChange={(e) =>
              setFormData({ ...formData, priority: parseInt(e.target.value) })
            }
          >
            {Object.entries(PriorityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {/* Assignee & Milestone */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Assignee" icon={UserIcon}>
          <Select
            value={formData.assignee_id || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                assignee_id: e.target.value || null,
              })
            }
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Milestone" icon={MilestoneIcon}>
          <Select
            value={formData.milestone_id || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                milestone_id: e.target.value || null,
              })
            }
          >
            <option value="">No milestone</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {/* Due Date */}
      <FormField label="Due Date" icon={Calendar}>
        <Input
          type="date"
          value={formData.due_date?.split("T")[0] || ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              due_date: e.target.value ? `${e.target.value}T00:00:00Z` : null,
            })
          }
        />
      </FormField>

      {/* Requires Review */}
      <CheckboxField
        label="Requires review before completion"
        checked={formData.requires_review || false}
        onChange={(checked) =>
          setFormData({ ...formData, requires_review: checked })
        }
      />
    </FormModal>
  );
}
