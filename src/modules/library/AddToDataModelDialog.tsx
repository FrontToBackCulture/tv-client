// src/modules/library/AddToDataModelDialog.tsx
// Dialog for adding a domain table to the Data Model (generates schema.json)

import { useState, useRef, useEffect, useMemo } from "react";
import { Database, X, Loader2, CheckCircle } from "lucide-react";
import { TableInfo } from "./DataModelsAgGrid";
import {
  useCreateDomainModelSchema,
  useDomainModelEntities,
  EntityInfo,
} from "../../hooks/useValSync";
import { useRepository } from "../../stores/repositoryStore";

interface AddToDataModelDialogProps {
  table: TableInfo;
  dataModelsPath: string;
  onClose: () => void;
}

export function AddToDataModelDialog({
  table,
  dataModelsPath,
  onClose,
}: AddToDataModelDialogProps) {
  const [entityName, setEntityName] = useState("");
  const [modelName, setModelName] = useState("udt");
  const [showEntityDropdown, setShowEntityDropdown] = useState(false);
  const entityInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { activeRepository } = useRepository();
  const entitiesBasePath = activeRepository
    ? `${activeRepository.path}/0_Platform/architecture/domain-model/entities`
    : null;

  const entitiesQuery = useDomainModelEntities(entitiesBasePath);
  const createSchema = useCreateDomainModelSchema();

  // Definition path for this table
  const definitionPath = `${dataModelsPath}/table_${table.name}/definition.json`;

  // Existing entity names for the combobox
  const existingEntities: string[] = useMemo(() => {
    if (!entitiesQuery.data) return [];
    return entitiesQuery.data.map((e: EntityInfo) => e.name).sort();
  }, [entitiesQuery.data]);

  // Filtered entities based on input
  const filteredEntities = useMemo(() => {
    if (!entityName) return existingEntities;
    const lower = entityName.toLowerCase();
    return existingEntities.filter((e) => e.toLowerCase().includes(lower));
  }, [existingEntities, entityName]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        entityInputRef.current &&
        !entityInputRef.current.contains(e.target as Node)
      ) {
        setShowEntityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const canSubmit =
    entityName.trim() !== "" &&
    modelName.trim() !== "" &&
    entitiesBasePath !== null &&
    !createSchema.isPending;

  const handleSubmit = () => {
    if (!canSubmit || !entitiesBasePath) return;
    createSchema.mutate({
      definitionPath,
      entityName: entityName.trim(),
      modelName: modelName.trim(),
      entitiesBasePath,
      tableDisplayName: table.displayName || table.name,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Add to Data Model
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Read-only table info */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800/50 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Table</span>
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {table.name}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Display Name</span>
              <span className="text-zinc-700 dark:text-zinc-300">
                {table.displayName || "-"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Columns</span>
              <span className="text-zinc-700 dark:text-zinc-300">
                {table.columnCount ?? "-"}
              </span>
            </div>
          </div>

          {/* Entity name - combobox */}
          <div className="relative">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Entity Name
            </label>
            <input
              ref={entityInputRef}
              type="text"
              value={entityName}
              onChange={(e) => {
                setEntityName(e.target.value);
                setShowEntityDropdown(true);
              }}
              onFocus={() => setShowEntityDropdown(true)}
              placeholder="e.g., receipts, payments"
              className="w-full px-3 py-2 text-sm rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              autoFocus
            />
            {showEntityDropdown && filteredEntities.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute left-0 right-0 top-full mt-1 max-h-40 overflow-y-auto bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg z-10"
              >
                {filteredEntities.map((name) => (
                  <button
                    key={name}
                    onClick={() => {
                      setEntityName(name);
                      setShowEntityDropdown(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Model name */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Model Name
            </label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g., udt, un"
              className="w-full px-3 py-2 text-sm rounded border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Success message */}
          {createSchema.isSuccess && createSchema.data && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-xs font-medium mb-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Schema created ({createSchema.data.field_count} fields)
              </div>
              <p className="text-xs text-green-600 dark:text-green-500 font-mono break-all">
                {createSchema.data.schema_path}
              </p>
            </div>
          )}

          {/* Error message */}
          {createSchema.isError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-600 dark:text-red-400">
                {createSchema.error instanceof Error
                  ? createSchema.error.message
                  : String(createSchema.error)}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700"
          >
            {createSchema.isSuccess ? "Close" : "Cancel"}
          </button>
          {!createSchema.isSuccess && (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createSchema.isPending ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Database className="w-3 h-3" />
                  Create Schema
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
