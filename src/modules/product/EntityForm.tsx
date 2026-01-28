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
} from "../../hooks/useProduct";
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
import { X, Loader2 } from "lucide-react";

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
      onSaved();
    } catch (err) {
      console.error("Failed to create entity:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4 border border-slate-200 dark:border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{TITLES[entityType]}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-3">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1">
              {entityType === "deployment" ? "Domain ID" : entityType === "release" ? "Name" : "Name"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={entityType === "deployment" ? "e.g. koi" : "Enter name..."}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500 resize-none"
            />
          </div>

          {/* Module-specific: Layer */}
          {entityType === "module" && (
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">Layer</label>
              <select
                value={extra.layer || "application"}
                onChange={(e) => setExtra({ ...extra, layer: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
              >
                {MODULE_LAYERS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Feature-specific: Module */}
          {entityType === "feature" && (
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">Module</label>
              <select
                value={extra.module_id || ""}
                onChange={(e) => setExtra({ ...extra, module_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
              >
                <option value="">Select module...</option>
                {(modules ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Connector-specific: Type & Category */}
          {entityType === "connector" && (
            <>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Type</label>
                <select
                  value={extra.connector_type || "api"}
                  onChange={(e) => setExtra({ ...extra, connector_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
                >
                  {CONNECTOR_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Platform Category</label>
                <select
                  value={extra.platform_category || "Other"}
                  onChange={(e) => setExtra({ ...extra, platform_category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
                >
                  {PLATFORM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Release-specific: Version & Date */}
          {entityType === "release" && (
            <>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Version</label>
                <input
                  type="text"
                  value={extra.version || ""}
                  onChange={(e) => setExtra({ ...extra, version: e.target.value })}
                  placeholder="e.g. 4.2.0"
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Release Date</label>
                <input
                  type="date"
                  value={extra.release_date || ""}
                  onChange={(e) => setExtra({ ...extra, release_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            </>
          )}

          {/* Status selector — context-sensitive */}
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1">Status</label>
            <select
              value={extra.status || ""}
              onChange={(e) => setExtra({ ...extra, status: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-teal-500"
            >
              {entityType === "module" && MODULE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "feature" && FEATURE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "connector" && CONNECTOR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "solution" && SOLUTION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "release" && RELEASE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              {entityType === "deployment" && DEPLOYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
