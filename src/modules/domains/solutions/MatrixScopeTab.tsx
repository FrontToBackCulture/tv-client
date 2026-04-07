import { useCallback, useState } from "react";
import type { InstanceData, ScopeOutlet, PaymentMethod, BankAccount } from "../../../lib/solutions/types";
import { POS_OPTIONS, PAYMENT_METHOD_OPTIONS, BANK_OPTIONS } from "../../../lib/solutions/types";
import { getOutletNames, getEntities, filterScope } from "./matrixHelpers";
import {
  CollapsibleSection, EditableInput, AddButton, DeleteButton,
} from "./matrixComponents";

interface Props {
  data: InstanceData;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

export default function MatrixScopeTab({ data, onChange, selectedEntity }: Props) {
  const scope = data.scope || [];
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
  const outletNames = getOutletNames(scope);
  const entities = getEntities(scope);
  const filteredScope = filterScope(scope, selectedEntity);

  const updateScope = useCallback(
    (idx: number, field: keyof ScopeOutlet, value: unknown) => {
      const next = [...scope];
      next[idx] = { ...next[idx], [field]: value };
      onChange({ ...data, scope: next });
    },
    [data, scope, onChange]
  );

  const addOutlet = (entity: string = "") => {
    onChange({ ...data, scope: [...scope, { entity, outlet: "", pos: [], notes: "" }] });
  };

  const removeOutlet = (idx: number) => {
    onChange({ ...data, scope: scope.filter((_, i) => i !== idx) });
  };

  const updatePM = useCallback(
    (idx: number, field: keyof PaymentMethod, value: unknown) => {
      const next = [...pms];
      next[idx] = { ...next[idx], [field]: value };
      onChange({ ...data, paymentMethods: next });
    },
    [data, pms, onChange]
  );

  const addPM = (name: string) => {
    if (!name.trim() || pms.find((p) => p.name === name.trim())) return;
    onChange({ ...data, paymentMethods: [...pms, { name: name.trim(), appliesTo: "all", excludedOutlets: [], notes: "" }] });
  };

  const removePM = (idx: number) => {
    onChange({ ...data, paymentMethods: pms.filter((_, i) => i !== idx) });
  };

  const updateBank = useCallback(
    (idx: number, field: keyof BankAccount, value: unknown) => {
      const next = [...banks];
      next[idx] = { ...next[idx], [field]: value };
      onChange({ ...data, banks: next });
    },
    [data, banks, onChange]
  );

  const addBank = (bankName: string, account: string) => {
    if (!bankName.trim()) return;
    onChange({ ...data, banks: [...banks, { bank: bankName.trim(), account: account.trim(), outlets: [], paymentMethods: [], notes: "" }] });
  };

  const removeBank = (idx: number) => {
    onChange({ ...data, banks: banks.filter((_, i) => i !== idx) });
  };

  // Filtered banks for selected entity
  const filteredBanks = selectedEntity
    ? banks.filter((b) => b.outlets.length === 0 || b.outlets.some((o) => filteredScope.some((s) => s.outlet === o)))
    : banks;
  const filteredOutletNames = filteredScope.map((s) => s.outlet).filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      {!selectedEntity && scope.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5">
          <SummaryCard value={scope.length} label="Outlets" />
          <SummaryCard value={pms.length} label="Payment Methods" />
          <SummaryCard value={banks.length} label="Bank Accounts" />
          <SummaryCard value={new Set(scope.flatMap((s) => Array.isArray(s.pos) ? s.pos : [])).size} label="POS Systems" />
        </div>
      )}

