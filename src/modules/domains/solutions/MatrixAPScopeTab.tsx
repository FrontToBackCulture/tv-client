import { useCallback, useState } from "react";
import type { InstanceData, ScopeOutlet, APSupplier, APDocumentType, APReconciliationType } from "../../../lib/solutions/types";
import { AP_DOCUMENT_TYPES, AP_RECON_TYPES } from "../../../lib/solutions/types";
import { getOutletNames, getEntities, filterScope } from "./matrixHelpers";
import {
  CollapsibleSection, EditableInput, AddButton, DeleteButton,
} from "./matrixComponents";

interface Props {
  data: InstanceData;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

export default function MatrixAPScopeTab({ data, onChange, selectedEntity }: Props) {
  const scope = data.scope || [];
  const suppliers = data.suppliers || [];
  const outletNames = getOutletNames(scope);
  const entities = getEntities(scope);
  const filteredScope = filterScope(scope, selectedEntity);

  // ─── Outlet CRUD ───
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

  // ─── Supplier CRUD ───
  const updateSupplier = useCallback(
    (idx: number, field: keyof APSupplier, value: unknown) => {
      const next = [...suppliers];
      next[idx] = { ...next[idx], [field]: value };
      onChange({ ...data, suppliers: next });
    },
    [data, suppliers, onChange]
  );

  const addSupplier = () => {
    onChange({
      ...data,
      suppliers: [
        ...suppliers,
        { name: "", documentTypes: ["invoice"], reconciliationTypes: [], appliesTo: "all", excludedOutlets: [], notes: "" },
      ],
    });
  };

  const removeSupplier = (idx: number) => {
    onChange({ ...data, suppliers: suppliers.filter((_, i) => i !== idx) });
  };

  const toggleDocType = (idx: number, docType: APDocumentType) => {
    const s = suppliers[idx];
    const types = s.documentTypes.includes(docType)
      ? s.documentTypes.filter((t) => t !== docType)
      : [...s.documentTypes, docType];
    updateSupplier(idx, "documentTypes", types);
  };

  const toggleReconType = (idx: number, reconType: APReconciliationType) => {
    const s = suppliers[idx];
    const types = s.reconciliationTypes.includes(reconType)
      ? s.reconciliationTypes.filter((t) => t !== reconType)
      : [...s.reconciliationTypes, reconType];
    updateSupplier(idx, "reconciliationTypes", types);
  };

  // Filtered suppliers based on selected entity
  const filteredSuppliers = selectedEntity
    ? suppliers.filter(
        (s) =>
          s.appliesTo === "all"
            ? !s.excludedOutlets.some((o) => filteredScope.some((sc) => sc.outlet === o))
            : true
      )
    : suppliers;

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      {!selectedEntity && scope.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5">
          <SummaryCard value={scope.length} label="Outlets" />
          <SummaryCard value={suppliers.length} label="Suppliers" />
          <SummaryCard
            value={new Set(suppliers.flatMap((s) => s.documentTypes)).size}
            label="Doc Types"
          />
          <SummaryCard
            value={new Set(suppliers.flatMap((s) => s.reconciliationTypes)).size}
            label="Recon Types"
          />
        </div>
      )}

