import type { InstanceData, TemplateDefinition, StatusEntry } from "../../../lib/solutions/types";
import { getUniquePOS, getCredentialPlatforms, getOutletNames, getStatus, getCredentialPlatformOutlets, filterScope } from "./matrixHelpers";
import { CollapsibleSection, StatusSelect, OwnerTag, EditableInput } from "./matrixComponents";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
}

export default function MatrixConnectivityTab({ data, template, onChange, selectedEntity }: Props) {
  const scope = filterScope(data.scope || [], selectedEntity);
  const pms = data.paymentMethods || [];
  const posStatus = data.posStatus || {};
  const credStatus = data.credStatus || {};

  const posList = getUniquePOS(scope);
  const platforms = getCredentialPlatforms(pms, template);
  const outletNames = getOutletNames(scope);

  const updatePosStatus = (key: string, field: keyof StatusEntry, value: string) => {
    const st = getStatus(posStatus, key);
    onChange({ ...data, posStatus: { ...posStatus, [key]: { ...st, [field]: value } } });
  };

  const updateCredStatus = (key: string, field: keyof StatusEntry, value: string) => {
    const st = getStatus(credStatus, key);
    onChange({ ...data, credStatus: { ...credStatus, [key]: { ...st, [field]: value } } });
  };

  const posDone = posList.filter((p) => getStatus(posStatus, p.name).status === "done").length;
  const credDone = platforms.filter((p) => { const s = getStatus(credStatus, p).status; return s === "done" || s === "na"; }).length;

  return (
    <div className="space-y-8">
      {/* POS Connections */}
      <CollapsibleSection badge="POS" badgeColor="cyan" title="POS Connections" progress={`${posDone} / ${posList.length}`} description="One row per POS system. Set up the connection so data flows into VAL.">
        {posList.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">No POS systems defined in Scope.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">POS System</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">Outlets</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[100px]">Status</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[80px]">Owner</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              </tr>
            </thead>
            <tbody>
              {posList.map((pos, i) => {
                const st = getStatus(posStatus, pos.name);
                return (
                  <tr key={pos.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
                    <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{pos.name}</td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400">{pos.outlets.length} outlets</span>
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <StatusSelect value={st.status} onChange={(v) => updatePosStatus(pos.name, "status", v)} showNA={false} />
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="tv" /></td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <EditableInput value={st.detail} onChange={(v) => updatePosStatus(pos.name, "detail", v)} placeholder="Connection method, API details..." />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Platform Credentials */}
      <CollapsibleSection badge="Credentials" badgeColor="cyan" title="Platform Credentials" progress={`${credDone} / ${platforms.length}`} description="Credentials needed to activate robot downloaders.">
        {platforms.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-600 py-3">No delivery platforms in scope.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-8">#</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">Platform</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[15%]">Outlets</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[100px]">Status</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 w-[80px]">Owner</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">Notes</th>
              </tr>
            </thead>
            <tbody>
              {platforms.map((platform, i) => {
                const st = getStatus(credStatus, platform);
                const applicable = getCredentialPlatformOutlets(platform, pms, outletNames);
                return (
                  <tr key={platform} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-600 font-mono border-b border-zinc-200/50 dark:border-zinc-800/50">{i + 1}</td>
                    <td className="px-3 py-2 text-xs border-b border-zinc-200/50 dark:border-zinc-800/50">{platform}</td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400">{applicable.length} outlets</span>
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <StatusSelect value={st.status} onChange={(v) => updateCredStatus(platform, "status", v)} />
                    </td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50"><OwnerTag owner="client" /></td>
                    <td className="px-3 py-2 border-b border-zinc-200/50 dark:border-zinc-800/50">
                      <EditableInput value={st.detail} onChange={(v) => updateCredStatus(platform, "detail", v)} placeholder="Merchant login credentials..." />
                    </td>
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
