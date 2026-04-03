// src/modules/product/EntityForm.tsx
// Shared create modal for all product entity types

import { useState } from "react";
import {
  useCreateProductModule,
  useCreateProductFeature,
  useCreateProductConnector,
  useCreateProductSolution,
  useCreateProductRelease,
  useCreateProductDeployment,
  useProductModules,
} from "../../hooks/product";
import {
  MODULE_LAYERS,
  MODULE_STATUSES,
  FEATURE_STATUSES,
  CONNECTOR_TYPES,
  CONNECTOR_STATUSES,
  SOLUTION_STATUSES,
  RELEASE_STATUSES,
  DEPLOYMENT_STATUSES,
  PLATFORM_CATEGORIES,
} from "../../lib/product/types";
import type { ProductEntityType } from "../../lib/product/types";
import { X } from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import { toast } from "../../stores/toastStore";
import { FormField, Input, Select, Textarea } from "../../components/ui";

interface EntityFormProps {
  entityType: ProductEntityType;
  onClose: () => void;
  onSaved: () => void;
}

const TITLES: Record<ProductEntityType, string> = {
  module: "New Module",
  feature: "New Feature",
  connector: "New Connector",
  solution: "New Solution",
  release: "New Release",
  deployment: "New Deployment",
};

export function EntityForm({ entityType, onClose, onSaved }: EntityFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const createModule = useCreateProductModule();
  const createFeature = useCreateProductFeature();
  const createConnector = useCreateProductConnector();
  const createSolution = useCreateProductSolution();
  const createRelease = useCreateProductRelease();
  const createDeployment = useCreateProductDeployment();

  // For feature creation — need module list
  const { data: modules } = useProductModules();

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    try {
      switch (entityType) {
        case "module":
          await createModule.mutateAsync({
            name: name.trim(),
            slug: name.trim().toLowerCase().replace(/\s+/g, "-"),
            layer: (extra.layer as "connectivity" | "application" | "experience") || "application",
            description: description || null,
            status: (extra.status as "active" | "maintenance" | "deprecated") || "active",
          });
          break;
        case "feature":
          await createFeature.mutateAsync({
            name: name.trim(),
            module_id: extra.module_id || (modules?.[0]?.id ?? ""),
            description: description || null,
            category: extra.category || null,
            status: (extra.status as "planned" | "alpha" | "beta" | "ga" | "deprecated") || "planned",
          });
          break;
        case "connector":
          await createConnector.mutateAsync({
            name: name.trim(),
            platform_category: extra.platform_category || "Other",
            connector_type: (extra.connector_type as "api" | "report_translator" | "rpa" | "hybrid") || "api",
            description: description || null,
            status: (extra.status as "planned" | "development" | "active" | "maintenance" | "deprecated") || "active",
          });
          break;
        case "solution":
          await createSolution.mutateAsync({
            name: name.trim(),
            description: description || null,
            target_industry: extra.target_industry || null,
            status: (extra.status as "draft" | "active" | "sunset") || "draft",
          });
          break;
        case "release":
          await createRelease.mutateAsync({
            version: extra.version || name.trim(),
            name: name.trim(),
            description: description || null,
            release_date: extra.release_date || null,
            status: (extra.status as "planned" | "in_progress" | "released") || "planned",
          });
          break;
        case "deployment":
          await createDeployment.mutateAsync({
            domain_id: name.trim(),
            description: description || null,
            status: (extra.status as "active" | "inactive" | "trial") || "trial",
          });
          break;
      }
      toast.success(`${TITLES[entityType].replace("New ", "")} created`);
      onSaved();
    } catch (err) {
      toast.error(`Failed to create ${entityType}`);
      console.error("Failed to create entity:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg w-full max-w-md mx-4 border border-zinc-200 dark:border-zinc-800 animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{TITLES[entityType]}</h3>
          <IconButton onClick={onClose} icon={X} label="Close" />
        </div>

        {/* Form */}
        <div className="p-4 space-y-3">
          {/* Name */}
          <FormField label={entityType === "deployment" ? "Domain ID" : "Name"}>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={entityType === "deployment" ? "e.g. koi" : "Enter name..."}
              autoFocus
            />
          </FormField>

          {/* Description */}
          <FormField label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </FormField>

          {/* Module-specific: Layer */}
          {entityType === "module" && (
            <FormField label="Layer">
              <Select
                value={extra.layer || "application"}
                onChange={(e) => setExtra({ ...extra, layer: e.target.value })}
              >
                {MODULE_LAYERS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </Select>
            </FormField>
          )}

          {/* Feature-specific: Module */}
          {entityType === "feature" && (
            <FormField label="Module">
              <Select
                value={extra.module_id || ""}
                onChange={(e) => setExtra({ ...extra, module_id: e.target.value })}
              >
                <option value="">Select module...</option>
                {(modules ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </FormField>
          )}

          {/* Connector-specific: Type & Category */}
          {entityType === "connector" && (
            <>
              <FormField label="Type">
                <Select
                  value={extra.connector_type || "api"}
                  onChange={(e) => setExtra({ ...extra, connector_type: e.target.value })}
                >
                  {CONNECTOR_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Platform Category">
                <Select
                  value={extra.platform_category || "Other"}
                  onChange={(e) => setExtra({ ...extra, platform_category: e.target.value })}
                >
                  {PLATFORM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </FormField>
            </>
          )}

          {/* Release-specific: Version & Date */}
          {entityType === "release" && (
            <>
              <FormField label="Version">
                <Input
                  type="text"
                  value={extra.version || ""}
                  onChange={(e) => setExtra({ ...extra, version: e.target.value })}
                  placeholder="e.g. 4.2.0"
                />
              </FormField>
              <FormField label="Release Date">
                <Input
                  type="date"
                  value={extra.release_date || ""}
                  onChange={(e) => setExtra({ ...extra, release_date: e.target.value })}
                />
              </FormField>
            </>
          )}

          {/* Status selector — context-sensitive */}
          <FormField label="Status">
            <Select
              value={extra.status || ""}
              onChange={(e) => setExtra({ ...extra, status: e.target.value })}
            >
              {entityType === "module" && MODULE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "feature" && FEATURE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "connector" && CONNECTOR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "solution" && SOLUTION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "release" && RELEASE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "deployment" && DEPLOYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </FormField>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
          <Button
            onClick={onClose}
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            loading={saving}
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
