import type {
  InstanceData,
  ScopeOutlet,
  PaymentMethod,
  BankAccount,
  APSupplier,
  OutletInfo,
  UniquePOS,
  SyncItem,
  ItemStatus,
  StatusEntry,
  ImplStatusEntry,
  TemplateDefinition,
} from "../../../lib/solutions/types";

// ============================================================================
// Scope-derived data (pure functions, no state)
// ============================================================================

export function getOutlets(scope: ScopeOutlet[]): OutletInfo[] {
  return scope
    .filter((r) => r.outlet)
    .map((r) => ({
      key: r.outlet,
      entity: r.entity,
      label: r.entity ? `${r.entity} — ${r.outlet}` : r.outlet,
    }));
}

export function getOutletNames(scope: ScopeOutlet[]): string[] {
  return scope.filter((r) => r.outlet).map((r) => r.outlet);
}

/** Filter scope to a specific entity, or return all if entity is null */
export function filterScope(scope: ScopeOutlet[], entity: string | null): ScopeOutlet[] {
  if (!entity) return scope;
  return scope.filter((r) => r.entity === entity);
}

/** Get unique entities from scope, sorted by outlet count desc */
export function getEntities(scope: ScopeOutlet[]): { entity: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const r of scope) {
    if (r.entity) map[r.entity] = (map[r.entity] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([entity, count]) => ({ entity, count }));
}

export function getPMNames(pms: PaymentMethod[]): string[] {
  return pms.map((p) => p.name);
}

export function getUniquePOS(scope: ScopeOutlet[]): UniquePOS[] {
  const posMap: Record<string, UniquePOS> = {};
  scope.forEach((r) => {
    if (!r.outlet) return;
    const posList = Array.isArray(r.pos) ? r.pos : r.pos ? [r.pos] : [];
    posList.forEach((posName) => {
      if (!posName) return;
      if (!posMap[posName]) posMap[posName] = { name: posName, outlets: [] };
      posMap[posName].outlets.push(r.outlet);
    });
  });
  return Object.values(posMap);
}

export function isPMApplicable(pm: PaymentMethod, outletName: string): boolean {
  if (pm.appliesTo === "all") {
    return !(pm.excludedOutlets || []).includes(outletName);
  }
  return false;
}

export function getBankForCell(
  banks: BankAccount[],
  outletName: string,
  pmName: string
): string {
  for (const b of banks) {
    const hasOutlet =
      b.outlets.length === 0 || b.outlets.includes(outletName);
    const hasPM =
      b.paymentMethods.length === 0 || b.paymentMethods.includes(pmName);
    if (hasOutlet && hasPM) {
      return b.account ? `${b.bank} ${b.account}` : b.bank;
    }
  }
  return "";
}

// Maps payment method names to credential platform groups
// Any Grab-related PM → "Grab" credential, any foodpanda-related → "foodpanda"
const CREDENTIAL_GROUPS: Record<string, string> = {
  Grab: "Grab",
  GrabFood: "Grab",
  GrabMart: "Grab",
  GrabFinance: "Grab",
  GrabPay: "Grab",
  "Food Panda": "foodpanda",
  foodpanda: "foodpanda",
  Deliveroo: "Deliveroo",
};

export function getCredentialPlatforms(
  pms: PaymentMethod[],
  _template: TemplateDefinition
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  pms.forEach((pm) => {
    const group = CREDENTIAL_GROUPS[pm.name];
    if (group && !seen.has(group)) {
      seen.add(group);
      result.push(group);
    }
  });
  return result;
}

// Get all outlets applicable to a credential platform group
export function getCredentialPlatformOutlets(
  platformGroup: string,
  pms: PaymentMethod[],
  outletNames: string[]
): string[] {
  // Find all PMs that belong to this credential group
  const groupPMs = pms.filter((pm) => CREDENTIAL_GROUPS[pm.name] === platformGroup);
  if (groupPMs.length === 0) return outletNames;
  // Union of all outlets across those PMs
  const outlets = new Set<string>();
  outletNames.forEach((o) => {
    if (groupPMs.some((pm) => isPMApplicable(pm, o))) outlets.add(o);
  });
  return [...outlets];
}

export function getSettlementPMs(
  pms: PaymentMethod[],
  template: TemplateDefinition
): PaymentMethod[] {
  const exclude = template.settlementExclude || ["Cash"];
  return pms.filter((pm) => !exclude.includes(pm.name));
}

