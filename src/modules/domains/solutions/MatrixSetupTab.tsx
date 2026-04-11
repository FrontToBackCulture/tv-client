import { useEffect } from "react";
import type { InstanceData, TemplateDefinition, ImplStatusEntry } from "../../../lib/solutions/types";
import {
  getOutletNames, getUniquePOS, getCredentialPlatforms, getSyncItems,
  isPMApplicable, getImplStatus, filterScope,
} from "./matrixHelpers";
import {
  CollapsibleSection, StatusSelect, OwnerTag, EditableInput, TypeBadge, OutletScope,
} from "./matrixComponents";
import {
  Empty, THead,
  PROV_STATUS_COLORS, PROV_STATUS_LABELS,
  COL_NUM, COL_TYPE, COL_NAME, COL_SCOPE, COL_SYNC_STATUS,
  COL_OWNER, COL_NOTES,
} from "./matrixImplHelpers";
import { useTriggerSync, useSyncJobs, buildSyncRequestsFromScope } from "../../../hooks/solutions";
import { supabase } from "../../../lib/supabase";
import { timeAgoVerbose, formatDateTimeSGT } from "../../../lib/date";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
  domain?: string;
  instanceId?: string;
}

export default function MatrixSetupTab({ data, template, onChange, selectedEntity, domain, instanceId }: Props) {
  const scope = filterScope(data.scope || [], selectedEntity);
  const pms = data.paymentMethods || [];
  const banks = data.banks || [];
  const implStatus = data.implStatus || {};
  const outletNames = getOutletNames(scope);

  const updateImpl = (key: string, field: keyof ImplStatusEntry, value: string) => {
    const st = getImplStatus(implStatus, key);
    onChange({ ...data, implStatus: { ...implStatus, [key]: { ...st, [field]: value } } });
  };

  const countDone = (keys: string[]) =>
    keys.filter((k) => { const s = getImplStatus(implStatus, k).status; return s === "done" || s === "na"; }).length;

  const posList = getUniquePOS(scope);
  const platforms = getCredentialPlatforms(pms, template);
  const syncItems = getSyncItems(scope, pms, banks);

  const botKeys = platforms.map((p) => `bot::${p}`);
  const posSetupKeys = posList.map((p) => `pos-setup::${p.name}`);

  const valConfig = (template as any).valConfig;
  const { data: provisionJobs, refetch: refetchJobs } = useSyncJobs(domain || null, false);
  const triggerSync = useTriggerSync();

  // Count items whose provision job reports "done" for a given resource type.
  // Used for the Sync Tables / Workflows / Dashboards section progress badges.
  const countSyncDone = (resourceType: "tables" | "workflows" | "dashboards") => {
    if (!provisionJobs) return 0;
    return syncItems.filter((item) => {
      const job = provisionJobs.find((j) =>
        j.resource_type === resourceType &&
        (j.system_id === item.name || (item.name === "Base" && j.system_id === "base"))
      );
      return job?.status === "done";
    }).length;
  };

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
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Type", className: COL_TYPE },
              { label: "Name", className: COL_NAME },
              { label: "Scope", className: COL_SCOPE },
              { label: "Setup Status", className: COL_SYNC_STATUS },
              { label: "Owner", className: COL_OWNER },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>{platforms.map((pm, i) => {
              const pmObj = pms.find((p) => p.name === pm);
              const applicable = pmObj ? outletNames.filter((o) => isPMApplicable(pmObj, o)) : outletNames;
              const key = `bot::${pm}`;
              const st = getImplStatus(implStatus, key);
              return (
                <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_TYPE}`}><TypeBadge type="Payment" /></td>
                  <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NAME}`}>{pm}</td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SCOPE}`}><OutletScope outlets={applicable} /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SYNC_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_OWNER}`}><OwnerTag owner="tv" /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
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
            <THead cols={[
              { label: "#", className: COL_NUM },
              { label: "Type", className: COL_TYPE },
              { label: "Name", className: COL_NAME },
              { label: "Scope", className: COL_SCOPE },
              { label: "Setup Status", className: COL_SYNC_STATUS },
              { label: "Owner", className: COL_OWNER },
              { label: "Notes", className: COL_NOTES },
            ]} />
            <tbody>{posList.map((pos, i) => {
              const key = `pos-setup::${pos.name}`;
              const st = getImplStatus(implStatus, key);
              return (
                <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_TYPE}`}><TypeBadge type="POS" /></td>
                  <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NAME}`}>{pos.name}</td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SCOPE}`}><OutletScope outlets={pos.outlets} /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SYNC_STATUS}`}><StatusSelect value={st.status} onChange={(v) => updateImpl(key, "status", v)} /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_OWNER}`}><OwnerTag owner="tv" /></td>
                  <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => updateImpl(key, "detail", v)} placeholder="Notes..." /></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Sync Tables */}
      <CollapsibleSection badge="Sync Tables" badgeColor="green" title="Sync Tables from Lab" progress={`${countSyncDone("tables")} / ${syncItems.length}`}>
        <SyncTable items={syncItems} prefix="sync-tbl" implStatus={implStatus} onUpdate={updateImpl}
          provisionJobs={provisionJobs} resourceType="tables" syncRequests={buildRequests("tables")} triggerSync={triggerSync} refetchJobs={refetchJobs} />
      </CollapsibleSection>

      {/* Sync Workflows */}
      <CollapsibleSection badge="Workflows" badgeColor="green" title="Sync Workflows" progress={`${countSyncDone("workflows")} / ${syncItems.length}`}>
        <SyncTable items={syncItems} prefix="sync-wf" implStatus={implStatus} onUpdate={updateImpl}
          provisionJobs={provisionJobs} resourceType="workflows" syncRequests={buildRequests("workflows")} triggerSync={triggerSync} refetchJobs={refetchJobs} />
      </CollapsibleSection>

      {/* Sync Dashboards */}
      <CollapsibleSection badge="Dashboards" badgeColor="green" title="Sync Dashboards" progress={`${countSyncDone("dashboards")} / ${syncItems.length}`}>
        <SyncTable items={syncItems} prefix="sync-dash" implStatus={implStatus} onUpdate={updateImpl}
          provisionJobs={provisionJobs} resourceType="dashboards" syncRequests={buildRequests("dashboards")} triggerSync={triggerSync} refetchJobs={refetchJobs} />
      </CollapsibleSection>
    </div>
  );
}

// ─── SyncTable — per-item row with Sync button and status ───

function SyncTable({ items, prefix, implStatus, onUpdate, provisionJobs, resourceType, syncRequests, triggerSync, refetchJobs }: {
  items: ReturnType<typeof getSyncItems>; prefix: string; implStatus: Record<string, ImplStatusEntry>;
  onUpdate: (key: string, field: keyof ImplStatusEntry, value: string) => void;
  provisionJobs?: { system_id: string | null; resource_type: string; status: string; completed_at: string | null }[] | null;
  resourceType?: "tables" | "workflows" | "dashboards";
  syncRequests?: ReturnType<typeof buildSyncRequestsFromScope>;
  triggerSync?: ReturnType<typeof useTriggerSync>;
  refetchJobs?: () => void;
}) {
  if (items.length === 0) return <Empty />;

  const getProvisionJob = (itemName: string) => {
    if (!provisionJobs || !resourceType) return null;
    return provisionJobs.find((j) =>
      j.resource_type === resourceType &&
      (j.system_id === itemName || (itemName === "Base" && j.system_id === "base"))
    ) || null;
  };

  const getProvisionStatus = (itemName: string): string | null => {
    return getProvisionJob(itemName)?.status || null;
  };

  const findSyncRequest = (itemName: string) => {
    if (!syncRequests) return null;
    return syncRequests.find((r) =>
      r.system_id === itemName || (itemName === "Base" && (!r.system_id || r.system_id === "base"))
    ) || null;
  };

  const handleSync = (req: ReturnType<typeof buildSyncRequestsFromScope>[number]) => {
    if (!triggerSync) return;
    triggerSync.mutateAsync(req).then(() => refetchJobs?.()).catch((e) => console.error("Sync failed:", e));
  };

  // `syncAll` drives both "Sync All" (only pending/error rows) and "Re-sync All"
  // (every row that's not currently in flight). Skip rows that are actively
  // syncing so we don't double-trigger.
  const runSyncAll = (includeDone: boolean) => {
    if (!syncRequests || !triggerSync) return;
    for (const req of syncRequests) {
      const sysId = req.system_id || "base";
      const status = getProvisionStatus(items.find((it) => findSyncRequest(it.name) === req)?.name || sysId);
      if (status === "syncing" || status === "queued") continue;
      if (!includeDone && status === "done") continue;
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
        <div className="flex justify-end mb-2 gap-2">
          <button
            onClick={() => runSyncAll(false)}
            disabled={!anySyncable}
            className="text-[10px] font-semibold px-2.5 py-1 rounded border-none cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
          >
            {allDone ? "All Synced" : "Sync All from Lab"}
          </button>
          {allDone && (
            <button
              onClick={() => runSyncAll(true)}
              title="Re-sync every row from Lab, including rows that are already Done"
              className="text-[10px] font-semibold px-2.5 py-1 rounded border-none cursor-pointer transition-all bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-blue-500"
            >
              Re-sync All
            </button>
          )}
        </div>
      )}
      <table className="w-full border-collapse">
        <THead cols={[
          { label: "#", className: COL_NUM },
          { label: "Type", className: COL_TYPE },
          { label: "Name", className: COL_NAME },
          { label: "Scope", className: COL_SCOPE },
          { label: "Setup Status", className: COL_SYNC_STATUS },
          { label: "Owner", className: COL_OWNER },
          { label: "Notes", className: COL_NOTES },
        ]} />
        <tbody>{items.map((item, i) => {
          const key = `${prefix}::${item.key}`;
          const st = getImplStatus(implStatus, key);
          const job = getProvisionJob(item.name);
          const provStatus = job?.status || null;
          const req = findSyncRequest(item.name);
          const canSync = Boolean(req) && (!provStatus || provStatus === "pending" || provStatus === "error");
          const canResync = Boolean(req) && provStatus === "done";
          return (
            <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
              <td className={`px-3 py-1.5 text-xs text-zinc-500 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NUM}`}>{i + 1}</td>
              <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_TYPE}`}><TypeBadge type={item.type} /></td>
              <td className={`px-3 py-1.5 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NAME}`}>{item.name}</td>
              <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SCOPE}`}><OutletScope outlets={item.outlets} /></td>
              <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_SYNC_STATUS}`}>
                <div className="flex items-center gap-1.5">
                  {provStatus ? (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PROV_STATUS_COLORS[provStatus] || PROV_STATUS_COLORS.pending}`}>
                      {PROV_STATUS_LABELS[provStatus] || provStatus}
                    </span>
                  ) : (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PROV_STATUS_COLORS.pending}`}>Pending</span>
                  )}
                  {provStatus === "done" && job?.completed_at && (
                    <span
                      className="text-[10px] text-zinc-400 dark:text-zinc-500"
                      title={formatDateTimeSGT(new Date(job.completed_at))}
                    >
                      {timeAgoVerbose(job.completed_at)}
                    </span>
                  )}
                  {canSync && req && (
                    <button
                      onClick={() => handleSync(req)}
                      className={`text-[10px] font-semibold cursor-pointer bg-transparent border-none ${provStatus === "error" ? "text-red-400 hover:text-red-300" : "text-blue-500 hover:text-blue-400"}`}
                    >
                      {provStatus === "error" ? "Retry" : "Sync"}
                    </button>
                  )}
                  {canResync && req && (
                    <button
                      onClick={() => handleSync(req)}
                      title="Re-sync from Lab"
                      className="text-[11px] text-zinc-400 hover:text-blue-500 bg-transparent border-none cursor-pointer"
                    >
                      ↻
                    </button>
                  )}
                </div>
              </td>
              <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_OWNER}`}><OwnerTag owner="tv" /></td>
              <td className={`px-3 py-1.5 border-b border-zinc-200/50 dark:border-zinc-800/50 ${COL_NOTES}`}><EditableInput value={st.detail} onChange={(v) => onUpdate(key, "detail", v)} placeholder="Notes..." /></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
