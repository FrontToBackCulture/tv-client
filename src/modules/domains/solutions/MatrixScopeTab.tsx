import { useCallback, useMemo, useRef, useState } from "react";
import type { InstanceData, ScopeOutlet, ScopeEntity, PaymentMethod, BankAccount, TemplateDefinition } from "../../../lib/solutions/types";
import { POS_OPTIONS, PAYMENT_METHOD_OPTIONS, BANK_OPTIONS } from "../../../lib/solutions/types";
import { getOutletNames, getOutlets, getEntities, getBankForCell, isPMApplicable, filterScope } from "./matrixHelpers";
import {
  CollapsibleSection, EditableInput, AddButton, DeleteButton,
} from "./matrixComponents";

interface Props {
  data: InstanceData;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
  domain?: string;
  instanceId?: string;
  template?: TemplateDefinition;
  onAddSystem?: (systemId: string, systemType: string) => void;
}

export default function MatrixScopeTab({ data, onChange, selectedEntity, domain: _domain, instanceId: _instanceId, template, onAddSystem }: Props) {
  const scope = data.scope || [];
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
  const outletNames = getOutletNames(scope);
  const entities = getEntities(scope);
  const filteredScope = filterScope(scope, selectedEntity);

  // All POS values in use across the entire scope (includes custom ones)
  const allScopePOS = useMemo(
    () => [...new Set(scope.flatMap((s) => Array.isArray(s.pos) ? s.pos : []))],
    [scope]
  );

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

  const renameEntity = (oldEntity: string, newEntity: string) => {
    const nextScope = scope.map((s) => (s.entity || "") === oldEntity ? { ...s, entity: newEntity } : s);
    // Keep data.entities in sync when renaming so the shortcode stays attached to the entity.
    const nextEntities = (data.entities || []).map((e) =>
      e.name === oldEntity ? { ...e, name: newEntity } : e,
    );
    onChange({ ...data, scope: nextScope, entities: nextEntities });
  };

  const getEntityShortCode = (entity: string): string => {
    return (data.entities || []).find((e) => e.name === entity)?.shortCode || "";
  };

  const updateEntityShortCode = (entity: string, shortCode: string) => {
    if (!entity) return; // Don't store shortcodes for the "Unassigned" group
    const existing = data.entities || [];
    const trimmed = shortCode.trim();
    const idx = existing.findIndex((e) => e.name === entity);
    let next: ScopeEntity[];
    if (idx >= 0) {
      if (!trimmed) {
        next = existing.filter((_, i) => i !== idx);
      } else {
        next = [...existing];
        next[idx] = { ...next[idx], shortCode: trimmed };
      }
    } else if (trimmed) {
      next = [...existing, { name: entity, shortCode: trimmed }];
    } else {
      return; // nothing to do
    }
    onChange({ ...data, entities: next });
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

  // Add custom system to template valConfig
  const addCustomSystem = useCallback((systemId: string, systemType: string) => {
    if (!onAddSystem) return;
    const valConfig = (template as any)?.valConfig;
    if (!valConfig) return;
    const systems: any[] = valConfig.systems || [];
    // Skip if already exists
    if (systems.some((s: any) => s.id === systemId)) return;
    onAddSystem(systemId, systemType);
  }, [onAddSystem, template]);

  const handleAddCustomPOS = useCallback((name: string) => addCustomSystem(name, "POS"), [addCustomSystem]);
  const handleAddCustomPM = useCallback((name: string) => addCustomSystem(name, "Platform Delivery"), [addCustomSystem]);
  const handleAddCustomBank = useCallback((name: string) => addCustomSystem(name, "Bank"), [addCustomSystem]);

  // Payment methods declared on the solution template (valConfig.systems where type === "Platform Delivery").
  // Merging these into the dropdown lets new template-level methods appear in existing domain instances.
  const templatePMs = useMemo(() => {
    const systems: any[] = (template as any)?.valConfig?.systems || [];
    return systems.filter((s) => s?.type === "Platform Delivery").map((s) => String(s.id)).filter(Boolean);
  }, [template]);

  // Filtered banks for selected entity
  const filteredBanks = selectedEntity !== null
    ? banks.filter((b) => b.outlets.length === 0 || b.outlets.some((o) => filteredScope.some((s) => s.outlet === o)))
    : banks;
  const filteredOutletNames = filteredScope.map((s) => s.outlet).filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      {selectedEntity === null && scope.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5">
          <SummaryCard value={scope.length} label="Outlets" />
          <SummaryCard value={pms.length} label="Payment Methods" />
          <SummaryCard value={banks.length} label="Bank Accounts" />
          <SummaryCard value={new Set(scope.flatMap((s) => Array.isArray(s.pos) ? s.pos : [])).size} label="POS Systems" />
        </div>
      )}

      {/* Entities & Outlets */}
      <CollapsibleSection badge="1" badgeColor="purple" title={selectedEntity !== null ? `${selectedEntity || "Unassigned"} Outlets` : "Entities & Outlets"} description={selectedEntity !== null ? undefined : "Grouped by entity. Click an entity in the sidebar to filter."}>
        {scope.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 dark:text-zinc-600">
            <p className="text-sm mb-3">No outlets defined</p>
            <p className="text-xs mb-4">Click "Pre-populate from VAL" or add manually below.</p>
            <AddButton label="+ Add Outlet" onClick={() => addOutlet("")} />
          </div>
        ) : selectedEntity !== null ? (
          /* Flat filtered view for selected entity */
          <OutletTable
            scope={scope}
            filteredScope={filteredScope}
            onUpdate={updateScope}
            onRemove={removeOutlet}
            onAdd={() => addOutlet(selectedEntity)}
            entityName={selectedEntity}
            showEntity={selectedEntity === ""}
            onAddCustomPOS={handleAddCustomPOS}
            allScopePOS={allScopePOS}
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
                shortCode={getEntityShortCode(entity)}
                onUpdate={updateScope}
                onRemove={removeOutlet}
                onAdd={() => addOutlet(entity)}
                onRenameEntity={renameEntity}
                onUpdateShortCode={updateEntityShortCode}
                onAddCustomPOS={handleAddCustomPOS}
                allScopePOS={allScopePOS}
              />
            ))}
            <AddButton label="+ Add Outlet" onClick={() => addOutlet("")} />
          </>
        )}
      </CollapsibleSection>

      {/* Payment Methods */}
      <CollapsibleSection badge="2" badgeColor="purple" title={selectedEntity !== null ? `Payment Methods for ${selectedEntity || "Unassigned"}` : "Payment Methods"}>
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
              const relevantOutlets = selectedEntity !== null ? filteredOutletNames : outletNames;
              const applicableCount = relevantOutlets.filter((o) => !excluded.includes(o)).length;
              const excludedCount = relevantOutlets.filter((o) => excluded.includes(o)).length;
              const allApplied = excludedCount === 0;
              return (
                <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-2 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
                  <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    <OutletToggleDropdown
                      allOutlets={relevantOutlets}
                      excludedOutlets={excluded}
                      onChange={(newExcluded) => updatePM(i, "excludedOutlets", newExcluded)}
                      label={allApplied ? `All ${relevantOutlets.length}` : String(applicableCount)}
                      badgeClass={allApplied ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}
                    />
                  </td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    <OutletToggleDropdown
                      allOutlets={relevantOutlets}
                      excludedOutlets={excluded}
                      onChange={(newExcluded) => updatePM(i, "excludedOutlets", newExcluded)}
                      label={excludedCount > 0 ? `${excludedCount} excluded` : "\u2014"}
                      badgeClass={excludedCount > 0 ? "text-amber-500 underline decoration-dotted" : "text-zinc-300 dark:text-zinc-700"}
                      showExcluded
                    />
                  </td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={pm.notes} onChange={(v) => updatePM(i, "notes", v)} placeholder="Notes..." /></td>
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><DeleteButton onClick={() => removePM(i)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <PMAddRow onAdd={addPM} existingPMs={pms.map((p) => p.name)} templatePMs={templatePMs} onAddCustom={handleAddCustomPM} />
      </CollapsibleSection>

      {/* Bank Accounts */}
      <CollapsibleSection badge="3" badgeColor="purple" title={selectedEntity !== null ? `Bank Accounts for ${selectedEntity || "Unassigned"}` : "Bank Accounts"}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[10%]">Bank</th>
              <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[14%]">Account No.</th>
              {selectedEntity !== null ? (
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
              const bankEntity = selectedEntity !== null ? selectedEntity : (bankOutlets.length > 0 ? scope.find((s) => bankOutlets.includes(s.outlet))?.entity || "" : "");
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
                  {selectedEntity === null && (
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
        {selectedEntity === null && <BankAddRow onAdd={addBank} onAddCustom={handleAddCustomBank} />}
      </CollapsibleSection>

      {/* Bank Settlement Summary — read-only verification derived from the bank definitions above */}
      <CollapsibleSection badge="Verify" badgeColor="purple" title="Bank Settlement Summary" description="Read-only — derived from bank definitions. Shows which bank account receives settlement for each outlet × payment method.">
        {filteredScope.length === 0 || pms.length === 0 || banks.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Add outlets, payment methods, and bank accounts first.</p>
        ) : (() => {
          const bsOutlets = getOutlets(filteredScope);
          return (
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
                  {bsOutlets.map((o) => (
                    <tr key={o.key}>
                      <th className="bg-zinc-50 dark:bg-zinc-900 text-xs font-medium text-left px-3 py-2 border border-zinc-200 dark:border-zinc-800 sticky left-0 z-[1] whitespace-nowrap">{o.key}</th>
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
          );
        })()}
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

// ─── Entity shortcode input — commit-on-blur ───
function EntityShortCodeInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [focused, setFocused] = useState(false);
  // Keep the input in sync with external updates when not actively editing.
  if (!focused && local !== value) setLocal(value);
  const bare = !value.trim();
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (local.trim() !== value) onSave(local); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setLocal(value); (e.target as HTMLInputElement).blur(); }
      }}
      placeholder="Short"
      title={bare ? "Entity shortcode — used as the `brand` column in master outlets" : "Entity shortcode"}
      className={`text-[11px] font-mono px-1.5 py-0.5 rounded border w-[80px] bg-white dark:bg-zinc-800 focus:outline-none focus:border-blue-500 ${bare ? "border-amber-400 text-amber-500 placeholder:text-amber-400/60" : "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"}`}
    />
  );
}

// ─── Entity group (collapsible) ───
function EntityGroup({ entity, count, scope, shortCode, onUpdate, onRemove, onAdd, onRenameEntity, onUpdateShortCode, onAddCustomPOS, allScopePOS }: {
  entity: string; count: number; scope: ScopeOutlet[];
  shortCode: string;
  onUpdate: (idx: number, field: keyof ScopeOutlet, value: unknown) => void;
  onRemove: (idx: number) => void; onAdd: () => void;
  onRenameEntity: (oldEntity: string, newEntity: string) => void;
  onUpdateShortCode: (entity: string, shortCode: string) => void;
  onAddCustomPOS?: (name: string) => void;
  allScopePOS?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entity);
  const entityScope = scope.filter((s) => (s.entity || "") === entity);
  const posSet = new Set(entityScope.flatMap((s) => Array.isArray(s.pos) ? s.pos : []));

  const commitRename = () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== entity) {
      onRenameEntity(entity, trimmed);
    } else {
      setEditValue(entity);
    }
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg mb-2 overflow-hidden">
      <div className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer bg-transparent border-none text-left p-0"
        >
          <span className={`text-[10px] text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
        </button>
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditValue(entity); setEditing(false); } }}
            className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-blue-500 rounded px-1.5 py-0.5 outline-none w-[200px]"
          />
        ) : (
          <span
            onDoubleClick={() => { if (entity) { setEditValue(entity); setEditing(true); } }}
            className={`text-xs font-semibold cursor-default ${entity ? "text-zinc-700 dark:text-zinc-300 hover:text-blue-500 dark:hover:text-blue-400" : "text-zinc-400 dark:text-zinc-500 italic"}`}
            title={entity ? "Double-click to rename" : ""}
          >
            {entity || "Unassigned"}
          </span>
        )}
        {entity && (
          <EntityShortCodeInput
            value={shortCode}
            onSave={(v) => onUpdateShortCode(entity, v)}
          />
        )}
        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{count} outlets</span>
        <div className="flex gap-1 ml-auto">
          {[...posSet].map((pos) => (
            <span key={pos} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400">{pos}</span>
          ))}
        </div>
      </div>
      {open && (
        <div>
          <OutletTable scope={scope} filteredScope={entityScope} onUpdate={onUpdate} onRemove={onRemove} onAdd={onAdd} entityName={entity} showEntity={entity === ""} onAddCustomPOS={onAddCustomPOS} allScopePOS={allScopePOS} />
        </div>
      )}
    </div>
  );
}

// ─── Outlet table (used in both grouped and filtered views) ───
function OutletTable({ scope, filteredScope, onUpdate, onRemove, onAdd, entityName, showEntity = false, onAddCustomPOS, allScopePOS }: {
  scope: ScopeOutlet[]; filteredScope: ScopeOutlet[];
  onUpdate: (idx: number, field: keyof ScopeOutlet, value: unknown) => void;
  onRemove: (idx: number) => void; onAdd: () => void; entityName: string; showEntity?: boolean;
  onAddCustomPOS?: (name: string) => void;
  allScopePOS?: string[];
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
            {showEntity && <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[18%]">Entity</th>}
            <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[12%]">Code</th>
            <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[22%]">Outlet Name</th>
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
                {showEntity && (
                  <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                    <EditableInput value={row.entity} onChange={(v) => onUpdate(globalIdx, "entity", v)} placeholder="Entity..." />
                  </td>
                )}
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <EditableInput value={row.outlet} onChange={(v) => onUpdate(globalIdx, "outlet", v)} placeholder="TAKA" />
                </td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <EditableInput value={row.outletName || ""} onChange={(v) => onUpdate(globalIdx, "outletName", v)} placeholder="Takashimaya..." />
                </td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <POSMultiSelect value={Array.isArray(row.pos) ? row.pos : []} onChange={(v) => onUpdate(globalIdx, "pos", v)} onAddCustom={onAddCustomPOS} allScopePOS={allScopePOS} />
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
        <AddButton label={entityName ? `+ Add to ${entityName}` : "+ Add Outlet"} onClick={onAdd} />
      </div>
    </>
  );
}

// ─── POS multi-select ───
function POSMultiSelect({ value, onChange, onAddCustom, allScopePOS }: { value: string[]; onChange: (v: string[]) => void; onAddCustom?: (name: string) => void; allScopePOS?: string[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  const toggle = (pos: string) => {
    onChange(value.includes(pos) ? value.filter((p) => p !== pos) : [...value, pos]);
  };

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropHeight = 260; // search input + list
      const openUp = spaceBelow < dropHeight && rect.top > dropHeight;
      setDropStyle(openUp
        ? { position: "fixed", left: rect.left, bottom: window.innerHeight - rect.top + 4, width: 220 }
        : { position: "fixed", left: rect.left, top: rect.bottom + 4, width: 220 }
      );
    }
    setSearch("");
    setOpen(true);
  };

  // Combine hardcoded options with any custom POS in use across the whole scope
  const allOptions = [...new Set([...POS_OPTIONS, ...(allScopePOS || []), ...value])].sort();
  const filtered = allOptions.filter((pos) => pos.toLowerCase().includes(search.toLowerCase()));
  const trimmed = search.trim();
  const canCreate = trimmed.length > 0 && !allOptions.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  return (
    <div ref={triggerRef}>
      <div onClick={openDropdown} className="flex flex-wrap gap-1 min-h-[22px] px-1 py-0.5 rounded border border-transparent cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
        {value.length === 0 ? (
          <span className="text-xs text-zinc-400 dark:text-zinc-600 italic">Select POS...</span>
        ) : value.map((pos) => {
          const isCustom = !(POS_OPTIONS as readonly string[]).includes(pos);
          return (
            <span key={pos} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${isCustom ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-teal-500/10 text-teal-600 dark:text-teal-400"}`}>
              {pos}
              <button onClick={(e) => { e.stopPropagation(); toggle(pos); }} className={`${isCustom ? "text-amber-400" : "text-teal-400"} hover:text-red-400 bg-transparent border-none cursor-pointer text-[10px] leading-none`}>&times;</button>
            </span>
          );
        })}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div style={dropStyle} className="z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
            <div className="px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or create POS..."
                className="w-full text-xs bg-transparent border-none outline-none text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto py-1">
              {canCreate && (
                <button
                  onClick={() => { toggle(trimmed); onAddCustom?.(trimmed); setSearch(""); }}
                  className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer transition-colors border-none text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                >
                  <span className="w-3 h-3 rounded border border-amber-400 flex items-center justify-center text-[8px] flex-shrink-0">+</span>
                  Create "{trimmed}"
                </button>
              )}
              {filtered.length === 0 && !canCreate ? (
                <p className="text-xs text-zinc-400 text-center py-2">No matches</p>
              ) : filtered.map((pos) => {
                const selected = value.includes(pos);
                return (
                  <button key={pos} onClick={() => toggle(pos)} className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer transition-colors border-none ${selected ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}>
                    <span className={`w-3 h-3 rounded border flex items-center justify-center text-[8px] flex-shrink-0 ${selected ? "bg-teal-500 border-teal-500 text-white" : "border-zinc-300 dark:border-zinc-600"}`}>{selected && "✓"}</span>
                    {pos}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Outlet toggle dropdown (for PM applicable/excluded) ───
function OutletToggleDropdown({ allOutlets, excludedOutlets, onChange, label, badgeClass, showExcluded }: {
  allOutlets: string[]; excludedOutlets: string[];
  onChange: (excluded: string[]) => void;
  label: string; badgeClass: string; showExcluded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  const openDropdown = () => {
    if (allOutlets.length === 0) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropHeight = 300;
      const openUp = spaceBelow < dropHeight && rect.top > dropHeight;
      setDropStyle(openUp
        ? { position: "fixed", left: rect.left, bottom: window.innerHeight - rect.top + 4, width: 240 }
        : { position: "fixed", left: rect.left, top: rect.bottom + 4, width: 240 }
      );
    }
    setSearch("");
    setOpen(true);
  };

  const toggleOutlet = (outlet: string) => {
    const isExcluded = excludedOutlets.includes(outlet);
    onChange(isExcluded ? excludedOutlets.filter((o) => o !== outlet) : [...excludedOutlets, outlet]);
  };

  const selectAll = () => onChange([]);
  const deselectAll = () => onChange([...allOutlets]);

  const filtered = allOutlets.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  // Sort: show relevant ones first (excluded first when showExcluded, included first otherwise)
  const sorted = [...filtered].sort((a, b) => {
    const aEx = excludedOutlets.includes(a) ? 1 : 0;
    const bEx = excludedOutlets.includes(b) ? 1 : 0;
    return showExcluded ? aEx - bEx : bEx - aEx;
  });

  return (
    <>
      <span
        ref={triggerRef}
        onClick={openDropdown}
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 ${badgeClass}`}
      >
        {label}
      </span>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div style={dropStyle} className="z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-zinc-200 dark:border-zinc-800">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search outlets..."
                className="w-full text-xs bg-transparent border-none outline-none text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 border-b border-zinc-100 dark:border-zinc-800/50">
              <button onClick={selectAll} className="text-[10px] text-blue-500 hover:text-blue-400 bg-transparent border-none cursor-pointer">Include all</button>
              <span className="text-zinc-300 dark:text-zinc-700">|</span>
              <button onClick={deselectAll} className="text-[10px] text-zinc-400 hover:text-zinc-300 bg-transparent border-none cursor-pointer">Exclude all</button>
            </div>
            <div className="max-h-[220px] overflow-y-auto py-1">
              {sorted.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-2">No outlets</p>
              ) : sorted.map((outlet) => {
                const isIncluded = !excludedOutlets.includes(outlet);
                return (
                  <button key={outlet} onClick={() => toggleOutlet(outlet)} className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer transition-colors border-none ${isIncluded ? "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800" : "text-zinc-400 dark:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}>
                    <span className={`w-3 h-3 rounded border flex items-center justify-center text-[8px] flex-shrink-0 ${isIncluded ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-300 dark:border-zinc-600"}`}>{isIncluded && "✓"}</span>
                    <span className={isIncluded ? "" : "line-through"}>{outlet}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── PM add row ───
function PMAddRow({ onAdd, existingPMs, templatePMs = [], onAddCustom }: { onAdd: (name: string) => void; existingPMs: string[]; templatePMs?: string[]; onAddCustom?: (name: string) => void }) {
  const allOptions = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const pm of [...PAYMENT_METHOD_OPTIONS, ...templatePMs]) {
      const key = pm.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(pm);
    }
    return merged;
  }, [templatePMs]);
  const available = allOptions.filter((pm) => !existingPMs.includes(pm));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = available.filter((pm) => pm.toLowerCase().includes(search.toLowerCase()));
  const trimmed = search.trim();
  const canCreate = trimmed.length > 0
    && !existingPMs.some((p) => p.toLowerCase() === trimmed.toLowerCase())
    && !allOptions.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="relative mt-2">
      <button onClick={() => { setOpen(!open); setSearch(""); }} className="text-[11px] font-medium px-3 py-1.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 bg-transparent cursor-pointer hover:border-blue-500 hover:text-blue-400 hover:bg-blue-500/5">+ Add Payment Method</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full left-0 mb-1 w-[240px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
            <div className="px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or create..."
                className="w-full text-xs bg-transparent border-none outline-none text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto py-1">
              {canCreate && (
                <button
                  onClick={() => { onAdd(trimmed); onAddCustom?.(trimmed); setSearch(""); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer border-none"
                >
                  + Create "{trimmed}"
                </button>
              )}
              {filtered.length === 0 && !canCreate ? (
                <p className="text-xs text-zinc-400 text-center py-2">{available.length === 0 ? "All added" : "No matches"}</p>
              ) : filtered.map((pm) => (
                <button key={pm} onClick={() => { onAdd(pm); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer border-none">{pm}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Bank add row ───
function BankAddRow({ onAdd, onAddCustom }: { onAdd: (bank: string, account: string) => void; onAddCustom?: (name: string) => void }) {
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");

  const handleAdd = (bankName: string, account: string) => {
    if (!bankName.trim()) return;
    const isCustom = !(BANK_OPTIONS as readonly string[]).includes(bankName.trim());
    if (isCustom) onAddCustom?.(bankName.trim());
    onAdd(bankName.trim(), account);
  };

  return (
    <div className="flex gap-2 items-center mt-2">
      {customMode ? (
        <input
          autoFocus
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Bank name..."
          className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200 w-[120px] focus:border-blue-500 focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          onKeyDown={(e) => {
            if (e.key === "Enter" && customName.trim()) {
              const inp = document.getElementById("bankAcctInput") as HTMLInputElement;
              handleAdd(customName.trim(), inp?.value || "");
              setCustomName("");
              setCustomMode(false);
              if (inp) inp.value = "";
            }
            if (e.key === "Escape") { setCustomMode(false); setCustomName(""); }
          }}
        />
      ) : (
        <select id="bankNameSelect" className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200 w-[120px] focus:border-blue-500 focus:outline-none cursor-pointer">
          <option value="">Bank...</option>
          {BANK_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
          <option value="__custom">+ Custom...</option>
        </select>
      )}
      <input id="bankAcctInput" type="text" placeholder="Account number..." className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-zinc-700 dark:text-zinc-200 w-[180px] focus:border-blue-500 focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (customMode && customName.trim()) {
              const inp = e.target as HTMLInputElement;
              handleAdd(customName.trim(), inp.value);
              setCustomName("");
              setCustomMode(false);
              inp.value = "";
            } else {
              const sel = document.getElementById("bankNameSelect") as HTMLSelectElement;
              const inp = e.target as HTMLInputElement;
              if (sel?.value === "__custom") { setCustomMode(true); return; }
              if (sel?.value) { handleAdd(sel.value, inp.value); sel.value = ""; inp.value = ""; }
            }
          }
        }}
      />
      <AddButton label="+ Add" onClick={() => {
        if (customMode && customName.trim()) {
          const inp = document.getElementById("bankAcctInput") as HTMLInputElement;
          handleAdd(customName.trim(), inp?.value || "");
          setCustomName("");
          setCustomMode(false);
          if (inp) inp.value = "";
        } else {
          const sel = document.getElementById("bankNameSelect") as HTMLSelectElement;
          if (sel?.value === "__custom") { setCustomMode(true); return; }
          const inp = document.getElementById("bankAcctInput") as HTMLInputElement;
          if (sel?.value) { handleAdd(sel.value, inp?.value || ""); sel.value = ""; if (inp) inp.value = ""; }
        }
      }} />
    </div>
  );
}
