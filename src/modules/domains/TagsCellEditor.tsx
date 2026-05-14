// Tags-specific cell editor.
//
// The `tags` column stores `string[]` on the row but AG Grid's built-in
// agTextCellEditor doesn't know how to render an array as a string for
// editing, so the cell appears blank when entering edit mode. This editor
// keeps the array shape on commit while showing/accepting a comma-separated
// string in the input — and adds an HTML datalist for autocomplete against
// any tag vocabulary supplied by the column def.

import { useEffect, useRef, useState } from "react";
import type { CustomCellEditorProps } from "ag-grid-react";

export interface TagsEditorParams {
  /** Optional vocabulary for autocomplete (existing tags across rows). */
  values?: string[];
  placeholder?: string;
}

export function TagsCellEditor(
  props: CustomCellEditorProps<unknown, string[]> & Partial<TagsEditorParams>,
) {
  const { value, onValueChange, values: valuesProp = [], placeholder } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  // Internal text state — separate from the array value so the user can
  // type a trailing comma without it being parsed away mid-edit.
  const [text, setText] = useState(() =>
    Array.isArray(value) ? value.join(", ") : (typeof value === "string" ? value : ""),
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const listId = useRef(`tv-tags-${Math.random().toString(36).slice(2, 9)}`).current;

  const handleChange = (newText: string) => {
    setText(newText);
    const parsed = newText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onValueChange(parsed);
  };

  return (
    <div className="flex w-full h-full">
      <input
        ref={inputRef}
        type="text"
        list={listId}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Tab") e.stopPropagation();
        }}
        placeholder={placeholder ?? "Type tags, comma-separated…"}
        className="w-full h-full px-2 py-0 text-xs border-0 outline-none bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
      />
      <datalist id={listId}>
        {valuesProp.filter(Boolean).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}
