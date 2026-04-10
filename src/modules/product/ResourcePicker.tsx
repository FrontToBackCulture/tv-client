import { useState, useRef, useMemo } from "react";

interface PickerItem {
  id: string | number;
  label: string;
  sublabel?: string;
}

interface ResourcePickerProps {
  items: PickerItem[];
  value: (string | number)[];
  onChange: (value: (string | number)[]) => void;
  mode: "single" | "multi";
  placeholder?: string;
  loading?: boolean;
}

export default function ResourcePicker({
  items,
  value,
  onChange,
  mode,
  placeholder = "Search...",
  loading,
}: ResourcePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        String(item.id).toLowerCase().includes(q) ||
        (item.sublabel?.toLowerCase().includes(q) ?? false),
    );
  }, [items, search]);

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropHeight = 300;
      const openUp = spaceBelow < dropHeight && rect.top > dropHeight;
      const width = Math.max(rect.width, 280);
      setDropStyle(
        openUp
          ? { position: "fixed", left: rect.left, bottom: window.innerHeight - rect.top + 4, width }
          : { position: "fixed", left: rect.left, top: rect.bottom + 4, width },
      );
    }
    setSearch("");
    setOpen(true);
  };

  const toggle = (id: string | number) => {
    if (mode === "single") {
      onChange([id]);
      setOpen(false);
    } else {
      onChange(
        value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
      );
    }
  };

  const remove = (id: string | number) => {
    onChange(value.filter((v) => v !== id));
  };

  // Resolve display names for selected values
  const resolvedItems = value
    .map((id) => items.find((item) => item.id === id || String(item.id) === String(id)))
    .filter(Boolean) as PickerItem[];

  if (loading) {
    return (
      <div className="text-[10px] text-zinc-400 italic py-1">Loading resources...</div>
    );
  }

  return (
    <div ref={triggerRef}>
      <div
        onClick={openDropdown}
        className="flex flex-wrap gap-1 min-h-[26px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:border-blue-500/50 dark:hover:border-blue-400/50 transition-colors bg-white dark:bg-zinc-900"
      >
        {value.length === 0 ? (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
            {placeholder}
          </span>
        ) : mode === "single" && resolvedItems.length === 1 ? (
          <span className="text-[11px] text-zinc-700 dark:text-zinc-300">
            {resolvedItems[0].label}{" "}
            <span className="text-zinc-400 font-mono text-[10px]">
              {resolvedItems[0].sublabel ?? resolvedItems[0].id}
            </span>
          </span>
        ) : (
          resolvedItems.map((item) => (
            <span
              key={item.id}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5"
            >
              {item.label}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(item.id);
                }}
                className="text-blue-400 hover:text-red-400 bg-transparent border-none cursor-pointer text-[10px] leading-none"
              >
                &times;
              </button>
            </span>
          ))
        )}
        {/* Show unresolved IDs (not found in items list) */}
        {value
          .filter((id) => !items.find((item) => item.id === id || String(item.id) === String(id)))
          .map((id) => (
            <span
              key={id}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 inline-flex items-center gap-0.5"
            >
              {id}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(id);
                }}
                className="text-zinc-400 hover:text-red-400 bg-transparent border-none cursor-pointer text-[10px] leading-none"
              >
                &times;
              </button>
            </span>
          ))}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={dropStyle}
            className="z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden"
          >
            <div className="px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full text-xs bg-transparent border-none outline-none text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-3">
                  {items.length === 0 ? "No resources synced" : "No matches"}
                </p>
              ) : (
                filtered.map((item) => {
                  const selected = value.includes(item.id) || value.includes(String(item.id));
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer transition-colors border-none ${
                        selected
                          ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {mode === "multi" && (
                        <span
                          className={`w-3 h-3 rounded border flex items-center justify-center text-[8px] flex-shrink-0 ${
                            selected
                              ? "bg-blue-500 border-blue-500 text-white"
                              : "border-zinc-300 dark:border-zinc-600"
                          }`}
                        >
                          {selected && "✓"}
                        </span>
                      )}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0">
                          {item.sublabel}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {mode === "multi" && value.length > 0 && (
              <div className="px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-400">
                {value.length} selected
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
