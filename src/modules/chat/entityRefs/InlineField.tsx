// Inline editable field used in the EntityDetailPane.
// Click to edit, save on blur/Enter, Escape to cancel.

import { useState, useRef, useEffect } from "react";
import { cn } from "../../../lib/cn";

type FieldType = "text" | "textarea" | "number" | "date" | "select";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string | number | null | undefined;
  type?: FieldType;
  options?: Option[];
  displayValue?: string;
  placeholder?: string;
  mono?: boolean;
  onSave: (val: string) => void;
}

export function InlineField({ value, type = "text", options, displayValue, placeholder, mono, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    setDraft(String(value ?? ""));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current && type !== "select") {
        (inputRef.current as HTMLInputElement).select();
      }
    }
  }, [editing, type]);

  function save() {
    setEditing(false);
    if (draft !== String(value ?? "")) {
      onSave(draft);
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(String(value ?? ""));
  }

  // Display mode
  if (!editing) {
    const shown = displayValue ?? (value != null && value !== "" ? String(value) : null);
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "text-left w-full min-h-[20px] px-1.5 -mx-1 py-0.5 rounded hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors border border-transparent hover:border-teal-200/60 dark:hover:border-teal-900/60",
          "text-[12px] text-zinc-800 dark:text-zinc-200 truncate block",
          mono && "font-mono text-[11px]",
          !shown && "text-zinc-300 dark:text-zinc-600",
        )}
      >
        {shown ?? placeholder ?? "—"}
      </button>
    );
  }

  // Edit mode
  const common = "w-full text-[12px] bg-white dark:bg-zinc-900 border border-teal-400 dark:border-teal-500 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-teal-400";

  if (type === "select" && options) {
    return (
      <select
        ref={inputRef as any}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
        className={common}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (type === "textarea") {
    return (
      <textarea
        ref={inputRef as any}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Escape") cancel(); if (e.key === "Enter" && e.metaKey) save(); }}
        rows={4}
        className={cn(common, "resize-none")}
      />
    );
  }

  return (
    <input
      ref={inputRef as any}
      type={type === "date" ? "date" : type === "number" ? "number" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
      className={cn(common, mono && "font-mono")}
    />
  );
}
