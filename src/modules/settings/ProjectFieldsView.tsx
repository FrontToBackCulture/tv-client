// src/modules/settings/ProjectFieldsView.tsx
// Settings view to configure which fields appear on project detail pages per project type
// Supports: toggle fields, edit label/type, manage select options, add custom fields

import { useState } from "react";
import { RotateCcw, Plus, Trash2, ChevronDown, ChevronRight, GripVertical, X } from "lucide-react";
import {
  useProjectFieldsStore,
  getFieldDefsForType,
  PROJECT_TYPES,
  FIELD_TYPE_CONFIG,
  BUILT_IN_FIELDS,
  DEAL_BUILT_IN_FIELDS,
  type ProjectType,
  type FieldType,
  type CustomFieldDef,
} from "../../stores/projectFieldsStore";
import { cn } from "../../lib/cn";

const FIELD_TYPES: FieldType[] = ["text", "number", "date", "select", "textarea"];

export function ProjectFieldsView() {
  const [activeType, setActiveType] = useState<ProjectType>("work");
  const store = useProjectFieldsStore();

  const enabledFields = store.configs[activeType] ?? [];
  const deletedFieldKeys = store.deletedFields[activeType] ?? [];

  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");

  const allFields = getFieldDefsForType(activeType);
  const builtInFields = allFields.filter((f) => f.builtIn);
  const customFields = allFields.filter((f) => !f.builtIn);
  const activeTypeInfo = PROJECT_TYPES.find((t) => t.key === activeType)!;

  function handleAddCustomField() {
    if (!newFieldLabel.trim()) return;
    const key = `custom_${Date.now()}`;
    const field: CustomFieldDef = {
      key,
      label: newFieldLabel.trim(),
      type: newFieldType,
      options: newFieldType === "select" ? [{ value: "option_1", label: "Option 1" }] : undefined,
    };
    store.addCustomField(activeType, field);
    setNewFieldLabel("");
    setNewFieldType("text");
    setShowAddField(false);
    setExpandedField(key);
  }

  function handleUpdateLabel(fieldKey: string, label: string, isCustom: boolean) {
    if (isCustom) {
      store.updateCustomField(activeType, fieldKey, { label });
    } else {
      store.setFieldOverride(activeType, fieldKey, { label });
    }
  }

  function handleUpdateType(fieldKey: string, type: FieldType, isCustom: boolean) {
    if (isCustom) {
      store.updateCustomField(activeType, fieldKey, {
        type,
        options: type === "select" ? [{ value: "option_1", label: "Option 1" }] : undefined,
      });
    } else {
      store.setFieldOverride(activeType, fieldKey, { type });
    }
  }

  function handleUpdateOptions(fieldKey: string, options: { value: string; label: string }[], isCustom: boolean) {
    if (isCustom) {
      store.updateCustomField(activeType, fieldKey, { options });
    } else {
      store.setFieldOverride(activeType, fieldKey, { options });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Project Fields</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Configure which fields appear on project detail pages. Edit labels, types, and add custom fields.
        </p>
      </div>

      {/* Project type tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
        {PROJECT_TYPES.map((pt) => (
          <button
            key={pt.key}
            onClick={() => { setActiveType(pt.key); setExpandedField(null); setShowAddField(false); }}
            className={cn(
              "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeType === pt.key
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            {pt.label}
          </button>
        ))}
      </div>

      {/* Type description + reset */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">{activeTypeInfo.description}</p>
        <button
          onClick={() => { store.resetToDefaults(activeType); setExpandedField(null); }}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={12} />
          Reset to defaults
        </button>
      </div>

      {/* Field list */}
      <div className="space-y-4">
        {/* Built-in fields */}
        {builtInFields.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
            Built-in Fields
          </h3>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {builtInFields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                enabled={enabledFields.includes(field.key)}
                expanded={expandedField === field.key}
                onToggle={() => store.toggleField(activeType, field.key)}
                onExpand={() => setExpandedField(expandedField === field.key ? null : field.key)}
                onUpdateLabel={(label) => handleUpdateLabel(field.key, label, false)}
                onUpdateType={(type) => handleUpdateType(field.key, type, false)}
                onUpdateOptions={(options) => handleUpdateOptions(field.key, options, false)}
                onDelete={() => { store.deleteBuiltInField(activeType, field.key); setExpandedField(null); }}
              />
            ))}
          </div>
        </div>
        )}

        {/* Custom fields */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Custom Fields {customFields.length > 0 && `(${customFields.length})`}
            </h3>
          </div>

          {customFields.length > 0 && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/50 mb-3">
              {customFields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  enabled={enabledFields.includes(field.key)}
                  expanded={expandedField === field.key}
                  onToggle={() => store.toggleField(activeType, field.key)}
                  onExpand={() => setExpandedField(expandedField === field.key ? null : field.key)}
                  onUpdateLabel={(label) => handleUpdateLabel(field.key, label, true)}
                  onUpdateType={(type) => handleUpdateType(field.key, type, true)}
                  onUpdateOptions={(options) => handleUpdateOptions(field.key, options, true)}
                  onDelete={() => { store.removeCustomField(activeType, field.key); setExpandedField(null); }}
                />
              ))}
            </div>
          )}

          {/* Add custom field */}
          {showAddField ? (
            <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="Field name..."
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomField(); if (e.key === "Escape") setShowAddField(false); }}
                  className="flex-1 text-sm px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-teal-500/30"
                />
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as FieldType)}
                  className="text-sm px-2 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-teal-500/30"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>{FIELD_TYPE_CONFIG[t].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowAddField(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-2.5 py-1 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomField}
                  disabled={!newFieldLabel.trim()}
                  className="text-xs bg-teal-600 text-white px-3 py-1 rounded font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add Field
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddField(true)}
              className="flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-medium transition-colors"
            >
              <Plus size={14} />
              Add custom field
            </button>
          )}
        </div>

        {/* Deleted fields — restore */}
        {deletedFieldKeys.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
              Deleted Fields ({deletedFieldKeys.length})
            </h3>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {deletedFieldKeys.map((key) => {
                const allBuiltIn = activeType === "deal" ? [...BUILT_IN_FIELDS, ...DEAL_BUILT_IN_FIELDS] : BUILT_IN_FIELDS;
                const original = allBuiltIn.find((f) => f.key === key);
                if (!original) return null;
                const typeConfig = FIELD_TYPE_CONFIG[original.type];
                return (
                  <div key={key} className="flex items-center gap-2 px-3 py-2.5 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <span className="text-sm text-zinc-400 line-through flex-1">{original.label}</span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full opacity-50"
                      style={{ backgroundColor: `${typeConfig.color}15`, color: typeConfig.color }}
                    >
                      {typeConfig.label}
                    </span>
                    <span className="text-[10px] text-zinc-300 dark:text-zinc-600 font-mono">{key}</span>
                    <button
                      onClick={() => store.restoreBuiltInField(activeType, key)}
                      className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium px-2 py-0.5 rounded hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
                    >
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FieldRow — single field with toggle, type badge, expandable editor
// ============================================================================

function FieldRow({
  field,
  enabled,
  expanded,
  onToggle,
  onExpand,
  onUpdateLabel,
  onUpdateType,
  onUpdateOptions,
  onDelete,
}: {
  field: { key: string; label: string; type: FieldType; options?: { value: string; label: string }[]; builtIn: boolean };
  enabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onUpdateLabel: (label: string) => void;
  onUpdateType: (type: FieldType) => void;
  onUpdateOptions: (options: { value: string; label: string }[]) => void;
  onDelete: (() => void) | null;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(field.label);
  const typeConfig = FIELD_TYPE_CONFIG[field.type];

  function saveLabel() {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== field.label) {
      onUpdateLabel(trimmed);
    }
    setEditingLabel(false);
  }

  return (
    <div>
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        {/* Expand chevron */}
        <button
          onClick={onExpand}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-0.5"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Label (click to edit) */}
        <div className="flex-1 min-w-0">
          {editingLabel ? (
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => { if (e.key === "Enter") saveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
              autoFocus
              className="text-sm font-medium bg-transparent border-b border-teal-500 text-zinc-900 dark:text-zinc-100 outline-none w-full"
            />
          ) : (
            <span
              onClick={() => { setLabelDraft(field.label); setEditingLabel(true); }}
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100 cursor-text hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
            >
              {field.label}
            </span>
          )}
        </div>

        {/* Type badge */}
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: `${typeConfig.color}15`, color: typeConfig.color }}
        >
          {typeConfig.label}
        </span>

        {/* DB key */}
        <span className="text-[10px] text-zinc-300 dark:text-zinc-600 font-mono flex-shrink-0 hidden sm:inline">
          {field.key}
        </span>

        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ml-1",
            enabled ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-600"
          )}
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-200 transition-transform",
              enabled ? "translate-x-4" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 ml-7 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/30">
          {/* Type selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 w-16">Type</span>
            <div className="flex gap-1">
              {FIELD_TYPES.map((t) => {
                const tc = FIELD_TYPE_CONFIG[t];
                const isActive = field.type === t;
                return (
                  <button
                    key={t}
                    onClick={() => onUpdateType(t)}
                    className={cn(
                      "text-[11px] font-medium px-2 py-1 rounded transition-colors",
                      isActive
                        ? "ring-1 ring-offset-1"
                        : "opacity-50 hover:opacity-80"
                    )}
                    style={{
                      backgroundColor: `${tc.color}15`,
                      color: tc.color,
                      ...(isActive ? { ['--tw-ring-color' as string]: tc.color } : {}),
                    }}
                  >
                    {tc.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select options editor */}
          {field.type === "select" && (
            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Options</span>
              <div className="space-y-1">
                {(field.options ?? []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <GripVertical size={12} className="text-zinc-300 flex-shrink-0" />
                    <input
                      type="text"
                      value={opt.value}
                      onChange={(e) => {
                        const updated = [...(field.options ?? [])];
                        updated[i] = { ...updated[i], value: e.target.value };
                        onUpdateOptions(updated);
                      }}
                      placeholder="value"
                      className="w-28 text-xs px-2 py-1 border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-teal-500/30 font-mono"
                    />
                    <input
                      type="text"
                      value={opt.label}
                      onChange={(e) => {
                        const updated = [...(field.options ?? [])];
                        updated[i] = { ...updated[i], label: e.target.value };
                        onUpdateOptions(updated);
                      }}
                      placeholder="Label"
                      className="flex-1 text-xs px-2 py-1 border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-teal-500/30"
                    />
                    <button
                      onClick={() => {
                        const updated = (field.options ?? []).filter((_, j) => j !== i);
                        onUpdateOptions(updated);
                      }}
                      className="text-zinc-400 hover:text-red-500 p-0.5 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  const current = field.options ?? [];
                  const nextNum = current.length + 1;
                  onUpdateOptions([...current, { value: `option_${nextNum}`, label: `Option ${nextNum}` }]);
                }}
                className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium flex items-center gap-1"
              >
                <Plus size={12} />
                Add option
              </button>
            </div>
          )}

          {/* Delete (custom fields only) */}
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} />
              Remove field
            </button>
          )}

          {field.builtIn && (
            <p className="text-[10px] text-zinc-400 italic">
              Built-in field — maps to database column <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{field.key}</code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