      {/* Entities & Outlets */}
      <CollapsibleSection badge="1" badgeColor="purple" title={selectedEntity ? `${selectedEntity} Outlets` : "Entities & Outlets"} description={selectedEntity ? undefined : "Grouped by entity. Click an entity in the sidebar to filter."}>
        {scope.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 dark:text-zinc-600">
            <p className="text-sm mb-3">No outlets defined</p>
            <p className="text-xs mb-4">Click "Pre-populate from VAL" or add manually below.</p>
            <AddButton label="+ Add Outlet" onClick={() => addOutlet("")} />
          </div>
        ) : selectedEntity ? (
          /* Flat filtered view for selected entity */
          <OutletTable
            scope={scope}
            filteredScope={filteredScope}
            onUpdate={updateScope}
            onRemove={removeOutlet}
            onAdd={() => addOutlet(selectedEntity)}
            entityName={selectedEntity}
          />
        ) : (
          /* Grouped view for all entities */
          <>
            {entities.map(({ entity, count }) => (
              <EntityGroup
                key={entity}
                entity={entity}
                count={count}
                scope={scope}
                onUpdate={updateScope}
                onRemove={removeOutlet}
                onAdd={() => addOutlet(entity)}
              />
            ))}
            <AddButton label="+ Add Outlet" onClick={() => addOutlet("")} />
          </>
        )}
      </CollapsibleSection>

      {/* Payment Methods */}
      <CollapsibleSection badge="2" badgeColor="purple" title={selectedEntity ? `Payment Methods for ${selectedEntity}` : "Payment Methods"}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[22%]">Payment Method</th>
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Applicable</th>
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Excluded</th>
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              <th className="w-8 border-b border-zinc-200 dark:border-zinc-800"></th>
            </tr>
          </thead>
          <tbody>
            {pms.map((pm, i) => {
              const excluded = pm.excludedOutlets || [];
              const relevantOutlets = selectedEntity ? filteredOutletNames : outletNames;
              const applicableCount = relevantOutlets.filter((o) => !excluded.includes(o)).length;
              const excludedCount = relevantOutlets.filter((o) => excluded.includes(o)).length;
              const allApplied = excludedCount === 0;
              return (
                <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-2 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
                  <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${allApplied ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                      {allApplied ? `All ${relevantOutlets.length}` : applicableCount}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    {excludedCount > 0 ? (
                      <button
                        onClick={() => { /* expand to show excluded outlets */ }}
                        className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 cursor-pointer underline decoration-dotted hover:text-amber-500 bg-transparent border-none"
                      >
                        {excludedCount} excluded
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-300 dark:text-zinc-700">&mdash;</span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={pm.notes} onChange={(v) => updatePM(i, "notes", v)} placeholder="Notes..." /></td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><DeleteButton onClick={() => removePM(i)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <PMAddRow onAdd={addPM} existingPMs={pms.map((p) => p.name)} />
      </CollapsibleSection>

      {/* Bank Accounts */}
      <CollapsibleSection badge="3" badgeColor="purple" title={selectedEntity ? `Bank Accounts for ${selectedEntity}` : "Bank Accounts"}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Bank</th>
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[14%]">Account No.</th>
              {selectedEntity ? (
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Outlets</th>
              ) : (
                <>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Entity</th>
                  <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Outlets</th>
                </>
              )}
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              <th className="w-8 border-b border-zinc-200 dark:border-zinc-800"></th>
            </tr>
          </thead>
          <tbody>
            {filteredBanks.map((bank, i) => {
              const bankOutlets = bank.outlets || [];
              const displayOutletCount = selectedEntity
                ? filteredOutletNames.filter((o) => bankOutlets.length === 0 || bankOutlets.includes(o)).length
                : bankOutlets.length === 0 ? outletNames.length : bankOutlets.length;
              // Determine entity for this bank (based on outlet membership)
              const bankEntity = selectedEntity || (bankOutlets.length > 0 ? scope.find((s) => bankOutlets.includes(s.outlet))?.entity || "" : "");
              const realIdx = banks.indexOf(bank);
              return (
                <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-2 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    <select value={bank.bank} onChange={(e) => updateBank(realIdx, "bank", e.target.value)} className="text-xs bg-transparent border border-transparent rounded px-1 py-0.5 w-full cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:border-blue-500 focus:outline-none text-zinc-700 dark:text-zinc-200">
                      <option value="">Select...</option>
                      {BANK_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={bank.account} onChange={(v) => updateBank(realIdx, "account", v)} placeholder="Account no..." className="font-mono text-[11px]" /></td>
                  {!selectedEntity && (
                    <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{bankEntity}</td>
                  )}
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                      {bankOutlets.length === 0 ? `All ${displayOutletCount}` : `${displayOutletCount} outlets`}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={bank.notes} onChange={(v) => updateBank(realIdx, "notes", v)} placeholder="Notes..." /></td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><DeleteButton onClick={() => removeBank(realIdx)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!selectedEntity && <BankAddRow onAdd={addBank} />}
      </CollapsibleSection>
    </div>
  );
}

// ─── Summary card ───
function SummaryCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-lg px-3 py-2.5">
      <div className="text-xl font-bold font-mono">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

// ─── Entity group (collapsible) ───
function EntityGroup({ entity, count, scope, onUpdate, onRemove, onAdd }: {
  entity: string; count: number; scope: ScopeOutlet[];
  onUpdate: (idx: number, field: keyof ScopeOutlet, value: unknown) => void;
  onRemove: (idx: number) => void; onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const entityScope = scope.filter((s) => s.entity === entity);
  const posSet = new Set(entityScope.flatMap((s) => Array.isArray(s.pos) ? s.pos : []));

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg mb-2 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors border-none text-left"
      >
        <span className={`text-[10px] text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{entity}</span>
        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{count} outlets</span>
        <div className="flex gap-1 ml-auto">
          {[...posSet].map((pos) => (
            <span key={pos} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400">{pos}</span>
          ))}
        </div>
      </button>
      {open && (
        <div>
          <OutletTable scope={scope} filteredScope={entityScope} onUpdate={onUpdate} onRemove={onRemove} onAdd={onAdd} entityName={entity} />
        </div>
      )}
    </div>
  );
}

// ─── Outlet table (used in both grouped and filtered views) ───
function OutletTable({ scope, filteredScope, onUpdate, onRemove, onAdd, entityName }: {
  scope: ScopeOutlet[]; filteredScope: ScopeOutlet[];
  onUpdate: (idx: number, field: keyof ScopeOutlet, value: unknown) => void;
  onRemove: (idx: number) => void; onAdd: () => void; entityName: string;
}) {
  const [showAll, setShowAll] = useState(filteredScope.length <= 10);
  const displayScope = showAll ? filteredScope : filteredScope.slice(0, 8);
  const remaining = filteredScope.length - displayScope.length;

  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
            <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[25%]">Outlet</th>
            <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[20%]">POS</th>
            <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
            <th className="w-8 border-b border-zinc-200 dark:border-zinc-800"></th>
          </tr>
        </thead>
        <tbody>
          {displayScope.map((row, localIdx) => {
            const globalIdx = scope.indexOf(row);
            return (
              <tr key={globalIdx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <td className="px-3 py-2 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{localIdx + 1}</td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <EditableInput value={row.outlet} onChange={(v) => onUpdate(globalIdx, "outlet", v)} placeholder="Outlet..." />
                </td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <POSMultiSelect value={Array.isArray(row.pos) ? row.pos : []} onChange={(v) => onUpdate(globalIdx, "pos", v)} />
                </td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <EditableInput value={row.notes} onChange={(v) => onUpdate(globalIdx, "notes", v)} placeholder="Notes..." />
                </td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><DeleteButton onClick={() => onRemove(globalIdx)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-center py-1.5 text-[11px] font-medium text-teal-600 dark:text-teal-400 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950/20 border-t border-zinc-200/50 dark:border-zinc-800/50 bg-transparent border-x-0 border-b-0"
        >
          Show {remaining} more outlets &darr;
        </button>
      )}
      <div className="px-3 py-1.5 border-t border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900/50">
        <AddButton label={`+ Add to ${entityName}`} onClick={onAdd} />
      </div>
    </>
  );
}

// ─── POS multi-select ───
function POSMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (pos: string) => {
    onChange(value.includes(pos) ? value.filter((p) => p !== pos) : [...value, pos]);
  };
  return (
    <div className="relative">
      <div onClick={() => setOpen(!open)} className="flex flex-wrap gap-1 min-h-[22px] px-1 py-0.5 rounded border border-transparent cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
        {value.length === 0 ? (
          <span className="text-xs text-zinc-400 dark:text-zinc-600 italic">Select POS...</span>
        ) : value.map((pos) => (
          <span key={pos} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 inline-flex items-center gap-0.5">
            {pos}
            <button onClick={(e) => { e.stopPropagation(); toggle(pos); }} className="text-teal-400 hover:text-red-400 bg-transparent border-none cursor-pointer text-[10px] leading-none">&times;</button>
          </span>
        ))}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 mt-1 w-[180px] max-h-[200px] overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1">
            {POS_OPTIONS.map((pos) => {
              const selected = value.includes(pos);
              return (
                <button key={pos} onClick={() => toggle(pos)} className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer transition-colors border-none ${selected ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}>
                  <span className={`w-3 h-3 rounded border flex items-center justify-center text-[8px] flex-shrink-0 ${selected ? "bg-teal-500 border-teal-500 text-white" : "border-zinc-300 dark:border-zinc-600"}`}>{selected && "✓"}</span>
                  {pos}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── PM add row ───
function PMAddRow({ onAdd, existingPMs }: { onAdd: (name: string) => void; existingPMs: string[] }) {
  const available = PAYMENT_METHOD_OPTIONS.filter((pm) => !existingPMs.includes(pm));
  const [open, setOpen] = useState(false);
  if (available.length === 0) return <p className="text-[11px] text-zinc-400 mt-2">All payment methods added</p>;
  return (
    <div className="relative mt-2">
      <button onClick={() => setOpen(!open)} className="text-[11px] font-medium px-3 py-1.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 bg-transparent cursor-pointer hover:border-blue-500 hover:text-blue-400 hover:bg-blue-500/5">+ Add Payment Method</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full left-0 mb-1 w-[220px] max-h-[280px] overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1">
            {available.map((pm) => (
              <button key={pm} onClick={() => { onAdd(pm); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer border-none">{pm}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Bank add row ───
function BankAddRow({ onAdd }: { onAdd: (bank: string, account: string) => void }) {
  return (
    <div className="flex gap-2 items-center mt-2">
      <select id="bankNameSelect" className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200 w-[120px] focus:border-blue-500 focus:outline-none cursor-pointer">
        <option value="">Bank...</option>
        {BANK_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <input id="bankAcctInput" type="text" placeholder="Account number..." className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200 w-[180px] focus:border-blue-500 focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
        onKeyDown={(e) => { if (e.key === "Enter") { const sel = document.getElementById("bankNameSelect") as HTMLSelectElement; const inp = e.target as HTMLInputElement; if (sel.value) { onAdd(sel.value, inp.value); sel.value = ""; inp.value = ""; } } }}
      />
      <AddButton label="+ Add" onClick={() => { const sel = document.getElementById("bankNameSelect") as HTMLSelectElement; const inp = document.getElementById("bankAcctInput") as HTMLInputElement; if (sel?.value) { onAdd(sel.value, inp?.value || ""); sel.value = ""; if (inp) inp.value = ""; } }} />
    </div>
  );
}
