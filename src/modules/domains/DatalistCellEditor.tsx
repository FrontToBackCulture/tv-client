// Custom AG Grid cell editor: text input with native HTML datalist.
//
// Why not agRichSelectCellEditor? In AG Grid v35, agRichSelectCellEditor
// (even with allowTyping: true) only commits values that match the
// `values` list — typing a brand-new value and pressing Enter just
// reverts. We want "pick from list OR type a new value" so users can
// extend the Data Representation / classification vocabularies inline.
//
// Uses the modern AG Grid React API (CustomCellEditorProps + onValueChange)
// — getValue/forwardRef wasn't picking up new typed values reliably.

import { useEffect, useRef } from "react";
import type { CustomCellEditorProps } from "ag-grid-react";

export interface DatalistEditorParams {
  values: string[];
  /** Optional placeholder shown when the cell is empty. */
  placeholder?: string;
}

export function DatalistCellEditor(
  props: CustomCellEditorProps<unknown, string> & Partial<DatalistEditorParams>,
) {
  const { value, onValueChange, values: valuesProp = [], placeholder } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + select on mount so users can type immediately. AG Grid
  // already triggers edit mode; we just need the cursor to land here.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Stable per-instance datalist id — reusing one global id breaks if
  // two editors mount at the same time (the second would attach to the
  // first's list).
  const listId = useRef(`tv-datalist-${Math.random().toString(36).slice(2, 9)}`).current;

  return (
    <div className="flex w-full h-full">
      <input
        ref={inputRef}
        type="text"
        list={listId}
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter / Tab close the editor — AG Grid handles that. Stop
          // propagation so the parent grid's keyboard nav doesn't also
          // act on these keys mid-edit (would otherwise jump rows).
          if (e.key === "Enter" || e.key === "Tab") e.stopPropagation();
        }}
        placeholder={placeholder ?? "Type or pick…"}
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
