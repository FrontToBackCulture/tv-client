// src/modules/product/CategoryLibraryPanel.tsx
// Editable panel for managing classification values used across data models.
// Values persist to localStorage via the classification store.

import { useState, useRef } from "react";
import { Database, Tag, Folder, Activity, CheckCircle, Server, X, Plus, RotateCcw } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  useClassificationStore,
  type ClassificationField,
} from "../../stores/classificationStore";

const TAB_CONFIG: {
  id: string;
  field: ClassificationField;
  label: string;
  icon: typeof Tag;
}[] = [
  { id: "category", field: "dataCategory", label: "Category", icon: Folder },
  { id: "sub-category", field: "dataSubCategory", label: "Sub Category", icon: Tag },
  { id: "tags", field: "tags", label: "Tags", icon: Tag },
  { id: "source", field: "dataSource", label: "Data Source", icon: Activity },
  { id: "source-system", field: "sourceSystem", label: "Source System", icon: Server },
  { id: "data-type", field: "dataType", label: "Data Type", icon: Database },
  { id: "status", field: "usageStatus", label: "Usage Status", icon: CheckCircle },
  { id: "action", field: "action", label: "Action", icon: CheckCircle },
];

export function CategoryLibraryPanel() {
  const [activeTabId, setActiveTabId] = useState("category");
  const [newValue, setNewValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { values, addValue, removeValue, resetField } = useClassificationStore();

  const activeTab = TAB_CONFIG.find((t) => t.id === activeTabId) ?? TAB_CONFIG[0];
  const activeValues = values[activeTab.field];

  const handleAdd = () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    addValue(activeTab.field, trimmed);
    setNewValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Category Library
          </h2>
          <p className="text-sm text-zinc-500">
            Edit classification values used in data model dropdowns
          </p>
        </div>
        <button
          onClick={() => resetField(activeTab.field)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          title={`Reset ${activeTab.label} to defaults`}
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800 flex gap-1 overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTabId === tab.id;
          const count = values[tab.field].length;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTabId(tab.id); setNewValue(""); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
                isActive
                  ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
              )}
            >
              <Icon size={12} />
              {tab.label}
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] rounded-full",
                isActive
                  ? "bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200"
                  : "bg-slate-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Add new value */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Add new ${activeTab.label.toLowerCase()}...`}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newValue.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-wrap gap-2">
          {activeValues.map((value) => (
            <div
              key={value}
              className="group flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
            >
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {value}
              </span>
              <button
                onClick={() => removeValue(activeTab.field, value)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                title={`Remove "${value}"`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {activeValues.length === 0 && (
            <p className="text-sm text-zinc-400 italic">No values. Add one above or reset to defaults.</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-zinc-800 text-xs text-zinc-500">
        {activeValues.length} values - used as dropdown options when classifying data models
      </div>
    </div>
  );
}
