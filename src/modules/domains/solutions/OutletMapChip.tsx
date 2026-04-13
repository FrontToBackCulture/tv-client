import { useEffect, useRef, useState } from "react";
import type { OutletInfo } from "../../../lib/solutions/types";

interface Props {
  dataOutletName: string;
  mappedScopeCode: string | null;
  scopeOutlets: OutletInfo[];
  onMap: (scopeCode: string | null) => void;
}

export default function OutletMapChip({ dataOutletName, mappedScopeCode, scopeOutlets, onMap }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = query
    ? scopeOutlets.filter((o) =>
        `${o.key} ${o.label} ${o.outletName ?? ""} ${o.entity}`.toLowerCase().includes(query.toLowerCase())
      )
    : scopeOutlets;

  const mapped = mappedScopeCode ? scopeOutlets.find((o) => o.key === mappedScopeCode) : null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={mapped ? `${dataOutletName} → ${mapped.label}` : `Click to map "${dataOutletName}"`}
        className={`text-[9px] px-1.5 py-0.5 rounded truncate max-w-[180px] cursor-pointer border-none ${
          mapped
            ? "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
            : "bg-amber-500/15 text-amber-500 hover:bg-amber-500/25"
        }`}
      >
        {mapped ? mapped.key : `⚠ ${dataOutletName}`}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 w-72 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
          <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
            <div className="text-[9px] uppercase tracking-wider text-zinc-400 mb-0.5">Map data outlet</div>
            <div className="text-[11px] font-mono text-zinc-700 dark:text-zinc-200 truncate" title={dataOutletName}>
              {dataOutletName}
            </div>
          </div>
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scope outlets…"
              className="w-full text-[11px] px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-[10px] text-zinc-400 text-center">No matching scope outlets</div>
            ) : (
              filtered.map((o) => {
                const isCurrent = o.key === mappedScopeCode;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => {
                      onMap(o.key);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer border-none bg-transparent flex items-center justify-between gap-2 ${
                      isCurrent ? "text-blue-500" : "text-zinc-700 dark:text-zinc-200"
                    }`}
                  >
                    <span className="font-mono truncate">{o.key}</span>
                    <span className="text-[10px] text-zinc-400 truncate flex-1 text-right" title={o.outletName || o.label}>
                      {o.outletName || o.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {mappedScopeCode && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 p-1.5">
              <button
                type="button"
                onClick={() => {
                  onMap(null);
                  setOpen(false);
                }}
                className="w-full text-[10px] text-red-400 hover:text-red-500 hover:bg-red-500/5 px-2 py-1 rounded cursor-pointer border-none bg-transparent"
              >
                Clear mapping
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
