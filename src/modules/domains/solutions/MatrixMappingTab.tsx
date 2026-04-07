import type { InstanceData } from "../../../lib/solutions/types";
import { getOutlets, getOutletMapSystems, isPMApplicable, getBankForCell, filterScope } from "./matrixHelpers";
import { CollapsibleSection } from "./matrixComponents";

interface Props {
  data: InstanceData;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

export default function MatrixMappingTab({ data, onChange, selectedEntity }: Props) {
  const scope = filterScope(data.scope || [], selectedEntity);
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
  const outlets = getOutlets(scope);
  const outletMap = data.outletMap || {};
  const posLabels = data.posLabels || {};

  const updateOutletMap = (key: string, value: string) => {
    onChange({ ...data, outletMap: { ...outletMap, [key]: value } });
  };

  const updatePosLabel = (key: string, value: string) => {
    onChange({ ...data, posLabels: { ...posLabels, [key]: value } });
  };

  // Progress
  const systems = getOutletMapSystems(pms);
  let omFilled = 0, omTotal = 0;
  outlets.forEach((o) => {
    omTotal++; if (outletMap[`${o.key}::pos`]) omFilled++;
    systems.forEach((sys) => {
      const pmObj = pms.find((p) => p.name === sys);
      if (pmObj && !isPMApplicable(pmObj, o.key)) return;
      omTotal++; if (outletMap[`${o.key}::${sys}`]) omFilled++;
    });
  });

  let plFilled = 0, plTotal = 0;
  outlets.forEach((o) => {
    pms.forEach((pm) => {
      if (!isPMApplicable(pm, o.key)) return;
      plTotal++; if (posLabels[`${o.key}::${pm.name}`]) plFilled++;
    });
  });

  const empty = !outlets.length || !pms.length;

  return (
    <div className="space-y-8">
      {/* Outlet Name Mapping */}
      <CollapsibleSection badge="Outlets" badgeColor="amber" title="Outlet Name Mapping" progress={`${omFilled} / ${omTotal}`} description="For each outlet — what is it called in POS, in each platform's report, and in accounting?">
        {empty ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add outlets and payment methods in Scope first.</p>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <table className="border-collapse min-w-full">
              <thead>
                <tr>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800 sticky left-0 z-10 whitespace-nowrap">Outlet (VAL)</th>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-center border border-zinc-200 dark:border-zinc-800 whitespace-nowrap">POS Value</th>
                  {systems.map((sys) => (
                    <th key={sys} className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-center border border-zinc-200 dark:border-zinc-800 whitespace-nowrap">{sys} Value</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outlets.map((o) => (
                  <tr key={o.key}>
                    <th className="bg-zinc-50 dark:bg-zinc-900 text-xs font-medium text-left px-3 py-2 border border-zinc-200 dark:border-zinc-800 sticky left-0 z-[1] whitespace-nowrap">{o.label}</th>
                    <td className="border border-zinc-200 dark:border-zinc-800 min-w-[110px]">
                      <div className="px-2 py-1.5">
                        <input
                          type="text"
                          value={outletMap[`${o.key}::pos`] || ""}
                          onChange={(e) => updateOutletMap(`${o.key}::pos`, e.target.value)}
                          placeholder="POS code..."
                          className="w-full text-xs text-center text-zinc-700 dark:text-zinc-200 bg-transparent border-none focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:italic"
                        />
                      </div>
                    </td>
                    {systems.map((sys) => {
                      const pmObj = pms.find((p) => p.name === sys);
                      if (pmObj && !isPMApplicable(pmObj, o.key)) {
                        return <td key={sys} className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 opacity-40 text-center text-xs text-zinc-500 dark:text-zinc-600">&mdash;</td>;
                      }
                      const key = `${o.key}::${sys}`;
                      return (
                        <td key={sys} className="border border-zinc-200 dark:border-zinc-800 min-w-[110px]">
                          <div className="px-2 py-1.5">
                            <input
                              type="text"
                              value={outletMap[key] || ""}
                              onChange={(e) => updateOutletMap(key, e.target.value)}
                              placeholder={sys === "Accounting" ? "Acct code..." : "Platform value..."}
                              className="w-full text-xs text-center text-zinc-700 dark:text-zinc-200 bg-transparent border-none focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:italic"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Payment Method Mapping */}
      <CollapsibleSection badge="Payment Methods" badgeColor="amber" title="Payment Method Mapping (POS → VAL)" progress={`${plFilled} / ${plTotal}`} description="For each outlet — what does the POS call each payment method?">
        {empty ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add outlets and payment methods in Scope first.</p>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <table className="border-collapse min-w-full">
              <thead>
                <tr>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800 sticky left-0 z-10 whitespace-nowrap">Outlet</th>
                  {pms.map((pm) => (
                    <th key={pm.name} className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-center border border-zinc-200 dark:border-zinc-800 whitespace-nowrap">{pm.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outlets.map((o) => (
                  <tr key={o.key}>
                    <th className="bg-zinc-50 dark:bg-zinc-900 text-xs font-medium text-left px-3 py-2 border border-zinc-200 dark:border-zinc-800 sticky left-0 z-[1] whitespace-nowrap">{o.label}</th>
                    {pms.map((pm) => {
                      if (!isPMApplicable(pm, o.key)) {
                        return <td key={pm.name} className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 opacity-40 text-center text-xs text-zinc-500 dark:text-zinc-600">&mdash;</td>;
                      }
                      const key = `${o.key}::${pm.name}`;
                      return (
                        <td key={pm.name} className="border border-zinc-200 dark:border-zinc-800 min-w-[110px]">
                          <div className="px-2 py-1.5">
                            <input
                              type="text"
                              value={posLabels[key] || ""}
                              onChange={(e) => updatePosLabel(key, e.target.value)}
                              placeholder="POS label..."
                              className="w-full text-xs text-center text-zinc-700 dark:text-zinc-200 bg-transparent border-none focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 placeholder:italic"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Bank Settlement Verification */}
      <CollapsibleSection badge="Verification" badgeColor="purple" title="Bank Settlement Summary" description="Read-only — derived from bank definitions in Scope.">
        {empty || banks.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add outlets, payment methods, and bank accounts in Scope first.</p>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <table className="border-collapse min-w-full">
              <thead>
                <tr>
                  <th className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-left border border-zinc-200 dark:border-zinc-800 sticky left-0 z-10 whitespace-nowrap">Outlet</th>
                  {pms.map((pm) => (
                    <th key={pm.name} className="bg-zinc-50 dark:bg-zinc-900 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-3 py-2.5 text-center border border-zinc-200 dark:border-zinc-800 whitespace-nowrap">{pm.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outlets.map((o) => (
                  <tr key={o.key}>
                    <th className="bg-zinc-50 dark:bg-zinc-900 text-xs font-medium text-left px-3 py-2 border border-zinc-200 dark:border-zinc-800 sticky left-0 z-[1] whitespace-nowrap">{o.label}</th>
                    {pms.map((pm) => {
                      if (!isPMApplicable(pm, o.key)) {
                        return <td key={pm.name} className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 opacity-40 text-center text-xs text-zinc-500 dark:text-zinc-600">&mdash;</td>;
                      }
                      const bank = getBankForCell(banks, o.key, pm.name);
                      return (
                        <td key={pm.name} className="border border-zinc-200 dark:border-zinc-800 text-center">
                          <div className="px-2 py-1.5">
                            {bank ? (
                              <span className="text-[11px] font-semibold text-blue-400">{bank}</span>
                            ) : (
                              <span className="text-[10px] text-red-400">Not mapped</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
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
