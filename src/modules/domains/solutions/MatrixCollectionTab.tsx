import type { InstanceData, TemplateDefinition, StatusEntry } from "../../../lib/solutions/types";
import { getOutlets, getOutletNames, getSettlementPMs, isPMApplicable, getStatus, filterScope } from "./matrixHelpers";
import { CollapsibleSection, StatusSelect, OwnerTag, EditableInput, AddButton } from "./matrixComponents";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

export default function MatrixCollectionTab({ data, template, onChange, selectedEntity }: Props) {
  const scope = filterScope(data.scope || [], selectedEntity);
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
  const periods = data.periods || [];
  const docStatus = data.docStatus || {};
  const outlets = getOutlets(scope);
  const outletNames = getOutletNames(scope);

  const updateDoc = (key: string, field: keyof StatusEntry, value: string) => {
    const st = getStatus(docStatus, key);
    onChange({ ...data, docStatus: { ...docStatus, [key]: { ...st, [field]: value } } });
  };

  const addPeriod = (period: string) => {
    if (!period.trim() || periods.includes(period.trim())) return;
    onChange({ ...data, periods: [...periods, period.trim()] });
  };

  const removePeriod = (idx: number) => {
    onChange({ ...data, periods: periods.filter((_, i) => i !== idx) });
  };

  // Progress helpers
  const countDone = (keys: string[]) => keys.filter((k) => { const s = getStatus(docStatus, k).status; return s === "done" || s === "na"; }).length;

  const glKeys = pms.map((pm) => `gl::${pm.name}`);
  const posDataKeys = outlets.flatMap((o) => periods.map((p) => `pos::${o.key}::${p}`));
  const settlPMs = getSettlementPMs(pms, template);
  const settlKeys = settlPMs.flatMap((pm) => periods.map((p) => `settl::${pm.name}::${p}`));
  const filteredBanks = selectedEntity ? banks.filter((b) => b.outlets.length === 0 || b.outlets.some((o) => outletNames.includes(o))) : banks;
  const bankKeys = filteredBanks.flatMap((b) => periods.map((p) => `bank::${b.bank}::${b.account}::${p}`));

  return (
    <div className="space-y-8">
      {/* Periods */}
      <CollapsibleSection badge="Periods" badgeColor="teal" title="Data Periods Required" description="Which months of historical data do we need? These generate rows below.">
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
            id="periodMonth"
            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            id="periodYear"
            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-zinc-700 dark:text-zinc-200 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y} selected={y === new Date().getFullYear()}>{y}</option>
            ))}
          </select>
          <AddButton label="+ Add" onClick={() => {
            const m = (document.getElementById("periodMonth") as HTMLSelectElement)?.value;
            const y = (document.getElementById("periodYear") as HTMLSelectElement)?.value;
            if (m && y) addPeriod(`${m} ${y}`);
          }} />
        </div>
      </CollapsibleSection>

      {/* GL Posting */}
      <CollapsibleSection badge="GL" badgeColor="teal" title="GL Posting Method & Template" progress={`${countDone(glKeys)} / ${glKeys.length}`} description="One row per payment method — need the posting rules/template for each.">
        <StatusTable
          rows={pms.map((pm) => {
            const key = `gl::${pm.name}`;
            const st = getStatus(docStatus, key);
            const applicable = outletNames.filter((o) => isPMApplicable(pm, o));
            return { key, label: pm.name, chips: applicable, st, owner: "client" };
          })}
          columns={["Payment Method", "Outlets"]}
          onStatusChange={(key, v) => updateDoc(key, "status", v)}
          onDetailChange={(key, v) => updateDoc(key, "detail", v)}
        />
      </CollapsibleSection>

      {/* POS Data */}
      <CollapsibleSection badge="POS Data" badgeColor="teal" title="POS Reports (Historical)" progress={`${countDone(posDataKeys)} / ${posDataKeys.length}`} description="One row per outlet per period.">
        {outlets.length === 0 || periods.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add outlets and periods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[18%]">Outlet</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">POS</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Period</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[90px]">Status</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Owner</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return outlets.flatMap((o) => {
                  const posRaw = (scope.find((r) => r.outlet === o.key) || { pos: [] }).pos;
                  const posType = Array.isArray(posRaw) ? posRaw.join(", ") : String(posRaw || "");
                  return periods.map((period) => {
                    n++;
                    const key = `pos::${o.key}::${period}`;
                    const st = getStatus(docStatus, key);
                    return (
                      <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{o.label}</td>
                        <td className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{posType}</td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{period}</td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateDoc(key, "status", v)} /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="client" /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateDoc(key, "detail", v)} placeholder="Notes..." /></td>
                      </tr>
                    );
                  });
                });
              })()}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Settlement Reports */}
      <CollapsibleSection badge="Settlement" badgeColor="teal" title="Settlement Reports" progress={`${countDone(settlKeys)} / ${settlKeys.length}`} description="One row per payment method (excl. Cash) per period.">
        <StatusTable
          rows={settlPMs.flatMap((pm) => {
            const applicable = outletNames.filter((o) => isPMApplicable(pm, o));
            return periods.map((period) => {
              const key = `settl::${pm.name}::${period}`;
              const st = getStatus(docStatus, key);
              return { key, label: pm.name, chips: applicable, period, st, owner: "client" };
            });
          })}
          columns={["Payment Method", "Outlets"]}
          showPeriod
          onStatusChange={(key, v) => updateDoc(key, "status", v)}
          onDetailChange={(key, v) => updateDoc(key, "detail", v)}
        />
      </CollapsibleSection>

      {/* Bank Statements */}
      <CollapsibleSection badge="Bank" badgeColor="teal" title="Bank Statements" progress={`${countDone(bankKeys)} / ${bankKeys.length}`} description="One row per bank account per period.">
        {filteredBanks.length === 0 || periods.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add bank accounts and periods first.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">Bank</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">Account</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Period</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[90px]">Status</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Owner</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let n = 0;
                return filteredBanks.flatMap((b) =>
                  periods.map((period) => {
                    n++;
                    const key = `bank::${b.bank}::${b.account}::${period}`;
                    const st = getStatus(docStatus, key);
                    return (
                      <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{b.bank}</td>
                        <td className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{b.account}</td>
                        <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{period}</td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateDoc(key, "status", v)} /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="client" /></td>
                        <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateDoc(key, "detail", v)} placeholder="Notes..." /></td>
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

// Reusable status table for GL and Settlement sections
function StatusTable({
  rows,
  columns,
  showPeriod,
  onStatusChange,
  onDetailChange,
}: {
  rows: Array<{ key: string; label: string; chips: string[]; period?: string; st: { status: string; detail: string }; owner: string }>;
  columns: [string, string];
  showPeriod?: boolean;
  onStatusChange: (key: string, v: string) => void;
  onDetailChange: (key: string, v: string) => void;
}) {
  if (rows.length === 0) return <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add scope items first.</p>;
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">{columns[0]}</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">{columns[1]}</th>
          {showPeriod && <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Period</th>}
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[90px]">Status</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[70px]">Owner</th>
          <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
            <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
            <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{row.label}</td>
            <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400">{row.chips.length} outlets</span>
              </div>
            </td>
            {showPeriod && <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{row.period}</td>}
            <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
              <StatusSelect value={row.st.status as any} onChange={(v) => onStatusChange(row.key, v)} />
            </td>
            <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner={row.owner} /></td>
            <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
              <EditableInput value={row.st.detail} onChange={(v) => onDetailChange(row.key, v)} placeholder="Notes..." />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
