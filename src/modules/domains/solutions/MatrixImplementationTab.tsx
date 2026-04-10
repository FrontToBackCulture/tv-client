import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InstanceData, TemplateDefinition, ImplStatusEntry } from "../../../lib/solutions/types";
import {
  getOutlets, getOutletNames, getUniquePOS, getCredentialPlatforms,
  getSyncItems, isPMApplicable, getImplStatus, filterScope, getEntities,
} from "./matrixHelpers";
import {
  CollapsibleSection, StatusSelect, OwnerTag, EditableInput,
  TypeBadge, GridStatusCell,
} from "./matrixComponents";
import { useTriggerSync, useSyncJobs, buildSyncRequestsFromScope } from "../../../hooks/solutions";
import { supabase } from "../../../lib/supabase";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
  domain?: string;
  instanceId?: string;
}

export default function MatrixImplementationTab({ data, template, onChange, selectedEntity, domain, instanceId }: Props) {
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
  const syncDashKeys = syncItems.map((item) => `sync-dash::${item.key}`);
  const populateMappingKeys = outlets.flatMap((o) => pms.filter((pm) => isPMApplicable(pm, o.key)).map((pm) => `populate-map::${o.key}::${pm.name}`));
  const populateDataKeys = syncItems.flatMap((item) => periods.map((p) => `populate-data::${item.key}::${p}`));
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

  const valConfig = (template as any).valConfig;
  const valSystems: any[] = valConfig?.systems || [];
  const uploadedFiles = data.uploadedFiles || [];
  const { data: provisionJobs, refetch: refetchJobs } = useSyncJobs(domain || null, false);
  const triggerSync = useTriggerSync();


  // Build sync requests from scope for inline sync buttons
  const scopeSystems = domain && valConfig ? {
    pos: [...new Set((data.scope || []).flatMap((s) => s.pos || []))],
    paymentMethods: (data.paymentMethods || []).map((p) => p.name),
    banks: [...new Set((data.banks || []).map((b) => b.bank).filter(Boolean))],
  } : null;

  const buildRequests = (resourceType: "tables" | "workflows" | "dashboards") =>
    scopeSystems && domain && valConfig
      ? buildSyncRequestsFromScope(scopeSystems, valConfig, domain, instanceId, resourceType)
      : [];

  // Poll for active syncs
  const anyActive = provisionJobs?.some((j) => j.status === "syncing" || j.status === "queued");
  useEffect(() => {
    if (!anyActive || !domain) return;
    const poll = async () => {
      try { await supabase.functions.invoke("check-sync-status", { body: { domain } }); } catch (_) { /* ignore */ }
      refetchJobs();
    };
    const interval = setInterval(poll, 4000);
    poll();
    return () => clearInterval(interval);
  }, [anyActive, domain, refetchJobs]);

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
        <SyncTable items={syncItems} prefix="sync-tbl" implStatus={implStatus} onUpdate={updateImpl}
          provisionJobs={provisionJobs} resourceType="tables" syncRequests={buildRequests("tables")} triggerSync={triggerSync} refetchJobs={refetchJobs} />
      </CollapsibleSection>

      {/* Sync Workflows */}
      <CollapsibleSection badge="Workflows" badgeColor="green" title="Sync Workflows" progress={`${countDone(syncWfKeys)} / ${syncWfKeys.length}`}>
        <SyncTable items={syncItems} prefix="sync-wf" implStatus={implStatus} onUpdate={updateImpl}
          provisionJobs={provisionJobs} resourceType="workflows" syncRequests={buildRequests("workflows")} triggerSync={triggerSync} refetchJobs={refetchJobs} />
      </CollapsibleSection>

      {/* Sync Dashboards */}
      <CollapsibleSection badge="Dashboards" badgeColor="green" title="Sync Dashboards" progress={`${countDone(syncDashKeys)} / ${syncDashKeys.length}`}>
        <SyncTable items={syncItems} prefix="sync-dash" implStatus={implStatus} onUpdate={updateImpl}
          provisionJobs={provisionJobs} resourceType="dashboards" syncRequests={buildRequests("dashboards")} triggerSync={triggerSync} refetchJobs={refetchJobs} />
      </CollapsibleSection>

      {/* Populate Mapping */}
      <CollapsibleSection badge="Mapping" badgeColor="green" title="Populate Mapping" progress={`${countDone(populateMappingKeys)} / ${populateMappingKeys.length}`} description="Load outlet/PM mapping configuration into VAL.">
        {outlets.length === 0 || pms.length === 0 ? <Empty /> : (() => {
          // Build scan data lookup for inline push
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

          return (
          <table className="w-full border-collapse">
            <THead cols={["#","Outlet","Payment Method","Store ID","Store Name","Push","Status","Notes"]} />
            <tbody>
              {renderOutletPMRows((o, pm, n) => {
                const key = `populate-map::${o.key}::${pm.name}`;
                const st = getImplStatus(implStatus, key);
                // Find matching scan data for this outlet+system
                const sysDetails = scanDetailsBySystem[pm.name.toLowerCase()] || [];
                const match = sysDetails.find((d) => d.outletCode === o.key);
                const sys = valSystems.find((s: any) => s.id.toLowerCase() === pm.name.toLowerCase());
                return (
                  <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{n}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{o.key}</td>
                    <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pm.name}</td>
                    <td className="px-3 py-1.5 text-[10px] font-mono text-zinc-400 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate max-w-[150px]" title={match?.storeId}>
                      {match?.storeId || <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50 truncate max-w-[180px]" title={match?.storeName}>
                      {match?.storeName || <span className="text-zinc-300 dark:text-zinc-600">&mdash;</span>}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      {match && domain && sys?.outletMapColumns ? (
                        <PushMappingCell
                          domain={domain}
                          tableName={sys.tables.outletMap}
                          columns={sys.outletMapColumns}
                          storeId={match.storeId}
                          outletCode={match.outletCode}
                          statusKey={key}
                          data={data}
                          onChange={onChange}
                        />
                      ) : (
                        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">&mdash;</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          );
        })()}
      </CollapsibleSection>

      {/* Populate Data */}
      <CollapsibleSection badge="Data" badgeColor="green" title="Populate Data" progress={`${countDone(populateDataKeys)} / ${populateDataKeys.length}`} description="Run dataLoad workflows to process uploaded files from VAL Drive into tables.">
        {syncItems.length === 0 || periods.length === 0 ? <Empty /> : (() => {
          // Build scan data lookup: system name → { outlets, dateRange }
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
          // Resolve outlet names via mapping
          const outletMapping = data.outletMapping || {};

          return (
          <table className="w-full border-collapse">
            <THead cols={["#","Type","System","Scope","Period","Outlets Uploaded","Date Range","Data Load","Status","Notes"]} />
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
                    <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i * periods.length + periods.indexOf(period) + 1}</td>
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
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                    <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                  </tr>
                );
              })
            )}</tbody>
          </table>
          );
        })()}
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

function SyncTable({ items, prefix, implStatus, onUpdate, provisionJobs, resourceType, syncRequests, triggerSync, refetchJobs }: {
  items: ReturnType<typeof getSyncItems>; prefix: string; implStatus: Record<string, ImplStatusEntry>;
  onUpdate: (key: string, field: keyof ImplStatusEntry, value: string) => void;
  provisionJobs?: { system_id: string | null; resource_type: string; status: string }[] | null;
  resourceType?: "tables" | "workflows" | "dashboards";
  syncRequests?: ReturnType<typeof buildSyncRequestsFromScope>;
  triggerSync?: ReturnType<typeof useTriggerSync>;
  refetchJobs?: () => void;
}) {
  if (items.length === 0) return <Empty />;

  const getProvisionStatus = (itemName: string): string | null => {
    if (!provisionJobs || !resourceType) return null;
    const job = provisionJobs.find((j) =>
      j.resource_type === resourceType &&
      (j.system_id === itemName || (itemName === "Reconciliation" && j.system_id === "base"))
    );
    return job?.status || null;
  };

  const findSyncRequest = (itemName: string) => {
    if (!syncRequests) return null;
    return syncRequests.find((r) =>
      r.system_id === itemName || (itemName === "Reconciliation" && (!r.system_id || r.system_id === "base"))
    ) || null;
  };

  const handleSync = (req: ReturnType<typeof buildSyncRequestsFromScope>[number]) => {
    if (!triggerSync) return;
    triggerSync.mutateAsync(req).then(() => refetchJobs?.()).catch((e) => console.error("Sync failed:", e));
  };

  const handleSyncAll = () => {
    if (!syncRequests || !triggerSync) return;
    for (const req of syncRequests) {
      const sysId = req.system_id || "base";
      const status = getProvisionStatus(items.find((it) => findSyncRequest(it.name) === req)?.name || sysId);
      if (status === "done" || status === "syncing" || status === "queued") continue;
      handleSync(req);
    }
  };

  const hasSyncCapability = syncRequests && syncRequests.length > 0 && triggerSync;
  const allDone = hasSyncCapability && items.every((item) => getProvisionStatus(item.name) === "done");
  const anySyncable = hasSyncCapability && items.some((item) => {
    const s = getProvisionStatus(item.name);
    return !s || s === "pending" || s === "error";
  });

  return (
    <div>
      {hasSyncCapability && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleSyncAll}
            disabled={!anySyncable}
            className="text-[10px] font-semibold px-2.5 py-1 rounded border-none cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
          >
            {allDone ? "All Synced" : "Sync All from Lab"}
          </button>
        </div>
      )}
      <table className="w-full border-collapse">
        <THead cols={["#","Type","Name","Scope","Sync Status","Status","Owner","Notes"]} />
        <tbody>{items.map((item, i) => {
          const key = `${prefix}::${item.key}`;
          const st = getImplStatus(implStatus, key);
          const provStatus = getProvisionStatus(item.name);
          const req = findSyncRequest(item.name);
          const canSync = req && (!provStatus || provStatus === "pending" || provStatus === "error");
          return (
            <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
              <td className="px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
              <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><TypeBadge type={item.type} /></td>
              <td className="px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{item.name}</td>
              <td className="px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/50 dark:border-zinc-800/50">{item.scope}</td>
              <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50">
                <div className="flex items-center gap-1.5">
                  {provStatus ? (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PROV_STATUS_COLORS[provStatus] || PROV_STATUS_COLORS.pending}`}>
                      {PROV_STATUS_LABELS[provStatus] || provStatus}
                    </span>
                  ) : (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PROV_STATUS_COLORS.pending}`}>Pending</span>
                  )}
                  {canSync && (
                    <button
                      onClick={() => handleSync(req)}
                      className={`text-[10px] font-semibold cursor-pointer bg-transparent border-none ${provStatus === "error" ? "text-red-400 hover:text-red-300" : "text-blue-500 hover:text-blue-400"}`}
                    >
                      {provStatus === "error" ? "Retry" : "Sync"}
                    </button>
                  )}
                </div>
              </td>
              <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><StatusSelect value={st.status} onChange={(v) => onUpdate(key, "status", v)} /></td>
              <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="tv" /></td>
              <td className="px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50"><EditableInput value={st.detail} onChange={(v) => onUpdate(key, "detail", v)} placeholder="Notes..." /></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

// ─── Provision status constants ───

const PROV_STATUS_COLORS: Record<string, string> = {
  pending: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400",
  queued: "bg-blue-500/10 text-blue-400",
  syncing: "bg-blue-500/10 text-blue-400",
  done: "bg-emerald-500/10 text-emerald-400",
  error: "bg-red-500/10 text-red-400",
};
const PROV_STATUS_LABELS: Record<string, string> = {
  pending: "Pending", queued: "Queued", syncing: "Syncing...", done: "Done", error: "Error",
};

// ─── Inline Data Load trigger per system row ───

function DataLoadCell({ domain, workflowIds, hasUploaded, systemName, statusKey, data, onChange }: {
  domain?: string; workflowIds: number[]; hasUploaded: boolean; systemName: string;
  statusKey: string; data: InstanceData; onChange: (data: InstanceData) => void;
}) {
  const persisted = data.dataLoadStatus?.[statusKey];
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  // If persisted as "polling" but triggered > 2 min ago, assume done
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

  // Persist stale resolution
  useEffect(() => {
    if (isStalePolling) saveStatus("done");
  }, [isStalePolling, saveStatus]);

  // Poll when processing
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

function PushMappingCell({ domain, tableName, columns, storeId, outletCode }: {
  domain: string; tableName: string;
  columns: { storeId: string; outlet: string; pk?: string; zone?: string; allColumns?: { column_name: string; data_type: string }[] };
  storeId: string; outletCode: string;
  statusKey?: string; data?: InstanceData; onChange?: (data: InstanceData) => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setResult(null);
    setError(null);

    const pk = columns.pk || "general_record_id";
    const zone = columns.zone || "595";
    const allColumns = columns.allColumns || [
      { column_name: pk, data_type: "text" },
      { column_name: columns.storeId, data_type: "character varying" },
      { column_name: columns.outlet, data_type: "character varying" },
    ];

    const row = allColumns.map((c) => {
      if (c.column_name === columns.storeId) return storeId;
      if (c.column_name === columns.outlet) return outletCode;
      return ""; // PK auto-generate
    });

    try {
      const res = await invoke<{ inserted: number; failed: number; errors: string[] }>("val_table_insert_rows", {
        domain, tableName, zone, pk, columns: allColumns, rows: [row],
      });
      if (res.inserted > 0) {
        setResult("success");
      } else {
        setResult("error");
        setError(res.errors[0] || "Unknown error");
      }
    } catch (err: any) {
      setResult("error");
      setError(err?.message || String(err));
    } finally {
      setPushing(false);
    }
  };

  if (result === "success") {
    return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Pushed</span>;
  }
  if (result === "error") {
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
