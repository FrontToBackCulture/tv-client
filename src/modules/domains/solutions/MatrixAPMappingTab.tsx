import type { InstanceData } from "../../../lib/solutions/types";
import { getOutlets, filterScope } from "./matrixHelpers";
import { CollapsibleSection } from "./matrixComponents";

interface Props {
  data: InstanceData;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

export default function MatrixAPMappingTab({ data, onChange, selectedEntity }: Props) {
  const scope = filterScope(data.scope || [], selectedEntity);
  const suppliers = data.suppliers || [];
  const outlets = getOutlets(scope);
  const outletMap = data.outletMap || {};

  const updateOutletMap = (key: string, value: string) => {
    onChange({ ...data, outletMap: { ...outletMap, [key]: value } });
  };

  // Progress: outlet ship-to + accounting code
  let omFilled = 0, omTotal = 0;
  outlets.forEach((o) => {
    omTotal++; if (outletMap[`${o.key}::ship-to`]) omFilled++;
    omTotal++; if (outletMap[`${o.key}::accounting`]) omFilled++;
  });

  // Supplier mapping progress
  let smFilled = 0, smTotal = 0;
  suppliers.forEach((s) => {
    smTotal++; if (outletMap[`supplier::${s.name}`]) smFilled++;
    smTotal++; if (outletMap[`supplier::${s.name}::accounting`]) smFilled++;
  });

  return (
    <div className="space-y-8">
      {/* Outlet Mapping */}
      <CollapsibleSection
        badge="Outlets"
        badgeColor="amber"
        title="Outlet Mapping"
        progress={`${omFilled} / ${omTotal}`}
        description="Map each outlet to its ship-to address (as it appears on supplier invoices/DOs) and accounting code."
      >
        {outlets.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add outlets in Scope first.</p>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <table className="border-collapse min-w-full">
              <thead>
                <tr>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800 sticky left-0 z-10 whitespace-nowrap w-[22%]">
                    Outlet (VAL)
                  </th>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                    Ship-to Address / Name on Invoice
                  </th>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800 whitespace-nowrap w-[20%]">
                    Accounting Code
                  </th>
                </tr>
              </thead>
              <tbody>
                {outlets.map((o) => (
                  <tr key={o.key} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                    <th className="bg-zinc-50 dark:bg-zinc-900 text-xs font-medium text-left px-3 py-2 border border-zinc-200 dark:border-zinc-800 sticky left-0 z-[1] whitespace-nowrap">
                      {o.label}
                    </th>
                    <td className="border border-zinc-200 dark:border-zinc-800">
                      <div className="px-2 py-1.5">
                        <input
                          type="text"
                          value={outletMap[`${o.key}::ship-to`] || ""}
                          onChange={(e) => updateOutletMap(`${o.key}::ship-to`, e.target.value)}
                          placeholder="e.g. 123 Orchard Rd, #01-01..."
                          className="w-full text-xs text-zinc-700 dark:text-zinc-200 bg-transparent border-none focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:italic"
                        />
                      </div>
                    </td>
                    <td className="border border-zinc-200 dark:border-zinc-800">
                      <div className="px-2 py-1.5">
                        <input
                          type="text"
                          value={outletMap[`${o.key}::accounting`] || ""}
                          onChange={(e) => updateOutletMap(`${o.key}::accounting`, e.target.value)}
                          placeholder="GL code..."
                          className="w-full text-xs text-zinc-700 dark:text-zinc-200 bg-transparent border-none focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:italic font-mono"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Supplier Mapping */}
      <CollapsibleSection
        badge="Suppliers"
        badgeColor="amber"
        title="Supplier Mapping"
        progress={`${smFilled} / ${smTotal}`}
        description="Map each supplier name to how it appears in the accounting system."
      >
        {suppliers.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add suppliers in Scope first.</p>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <table className="border-collapse min-w-full">
              <thead>
                <tr>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800 w-[22%]">
                    Supplier (VAL)
                  </th>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800">
                    Name in Accounting System
                  </th>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800 w-[20%]">
                    Vendor Code
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.name} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                    <th className="bg-zinc-50 dark:bg-zinc-900 text-xs font-medium text-left px-3 py-2 border border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                      {s.name}
                    </th>
                    <td className="border border-zinc-200 dark:border-zinc-800">
                      <div className="px-2 py-1.5">
                        <input
                          type="text"
                          value={outletMap[`supplier::${s.name}`] || ""}
                          onChange={(e) => updateOutletMap(`supplier::${s.name}`, e.target.value)}
                          placeholder="Accounting system name..."
                          className="w-full text-xs text-zinc-700 dark:text-zinc-200 bg-transparent border-none focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:italic"
                        />
                      </div>
                    </td>
                    <td className="border border-zinc-200 dark:border-zinc-800">
                      <div className="px-2 py-1.5">
                        <input
                          type="text"
                          value={outletMap[`supplier::${s.name}::accounting`] || ""}
                          onChange={(e) => updateOutletMap(`supplier::${s.name}::accounting`, e.target.value)}
                          placeholder="Vendor code..."
                          className="w-full text-xs text-zinc-700 dark:text-zinc-200 bg-transparent border-none focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:italic font-mono"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
