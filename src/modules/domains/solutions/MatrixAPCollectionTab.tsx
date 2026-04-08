import type { InstanceData, TemplateDefinition, StatusEntry } from "../../../lib/solutions/types";
import { AP_DOCUMENT_TYPES } from "../../../lib/solutions/types";
import { getStatus } from "./matrixHelpers";
import { CollapsibleSection, StatusSelect, OwnerTag, EditableInput, AddButton } from "./matrixComponents";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

const DOC_LABELS: Record<string, string> = Object.fromEntries(
  AP_DOCUMENT_TYPES.map((d) => [d.key, d.label])
);

export default function MatrixAPCollectionTab({ data, onChange, selectedEntity: _selectedEntity }: Props) {
  const suppliers = data.suppliers || [];
  const periods = data.periods || [];
  const supplierDocSt = data.supplierDocStatus || {};

  const updateDoc = (key: string, field: keyof StatusEntry, value: string) => {
    const st = getStatus(supplierDocSt, key);
    onChange({ ...data, supplierDocStatus: { ...supplierDocSt, [key]: { ...st, [field]: value } } });
  };

  const addPeriod = (period: string) => {
    if (!period.trim() || periods.includes(period.trim())) return;
    onChange({ ...data, periods: [...periods, period.trim()] });
  };

  const removePeriod = (idx: number) => {
    onChange({ ...data, periods: periods.filter((_, i) => i !== idx) });
  };

  // Build rows: supplier × docType × period
  const docRows = suppliers.flatMap((s) =>
    s.documentTypes.flatMap((docType) =>
      periods.map((period) => ({
        key: `doc::${s.name}::${docType}::${period}`,
        supplier: s.name,
        docType,
        docLabel: DOC_LABELS[docType] || docType,
        period,
        st: getStatus(supplierDocSt, `doc::${s.name}::${docType}::${period}`),
      }))
    )
  );

  const countDone = docRows.filter((r) => r.st.status === "done" || r.st.status === "na").length;

  // Group by supplier for display
  const supplierGroups = suppliers.map((s) => {
    const rows = docRows.filter((r) => r.supplier === s.name);
    return { supplier: s, rows };
  });

  return (
    <div className="space-y-8">
      {/* Periods */}
      <CollapsibleSection badge="Periods" badgeColor="teal" title="Data Periods Required" description="Which months of historical data do we need?">
        <div className="flex gap-1.5 flex-wrap mb-3">
          {periods.map((p, i) => (
            <span key={p} className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1 text-[11px]">
              {p}
              <button onClick={() => removePeriod(i)} className="text-red-400 opacity-50 hover:opacity-100 text-sm bg-transparent border-none cursor-pointer">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5 items-center">
          <select
            id="apPeriodMonth"
            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            id="apPeriodYear"
            defaultValue={new Date().getFullYear()}
            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <AddButton label="+ Add" onClick={() => {
            const m = (document.getElementById("apPeriodMonth") as HTMLSelectElement)?.value;
            const y = (document.getElementById("apPeriodYear") as HTMLSelectElement)?.value;
            if (m && y) addPeriod(`${m} ${y}`);
          }} />
        </div>
      </CollapsibleSection>

      {/* Supplier Documents */}
      <CollapsibleSection
        badge="Documents"
        badgeColor="teal"
        title="Supplier Documents"
        progress={`${countDone} / ${docRows.length}`}
        description="One row per supplier per document type per period. Collect sample documents for scan template setup."
      >
        {suppliers.length === 0 || periods.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add suppliers and periods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[20%]">Supplier</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[16%]">Document Type</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Period</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[90px]">Status</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Owner</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return supplierGroups.flatMap(({ supplier: s, rows }) =>
                  rows.map((row, rowIdx) => {
                    n++;
                    const isFirstOfSupplier = rowIdx === 0;
                    return (
                      <tr key={row.key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                        <td className={`px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${isFirstOfSupplier ? "font-medium" : "text-zinc-400 dark:text-zinc-600"}`}>
                          {isFirstOfSupplier ? s.name : ""}
                        </td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400">
                            {row.docLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{row.period}</td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                          <StatusSelect value={row.st.status as any} onChange={(v) => updateDoc(row.key, "status", v)} />
                        </td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="client" /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                          <EditableInput value={row.st.detail} onChange={(v) => updateDoc(row.key, "detail", v)} placeholder="Notes..." />
                        </td>
                      </tr>
                    );
                  })
                );
              })()}
            </tbody>
          </table>
        )}
      </CollapsibleSection>
    </div>
  );
}