      {/* Entities & Outlets (reused from AR — simplified for AP, no POS) */}
      <CollapsibleSection
        badge="1"
        badgeColor="purple"
        title={selectedEntity ? `${selectedEntity} Outlets` : "Entities & Outlets"}
        description={selectedEntity ? undefined : "Define the outlets/entities that receive supplier deliveries."}
      >
        {scope.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 dark:text-zinc-600">
            <p className="text-sm mb-3">No outlets defined</p>
            <p className="text-xs mb-4">Add outlets that receive supplier deliveries.</p>
            <AddButton label="+ Add Outlet" onClick={() => addOutlet("")} />
          </div>
        ) : selectedEntity ? (
          <APOutletTable
            scope={scope}
            filteredScope={filteredScope}
            onUpdate={updateScope}
            onRemove={removeOutlet}
            onAdd={() => addOutlet(selectedEntity)}
            entityName={selectedEntity}
          />
        ) : (
          <>
            {entities.map(({ entity, count }) => (
              <APEntityGroup
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

      {/* Suppliers */}
      <CollapsibleSection
        badge="2"
        badgeColor="purple"
        title={selectedEntity ? `Suppliers for ${selectedEntity}` : "Suppliers"}
        description="Define suppliers, required document types, and reconciliation methods."
      >
        {suppliers.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 dark:text-zinc-600">
            <p className="text-sm mb-3">No suppliers defined</p>
            <p className="text-xs mb-4">Add suppliers and configure their document requirements.</p>
            <AddButton label="+ Add Supplier" onClick={addSupplier} />
          </div>
        ) : (
          <>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800">Supplier</th>
                  <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800">Document Types</th>
                  <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800">Reconciliation</th>
                  <th className="text-center px-2 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[60px]">Outlets</th>
                  <th className="text-left px-2 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
                  <th className="w-6 border-b border-zinc-200 dark:border-zinc-800"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => {
                  const realIdx = suppliers.indexOf(supplier);
                  return (
                    <SupplierCard
                      key={realIdx}
                      supplier={supplier}
                      index={realIdx}
                      outletNames={outletNames}
                      selectedEntity={selectedEntity}
                      filteredOutletNames={filteredScope.map((s) => s.outlet).filter(Boolean)}
                      onUpdate={updateSupplier}
                      onToggleDoc={toggleDocType}
                      onToggleRecon={toggleReconType}
                      onRemove={removeSupplier}
                    />
                  );
                })}
              </tbody>
            </table>
            <AddButton label="+ Add Supplier" onClick={addSupplier} />
          </>
        )}
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

// ─── Supplier row ───
function SupplierCard({
  supplier,
  index,
  outletNames,
  selectedEntity,
  filteredOutletNames,
  onUpdate,
  onToggleDoc,
  onToggleRecon,
  onRemove,
}: {
  supplier: APSupplier;
  index: number;
  outletNames: string[];
  selectedEntity: string | null;
  filteredOutletNames: string[];
  onUpdate: (idx: number, field: keyof APSupplier, value: unknown) => void;
  onToggleDoc: (idx: number, docType: APDocumentType) => void;
  onToggleRecon: (idx: number, reconType: APReconciliationType) => void;
  onRemove: (idx: number) => void;
}) {
  const excluded = supplier.excludedOutlets || [];
  const relevantOutlets = selectedEntity ? filteredOutletNames : outletNames;
  const applicableCount = relevantOutlets.filter((o) => !excluded.includes(o)).length;
  const docs = supplier.documentTypes;

  return (
    <tr className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
      {/* Name */}
      <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[18%]">
        <EditableInput
          value={supplier.name}
          onChange={(v) => onUpdate(index, "name", v)}
          placeholder="Supplier name..."
          className="font-medium"
        />
      </td>

      {/* Doc types — inline toggles */}
      <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
        <div className="flex flex-wrap gap-1">
          {AP_DOCUMENT_TYPES.map((dt) => {
            const active = docs.includes(dt.key);
            return (
              <button
                key={dt.key}
                onClick={() => onToggleDoc(index, dt.key)}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors cursor-pointer border-none ${
                  active
                    ? "bg-teal-500/15 text-teal-600 dark:text-teal-400"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 hover:text-teal-500 hover:bg-teal-500/10"
                }`}
              >
                {dt.label}
              </button>
            );
          })}
        </div>
      </td>

      {/* Recon types — inline toggles */}
      <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
        <div className="flex flex-wrap gap-1">
          {AP_RECON_TYPES.map((rt) => {
            const active = supplier.reconciliationTypes.includes(rt.key);
            let relevant = true;
            if (rt.key === "do_vs_invoice") relevant = docs.includes("delivery_order") && docs.includes("invoice");
            if (rt.key === "invoice_vs_soa") relevant = docs.includes("invoice") && docs.includes("statement_of_account");
            if (rt.key === "po_vs_invoice") relevant = docs.includes("purchase_order") && docs.includes("invoice");

            return (
              <button
                key={rt.key}
                onClick={() => onToggleRecon(index, rt.key)}
                disabled={!relevant}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors border-none ${
                  !relevant
                    ? "opacity-20 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                    : active
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 cursor-pointer"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 hover:text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                }`}
              >
                {rt.label}
              </button>
            );
          })}
        </div>
      </td>

      {/* Outlets */}
      <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[60px] text-center">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
          excluded.length === 0
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-amber-500/10 text-amber-500"
        }`}>
          {excluded.length === 0 ? `All ${relevantOutlets.length}` : `${applicableCount}/${relevantOutlets.length}`}
        </span>
      </td>

      {/* Notes */}
      <td className="px-2 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[18%]">
        <EditableInput
          value={supplier.notes}
          onChange={(v) => onUpdate(index, "notes", v)}
          placeholder="Notes..."
        />
      </td>

      {/* Delete */}
      <td className="px-1 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-6">
        <button
          onClick={() => onRemove(index)}
          className="text-red-400 opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-pointer bg-transparent border-none text-sm transition-opacity"
        >
          &times;
        </button>
      </td>
    </tr>
  );
}

// ─── AP Entity group (simplified — no POS column) ───
function APEntityGroup({
  entity,
  count,
  scope,
  onUpdate,
  onRemove,
  onAdd,
}: {
  entity: string;
  count: number;
  scope: ScopeOutlet[];
  onUpdate: (idx: number, field: keyof ScopeOutlet, value: unknown) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const entityScope = scope.filter((s) => s.entity === entity);

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg mb-2 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors border-none text-left"
      >
        <span className={`text-[10px] text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>
          &#9654;
        </span>
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{entity}</span>
        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
          {count} outlets
        </span>
      </button>
      {open && (
        <APOutletTable
          scope={scope}
          filteredScope={entityScope}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onAdd={onAdd}
          entityName={entity}
        />
      )}
    </div>
  );
}

// ─── AP Outlet table (no POS column) ───
function APOutletTable({
  scope,
  filteredScope,
  onUpdate,
  onRemove,
  onAdd,
  entityName,
}: {
  scope: ScopeOutlet[];
  filteredScope: ScopeOutlet[];
  onUpdate: (idx: number, field: keyof ScopeOutlet, value: unknown) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  entityName: string;
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
            <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[35%]">Outlet</th>
            <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
            <th className="w-8 border-b border-zinc-200 dark:border-zinc-800"></th>
          </tr>
        </thead>
        <tbody>
          {displayScope.map((row, localIdx) => {
            const globalIdx = scope.indexOf(row);
            return (
              <tr key={globalIdx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <td className="px-3 py-2 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">
                  {localIdx + 1}
                </td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <EditableInput
                    value={row.outlet}
                    onChange={(v) => onUpdate(globalIdx, "outlet", v)}
                    placeholder="Outlet name..."
                  />
                </td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <EditableInput
                    value={row.notes}
                    onChange={(v) => onUpdate(globalIdx, "notes", v)}
                    placeholder="Notes..."
                  />
                </td>
                <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                  <DeleteButton onClick={() => onRemove(globalIdx)} />
                </td>
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
