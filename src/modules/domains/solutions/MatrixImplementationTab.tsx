import type { InstanceData, TemplateDefinition, ImplStatusEntry } from "../../../lib/solutions/types";
import {
  getOutlets, getOutletNames, getUniquePOS, getCredentialPlatforms,
  getSyncItems, isPMApplicable, getImplStatus, filterScope, getEntities,
} from "./matrixHelpers";
import {
  CollapsibleSection, StatusSelect, OwnerTag, EditableInput,
  TypeBadge, GridStatusCell,
} from "./matrixComponents";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

export default function MatrixImplementationTab({ data, template, onChange, selectedEntity }: Props) {
  const scope = filterScope(data.scope || [], selectedEntity);
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
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

  const countDone = (keys: string[]) => keys.filter((k) => { const s = getImplStatus(implStatus, k).status; return s === "done" || s === "na"; }).length;

  const posList = getUniquePOS(scope);
  const platforms = getCredentialPlatforms(pms, template);
  const syncItems = getSyncItems(scope, pms, banks);

  const botKeys = platforms.map((p) => `bot::${p}`);
  const posSetupKeys = posList.map((p) => `pos-setup::${p.name}`);
  const syncTblKeys = syncItems.map((item) => `sync-tbl::${item.key}`);
  const syncWfKeys = syncItems.map((item) => `sync-wf::${item.key}`);
  const populateMappingKeys = outlets.flatMap((o) => pms.filter((pm) => isPMApplicable(pm, o.key)).map((pm) => `populate-map::${o.key}::${pm.name}`));
  const populateDataKeys = outlets.flatMap((o) => pms.filter((pm) => isPMApplicable(pm, o.key)).flatMap((pm) => periods.map((p) => `populate-data::${o.key}::${pm.name}::${p}`)));
  const acctKeys = pms.map((pm) => `acct::${pm.name}`);

  // Helper: render table rows with optional entity headers
  const renderOutletPMRows = (
    renderRow: (o: typeof outlets[0], pm: typeof pms[0], n: number) => React.ReactNode
  ) => {
    let n = 0;
    if (showEntityHeaders) {
      return entities.flatMap(({ entity }) => {
        const entOutlets = outlets.filter((o) => o.entity === entity);
        return [
          <tr key={`hdr-${entity}`}>
            <td colSpan={20} className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{entity} ({entOutlets.length})</span>
            </td>
          </tr>,
          ...entOutlets.flatMap((o) =>
            pms.filter((pm) => isPMApplicable(pm, o.key)).map((pm) => { n++; return renderRow(o, pm, n); })
          ),
        ];
      });
    }
    return outlets.flatMap((o) =>
      pms.filter((pm) => isPMApplicable(pm, o.key)).map((pm) => { n++; return renderRow(o, pm, n); })
    );
  };

  return (
    <div className="space-y-8">
      {/* Bot Setup */}
      <CollapsibleSection badge="Bot Setup" badgeColor="green" title="Auto-Download Bots" progress={`${countDone(botKeys)} / ${botKeys.length}`} description="Activate robot downloaders for each delivery platform.">
        {platforms.length === 0 ? <Empty /> : (
          <table className="w-full border-collapse">
            <THead cols={["#","Platform","Outlets","Status","Owner","Notes"]} />
            <tbody>{platforms.map((pm, i) => {
              const pmObj = pms.find((p) => p.name === pm);
              const applicable = pmObj ? outletNames.filter((o) => isPMApplicable(pmObj, o)) : outletNames;
              const key = `bot::${pm}`;
              const st = getImplStatus(implStatus, key);
              return (
                <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
                  <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm}</td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OutletCount count={applicable.length} /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="tv" /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* POS Setup */}
      <CollapsibleSection badge="POS Setup" badgeColor="green" title="POS Connection & Data Ingestion" progress={`${countDone(posSetupKeys)} / ${posSetupKeys.length}`}>
        {posList.length === 0 ? <Empty /> : (
          <table className="w-full border-collapse">
            <THead cols={["#","POS System","Outlets","Status","Owner","Notes"]} />
            <tbody>{posList.map((pos, i) => {
              const key = `pos-setup::${pos.name}`;
              const st = getImplStatus(implStatus, key);
              return (
                <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
                  <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pos.name}</td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OutletCount count={pos.outlets.length} /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="tv" /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Sync Tables */}
      <CollapsibleSection badge="Sync Tables" badgeColor="green" title="Sync Tables from Lab" progress={`${countDone(syncTblKeys)} / ${syncTblKeys.length}`}>
        <SyncTable items={syncItems} prefix="sync-tbl" implStatus={implStatus} onUpdate={updateImpl} />
      </CollapsibleSection>

      {/* Workflows */}
      <CollapsibleSection badge="Workflows" badgeColor="green" title="Configure Workflows" progress={`${countDone(syncWfKeys)} / ${syncWfKeys.length}`}>
        <SyncTable items={syncItems} prefix="sync-wf" implStatus={implStatus} onUpdate={updateImpl} />
      </CollapsibleSection>

      {/* Populate Mapping */}
      <CollapsibleSection badge="Mapping" badgeColor="green" title="Populate Mapping" progress={`${countDone(populateMappingKeys)} / ${populateMappingKeys.length}`} description="Load outlet/PM mapping configuration into VAL.">
        {outlets.length === 0 || pms.length === 0 ? <Empty /> : (
          <table className="w-full border-collapse">
            <THead cols={["#","Outlet","Payment Method","Status","Notes"]} />
            <tbody>
              {renderOutletPMRows((o, pm, n) => {
                const key = `populate-map::${o.key}::${pm.name}`;
                const st = getImplStatus(implStatus, key);
                return (
                  <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{o.key}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Populate Data */}
      <CollapsibleSection badge="Data" badgeColor="green" title="Populate Data" progress={`${countDone(populateDataKeys)} / ${populateDataKeys.length}`} description="Load historical transaction data per outlet per payment method per period.">
        {outlets.length === 0 || pms.length === 0 || periods.length === 0 ? <Empty /> : (
          <table className="w-full border-collapse">
            <THead cols={["#","Outlet","PM","Period","Min Date","Max Date","Status","Notes"]} />
            <tbody>
              {(() => {
                let n = 0;
                const rows: React.ReactNode[] = [];
                const renderEntity = (entOutlets: typeof outlets) => {
                  entOutlets.forEach((o) => {
                    pms.filter((pm) => isPMApplicable(pm, o.key)).forEach((pm) => {
                      periods.forEach((period) => {
                        n++;
                        const key = `populate-data::${o.key}::${pm.name}::${period}`;
                        const st = getImplStatus(implStatus, key);
                        rows.push(
                          <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                            <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                            <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{o.key}</td>
                            <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                            <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{period}</td>
                            <td className="px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{st.minDate || "—"}</td>
                            <td className="px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{st.maxDate || "—"}</td>
                            <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                            <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                          </tr>
                        );
                      });
                    });
                  });
                };
                if (showEntityHeaders) {
                  entities.forEach(({ entity }) => {
                    const entOutlets = outlets.filter((o) => o.entity === entity);
                    rows.push(
                      <tr key={`hdr-${entity}`}><td colSpan={20} className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800"><span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{entity} ({entOutlets.length})</span></td></tr>
                    );
                    renderEntity(entOutlets);
                  });
                } else {
                  renderEntity(outlets);
                }
                return rows;
              })()}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

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
            <THead cols={["#","Payment Method","Outlets","Status","Owner","Notes"]} />
            <tbody>{pms.map((pm, i) => {
              const applicable = outletNames.filter((o) => isPMApplicable(pm, o));
              const key = `acct::${pm.name}`;
              const st = getImplStatus(implStatus, key);
              return (
                <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
                  <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OutletCount count={applicable.length} /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="tv" /></td>
                  <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
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
            <THead cols={["#","Outlet","Payment Method","Walkthrough","Go Live","Date","Notes"]} />
            <tbody>
              {renderOutletPMRows((o, pm, n) => {
                const wtKey = `walkthru::${o.key}::${pm.name}`;
                const glKey = `golive::${o.key}::${pm.name}`;
                const wtSt = getImplStatus(implStatus, wtKey);
                const glSt = getImplStatus(implStatus, glKey);
                return (
                  <tr key={`${o.key}::${pm.name}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{o.key}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={wtSt.status} onChange={(v) => updateImpl(wtKey, "status", v)} showNA={false} /></td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={glSt.status} onChange={(v) => updateImpl(glKey, "status", v)} showNA={false} /></td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <input type="date" value={glSt.date || ""} onChange={(e) => updateImpl(glKey, "date", e.target.value)} className="text-[11px] font-mono text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1.5 py-0.5 w-[105px] focus:border-blue-500 focus:outline-none" />
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={glSt.detail} onChange={(v) => updateImpl(glKey, "detail", v)} placeholder="Notes..." /></td>
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

// ─── Shared helpers ───

function Empty() { return <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">No items to show.</p>; }
function OutletCount({ count }: { count: number }) { return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400">{count} outlets</span>; }
function THead({ cols }: { cols: string[] }) {
  return <thead><tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{cols.map((c, i) => <th key={i} className="text-left px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800">{c}</th>)}</tr></thead>;
}

function renderReconRow(o: { key: string; entity: string; label: string }, pms: Array<{ name: string; appliesTo: string; excludedOutlets: string[]; notes: string }>, period: string, implStatus: Record<string, ImplStatusEntry>, onUpdate: (key: string, field: keyof ImplStatusEntry, value: string) => void) {
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

function SyncTable({ items, prefix, implStatus, onUpdate }: {
  items: ReturnType<typeof getSyncItems>; prefix: string; implStatus: Record<string, ImplStatusEntry>; onUpdate: (key: string, field: keyof ImplStatusEntry, value: string) => void;
}) {
  if (items.length === 0) return <Empty />;
  return (
    <table className="w-full border-collapse">
      <THead cols={["#","Type","Name","Scope","Status","Owner","Notes"]} />
      <tbody>{items.map((item, i) => {
        const key = `${prefix}::${item.key}`;
        const st = getImplStatus(implStatus, key);
        return (
          <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
            <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
            <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><TypeBadge type={item.type} /></td>
            <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{item.name}</td>
            <td className="px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{item.scope}</td>
            <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => onUpdate(key, "status", v)} /></td>
            <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="tv" /></td>
            <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => onUpdate(key, "detail", v)} placeholder="Notes..." /></td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}
