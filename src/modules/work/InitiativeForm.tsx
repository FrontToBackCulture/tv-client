// src/modules/work/InitiativeForm.tsx
// Modal form for creating/editing initiatives with project assignment

import { useState, useMemo } from "react";
import {
  useCreateInitiative,
  useUpdateInitiative,
  useUsers,
  useProjects,
} from "../../hooks/work";
import { useSetInitiativeProjects } from "../../hooks/work/useInitiatives";
import type {
  Initiative,
  InitiativeInsert,
  InitiativeUpdate,
} from "../../lib/work/types";
import {
  InitiativeStatusLabels,
  InitiativeHealthLabels,
} from "../../lib/work/types";
import type { InitiativeStatus, InitiativeHealth } from "../../lib/work/types";
import { Calendar, User as UserIcon } from "lucide-react";
import { FormModal } from "../../components/ui/FormModal";
import { FormField, Input, Select, Textarea } from "../../components/ui";
import { toast } from "../../stores/toastStore";
import type { InitiativeProjectLink } from "./workViewsShared";

interface InitiativeFormProps {
  initiative?: Initiative;
  initiativeLinks?: InitiativeProjectLink[];
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

export function InitiativeForm({
  initiative,
  initiativeLinks = [],
  onClose,
  onSaved,
}: InitiativeFormProps) {
  const { data: users = [] } = useUsers();
  const { data: projects = [] } = useProjects();

  const currentProjectIds = useMemo(
    () =>
      initiative
        ? initiativeLinks
            .filter((l) => l.initiative_id === initiative.id)
            .map((l) => l.project_id)
        : [],
    [initiative, initiativeLinks]
  );

  const [formData, setFormData] = useState<
    Partial<InitiativeInsert | InitiativeUpdate>
  >({
    name: initiative?.name || "",
    description: initiative?.description || "",
    status: initiative?.status || "planned",
    health: initiative?.health || null,
    owner_id: initiative?.owner_id || null,
    target_date: initiative?.target_date || null,
    color: initiative?.color || "#0D7680",
  });
  const [selectedProjectIds, setSelectedProjectIds] =
    useState<string[]>(currentProjectIds);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateInitiative();
  const updateMutation = useUpdateInitiative();
  const setProjectsMutation = useSetInitiativeProjects();

  const isEditing = !!initiative;
  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    setProjectsMutation.isPending;

  // Find which projects are assigned to OTHER initiatives
  const takenProjectIds = useMemo(() => {
    const taken = new Set<string>();
    for (const link of initiativeLinks) {
      if (!initiative || link.initiative_id !== initiative.id) {
        taken.add(link.project_id);
      }
    }
    return taken;
  }, [initiativeLinks, initiative]);

  function toggleProject(projectId: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name?.trim()) {
      setError("Name is required");
      return;
    }

    setError(null);

    try {
      let initiativeId: string;

      if (isEditing) {
        await updateMutation.mutateAsync({
          id: initiative.id,
          updates: formData as InitiativeUpdate,
        });
        initiativeId = initiative.id;
      } else {
        const slug =
          slugify(formData.name) || `init-${Date.now().toString(36)}`;
        const created = await createMutation.mutateAsync({
          ...formData,
          name: formData.name!,
          slug,
        } as InitiativeInsert);
        initiativeId = created.id;
      }

      // Update project assignments
      await setProjectsMutation.mutateAsync({
        initiativeId,
        projectIds: selectedProjectIds,
      });

      toast.success(isEditing ? "Initiative updated" : "Initiative created");
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save initiative"
      );
    }
  }

  return (
    <FormModal
      title={isEditing ? "Edit Initiative" : "New Initiative"}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? "Save Changes" : "Create Initiative"}
      isSaving={isSaving}
      error={error}
    >
      {/* Name */}
      <FormField label="Name" required>
        <Input
          type="text"
          value={formData.name || ""}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Initiative name..."
          autoFocus
        />
      </FormField>

      {/* Description */}
      <FormField label="Description">
        <Textarea
          value={formData.description || ""}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          rows={3}
          placeholder="What is this initiative about?"
        />
      </FormField>

      {/* Status & Health */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Status">
          <Select
            value={formData.status || "planned"}
            onChange={(e) =>
              setFormData({
                ...formData,
                status: e.target.value as InitiativeStatus,
              })
            }
          >
            {Object.entries(InitiativeStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Health">
          <Select
            value={formData.health || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                health: (e.target.value as InitiativeHealth) || null,
              })
            }
          >
            <option value="">Not set</option>
            {Object.entries(InitiativeHealthLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {/* Owner & Target Date */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Owner" icon={UserIcon}>
          <Select
            value={formData.owner_id || ""}
            onChange={(e) => {
              const selectedUser = users.find(u => u.id === e.target.value);
              setFormData({
                ...formData,
                owner_id: e.target.value || null,
                owner: selectedUser?.name || null,
              });
            }}
          >
            <option value="">No owner</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
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
                target_date: e.target.value
                  ? `${e.target.value}T00:00:00Z`
                  : null,
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
            className="w-8 h-8 rounded cursor-pointer border border-zinc-200 dark:border-zinc-700"
          />
          <span className="text-xs text-zinc-500 font-mono">
            {formData.color || "#0D7680"}
          </span>
        </div>
      </FormField>

      {/* Projects */}
      <FormField label="Projects">
        {projects.length === 0 ? (
          <p className="text-xs text-zinc-400">No projects available</p>
        ) : (
          <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 p-2">
            {projects.map((p) => {
              const isSelected = selectedProjectIds.includes(p.id);
              const isTaken = takenProjectIds.has(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    isTaken
                      ? "opacity-40 cursor-not-allowed"
                      : isSelected
                        ? "bg-teal-50 dark:bg-teal-900/20"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isTaken}
                    onChange={() => !isTaken && toggleProject(p.id)}
                    className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: p.color || "#6B7280" }}
                  />
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate">
                    {p.name}
                  </span>
                  {isTaken && (
                    <span className="text-xs text-zinc-400 flex-shrink-0">
                      In another initiative
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </FormField>
    </FormModal>
  );
}
