import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstanceData, TemplateDefinition, ImplStatusEntry } from "../../../lib/solutions/types";
import { timeAgoVerbose, formatDateTimeSGT } from "../../../lib/date";
import {
  getOutlets, getSyncItems, isPMApplicable, getImplStatus, filterScope, getEntities,
} from "./matrixHelpers";
import {
  CollapsibleSection, StatusSelect, EditableInput, TypeBadge,
} from "./matrixComponents";
import {
  Empty, THead, renderOutletPMRows,
  COL_NUM, COL_STATUS, COL_NOTES,
} from "./matrixImplHelpers";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
  domain?: string;
  instanceId?: string;
}

// Inline chip showing a VAL table ID in mono. Used in section descriptions
// so implementers know exactly which table each push lands in.
function TableChip({ table }: { table: string }) {
  return (
    <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
      {table}
    </code>
  );
}

// ─── Shared push helpers (used by both row-level buttons and Push All) ───

interface PushResult { success: boolean; error?: string }

async function pushMasterOutletRow(args: {
  domain: string;
  tableName: string;
  zone: string;
  columns: { pk: string; brand: string; name: string; allColumns: { column_name: string; data_type: string }[] };
  code: string;
  brand: string;
  name: string;
}): Promise<PushResult> {
  const row = args.columns.allColumns.map((c) => {
    if (c.column_name === args.columns.pk) return args.code;
    if (c.column_name === args.columns.brand) return args.brand;
    if (c.column_name === args.columns.name) return args.name;
    return "";
  });
  try {
    const res = await invoke<{ inserted: number; failed: number; errors: string[] }>("val_table_insert_rows", {
      domain: args.domain,
      tableName: args.tableName,
      zone: args.zone,
      pk: args.columns.pk,
      columns: args.columns.allColumns,
      rows: [row],
    });
    return res.inserted > 0 ? { success: true } : { success: false, error: res.errors[0] || "Unknown error" };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

async function pushMasterEntityRow(args: {
  domain: string;
  tableName: string;
  zone: string;
  columns: { pk: string; allColumns: { column_name: string; data_type: string }[] };
  shortCode: string;
}): Promise<PushResult> {
  const row = args.columns.allColumns.map((c) => (c.column_name === args.columns.pk ? args.shortCode : ""));
  try {
    const res = await invoke<{ inserted: number; failed: number; errors: string[] }>("val_table_insert_rows", {
      domain: args.domain,
      tableName: args.tableName,
      zone: args.zone,
      pk: args.columns.pk,
      columns: args.columns.allColumns,
      rows: [row],
    });
    return res.inserted > 0 ? { success: true } : { success: false, error: res.errors[0] || "Unknown error" };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

// All values for a master platforms row are predetermined by the solution
// template's valConfig.systems[i] config. No per-instance input required.
// Column mapping (from custom_tbl_100_167 data_model):
//   general_record_id             → sys.id
//   usr_cfaecfbceab               → sys.type                     (Platform Type)
//   usr_ccfbcae00c0_1             → sys.tables.statementSource   (first of comma-split)
//   usr_00bfadb0c0ce              → sys.paymentAdvice            (Payment Advice)
//   usr_aafee0ddca                → sys.tables.outletMap         (Outlet Map)
//   usr_ecbb0fae0cbbfb            → sys.tables.platformMap       (Platform Map)
//   usr_0deefbad0cbfb0            → sys.tables.bankAcctMap       (Bank Acct Map)
//   usr_ebeb0cffeee               → sys.tables.bankCounterpartyMap (Bank Counterparty Map)
//   usr_0fcabfc0fd00bda           → sys.upfrontPayment           (boolean)
//   usr_0cfc0efcdaaddeb           → sys.bankPaymentByOutlet      (boolean)
//   usr_fb0eefadecf               → sys.feesDeduction            (boolean)
//   usr_b0eaacbfdd0e0bbebfbe      → sys.notInPos                 (boolean)

// Hardcoded column IDs — match the actual VAL schema and the master platforms
// data_model in lab. Parallels how PushMappingCell references system-specific
// outletMapColumns from the template.
const MP_COL_PLATFORM_TYPE = "usr_cfaecfbceab";
const MP_COL_STATEMENT_SOURCE = "usr_ccfbcae00c0_1";
const MP_COL_PAYMENT_ADVICE = "usr_00bfadb0c0ce";
const MP_COL_OUTLET_MAP = "usr_aafee0ddca";
const MP_COL_PLATFORM_MAP = "usr_ecbb0fae0cbbfb";
const MP_COL_BANK_ACCT_MAP = "usr_0deefbad0cbfb0";
const MP_COL_BANK_COUNTERPARTY_MAP = "usr_ebeb0cffeee";
const MP_COL_UPFRONT = "usr_0fcabfc0fd00bda";
const MP_COL_BANK_PAY_BY_OUTLET = "usr_0cfc0efcdaaddeb";
const MP_COL_FEES_DEDUCTION = "usr_fb0eefadecf";
const MP_COL_NOT_IN_POS = "usr_b0eaacbfdd0e0bbebfbe";

// Derive all the values a master platforms row needs from a valConfig.systems
// entry. Used by both the push helper and the read-only UI preview.
function derivePlatformRow(sys: any): Record<string, string | boolean> {
  const firstOfCsv = (v?: string) => (v ? v.split(",")[0].trim() : "");
  return {
    [MP_COL_PLATFORM_TYPE]: sys.type || "",
    [MP_COL_STATEMENT_SOURCE]: firstOfCsv(sys.tables?.statementSource),
    [MP_COL_PAYMENT_ADVICE]: sys.paymentAdvice || "",
    [MP_COL_OUTLET_MAP]: sys.tables?.outletMap || "",
    [MP_COL_PLATFORM_MAP]: sys.tables?.platformMap || "",
    [MP_COL_BANK_ACCT_MAP]: sys.tables?.bankAcctMap || "",
    [MP_COL_BANK_COUNTERPARTY_MAP]: sys.tables?.bankCounterpartyMap || "",
    [MP_COL_UPFRONT]: Boolean(sys.upfrontPayment),
    [MP_COL_BANK_PAY_BY_OUTLET]: Boolean(sys.bankPaymentByOutlet),
    [MP_COL_FEES_DEDUCTION]: Boolean(sys.feesDeduction),
    [MP_COL_NOT_IN_POS]: Boolean(sys.notInPos),
  };
}

async function pushMasterPlatformRow(args: {
  domain: string;
  tableName: string;
  zone: string;
  columns: { pk: string; allColumns: { column_name: string; data_type: string }[] };
  platformName: string;
  sys: any;
}): Promise<PushResult> {
  const derived = derivePlatformRow(args.sys);
  const row = args.columns.allColumns.map((c) => {
    if (c.column_name === args.columns.pk) return args.platformName;
    if (c.column_name in derived) {
      const v = derived[c.column_name];
      return typeof v === "boolean" ? (v ? "true" : "false") : v;
    }
    return "";
  });
  try {
    const res = await invoke<{ inserted: number; failed: number; errors: string[] }>("val_table_insert_rows", {
      domain: args.domain,
      tableName: args.tableName,
      zone: args.zone,
      pk: args.columns.pk,
      columns: args.columns.allColumns,
      rows: [row],
    });
    return res.inserted > 0 ? { success: true } : { success: false, error: res.errors[0] || "Unknown error" };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

// Date Params rows are platform-agnostic preset configs. All values come from
// valConfig.base.masterTables.Date_Params.defaults[i] in the template —
// zero user input per instance. Operators toggle is_active in VAL later to
// switch between historical / incremental / daily run modes.
async function pushDateParamRow(args: {
  domain: string;
  tableName: string;
  zone: string;
  columns: {
    pk: string;
    workflowId: string;
    calcType: string;
    daysBack: string;
    daysForward: string;
    periodUnit: string;
    includeToday: string;
    isActive: string;
    description: string;
    configName: string;
    allColumns: { column_name: string; data_type: string }[];
  };
  preset: {
    id: string;
    workflowId?: string;
    calcType?: string;
    daysBack?: number;
    daysForward?: number;
    periodUnit?: string;
    includeToday?: boolean;
    isActive?: boolean;
    description?: string;
    configName?: string;
  };
}): Promise<PushResult> {
  const p = args.preset;
  const byCol: Record<string, string> = {
    [args.columns.pk]: p.id,
    [args.columns.workflowId]: p.workflowId || "",
    [args.columns.calcType]: p.calcType || "",
    [args.columns.daysBack]: p.daysBack != null ? String(p.daysBack) : "",
    [args.columns.daysForward]: p.daysForward != null ? String(p.daysForward) : "",
    [args.columns.periodUnit]: p.periodUnit || "",
    [args.columns.includeToday]: p.includeToday ? "true" : "false",
    [args.columns.isActive]: p.isActive ? "true" : "false",
    [args.columns.description]: p.description || "",
    [args.columns.configName]: p.configName || "",
  };
  const row = args.columns.allColumns.map((c) => (c.column_name in byCol ? byCol[c.column_name] : ""));
  try {
    const res = await invoke<{ inserted: number; failed: number; errors: string[] }>("val_table_insert_rows", {
      domain: args.domain,
      tableName: args.tableName,
      zone: args.zone,
      pk: args.columns.pk,
      columns: args.columns.allColumns,
      rows: [row],
    });
    return res.inserted > 0 ? { success: true } : { success: false, error: res.errors[0] || "Unknown error" };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

async function pushOutletMappingRow(args: {
  domain: string;
  tableName: string;
  columns: { storeId: string; outlet: string; pk?: string; zone?: string; allColumns?: { column_name: string; data_type: string }[] };
  storeId: string;
  outletCode: string;
}): Promise<PushResult> {
  const pk = args.columns.pk || "general_record_id";
  const zone = args.columns.zone || "595";
  const allColumns = args.columns.allColumns || [
    { column_name: pk, data_type: "text" },
    { column_name: args.columns.storeId, data_type: "character varying" },
    { column_name: args.columns.outlet, data_type: "character varying" },
  ];
  const row = allColumns.map((c) => {
    if (c.column_name === args.columns.storeId) return args.storeId;
    if (c.column_name === args.columns.outlet) return args.outletCode;
    return "";
  });
  try {
    const res = await invoke<{ inserted: number; failed: number; errors: string[] }>("val_table_insert_rows", {
      domain: args.domain, tableName: args.tableName, zone, pk, columns: allColumns, rows: [row],
    });
    return res.inserted > 0 ? { success: true } : { success: false, error: res.errors[0] || "Unknown error" };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

// Inline bulk-push toolbar. Sits above a table; shows a button that either
// reads "Push All (N)", "Pushing 3/9...", or "All pushed".
function PushAllToolbar({ label, pending, total, progress, onClick }: {
  label: string;
  pending: number;
  total: number;
  progress: { done: number; total: number } | null;
  onClick: () => void;
}) {
  const isRunning = progress !== null;
  const allDone = !isRunning && pending === 0 && total > 0;
  return (
    <div className="flex items-center justify-end mb-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isRunning || pending === 0}
        className="text-[10px] font-semibold px-2.5 py-1 rounded border-none cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
      >
        {isRunning
          ? `Pushing ${progress!.done} / ${progress!.total}…`
          : allDone
          ? "All pushed"
          : `${label} (${pending})`}
      </button>
    </div>
  );
}

export default function MatrixDataLoadTab({ data, template, onChange, selectedEntity, domain }: Props) {
  const scope = filterScope(data.scope || [], selectedEntity);
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
  const periods = data.periods || [];
  const implStatus = data.implStatus || {};
  const outlets = getOutlets(scope);
  const entities = getEntities(scope);
  const showEntityHeaders = !selectedEntity && entities.length > 1;

  const dataRef = useRef(data);
  dataRef.current = data;

  const updateImpl = (key: string, field: keyof ImplStatusEntry, value: string) => {
    const st = getImplStatus(implStatus, key);
    onChange({ ...data, implStatus: { ...implStatus, [key]: { ...st, [field]: value } } });
  };

  // Merge multiple ImplStatus fields at once. Used by push/run handlers that
  // need to set status=done and completedAt in the same write. Uses the ref
  // so concurrent Push All operations don't overwrite each other.
  const updateImplEntry = useCallback((key: string, patch: Partial<ImplStatusEntry>) => {
    const latest = dataRef.current;
    const latestImpl = latest.implStatus || {};
    const st = getImplStatus(latestImpl, key);
    const next = { ...latestImpl, [key]: { ...st, ...patch } };
    onChange({ ...latest, implStatus: next });
  }, [onChange]);

  const markPushed = useCallback((key: string) => {
    updateImplEntry(key, { status: "done", completedAt: new Date().toISOString() });
  }, [updateImplEntry]);

  // Bulk-push progress. Only one bulk op runs at a time (key tells which section).
  const [bulkProgress, setBulkProgress] = useState<{ key: string; done: number; total: number } | null>(null);

  const runBulk = useCallback(async (
    bulkKey: string,
    jobs: { implKey: string; run: () => Promise<PushResult> }[],
  ) => {
    if (jobs.length === 0) return;
    setBulkProgress({ key: bulkKey, done: 0, total: jobs.length });
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const res = await job.run();
      if (res.success) {
        updateImplEntry(job.implKey, { status: "done", completedAt: new Date().toISOString() });
      } else {
        updateImplEntry(job.implKey, { status: "blocked", detail: res.error || "Push failed" });
      }
      setBulkProgress({ key: bulkKey, done: i + 1, total: jobs.length });
    }
    setBulkProgress(null);
  }, [updateImplEntry]);

  const countDone = (keys: string[]) =>
    keys.filter((k) => { const s = getImplStatus(implStatus, k).status; return s === "done" || s === "na"; }).length;

  const syncItems = getSyncItems(scope, pms, banks);
  const masterEntityKeys = (data.entities || []).map((e) => `master-entity::${e.name}`);
  const masterOutletKeys = outlets.map((o) => `master-outlet::${o.key}`);
  const masterPlatformKeys = pms.map((pm) => `master-platform::${pm.name}`);
  const dateParamsDefaults: any[] = ((template as any).valConfig?.base?.masterTables?.Date_Params?.defaults) || [];
  const masterDateParamsKeys = dateParamsDefaults.map((d: any) => `master-date-param::${d.id}`);
  const masterAllKeys = [...masterEntityKeys, ...masterOutletKeys, ...masterPlatformKeys, ...masterDateParamsKeys];
  const populateMappingKeys = outlets.flatMap((o) => pms.filter((pm) => isPMApplicable(pm, o.key)).map((pm) => `populate-map::${o.key}::${pm.name}`));
  const populateDataKeys = syncItems.flatMap((item) => periods.map((p) => `populate-data::${item.key}::${p}`));

  const valConfig = (template as any).valConfig;
  const valSystems: any[] = valConfig?.systems || [];
  const masterOutletsConfig = valConfig?.base?.masterTables?.outlets;
  const masterEntitiesConfig = valConfig?.base?.masterTables?.entities;
  const masterPlatformsConfig = valConfig?.base?.masterTables?.platforms;
  const masterDateParamsConfig = valConfig?.base?.masterTables?.Date_Params;
  const uploadedFiles = data.uploadedFiles || [];

  // Sub-tab state — Master List / Mapping / Data. Each represents a distinct
  // phase. Persisted in the instance's data so it survives reload.
  const [activeSubTab, setActiveSubTab] = useState<"master" | "mapping" | "data">("master");

  // Entity shortcode lookup — used by the Master Outlets push to populate
  // the `brand` column on custom_tbl_100_168.
  const entityShortByName: Record<string, string> = {};
  for (const e of data.entities || []) entityShortByName[e.name] = e.shortCode;


  // Unique per-platform outletMap tables that Populate Outlet Mapping targets,
  // shown as chips at the top of the section so implementers know exactly
  // which VAL tables receive rows.
  const outletMapTables = Array.from(new Set(
    valSystems
      .filter((s: any) => s.outletMapColumns && s.tables?.outletMap)
      .map((s: any) => s.tables.outletMap as string)
  ));

  const masterProgress = `${countDone(masterAllKeys)} / ${masterAllKeys.length}`;
  const mappingProgress = `${countDone(populateMappingKeys)} / ${populateMappingKeys.length}`;
  const dataProgress = `${countDone(populateDataKeys)} / ${populateDataKeys.length}`;

  return (
    <div className="space-y-6">
      {/* Sub-tab bar — Master List → Mapping → Data is the sequential flow. */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        <SubTabButton label="Master List" progress={masterProgress} active={activeSubTab === "master"} onClick={() => setActiveSubTab("master")} />
        <SubTabButton label="Mapping" progress={mappingProgress} active={activeSubTab === "mapping"} onClick={() => setActiveSubTab("mapping")} />
        <SubTabButton label="Data" progress={dataProgress} active={activeSubTab === "data"} onClick={() => setActiveSubTab("data")} />
      </div>

      {activeSubTab === "master" && <div className="space-y-8">
      {/* Populate Master Entities — push entity shortcodes to custom_tbl_100_166.
          First step because outlets reference these via the Brand column. */}
      <CollapsibleSection
        badge="Master"
        badgeColor="green"
        title="Populate Master Entities"
        progress={`${countDone(masterEntityKeys)} / ${masterEntityKeys.length}`}
        description={
          <span>
            Push entity shortcodes to the master entities table. The shortcode is the ID that the Brand column on master outlets references.
            {masterEntitiesConfig?.table && (<> Target table: <TableChip table={masterEntitiesConfig.table} /></>)}
          </span>
        }
      >
        {(data.entities || []).length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">No entities defined yet. Add shortcodes in the Scope tab.</p>
        ) : !masterEntitiesConfig?.columns ? (
          <p className="text-xs text-amber-500 py-3">Template is missing <code className="font-mono">valConfig.base.masterTables.entities.columns</code>.</p>
        ) : (() => {
          const entList = data.entities || [];
          const eligible = entList.filter((e) => {
            const st = getImplStatus(implStatus, `master-entity::${e.name}`);
            return Boolean(domain && e.shortCode && !st.completedAt);
          });
          const runEntityBulk = () => {
            if (!domain || !masterEntitiesConfig?.columns) return;
            const jobs = eligible.map((e) => ({
              implKey: `master-entity::${e.name}`,
              run: () => pushMasterEntityRow({
                domain,
                tableName: masterEntitiesConfig.table,
                zone: masterEntitiesConfig.zone || "595",
                columns: masterEntitiesConfig.columns,
                shortCode: e.shortCode,
              }),
            }));
            runBulk("master-entities", jobs);
          };
          return (
          <>
          <PushAllToolbar
            label="Push All"
            pending={eligible.length}
            total={entList.length}
            progress={bulkProgress?.key === "master-entities" ? { done: bulkProgress.done, total: bulkProgress.total } : null}
            onClick={runEntityBulk}
          />
          <table className="w-full border-collapse table-fixed">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Short Code", className: "w-[100px]" },
              { label: "", className: "w-[110px]" },
              { label: "Entity Name", className: "" },
              { label: "Push", className: "w-[120px]" },
              { label: "Status", className: COL_STATUS },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {entList.map((e, i) => {
                const key = `master-entity::${e.name}`;
                const st = getImplStatus(implStatus, key);
                const canPush = Boolean(domain && e.shortCode);
                return (
                  <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
                    <td className="px-3 py-1.5 text-xs font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 w-[100px]">
                      {e.shortCode || <span className="text-[10px] text-amber-500 italic">missing</span>}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[110px]" />
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 truncate" title={e.name}>{e.name}</td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[120px]">
                      {canPush ? (
                        <PushGenericCell
                          persistedCompletedAt={st.completedAt}
                          run={() => pushMasterEntityRow({
                            domain: domain!,
                            tableName: masterEntitiesConfig.table,
                            zone: masterEntitiesConfig.zone || "595",
                            columns: masterEntitiesConfig.columns,
                            shortCode: e.shortCode,
                          })}
                          onPushed={() => markPushed(key)}
                        />
                      ) : (
                        <span className="text-[9px] text-zinc-300 dark:text-zinc-600" title="Set the shortcode in Scope first">&mdash;</span>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
          );
        })()}
      </CollapsibleSection>

      {/* Populate Master Outlets — push outlet definitions to custom_tbl_100_168.
          This has to run before Populate Outlet Mapping because downstream
          workflows reference the outlet codes in the master table. */}
      <CollapsibleSection
        badge="Master"
        badgeColor="green"
        title="Populate Master Outlets"
        progress={`${countDone(masterOutletKeys)} / ${masterOutletKeys.length}`}
        description={
          <span>
            Push outlet definitions (code, brand, name) to the master outlets table. Required before per-platform outlet mapping.
            {masterOutletsConfig?.table && (
              <> Target table: <TableChip table={masterOutletsConfig.table} /></>
            )}
          </span>
        }
      >
        {outlets.length === 0 ? <Empty /> : !masterOutletsConfig?.columns ? (
          <p className="text-xs text-amber-500 py-3">
            Template is missing <code className="font-mono">valConfig.base.masterTables.outlets.columns</code> — cannot build a push row.
          </p>
        ) : (() => {
          const eligible = outlets.filter((o) => {
            const brand = entityShortByName[o.entity || ""] || "";
            const st = getImplStatus(implStatus, `master-outlet::${o.key}`);
            return Boolean(domain && brand && !st.completedAt);
          });
          const runMasterBulk = () => {
            if (!domain || !masterOutletsConfig?.columns) return;
            const jobs = eligible.map((o) => {
              const brand = entityShortByName[o.entity || ""] || "";
              const longName = o.outletName || o.key;
              return {
                implKey: `master-outlet::${o.key}`,
                run: () => pushMasterOutletRow({
                  domain,
                  tableName: masterOutletsConfig.table,
                  zone: masterOutletsConfig.zone || "595",
                  columns: masterOutletsConfig.columns,
                  code: o.key,
                  brand,
                  name: longName,
                }),
              };
            });
            runBulk("master-outlets", jobs);
          };
          return (
          <>
          <PushAllToolbar
            label="Push All"
            pending={eligible.length}
            total={outlets.length}
            progress={bulkProgress?.key === "master-outlets" ? { done: bulkProgress.done, total: bulkProgress.total } : null}
            onClick={runMasterBulk}
          />
          <table className="w-full border-collapse table-fixed">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Code", className: "w-[100px]" },
              { label: "Brand", className: "w-[110px]" },
              { label: "Outlet Name", className: "" },
              { label: "Push", className: "w-[120px]" },
              { label: "Status", className: COL_STATUS },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {(() => {
                const rows: React.ReactNode[] = [];
                let n = 0;
                const groups = showEntityHeaders
                  ? entities.map((e) => ({ entity: e.entity, list: outlets.filter((o) => o.entity === e.entity) }))
                  : [{ entity: "", list: outlets }];

                for (const g of groups) {
                  if (showEntityHeaders && g.list.length > 0) {
                    rows.push(
                      <tr key={`mo-entity-${g.entity}`}>
                        <td colSpan={7} className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {g.entity || "Unassigned"}
                          {g.entity && !entityShortByName[g.entity] && (
                            <span className="ml-2 text-[9px] font-normal text-amber-500">shortcode missing — set in Scope</span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                  for (const o of g.list) {
                    n += 1;
                    const key = `master-outlet::${o.key}`;
                    const st = getImplStatus(implStatus, key);
                    const brand = entityShortByName[o.entity || ""] || "";
                    const longName = o.outletName || o.key;
                    const canPush = Boolean(domain && o.key && brand);
                    rows.push(
                      <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{n}</td>
                        <td className="px-3 py-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-300 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[100px]">{o.key}</td>
                        <td className="px-3 py-1.5 text-xs font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 w-[110px]">
                          {brand ? (
                            <span className="text-zinc-600 dark:text-zinc-400">{brand}</span>
                          ) : (
                            <span className="text-[10px] text-amber-500 italic">missing</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 truncate" title={longName}>{longName}</td>
                        <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[120px]">
                          {canPush ? (
                            <PushMasterOutletCell
                              domain={domain!}
                              tableName={masterOutletsConfig.table}
                              zone={masterOutletsConfig.zone || "595"}
                              columns={masterOutletsConfig.columns}
                              code={o.key}
                              brand={brand}
                              name={longName}
                              persistedCompletedAt={st.completedAt}
                              onPushed={() => markPushed(key)}
                            />
                          ) : (
                            <span className="text-[9px] text-zinc-300 dark:text-zinc-600" title={!brand ? "Set the entity shortcode in Scope first" : "Missing domain or outlet code"}>&mdash;</span>
                          )}
                        </td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                        <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                      </tr>
                    );
                  }
                }
                return rows;
              })()}
            </tbody>
          </table>
          </>
          );
        })()}
      </CollapsibleSection>

      {/* Populate Master Platforms — push payment methods / delivery platforms
          to custom_tbl_100_167. Uses valConfig.systems[i].type for Platform Type. */}
      <CollapsibleSection
        badge="Master"
        badgeColor="green"
        title="Populate Master Platforms"
        progress={`${countDone(masterPlatformKeys)} / ${masterPlatformKeys.length}`}
        description={
          <span>
            Push payment methods and delivery platforms to the master platforms table. Platform type (Delivery / In-store / Bank) comes from the template's system config.
            {masterPlatformsConfig?.table && (<> Target table: <TableChip table={masterPlatformsConfig.table} /></>)}
          </span>
        }
      >
        {pms.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">No payment methods defined yet. Add them in the Scope tab.</p>
        ) : !masterPlatformsConfig?.columns ? (
          <p className="text-xs text-amber-500 py-3">Template is missing <code className="font-mono">valConfig.base.masterTables.platforms.columns</code>.</p>
        ) : (() => {
          // Look up each PM's valConfig.systems entry — that's where the
          // predetermined platform metadata lives (type, tables, booleans).
          const sysByPm = (pm: { name: string }) =>
            valSystems.find((s: any) => s.id.toLowerCase() === pm.name.toLowerCase());

          const eligible = pms.filter((pm) => {
            const st = getImplStatus(implStatus, `master-platform::${pm.name}`);
            return Boolean(domain && sysByPm(pm) && !st.completedAt);
          });
          const runPlatformBulk = () => {
            if (!domain || !masterPlatformsConfig?.columns) return;
            const jobs = eligible
              .map((pm) => {
                const sys = sysByPm(pm);
                if (!sys) return null;
                return {
                  implKey: `master-platform::${pm.name}`,
                  run: () => pushMasterPlatformRow({
                    domain,
                    tableName: masterPlatformsConfig.table,
                    zone: masterPlatformsConfig.zone || "595",
                    columns: masterPlatformsConfig.columns,
                    platformName: pm.name,
                    sys,
                  }),
                };
              })
              .filter((j): j is { implKey: string; run: () => Promise<PushResult> } => j !== null);
            runBulk("master-platforms", jobs);
          };
          return (
          <>
          <PushAllToolbar
            label="Push All"
            pending={eligible.length}
            total={pms.length}
            progress={bulkProgress?.key === "master-platforms" ? { done: bulkProgress.done, total: bulkProgress.total } : null}
            onClick={runPlatformBulk}
          />
          <table className="w-full border-collapse table-fixed">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Platform", className: "w-[110px]" },
              { label: "Type", className: "w-[130px]" },
              { label: "Statement Source", className: "" },
              { label: "Flags", className: "w-[150px]" },
              { label: "Push", className: "w-[120px]" },
              { label: "Status", className: COL_STATUS },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {pms.map((pm, i) => {
                const key = `master-platform::${pm.name}`;
                const st = getImplStatus(implStatus, key);
                const sys = sysByPm(pm);
                if (!sys) {
                  return (
                    <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 opacity-60">
                      <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
                      <td colSpan={7} className="px-3 py-1.5 text-[11px] text-amber-500 border-b border-zinc-200/50 dark:border-zinc-800/50">
                        {pm.name} — not in template valConfig.systems. Add it in Config tab before pushing.
                      </td>
                    </tr>
                  );
                }
                const statementSource = (sys.tables?.statementSource || "").split(",")[0].trim();
                return (
                  <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
                    <td className="px-3 py-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-300 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[110px]">{pm.name}</td>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate w-[130px]" title={sys.type}>
                      {sys.type || <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] font-mono text-zinc-400 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate" title={sys.tables?.statementSource}>
                      {statementSource || <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[150px]">
                      <div className="flex flex-wrap gap-0.5">
                        {sys.upfrontPayment && <PlatformFlag label="upfront" />}
                        {sys.bankPaymentByOutlet && <PlatformFlag label="bank→outlet" />}
                        {sys.feesDeduction && <PlatformFlag label="fees" />}
                        {!sys.upfrontPayment && !sys.bankPaymentByOutlet && !sys.feesDeduction && (
                          <span className="text-[9px] text-zinc-300 dark:text-zinc-600">&mdash;</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[120px]">
                      {domain ? (
                        <PushGenericCell
                          persistedCompletedAt={st.completedAt}
                          run={() => pushMasterPlatformRow({
                            domain: domain!,
                            tableName: masterPlatformsConfig.table,
                            zone: masterPlatformsConfig.zone || "595",
                            columns: masterPlatformsConfig.columns,
                            platformName: pm.name,
                            sys,
                          })}
                          onPushed={() => markPushed(key)}
                        />
                      ) : (
                        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">&mdash;</span>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
          );
        })()}
      </CollapsibleSection>

      {/* Populate Date Params — push preset date-window configs to
          custom_tbl_1156_166. All values come from the template — operators
          toggle is_active in VAL to switch between historical / incremental
          run modes. Matches mb's 3-row preset (All / RevRec / DAT1). */}
      <CollapsibleSection
        badge="Master"
        badgeColor="green"
        title="Populate Date Params"
        progress={`${countDone(masterDateParamsKeys)} / ${masterDateParamsKeys.length}`}
        description={
          <span>
            Push per-workflow date-window presets to the data date pull config table. Operators toggle <code className="font-mono">is_active</code> in VAL to switch between historical and incremental run modes.
            {masterDateParamsConfig?.table && (<> Target table: <TableChip table={masterDateParamsConfig.table} /></>)}
          </span>
        }
      >
        {dateParamsDefaults.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">Template has no date param presets configured.</p>
        ) : !masterDateParamsConfig?.columns ? (
          <p className="text-xs text-amber-500 py-3">Template is missing <code className="font-mono">valConfig.base.masterTables.Date_Params.columns</code>.</p>
        ) : (() => {
          const eligible = dateParamsDefaults.filter((d: any) => {
            const st = getImplStatus(implStatus, `master-date-param::${d.id}`);
            return Boolean(domain && !st.completedAt);
          });
          const runDateBulk = () => {
            if (!domain || !masterDateParamsConfig?.columns) return;
            const jobs = eligible.map((preset: any) => ({
              implKey: `master-date-param::${preset.id}`,
              run: () => pushDateParamRow({
                domain,
                tableName: masterDateParamsConfig.table,
                zone: masterDateParamsConfig.zone || "1057",
                columns: masterDateParamsConfig.columns,
                preset,
              }),
            }));
            runBulk("master-date-params", jobs);
          };
          return (
          <>
          <PushAllToolbar
            label="Push All"
            pending={eligible.length}
            total={dateParamsDefaults.length}
            progress={bulkProgress?.key === "master-date-params" ? { done: bulkProgress.done, total: bulkProgress.total } : null}
            onClick={runDateBulk}
          />
          <table className="w-full border-collapse table-fixed">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "ID", className: "w-[80px]" },
              { label: "Workflow", className: "w-[110px]" },
              { label: "Calc Type", className: "w-[130px]" },
              { label: "Description", className: "" },
              { label: "Active", className: "w-[70px]" },
              { label: "Push", className: "w-[120px]" },
              { label: "Status", className: COL_STATUS },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {dateParamsDefaults.map((preset: any, i: number) => {
                const key = `master-date-param::${preset.id}`;
                const st = getImplStatus(implStatus, key);
                const calcLabel = preset.calcType === "Days Back" && preset.daysBack != null
                  ? `${preset.calcType} (${preset.daysBack})`
                  : preset.calcType === "Current Period" && preset.periodUnit
                  ? `${preset.calcType} (${preset.periodUnit})`
                  : preset.calcType || "—";
                return (
                  <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
                    <td className="px-3 py-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-300 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[80px]">{preset.id}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 w-[110px]">{preset.workflowId || <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}</td>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate w-[130px]" title={calcLabel}>{calcLabel}</td>
                    <td className="px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate" title={preset.description}>{preset.description || <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}</td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[70px]">
                      {preset.isActive ? (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">Yes</span>
                      ) : (
                        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">&mdash;</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[120px]">
                      {domain ? (
                        <PushGenericCell
                          persistedCompletedAt={st.completedAt}
                          run={() => pushDateParamRow({
                            domain: domain!,
                            tableName: masterDateParamsConfig.table,
                            zone: masterDateParamsConfig.zone || "1057",
                            columns: masterDateParamsConfig.columns,
                            preset,
                          })}
                          onPushed={() => markPushed(key)}
                        />
                      ) : (
                        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">&mdash;</span>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
          );
        })()}
      </CollapsibleSection>
      </div>}

      {activeSubTab === "mapping" && <div className="space-y-8">
      {/* Populate Outlet Mapping — push store_id ↔ outlet_code mappings to
          each platform's outletMap table (Grab → custom_tbl_100_169,
          Food Panda → custom_tbl_100_232, etc). Previously split into a
          preview pivot + a push table; merged now. */}
      <CollapsibleSection
        badge="Mapping"
        badgeColor="green"
        title="Populate Outlet Mapping"
        progress={`${countDone(populateMappingKeys)} / ${populateMappingKeys.length}`}
        description={
          <span>
            Push per-platform outlet mappings (store ID → outlet code) to each platform's outlet map table.
            {outletMapTables.length > 0 && (
              <>
                {" "}Target tables:{" "}
                {outletMapTables.map((t, i) => (
                  <span key={t}>
                    {i > 0 && " "}
                    <TableChip table={t} />
                  </span>
                ))}
              </>
            )}
          </span>
        }
      >
        {outlets.length === 0 || pms.length === 0 ? <Empty /> : (() => {
          const scanFiles = data.lastScan?.files || [];
          const outletMappingData = data.outletMapping || {};
          const scanDetailsBySystem: Record<string, { storeId: string; storeName: string; outletCode: string }[]> = {};
          for (const sys of valSystems) {
            if (!sys.outletMapColumns || !sys.tables?.outletMap) continue;
            const files = scanFiles.filter((f: any) => f.match?.platform.toLowerCase() === sys.id.toLowerCase());
            const details = files.flatMap((f: any) => f.outletDetails || []);
            const seen = new Set<string>();
            scanDetailsBySystem[sys.id.toLowerCase()] = details.filter((d: any) => {
              if (seen.has(d.name)) return false;
              seen.add(d.name);
              return true;
            }).map((d: any) => ({
              storeId: d.id,
              storeName: d.name,
              outletCode: outletMappingData[d.name] || "",
            }));
          }

          // Collect eligible (match + not yet pushed) rows for Push All.
          const mappingEligible: { implKey: string; run: () => Promise<PushResult> }[] = [];
          let mappingTotal = 0;
          for (const o of outlets) {
            for (const pm of pms) {
              if (!isPMApplicable(pm, o.key)) continue;
              const sys = valSystems.find((s: any) => s.id.toLowerCase() === pm.name.toLowerCase());
              if (!sys?.outletMapColumns || !sys.tables?.outletMap || !domain) continue;
              const match = (scanDetailsBySystem[pm.name.toLowerCase()] || []).find((d) => d.outletCode === o.key);
              if (!match) continue;
              mappingTotal += 1;
              const implKey = `populate-map::${o.key}::${pm.name}`;
              const st = getImplStatus(implStatus, implKey);
              if (st.completedAt) continue;
              mappingEligible.push({
                implKey,
                run: () => pushOutletMappingRow({
                  domain,
                  tableName: sys.tables.outletMap,
                  columns: sys.outletMapColumns,
                  storeId: match.storeId,
                  outletCode: match.outletCode,
                }),
              });
            }
          }

          return (
          <>
          <PushAllToolbar
            label="Push All"
            pending={mappingEligible.length}
            total={mappingTotal}
            progress={bulkProgress?.key === "outlet-mapping" ? { done: bulkProgress.done, total: bulkProgress.total } : null}
            onClick={() => runBulk("outlet-mapping", mappingEligible)}
          />
          <table className="w-full border-collapse table-fixed">
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Outlet", className: "w-[100px]" },
              { label: "Payment Method", className: "w-[110px]" },
              { label: "Store Info", className: "" },
              { label: "Push", className: "w-[120px]" },
              { label: "Status", className: COL_STATUS },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>
              {renderOutletPMRows(outlets, pms, entities, showEntityHeaders, (o, pm, n) => {
                const key = `populate-map::${o.key}::${pm.name}`;
                // colSpan is passed below to match this section's 7-column layout.
                const st = getImplStatus(implStatus, key);
                const sysDetails = scanDetailsBySystem[pm.name.toLowerCase()] || [];
                const match = sysDetails.find((d) => d.outletCode === o.key);
                const sys = valSystems.find((s: any) => s.id.toLowerCase() === pm.name.toLowerCase());
                return (
                  <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{n}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 w-[100px]">{o.key}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 w-[110px]">{pm.name}</td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate" title={match ? `${match.storeId} — ${match.storeName}` : ""}>
                      {match ? (
                        <div className="flex flex-col">
                          <span className="text-[10px] font-mono text-zinc-500 truncate">{match.storeId}</span>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{match.storeName}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-300 dark:text-zinc-600">&mdash;</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 w-[120px]">
                      {match && domain && sys?.outletMapColumns ? (
                        <PushMappingCell
                          domain={domain}
                          tableName={sys.tables.outletMap}
                          columns={sys.outletMapColumns}
                          storeId={match.storeId}
                          outletCode={match.outletCode}
                          persistedCompletedAt={st.completedAt}
                          onPushed={() => markPushed(key)}
                        />
                      ) : (
                        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">&mdash;</span>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              }, 7)}
            </tbody>
          </table>
          </>
          );
        })()}
      </CollapsibleSection>
      </div>}

      {activeSubTab === "data" && <div className="space-y-8">
      {/* Populate Data */}
      <CollapsibleSection badge="Data" badgeColor="green" title="Populate Data" progress={`${countDone(populateDataKeys)} / ${populateDataKeys.length}`} description="Run dataLoad workflows to process uploaded files from VAL Drive into tables.">
        {syncItems.length === 0 || periods.length === 0 ? <Empty /> : (() => {
          const scanFiles = data.lastScan?.files || [];
          const scanBySystem: Record<string, { outlets: string[]; dateFrom: string; dateTo: string }> = {};
          for (const f of scanFiles) {
            if (!f.match) continue;
            const platform = f.match.platform.toLowerCase();
            if (!scanBySystem[platform]) scanBySystem[platform] = { outlets: [], dateFrom: "", dateTo: "" };
            const entry = scanBySystem[platform];
            for (const o of (f.outlets || [])) { if (!entry.outlets.includes(o)) entry.outlets.push(o); }
            if (f.dateRange) {
              if (!entry.dateFrom || f.dateRange.from < entry.dateFrom) entry.dateFrom = f.dateRange.from;
              if (!entry.dateTo || f.dateRange.to > entry.dateTo) entry.dateTo = f.dateRange.to;
            }
          }
          const outletMapping = data.outletMapping || {};

          return (
          <table className="w-full border-collapse">
            <THead cols={[
              { label: "#", className: COL_NUM },
              "Type",
              "System",
              "Scope",
              "Period",
              "Outlets Uploaded",
              "Date Range",
              "Data Load",
              { label: "Status", className: COL_STATUS },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>{syncItems.flatMap((item, i) =>
              periods.map((period) => {
                const key = `populate-data::${item.key}::${period}`;
                const st = getImplStatus(implStatus, key);
                const sys = valSystems.find((s: any) => s.id.toLowerCase() === item.name.toLowerCase());
                const dataLoadIds: number[] = sys?.workflows?.dataLoad || [];
                const hasUploaded = uploadedFiles.some((f) => f.platform.toLowerCase() === item.name.toLowerCase());
                const scanData = scanBySystem[item.name.toLowerCase()];
                return (
                  <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i * periods.length + periods.indexOf(period) + 1}</td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><TypeBadge type={item.type} /></td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{item.name}</td>
                    <td className="px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{item.scope}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{period}</td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      {scanData?.outlets.length ? (
                        <div className="flex flex-wrap gap-0.5">
                          {scanData.outlets.map((o) => {
                            const code = outletMapping[o];
                            return <span key={o} className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-500 truncate max-w-[80px]" title={o}>{code || o}</span>;
                          })}
                        </div>
                      ) : (
                        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">&mdash;</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] font-mono text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      {scanData?.dateFrom ? `${scanData.dateFrom} → ${scanData.dateTo}` : <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <DataLoadCell
                        domain={domain}
                        workflowIds={dataLoadIds}
                        hasUploaded={hasUploaded}
                        systemName={item.name}
                        statusKey={`${item.key}::${period}`}
                        data={data}
                        onChange={onChange}
                      />
                    </td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                    <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })
            )}</tbody>
          </table>
          );
        })()}
      </CollapsibleSection>
      </div>}
    </div>
  );
}

// Tiny boolean-flag chip used in Populate Master Platforms rows to show
// which predetermined flags are true for a platform (upfront / bank→outlet / fees).
function PlatformFlag({ label }: { label: string }) {
  return (
    <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-teal-500/10 text-teal-500 dark:text-teal-400">
      {label}
    </span>
  );
}

// ─── Generic push cell — same visual contract as PushMappingCell /
// PushMasterOutletCell, but takes a plain `run` callback so any push shape
// can reuse it. Used by Master Entities and Master Platforms sections.
function PushGenericCell({ persistedCompletedAt, run, onPushed }: {
  persistedCompletedAt?: string;
  run: () => Promise<PushResult>;
  onPushed?: () => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setError(null);
    const res = await run();
    if (res.success) onPushed?.();
    else setError(res.error || "Unknown error");
    setPushing(false);
  };

  if (persistedCompletedAt) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400"
          title={formatDateTimeSGT(new Date(persistedCompletedAt))}
        >
          {timeAgoVerbose(persistedCompletedAt)}
        </span>
        <button onClick={handlePush} disabled={pushing} className="text-[9px] text-zinc-400 hover:text-blue-500 bg-transparent border-none cursor-pointer" title="Push again">
          {pushing ? "..." : "↻"}
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-bold text-red-400" title={error}>Failed</span>
        <button onClick={handlePush} className="text-[9px] text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer underline">Retry</button>
      </div>
    );
  }
  return (
    <button
      onClick={handlePush}
      disabled={pushing}
      className="text-[9px] font-semibold px-2 py-0.5 rounded cursor-pointer border-none disabled:opacity-40 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
    >
      {pushing ? "..." : "Push"}
    </button>
  );
}

// ─── Sub-tab button with inline progress ───
function SubTabButton({ label, progress, active, onClick }: {
  label: string;
  progress: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 border-b-2 -mb-px transition-colors cursor-pointer bg-transparent ${
        active
          ? "border-blue-500 text-blue-500 dark:text-blue-400"
          : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] font-mono text-zinc-400">{progress}</span>
    </button>
  );
}

// ─── Inline Data Load trigger per system row ───

function DataLoadCell({ domain, workflowIds, hasUploaded, systemName, statusKey, data, onChange }: {
  domain?: string; workflowIds: number[]; hasUploaded: boolean; systemName: string;
  statusKey: string; data: InstanceData; onChange: (data: InstanceData) => void;
}) {
  const persisted = data.dataLoadStatus?.[statusKey];
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  const isStalePolling = persisted?.status === "polling" && persisted.triggeredAt &&
    (Date.now() - new Date(persisted.triggeredAt).getTime()) > 2 * 60 * 1000;
  const status = localStatus || (isStalePolling ? "done" : persisted?.status) || "idle";

  const dataRef = useRef(data);
  dataRef.current = data;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const saveStatus = useCallback((newStatus: string) => {
    const d = dataRef.current;
    const updated = { ...(d.dataLoadStatus || {}), [statusKey]: { status: newStatus, triggeredAt: new Date().toISOString() } };
    onChangeRef.current({ ...d, dataLoadStatus: updated });
  }, [statusKey]);

  useEffect(() => {
    if (isStalePolling) saveStatus("done");
  }, [isStalePolling, saveStatus]);

  useEffect(() => {
    if (status !== "polling" || workflowIds.length === 0 || !domain) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const rawResults = await Promise.all(
          workflowIds.map((wfId) =>
            invoke<any>("val_workflow_execution_status", { domain, workflowId: wfId })
              .catch(() => ({ status: "unknown" }))
          )
        );
        if (cancelled) return;
        console.log("[DataLoad poll]", statusKey, rawResults);
        const results = rawResults.map((r) => ((r?.status || "unknown") as string).toLowerCase());
        const allDone = results.every((s) => s === "completed" || s === "complete");
        const anyFailed = results.some((s) => s === "failed" || s === "error");
        if (allDone) { setLocalStatus("done"); saveStatus("done"); }
        else if (anyFailed) { setLocalStatus("error"); saveStatus("error"); }
      } catch {
        if (!cancelled) { setLocalStatus("error"); saveStatus("error"); }
      }
    };
    const timeout = setTimeout(poll, 3000);
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearTimeout(timeout); clearInterval(interval); };
  }, [status, workflowIds, domain, statusKey, saveStatus]);

  if (workflowIds.length === 0) return <span className="text-[9px] text-zinc-300 dark:text-zinc-600">&mdash;</span>;
  if (!domain) return <span className="text-[9px] text-zinc-400">{workflowIds.length} wf</span>;

  const handleRun = async () => {
    setLocalStatus("running");
    try {
      for (const wfId of workflowIds) {
        await invoke("val_workflow_rerun", { domain, workflowId: wfId });
      }
      saveStatus("polling");
      setLocalStatus("polling");
    } catch {
      saveStatus("error");
      setLocalStatus(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {status === "done" ? (
        <>
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Done</span>
          <button onClick={handleRun} className="text-[10px] font-semibold text-zinc-400 hover:text-blue-400 bg-transparent border-none cursor-pointer">Re-run</button>
        </>
      ) : status === "error" ? (
        <>
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Failed</span>
          <button onClick={handleRun} className="text-[10px] font-semibold text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer">Retry</button>
        </>
      ) : status === "polling" ? (
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 animate-pulse">Processing...</span>
      ) : status === "running" ? (
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Triggering...</span>
      ) : (
        <button
          onClick={handleRun}
          disabled={!hasUploaded}
          title={!hasUploaded ? `Upload ${systemName} files first` : `Run ${workflowIds.length} dataLoad workflow${workflowIds.length !== 1 ? "s" : ""}`}
          className="text-[10px] font-semibold px-2 py-0.5 rounded cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500/10 text-orange-500 hover:bg-orange-500/20"
        >
          Run
        </button>
      )}
    </div>
  );
}

// ─── Inline Push Mapping Cell ───

function PushMappingCell({ domain, tableName, columns, storeId, outletCode, persistedCompletedAt, onPushed }: {
  domain: string; tableName: string;
  columns: { storeId: string; outlet: string; pk?: string; zone?: string; allColumns?: { column_name: string; data_type: string }[] };
  storeId: string; outletCode: string;
  persistedCompletedAt?: string;
  onPushed?: () => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setError(null);
    const res = await pushOutletMappingRow({ domain, tableName, columns, storeId, outletCode });
    if (res.success) onPushed?.();
    else setError(res.error || "Unknown error");
    setPushing(false);
  };

  if (persistedCompletedAt) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400"
          title={formatDateTimeSGT(new Date(persistedCompletedAt))}
        >
          {timeAgoVerbose(persistedCompletedAt)}
        </span>
        <button onClick={handlePush} disabled={pushing} className="text-[9px] text-zinc-400 hover:text-blue-500 bg-transparent border-none cursor-pointer" title="Push again">
          {pushing ? "..." : "↻"}
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-bold text-red-400" title={error || ""}>Failed</span>
        <button onClick={handlePush} className="text-[9px] text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer underline">Retry</button>
      </div>
    );
  }
  return (
    <button
      onClick={handlePush}
      disabled={pushing}
      className="text-[9px] font-semibold px-2 py-0.5 rounded cursor-pointer border-none disabled:opacity-40 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
    >
      {pushing ? "..." : "Push"}
    </button>
  );
}

// ─── Inline Push Master Outlet Cell ───
// Mirrors PushMappingCell — uses the same val_table_insert_rows Tauri command,
// but writes one row to the master outlets table (custom_tbl_100_168) with
// {id = outlet code, brand = entity shortcode, name = long outlet name}.

function PushMasterOutletCell({ domain, tableName, zone, columns, code, brand, name, persistedCompletedAt, onPushed }: {
  domain: string;
  tableName: string;
  zone: string;
  columns: {
    pk: string;
    brand: string;
    name: string;
    allColumns: { column_name: string; data_type: string }[];
  };
  code: string;
  brand: string;
  name: string;
  persistedCompletedAt?: string;
  onPushed?: () => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setError(null);
    const res = await pushMasterOutletRow({ domain, tableName, zone, columns, code, brand, name });
    if (res.success) onPushed?.();
    else setError(res.error || "Unknown error");
    setPushing(false);
  };

  // Persisted success state — survives reload because it reads from implStatus.
  if (persistedCompletedAt) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400"
          title={formatDateTimeSGT(new Date(persistedCompletedAt))}
        >
          {timeAgoVerbose(persistedCompletedAt)}
        </span>
        <button
          onClick={handlePush}
          disabled={pushing}
          className="text-[9px] text-zinc-400 hover:text-blue-500 bg-transparent border-none cursor-pointer"
          title="Push again"
        >
          {pushing ? "..." : "↻"}
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-bold text-red-400" title={error}>Failed</span>
        <button onClick={handlePush} className="text-[9px] text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer underline">Retry</button>
      </div>
    );
  }
  return (
    <button
      onClick={handlePush}
      disabled={pushing}
      className="text-[9px] font-semibold px-2 py-0.5 rounded cursor-pointer border-none disabled:opacity-40 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
    >
      {pushing ? "..." : "Push"}
    </button>
  );
}
