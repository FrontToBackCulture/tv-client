// Reusable folder picker — inline editable text field + tree browser popover
// that lets the user pick a folder from the active repository.
// Used by CRM company folder fields, project folder_path, etc.

import { useState, useRef, useEffect } from "react";
import { Folder, FolderOpen, ChevronDown, ChevronRight } from "lucide-react";
import { useRepository } from "../../stores/repositoryStore";
import { useFolderChildren } from "../../hooks/useFiles";

interface Props {
  value: string | null | undefined;
  onSave: (val: string) => void;
  placeholder?: string;
}

export function FolderPickerField({ value, onSave, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const ref = useRef<HTMLInputElement>(null);
  const { activeRepository } = useRepository();
  const basePath = activeRepository?.path ?? "";

  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);

  // Keep draft in sync with external value
  useEffect(() => {
    setDraft(String(value ?? ""));
  }, [value]);

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {editing ? (
          <input
            ref={ref}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft !== String(value ?? "")) onSave(draft);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(false);
                if (draft !== String(value ?? "")) onSave(draft);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={placeholder}
            className="text-xs border border-teal-400 rounded px-1.5 py-1 bg-white dark:bg-zinc-900 outline-none flex-1"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(String(value ?? ""));
              setEditing(true);
            }}
            className="text-left flex-1 min-h-[20px] cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/20 rounded px-1.5 py-0.5 -mx-1 transition-colors border border-transparent hover:border-teal-200 dark:hover:border-teal-800"
          >
            {value ? (
              <span className="text-zinc-700 dark:text-zinc-300 text-xs">{value}</span>
            ) : (
              <span className="text-zinc-300 dark:text-zinc-600 text-xs">{placeholder ?? "—"}</span>
            )}
          </button>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-400 hover:text-teal-500 transition-colors shrink-0"
          title="Browse folders"
        >
          <FolderOpen size={13} />
        </button>
      </div>
      {open && basePath && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg max-h-[360px] overflow-auto p-1">
          <MiniTreeNode
            path={basePath}
            name={activeRepository?.name ?? "Library"}
            level={0}
            onSelect={(p) => {
              onSave(p);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MiniTreeNode({
  path,
  name,
  level,
  onSelect,
}: {
  path: string;
  name: string;
  level: number;
  onSelect: (relativePath: string) => void;
}) {
  const [expanded, setExpanded] = useState(level === 0);
  const { data } = useFolderChildren(path, expanded);
  const { activeRepository } = useRepository();
  const basePath = activeRepository?.path ?? "";
  const dirs = (data ?? [])
    .filter((c: { is_directory: boolean }) => c.is_directory)
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

  const relativePath = basePath && path.startsWith(basePath) ? path.slice(basePath.length + 1) : path;

  return (
    <div>
      <button
        className="flex items-center gap-1 w-full text-left px-1 py-0.5 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded text-xs group"
        onClick={() => setExpanded(!expanded)}
        onDoubleClick={() => onSelect(relativePath)}
      >
        {dirs.length > 0 || !expanded ? (
          expanded ? (
            <ChevronDown size={10} className="text-zinc-400 shrink-0" />
          ) : (
            <ChevronRight size={10} className="text-zinc-400 shrink-0" />
          )
        ) : (
          <span className="w-[10px] shrink-0" />
        )}
        <Folder size={12} className="text-zinc-400 shrink-0" />
        <span className="truncate text-zinc-700 dark:text-zinc-300">{name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(relativePath);
          }}
          className="ml-auto opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 bg-teal-500 text-white rounded transition-opacity shrink-0"
        >
          Select
        </button>
      </button>
      {expanded &&
        dirs.map((d: { path: string; name: string }) => (
          <div key={d.path} style={{ paddingLeft: 12 }}>
            <MiniTreeNode path={d.path} name={d.name} level={level + 1} onSelect={onSelect} />
          </div>
        ))}
    </div>
  );
}
