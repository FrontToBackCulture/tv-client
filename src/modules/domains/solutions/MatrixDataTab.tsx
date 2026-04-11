import type { InstanceData, TemplateDefinition } from "../../../lib/solutions/types";
import MatrixCollectionTab from "./MatrixCollectionTab";

interface Props {
  data: InstanceData;
  template: TemplateDefinition;
  onChange: (data: InstanceData) => void;
  selectedEntity: string | null;
  domain?: string;
  instanceId?: string;
  /** Jump to a top-level tab — used by the footer next-step CTA to advance to Load. */
  onNavigateTab?: (tabKey: string) => void;
}

/**
 * Data tab — now a flat wrapper over MatrixCollectionTab.
 * The old Mapping sub-tab was dissolved: Outlet Name Mapping moved to Load,
 * Bank Settlement Summary moved to Scope, and Payment Method Mapping was
 * decorative (nothing downstream read it) so it was removed.
 */
export default function MatrixDataTab(props: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <MatrixCollectionTab
          data={props.data}
          template={props.template}
          onChange={props.onChange}
          selectedEntity={props.selectedEntity}
          domain={props.domain}
        />

        {/* Next-step CTA — jumps to the top-level Load tab */}
        {props.onNavigateTab && (
          <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-500">
              Done collecting data?
            </span>
            <button
              onClick={() => props.onNavigateTab?.("load")}
              className="text-[11px] font-semibold px-3 py-1.5 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400 hover:bg-blue-500/20 cursor-pointer border-none inline-flex items-center gap-1.5"
            >
              Next: Load
              <span className="text-[10px]">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
