// src/modules/work/ProjectForm.tsx
// Modal form for creating/editing projects

import { useState } from "react";
import {
  useCreateProject,
  useUpdateProject,
} from "../../hooks/work/useProjects";
import { useUsers, useInitiatives } from "../../hooks/work";
import type {
  Project,
  ProjectInsert,
  ProjectUpdate,
} from "../../lib/work/types";
import {
  ProjectStatusLabels,
  ProjectHealthLabels,
} from "../../lib/work/types";
import type { ProjectStatus, ProjectHealth } from "../../lib/work/types";
import { Calendar, User as UserIcon } from "lucide-react";
import { FormModal } from "../../components/ui/FormModal";
import { FormField, Input, Select, Textarea } from "../../components/ui";
import { toast } from "../../stores/toastStore";
import { supabase } from "../../lib/supabase";

interface ProjectFormProps {
  project?: Project;
  onClose: () => void;
  onSaved: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

function prefixFromName(name: string): string {
  return name
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
}

export function ProjectForm({ project, onClose, onSaved }: ProjectFormProps) {
  const { data: users = [] } = useUsers();
  const { data: initiatives = [] } = useInitiatives();

  const [formData, setFormData] = useState<Partial<ProjectInsert | ProjectUpdate>>({
    name: project?.name || "",
    description: project?.description || "",
    status: project?.status || "active",
    health: project?.health || null,
    lead: project?.lead || null,
    lead_id: project?.lead_id || null,
    target_date: project?.target_date || null,
    color: project?.color || "#0D7680",
    identifier_prefix: project?.identifier_prefix || "",
    priority: project?.priority ?? null,
    project_type: project?.project_type || "work",
    folder_path: project?.folder_path || "",
  });
  const [initiativeId, setInitiativeId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();

  const isEditing = !!project;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name?.trim()) {
      setError("Name is required");
      return;
    }

    setError(null);

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: project.id,
          updates: formData as ProjectUpdate,
        });
      } else {
        const baseSlug = slugify(formData.name) || `proj-${Date.now().toString(36)}`;
        // Check for existing slug and append suffix if needed
        const { data: existing } = await supabase.from("projects").select("slug").eq("slug", baseSlug).maybeSingle();
        const slug = existing ? `${baseSlug}-${Date.now().toString(36).slice(-4)}` : baseSlug;
        let prefix = (formData as ProjectInsert).identifier_prefix?.trim() || prefixFromName(formData.name);
        // Ensure prefix is unique — append number if taken
        const { data: conflictingPrefixes } = await supabase.from("projects").select("identifier_prefix").like("identifier_prefix", `${prefix}%`);
        if (conflictingPrefixes?.some(p => p.identifier_prefix === prefix)) {
          let suffix = 2;
          while (conflictingPrefixes.some(p => p.identifier_prefix === `${prefix}${suffix}`)) suffix++;
          prefix = `${prefix}${suffix}`;
        }
        const created = await createMutation.mutateAsync({
          ...formData,
          name: formData.name!,
          slug,
          identifier_prefix: prefix,
        } as ProjectInsert);

        // Add to initiative if selected
        if (initiativeId && created?.id) {
          await supabase.from("initiative_projects").insert({
            initiative_id: initiativeId,
            project_id: created.id,
          });
        }
      }

      toast.success(isEditing ? "Project updated" : "Project created");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
    }
  }

  return (
    <FormModal
      title={isEditing ? "Edit Project" : "New Project"}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? "Save Changes" : "Create Project"}
      isSaving={isSaving}
      error={error}
    >
      {/* Name */}
      <FormField label="Name" required>
        <Input
          type="text"
          value={formData.name || ""}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Project name..."
          autoFocus
        />
      </FormField>

      {/* Description */}
      <FormField label="Description">
        <Textarea
          value={formData.description || ""}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          placeholder="What is this project about?"
        />
      </FormField>

      {/* Identifier Prefix */}
      <FormField label="Prefix">
        <Input
          type="text"
          value={(formData as any).identifier_prefix || ""}
          onChange={(e) =>
            setFormData({ ...formData, identifier_prefix: e.target.value.toUpperCase().slice(0, 6) })
          }
          placeholder={formData.name ? prefixFromName(formData.name) : "e.g. PROJ"}
          maxLength={6}
        />
        <p className="text-[10px] text-zinc-400 mt-1">Used for task IDs (e.g. PROJ-1, PROJ-2)</p>
      </FormField>

      {/* Type & Initiative */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Type">
          <Select
            value={formData.project_type || "work"}
            onChange={(e) => setFormData({ ...formData, project_type: e.target.value as "work" | "deal" })}
          >
            <option value="work">Work</option>
            <option value="deal">Deal</option>
          </Select>
        </FormField>

        <FormField label="Initiative">
          <Select
            value={initiativeId}
            onChange={(e) => setInitiativeId(e.target.value)}
          >
            <option value="">No initiative</option>
            {initiatives.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </Select>
        </FormField>
      </div>

      {/* Status & Health */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Status">
          <Select
            value={formData.status || "active"}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
          >
            {Object.entries(ProjectStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Health">
          <Select
            value={formData.health || ""}
            onChange={(e) => setFormData({ ...formData, health: (e.target.value as ProjectHealth) || null })}
          >
            <option value="">Not set</option>
            {Object.entries(ProjectHealthLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormField>
      </div>

      {/* Lead & Target Date */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Lead" icon={UserIcon}>
          <Select
            value={formData.lead_id || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                lead_id: e.target.value || null,
                lead: e.target.value || null,
              })
            }
          >
            <option value="">No lead</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Target Date" icon={Calendar}>
          <Input
            type="date"
            value={formData.target_date?.split("T")[0] || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                target_date: e.target.value ? `${e.target.value}T00:00:00Z` : null,
              })
            }
          />
        </FormField>
      </div>

      {/* Color */}
      <FormField label="Color">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={formData.color || "#0D7680"}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border border-zinc-200 dark:border-zinc-800"
          />
          <span className="text-xs text-zinc-500 font-mono">{formData.color || "#0D7680"}</span>
        </div>
      </FormField>

      {/* Folder path — used to scope task attachments, activity logs, and bot-saved files */}
      <FormField label="Folder path">
        <Input
          type="text"
          value={formData.folder_path || ""}
          onChange={(e) => setFormData({ ...formData, folder_path: e.target.value || null })}
          placeholder="e.g. 3_Clients/uob/projects/sow-q1-2026"
        />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          Filesystem path (relative to tv-knowledge root) where this project's files, task attachments, and bot-generated artifacts are stored.
        </p>
      </FormField>
    </FormModal>
  );
}