export function getSyncItems(
  scope: ScopeOutlet[],
  pms: PaymentMethod[],
  banks: BankAccount[]
): SyncItem[] {
  const items: SyncItem[] = [];
  // Per POS
  getUniquePOS(scope).forEach((pos) => {
    items.push({
      type: "POS",
      name: pos.name,
      scope: pos.outlets.join(", "),
      key: `pos::${pos.name}`,
    });
  });
  // Per PM (non-cash)
  pms
    .filter((pm) => pm.name !== "Cash")
    .forEach((pm) => {
      const outlets = getOutletNames(scope).filter((o) =>
        isPMApplicable(pm, o)
      );
      items.push({
        type: "Payment",
        name: pm.name,
        scope: outlets.join(", "),
        key: `pm::${pm.name}`,
      });
    });
  // Per Bank (unique bank names only)
  const seenBanks = new Set<string>();
  banks.forEach((b) => {
    if (!b.bank || seenBanks.has(b.bank)) return;
    seenBanks.add(b.bank);
    items.push({
      type: "Bank",
      name: b.bank,
      scope: "All",
      key: `bank::${b.bank}`,
    });
  });
  // Recon
  items.push({ type: "Recon", name: "Reconciliation", scope: "All", key: "recon" });
  return items;
}

export function getOutletMapSystems(pms: PaymentMethod[]): string[] {
  const systems: string[] = [];
  pms.forEach((pm) => {
    if (pm.name !== "Cash") systems.push(pm.name);
  });
  systems.push("Accounting");
  return systems;
}

// ============================================================================
// Status helpers
// ============================================================================

export function getStatus(
  store: Record<string, StatusEntry> | undefined,
  key: string
): StatusEntry {
  return store?.[key] || { status: "pending", detail: "" };
}

export function getImplStatus(
  store: Record<string, ImplStatusEntry> | undefined,
  key: string
): ImplStatusEntry {
  return store?.[key] || { status: "pending", detail: "" };
}

// ============================================================================
// Progress calculation
// ============================================================================

export function calculateProgress(data: InstanceData, template: TemplateDefinition): { total: number; done: number; progress: number; blocked: number; inProgress: number; pending: number } {
  const statuses: ItemStatus[] = [];

  if (template.slug === "ap") {
    return calculateAPProgress(data, template);
  }

  const scope = data.scope || [];
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
  const periods = data.periods || [];
  const outlets = getOutlets(scope);

  // Connectivity
  getUniquePOS(scope).forEach((pos) => {
    statuses.push((data.posStatus?.[pos.name] || { status: "pending" }).status);
  });
  getCredentialPlatforms(pms, template).forEach((pm) => {
    statuses.push((data.credStatus?.[pm] || { status: "pending" }).status);
  });

  // Data Collection
  pms.forEach((pm) => {
    statuses.push((data.docStatus?.["gl::" + pm.name] || { status: "pending" }).status);
  });
  outlets.forEach((o) => {
    periods.forEach((p) => {
      statuses.push((data.docStatus?.["pos::" + o.key + "::" + p] || { status: "pending" }).status);
    });
  });
  getSettlementPMs(pms, template).forEach((pm) => {
    periods.forEach((p) => {
      statuses.push((data.docStatus?.["settl::" + pm.name + "::" + p] || { status: "pending" }).status);
    });
  });
  banks.forEach((b) => {
    periods.forEach((p) => {
      statuses.push((data.docStatus?.["bank::" + b.bank + "::" + b.account + "::" + p] || { status: "pending" }).status);
    });
  });

  // Mapping — count outlet map + POS labels
  const systems = getOutletMapSystems(pms);
  outlets.forEach((o) => {
    // POS value
    statuses.push(data.outletMap?.[o.key + "::pos"] ? "done" : "pending");
    systems.forEach((sys) => {
      const pmObj = pms.find((pm) => pm.name === sys);
      if (pmObj && !isPMApplicable(pmObj, o.key)) return;
      statuses.push(data.outletMap?.[o.key + "::" + sys] ? "done" : "pending");
    });
    pms.forEach((pm) => {
      if (!isPMApplicable(pm, o.key)) return;
      statuses.push(data.posLabels?.[o.key + "::" + pm.name] ? "done" : "pending");
    });
  });

  // Implementation
  const implSt = data.implStatus || {};
  // Bot setup
  getCredentialPlatforms(pms, template).forEach((pm) => {
    statuses.push((implSt["bot::" + pm] || { status: "pending" }).status);
  });
  // POS setup
  getUniquePOS(scope).forEach((pos) => {
    statuses.push((implSt["pos-setup::" + pos.name] || { status: "pending" }).status);
  });
  // Sync + Workflows
  getSyncItems(scope, pms, banks).forEach((item) => {
    statuses.push((implSt["sync-tbl::" + item.key] || { status: "pending" }).status);
    statuses.push((implSt["sync-wf::" + item.key] || { status: "pending" }).status);
  });
  // Populate Mapping — per outlet x PM
  outlets.forEach((o) => {
    pms.forEach((pm) => {
      if (isPMApplicable(pm, o.key)) {
        statuses.push((implSt["populate-map::" + o.key + "::" + pm.name] || { status: "pending" }).status);
      }
    });
  });
  // Populate Data — per outlet x PM x period
  outlets.forEach((o) => {
    pms.forEach((pm) => {
      if (isPMApplicable(pm, o.key)) {
        periods.forEach((p) => {
          statuses.push((implSt["populate-data::" + o.key + "::" + pm.name + "::" + p] || { status: "pending" }).status);
        });
      }
    });
  });
  // Recon
  outlets.forEach((o) => {
    pms.forEach((pm) => {
      if (!isPMApplicable(pm, o.key)) return;
      periods.forEach((p) => {
        statuses.push((implSt["recon::" + o.key + "::" + pm.name + "::" + p] || { status: "pending" }).status);
      });
    });
  });
  // Accounting
  pms.forEach((pm) => {
    statuses.push((implSt["acct::" + pm.name] || { status: "pending" }).status);
  });
  // Go live
  outlets.forEach((o) => {
    pms.forEach((pm) => {
      if (!isPMApplicable(pm, o.key)) return;
      statuses.push((implSt["walkthru::" + o.key + "::" + pm.name] || { status: "pending" }).status);
      statuses.push((implSt["golive::" + o.key + "::" + pm.name] || { status: "pending" }).status);
    });
  });

  const total = statuses.length;
  const done = statuses.filter((s) => s === "done" || s === "na").length;
  const blocked = statuses.filter((s) => s === "blocked").length;
  const inProgress = statuses.filter((s) => s === "progress").length;
  const pending = statuses.filter((s) => s === "pending").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return { total, done, progress, blocked, inProgress, pending };
}

