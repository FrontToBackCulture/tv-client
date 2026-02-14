// src/modules/product/SchemaFieldsGrid.tsx
// AG Grid for viewing/editing schema.json fields with auto-save

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import type {
  ColDef,
  ICellRendererParams,
  CellValueChangedEvent,
  ICellEditorParams,
} from "ag-grid-community";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../stores/appStore";
import { Loader2, Check } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface SchemaField {
  name: string;
  column: string;
  type: string;
  field_id: number | null;
  group: string | null;
  is_key: boolean;
  is_categorical: boolean;
  description: string | null;
  tags?: string[];
}

export interface SchemaFile {
  table_name: string;
  display_name: string;
  fuel_stage: string | null;
  model: string | null;
  description: string | null;
  status: string | null;
  resource_url: string | null;
  fields: SchemaField[];
}

interface SchemaFieldsGridProps {
  schemaData: SchemaFile;
  schemaFilePath: string;
}

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
      {/* Current tags */}
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

      {/* Input */}
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

      {/* Suggestions dropdown */}
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

TagsCellEditor.displayName = "TagsCellEditor";

// ============================================================================
// SchemaFieldsGrid
// ============================================================================

export function SchemaFieldsGrid({
  schemaData,
  schemaFilePath,
}: SchemaFieldsGridProps) {
  const theme = useAppStore((s) => s.theme);
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<SchemaField[]>(schemaData.fields);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const dirtyRef = useRef(false);
  const fieldsRef = useRef(fields);

  // Sync when schemaData changes (different entity selected)
  useEffect(() => {
    setFields(schemaData.fields);
    fieldsRef.current = schemaData.fields;
    dirtyRef.current = false;
    setSaveStatus("idle");
  }, [schemaData]);

  // Debounced auto-save
  useEffect(() => {
    if (!dirtyRef.current) return;

    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const updated: SchemaFile = {
          ...schemaData,
          fields: fieldsRef.current,
        };
        await invoke("write_file", {
          path: schemaFilePath,
          content: JSON.stringify(updated, null, 2),
        });
        queryClient.invalidateQueries({
          queryKey: ["domain-model-file", schemaFilePath],
        });
        dirtyRef.current = false;
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (err) {
        console.error("Failed to save schema.json:", err);
        setSaveStatus("idle");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [fields, schemaData, schemaFilePath, queryClient]);

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const { data, colDef } = event;
    const field = colDef.field as string;
    setFields((prev) => {
      const next = prev.map((f) =>
        f.column === data.column ? { ...f, [field]: data[field] } : f
      );
      fieldsRef.current = next;
      return next;
    });
    dirtyRef.current = true;
  }, []);

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
        width: 200,
        filter: "agTextColumnFilter",
      },
      {
        field: "type",
        headerName: "Type",
        width: 130,
        filter: "agSetColumnFilter",
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
        field: "is_key",
        headerName: "Key",
        width: 60,
        cellRenderer: (params: ICellRendererParams) =>
          params.value ? "Y" : "",
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

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Schema Fields ({fields.length})
        </h3>
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
      <div
        className={`${theme === "dark" ? "ag-theme-alpine-dark" : "ag-theme-alpine"} schema-fields-grid border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden`}
        style={{ ...gridStyle, width: "100%" }}
      >
        <style>{`
          .schema-fields-grid .ag-cell-editable {
            cursor: pointer;
          }
          .schema-fields-grid.ag-theme-alpine .ag-cell-editable:hover {
            background-color: rgba(13, 148, 136, 0.08);
          }
          .schema-fields-grid.ag-theme-alpine-dark .ag-cell-editable:hover {
            background-color: rgba(45, 212, 191, 0.06);
          }
          .schema-fields-grid.ag-theme-alpine-dark .ag-cell-inline-editing {
            background-color: #18181b !important;
            border-color: #14b8a6 !important;
          }
          .schema-fields-grid.ag-theme-alpine-dark .ag-popup,
          .schema-fields-grid.ag-theme-alpine-dark .ag-menu {
            background-color: #18181b !important;
            border: 1px solid #27272a !important;
          }
          .schema-fields-grid.ag-theme-alpine-dark .ag-filter {
            background-color: #18181b !important;
          }
          .schema-fields-grid.ag-theme-alpine-dark .ag-text-field-input,
          .schema-fields-grid.ag-theme-alpine-dark .ag-select .ag-picker-field-wrapper {
            background-color: #09090b !important;
            border-color: #3f3f46 !important;
            color: #d4d4d8 !important;
          }
        `}</style>
        <AgGridReact
          theme="legacy"
          rowData={fields}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(params) => params.data.column}
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
