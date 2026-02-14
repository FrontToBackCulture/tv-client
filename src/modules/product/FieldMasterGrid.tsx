// src/modules/product/FieldMasterGrid.tsx
// AG Grid for viewing/editing the cross-entity field master with auto-save + propagation

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import type {
  ColDef,
  ICellRendererParams,
  CellValueChangedEvent,
  ICellEditorParams,
} from "ag-grid-community";
import { useAppStore } from "../../stores/appStore";
import {
  useDomainModelFile,
  useBuildFieldMaster,
  useSaveFieldMaster,
} from "../../hooks/useValSync";
import type { FieldMasterFile, MasterField } from "../../hooks/useValSync";
import { Loader2, Check, RefreshCw, Layers } from "lucide-react";

// ============================================================================
// Constants
// ============================================================================

const GROUP_VALUES = [
  "",
  "identifiers",
  "organization",
  "transaction",
  "product",
  "time",
  "measures",
  "metadata",
];

const PREDEFINED_TAGS = [
  "pii",
  "sensitive",
  "financial",
  "key-metric",
  "dimension",
  "derived",
  "deprecated",
  "required",
  "nullable",
  "standardized",
  "raw",
];

// ============================================================================
// TagsCellRenderer — display tags as colored badges
// ============================================================================

const TagsCellRenderer = (params: ICellRendererParams) => {
  const tags: string[] = params.value ?? [];
  if (tags.length === 0) {
    return <span className="text-zinc-400">&mdash;</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 py-0.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

// ============================================================================
// TagsCellEditor — popup editor with chips + autocomplete input
// ============================================================================

const TagsCellEditor = forwardRef<unknown, ICellEditorParams>((props, ref) => {
  const [tags, setTags] = useState<string[]>(props.value ?? []);
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    getValue: () => tags,
    isPopup: () => true,
    isCancelAfterEnd: () => false,
  }));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed && !tags.includes(trimmed)) {
        setTags((prev) => [...prev, trimmed]);
      }
      setInput("");
      setShowSuggestions(false);
    },
    [tags]
  );

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (!input) return PREDEFINED_TAGS.filter((t) => !tags.includes(t));
    return PREDEFINED_TAGS.filter(
      (t) => t.includes(input.toLowerCase()) && !tags.includes(t)
    );
  }, [input, tags]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      e.stopPropagation();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    } else if (e.key === "Escape") {
      props.stopEditing();
    }
  };

  return (
    <div className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg min-w-[240px]">
      <div className="flex flex-wrap gap-1 mb-2 min-h-[24px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 text-zinc-400 hover:text-red-500 text-xs leading-none"
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setShowSuggestions(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowSuggestions(true)}
        placeholder="Type to add..."
        className="w-full px-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:border-teal-500"
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="mt-1 max-h-[120px] overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => addTag(suggestion)}
              className="w-full text-left px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-teal-50 dark:hover:bg-teal-900/20"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

TagsCellEditor.displayName = "FieldMasterTagsCellEditor";

// ============================================================================
// EntitiesCellRenderer — show entity chips
// ============================================================================

const EntitiesCellRenderer = (params: ICellRendererParams) => {
  const entities: { entity: string; model: string }[] = params.value ?? [];
  if (entities.length === 0) return <span className="text-zinc-400">&mdash;</span>;
  return (
    <div className="flex flex-wrap gap-1 py-0.5">
      {entities.map((e) => (
        <span
          key={`${e.entity}/${e.model}`}
          className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        >
          {e.entity}
        </span>
      ))}
    </div>
  );
};

// ============================================================================
// FieldMasterGrid
// ============================================================================

interface FieldMasterGridProps {
  entitiesPath: string;
}

export function FieldMasterGrid({ entitiesPath }: FieldMasterGridProps) {
  const theme = useAppStore((s) => s.theme);
  const masterFilePath = `${entitiesPath}/_field_master.json`;

  const masterQuery = useDomainModelFile<FieldMasterFile>(masterFilePath);
  const buildMutation = useBuildFieldMaster();
  const saveMutation = useSaveFieldMaster();

  const masterData = masterQuery.data ?? null;

  const [fields, setFields] = useState<MasterField[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const dirtyRef = useRef(false);
  const fieldsRef = useRef<MasterField[]>([]);

  // Sync when masterData changes
  useEffect(() => {
    if (masterData) {
      setFields(masterData.fields);
      fieldsRef.current = masterData.fields;
      dirtyRef.current = false;
      setSaveStatus("idle");
    }
  }, [masterData]);

  // Debounced auto-save + propagate
  useEffect(() => {
    if (!dirtyRef.current || !masterData) return;

    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const updated: FieldMasterFile = {
          ...masterData,
          fields: fieldsRef.current,
          total_fields: fieldsRef.current.length,
        };
        await saveMutation.mutateAsync({
          entitiesPath,
          master: updated,
        });
        dirtyRef.current = false;
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (err) {
        console.error("Failed to save field master:", err);
        setSaveStatus("idle");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [fields, masterData, entitiesPath, saveMutation]);

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const { data, colDef } = event;
    const field = colDef.field as string;
    setFields((prev) => {
      const next = prev.map((f) =>
        f.key === data.key ? { ...f, [field]: data[field] } : f
      );
      fieldsRef.current = next;
      return next;
    });
    dirtyRef.current = true;
  }, []);

  // Entity names for filter dropdown
  const entityNames = useMemo(() => {
    if (!fields.length) return [];
    const names = new Set<string>();
    for (const f of fields) {
      for (const e of f.entities) {
        names.add(e.entity);
      }
    }
    return Array.from(names).sort();
  }, [fields]);

  // Filtered rows
  const filteredFields = useMemo(() => {
    if (entityFilter === "all") return fields;
    return fields.filter((f) =>
      f.entities.some((e) => e.entity === entityFilter)
    );
  }, [fields, entityFilter]);

  const gridStyle = useMemo(
    () =>
      theme === "dark"
        ? ({
            "--ag-background-color": "#09090b",
            "--ag-header-background-color": "#18181b",
            "--ag-odd-row-background-color": "#0f0f12",
            "--ag-row-hover-color": "#1a1a1f",
            "--ag-border-color": "#27272a",
            "--ag-header-foreground-color": "#a1a1aa",
            "--ag-foreground-color": "#d4d4d8",
            "--ag-secondary-foreground-color": "#71717a",
            "--ag-font-size": "13px",
            "--ag-row-border-color": "#1e1e22",
            "--ag-selected-row-background-color": "rgba(20, 184, 166, 0.1)",
            "--ag-range-selection-border-color": "#14b8a6",
          } as React.CSSProperties)
        : ({
            "--ag-background-color": "#ffffff",
            "--ag-header-background-color": "#f8fafc",
            "--ag-odd-row-background-color": "#f8fafc",
            "--ag-row-hover-color": "#f1f5f9",
            "--ag-border-color": "#e4e4e7",
            "--ag-header-foreground-color": "#3f3f46",
            "--ag-foreground-color": "#27272a",
            "--ag-font-size": "13px",
            "--ag-row-border-color": "#f4f4f5",
          } as React.CSSProperties),
    [theme]
  );

  const columnDefs = useMemo<ColDef[]>(
    () => [
      {
        headerName: "#",
        valueGetter: (params) =>
          params.node ? params.node.rowIndex! + 1 : "",
        width: 50,
        suppressSizeToFit: true,
        sortable: false,
        filter: false,
      },
      {
        field: "name",
        headerName: "Name",
        width: 160,
        filter: "agTextColumnFilter",
      },
      {
        field: "column",
        headerName: "Column",
        width: 180,
        filter: "agTextColumnFilter",
        cellClass: "font-mono text-xs",
      },
      {
        field: "type",
        headerName: "Type",
        width: 100,
        filter: "agSetColumnFilter",
      },
      {
        field: "field_id",
        headerName: "Field ID",
        width: 80,
        filter: "agNumberColumnFilter",
        valueFormatter: (params) =>
          params.value != null ? String(params.value) : "",
      },
      {
        field: "group",
        headerName: "Group",
        width: 120,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: GROUP_VALUES },
        filter: "agSetColumnFilter",
        cellClass: "editable-cell",
      },
      {
        field: "is_categorical",
        headerName: "Cat",
        width: 60,
        editable: true,
        cellEditor: "agCheckboxCellEditor",
        cellRenderer: (params: ICellRendererParams) =>
          params.value ? "Y" : "",
        cellClass: "editable-cell",
      },
      {
        field: "tags",
        headerName: "Tags",
        width: 180,
        editable: true,
        cellRenderer: TagsCellRenderer,
        cellEditor: TagsCellEditor,
        cellEditorPopup: true,
        filter: "agTextColumnFilter",
        valueFormatter: (params) =>
          (params.value as string[] | undefined)?.join(", ") ?? "",
        cellClass: "editable-cell",
      },
      {
        field: "description",
        headerName: "Description",
        flex: 1,
        minWidth: 200,
        editable: true,
        cellEditor: "agLargeTextCellEditor",
        cellEditorParams: { maxLength: 500, rows: 3, cols: 50 },
        cellEditorPopup: true,
        filter: "agTextColumnFilter",
        cellClass: "editable-cell text-xs text-zinc-500 dark:text-zinc-400",
      },
      {
        field: "entities",
        headerName: "Entities",
        width: 160,
        cellRenderer: EntitiesCellRenderer,
        filter: false,
        sortable: false,
      },
    ],
    []
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      resizable: true,
      suppressMovable: true,
    }),
    []
  );

  // No master yet — show build button
  if (!masterData && !masterQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Layers size={20} className="text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            All Fields
          </h2>
        </div>
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
          <p className="text-sm text-zinc-500 mb-4">
            No field master found. Build one to see all fields across entities.
          </p>
          <button
            onClick={() => buildMutation.mutate(entitiesPath)}
            disabled={buildMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {buildMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Layers size={14} />
            )}
            {buildMutation.isPending ? "Building..." : "Build Field Master"}
          </button>
          {buildMutation.isError && (
            <p className="mt-2 text-sm text-red-600">
              {String(buildMutation.error)}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (masterQuery.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-zinc-400 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading field master...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers size={20} className="text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            All Fields
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Entity filter */}
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-2 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          >
            <option value="all">All entities</option>
            {entityNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Rebuild */}
          <button
            onClick={() => buildMutation.mutate(entitiesPath)}
            disabled={buildMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {buildMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Rebuild
          </button>

          {/* Save status */}
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
              <Check className="w-3 h-3" />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Status line */}
      {masterData && (
        <div className="text-xs text-zinc-400">
          {filteredFields.length}
          {entityFilter !== "all"
            ? ` of ${masterData.total_fields}`
            : ""}{" "}
          fields across {masterData.total_entities} entities
          {masterData.generated && (
            <span className="ml-2">
              &middot; last built{" "}
              {new Date(masterData.generated).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Grid */}
      <div
        className={`${theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} field-master-grid border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden`}
        style={{ ...gridStyle, width: "100%" }}
      >
        <style>{`
          .field-master-grid .ag-cell-editable {
            cursor: pointer;
          }
          .field-master-grid.ag-theme-alpine .ag-cell-editable:hover {
            background-color: rgba(13, 148, 136, 0.08);
          }
          .field-master-grid.ag-theme-alpine-dark .ag-cell-editable:hover {
            background-color: rgba(45, 212, 191, 0.06);
          }
          .field-master-grid.ag-theme-alpine-dark .ag-cell-inline-editing {
            background-color: #18181b !important;
            border-color: #14b8a6 !important;
          }
          .field-master-grid.ag-theme-alpine-dark .ag-popup,
          .field-master-grid.ag-theme-alpine-dark .ag-menu {
            background-color: #18181b !important;
            border: 1px solid #27272a !important;
          }
          .field-master-grid.ag-theme-alpine-dark .ag-filter {
            background-color: #18181b !important;
          }
          .field-master-grid.ag-theme-alpine-dark .ag-text-field-input,
          .field-master-grid.ag-theme-alpine-dark .ag-select .ag-picker-field-wrapper {
            background-color: #09090b !important;
            border-color: #3f3f46 !important;
            color: #d4d4d8 !important;
          }
        `}</style>
        <AgGridReact
          theme="legacy"
          rowData={filteredFields}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(params) => params.data.key}
          domLayout="autoHeight"
          rowHeight={36}
          headerHeight={36}
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          onCellValueChanged={onCellValueChanged}
        />
      </div>
    </div>
  );
}
