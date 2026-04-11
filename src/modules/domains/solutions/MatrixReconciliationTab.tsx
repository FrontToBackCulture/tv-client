import type { InstanceData, TemplateDefinition, ImplStatusEntry, PaymentMethod } from "../../../lib/solutions/types";
import {
  getOutlets, getOutletNames, isPMApplicable, getImplStatus, filterScope, getEntities,
} from "./matrixHelpers";
import {
  CollapsibleSection, StatusSelect, OwnerTag, EditableInput, GridStatusCell,
} from "./matrixComponents";
import {
  Empty, OutletCount, THead, renderOutletPMRows,
  COL_NUM, COL_STATUS, COL_OWNER, COL_NOTES,
} from "./matrixImplHelpers";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

export default function MatrixReconciliationTab({ data, onChange, selectedEntity }: Props) {
  const scope = filterScope(data.scope || [], selectedEntity);
  const pms = data.paymentMethods || [];
  const periods = data.periods || [];
  const implStatus = data.implStatus || {};
  const outlets = getOutlets(scope);
  const outletNames = getOutletNames(scope);
  const entities = getEntities(scope);
  const showEntityHeaders = !selectedEntity && entities.length > 1;

  const updateImpl = (key: string, field: keyof ImplStatusEntry, value: string) => {
    const st = getImplStatus(implStatus, key);
    onChange({ ...data, implStatus: { ...implStatus, [key]: { ...st, [field]: value } } });
  };

  const countDone = (keys: string[]) =>
    keys.filter((k) => { const s = getImplStatus(implStatus, k).status; return s === "done" || s === "na"; }).length;

  const acctKeys = pms.map((pm) => `acct::${pm.name}`);

  return (
    <div className="space-y-8">
      {/* Reconciliation — grid per period with entity row headers */}
      <CollapsibleSection badge="Reconciliation" badgeColor="green" title="Run & Verify Reconciliation" description="Click cells to cycle status.">
        {outlets.length === 0 || pms.length === 0 || periods.length === 0 ? <Empty /> : (
          periods.map((period) => (
            <div key={period}>
              <div className="flex items-center gap-2 my-3">
                <span className="text-xs font-semibold">{period}</span>
                <span className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              </div>
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg mb-4">
                <table className="border-collapse min-w-full">
                  <thead>
                    <tr>
                      <th className="bg-zinc-50 dark:bg-zinc-900 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-2.5 py-2 text-left border border-zinc-200 dark:border-zinc-800 sticky left-0 z-10 whitespace-nowrap min-w-[100px]">Outlet</th>
                      {pms.map((pm) => (
                        <th key={pm.name} className="bg-zinc-50 dark:bg-zinc-900 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 px-2 py-2 text-center border border-zinc-200 dark:border-zinc-800 whitespace-nowrap">{pm.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {showEntityHeaders ? entities.flatMap(({ entity }) => {
                      const entOutlets = outlets.filter((o) => o.entity === entity);
                      return [
                        <tr key={`ehdr-${entity}`}>
                          <th colSpan={pms.length + 1} className="bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 px-2.5 py-1.5 text-left border border-zinc-200 dark:border-zinc-800">
                            {entity} ({entOutlets.length})
                          </th>
                        </tr>,
                        ...entOutlets.map((o) => renderReconRow(o, pms, period, implStatus, updateImpl)),
                      ];
                    }) : outlets.map((o) => renderReconRow(o, pms, period, implStatus, updateImpl))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </CollapsibleSection>

      {/* Accounting Rules */}
      <CollapsibleSection badge="Accounting" badgeColor="green" title="Accounting Rules Setup" progress={`${countDone(acctKeys)} / ${acctKeys.length}`}>
        {pms.length === 0 ? <Empty /> : (
          <table className="w-full border-collapse">
            <THead cols={[
              { label: "#", className: COL_NUM },
              "Payment Method",
              "Outlets",
              { label: "Status", className: COL_STATUS },
              { label: "Owner", className: COL_OWNER },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>{pms.map((pm, i) => {
              const applicable = outletNames.filter((o) => isPMApplicable(pm, o));
              const key = `acct::${pm.name}`;
              const st = getImplStatus(implStatus, key);
              return (
                <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
                  <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OutletCount count={applicable.length} /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_OWNER}`}><OwnerTag owner="tv" /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Go Live */}
      <CollapsibleSection badge="Go Live" badgeColor="green" title="Walkthrough & Go Live" description="Track per outlet and payment method with go-live date.">
        {outlets.length === 0 || pms.length === 0 ? <Empty /> : (
          <table className="w-full border-collapse">
            <THead cols={[
              { label: "#", className: COL_NUM },
              "Outlet",
              "Payment Method",
              { label: "Walkthrough", className: COL_STATUS },
              { label: "Go Live", className: COL_STATUS },
              "Date",
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {renderOutletPMRows(outlets, pms, entities, showEntityHeaders, (o, pm, n) => {
                const wtKey = `walkthru::${o.key}::${pm.name}`;
                const glKey = `golive::${o.key}::${pm.name}`;
                const wtSt = getImplStatus(implStatus, wtKey);
                const glSt = getImplStatus(implStatus, glKey);
                return (
                  <tr key={`${o.key}::${pm.name}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{n}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{o.key}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={wtSt.status} onChange={(v) => updateImpl(wtKey, "status", v)} showNA={false} /></td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={glSt.status} onChange={(v) => updateImpl(glKey, "status", v)} showNA={false} /></td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <input type="date" value={glSt.date || ""} onChange={(e) => updateImpl(glKey, "date", e.target.value)} className="text-[11px] font-mono text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 w-[105px] focus:border-blue-500 focus:outline-none" />
                    </td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={glSt.detail} onChange={(v) => updateImpl(glKey, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CollapsibleSection>
    </div>
  );
}

function renderReconRow(
  o: { key: string; entity: string; label: string },
  pms: PaymentMethod[],
  period: string,
  implStatus: Record<string, ImplStatusEntry>,
  onUpdate: (key: string, field: keyof ImplStatusEntry, value: string) => void,
) {
  return (
    <tr key={o.key}>
      <th className="bg-zinc-50 dark:bg-zinc-900 text-[11px] font-medium text-left px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 sticky left-0 z-[1] whitespace-nowrap">{o.key}</th>
      {pms.map((pm) => {
        if (!isPMApplicable(pm, o.key)) return <td key={pm.name} className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 opacity-40 text-center text-xs">&mdash;</td>;
        const key = `recon::${o.key}::${pm.name}::${period}`;
        const st = getImplStatus(implStatus, key);
        return (
          <td key={pm.name} className="border border-zinc-200 dark:border-zinc-800 text-center">
            <div className="flex items-center justify-center py-1 px-0.5"><GridStatusCell value={st.status} onChange={(v) => onUpdate(key, "status", v)} /></div>
          </td>
        );
      })}
    </tr>
  );
}