// ============================================================================
// AP progress calculation
// ============================================================================

function calculateAPProgress(data: InstanceData, _template: TemplateDefinition): { total: number; done: number; progress: number; blocked: number; inProgress: number; pending: number } {
  const statuses: ItemStatus[] = [];
  const suppliers = data.suppliers || [];
  const periods = data.periods || [];
  const outlets = getOutlets(data.scope || []);
  const implSt = data.implStatus || {};
  const supplierDocSt = data.supplierDocStatus || {};

  // Document Collection: per supplier x doc type x period
  suppliers.forEach((s) => {
    s.documentTypes.forEach((docType) => {
      periods.forEach((p) => {
        statuses.push((supplierDocSt[`doc::${s.name}::${docType}::${p}`] || { status: "pending" }).status);
      });
    });
  });

  // Supplier mapping: per supplier
  suppliers.forEach((s) => {
    statuses.push(data.outletMap?.[`supplier::${s.name}`] ? "done" : "pending");
  });

  // Outlet mapping
  outlets.forEach((o) => {
    statuses.push(data.outletMap?.[o.key + "::accounting"] ? "done" : "pending");
  });

  // Implementation: scan templates per supplier
  suppliers.forEach((s) => {
    s.documentTypes.forEach((docType) => {
      statuses.push((implSt[`scan::${s.name}::${docType}`] || { status: "pending" }).status);
    });
  });

  // Matching rules per supplier x recon type
  suppliers.forEach((s) => {
    s.reconciliationTypes.forEach((reconType) => {
      statuses.push((implSt[`match::${s.name}::${reconType}`] || { status: "pending" }).status);
    });
  });

  // Recon verification per supplier x recon type x period
  suppliers.forEach((s) => {
    s.reconciliationTypes.forEach((reconType) => {
      periods.forEach((p) => {
        statuses.push((implSt[`recon::${s.name}::${reconType}::${p}`] || { status: "pending" }).status);
      });
    });
  });

  // Accounting rules per supplier
  suppliers.forEach((s) => {
    statuses.push((implSt[`acct::${s.name}`] || { status: "pending" }).status);
  });

  // Go live per outlet
  outlets.forEach((o) => {
    statuses.push((implSt[`walkthru::${o.key}`] || { status: "pending" }).status);
    statuses.push((implSt[`golive::${o.key}`] || { status: "pending" }).status);
  });

  const total = statuses.length;
  const done = statuses.filter((s) => s === "done" || s === "na").length;
  const blocked = statuses.filter((s) => s === "blocked").length;
  const inProgress = statuses.filter((s) => s === "progress").length;
  const pending = statuses.filter((s) => s === "pending").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return { total, done, progress, blocked, inProgress, pending };
}

// ============================================================================
// AP helpers
// ============================================================================

export function isSupplierApplicable(supplier: APSupplier, outletName: string): boolean {
  if (supplier.appliesTo === "all") {
    return !(supplier.excludedOutlets || []).includes(outletName);
  }
  return false;
}
