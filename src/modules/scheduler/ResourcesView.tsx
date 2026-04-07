// Resources tab — manage reusable node configurations across automations

import { Clock, Database, Puzzle, Zap, Brain, Send } from "lucide-react";
import { useCustomDataSources, useTriggerPresets, useInstructionTemplates, useOutputConfigs } from "@/hooks/scheduler";
import { ResourceSection } from "./resources/ResourceSection";
import { TriggerPresetsSection } from "./resources/TriggerPresetsSection";
import { DataSourcesSection } from "./resources/DataSourcesSection";
import { ActionTemplatesSection } from "./resources/ActionTemplatesSection";
import { InstructionTemplatesSection } from "./resources/InstructionTemplatesSection";
import { OutputConfigsSection } from "./resources/OutputConfigsSection";

export function ResourcesView() {
  const { data: customSources = [] } = useCustomDataSources();
  const { data: triggerPresets = [] } = useTriggerPresets();
  const { data: instructionTemplates = [] } = useInstructionTemplates();
  const { data: outputConfigs = [] } = useOutputConfigs();

  return (
    <div className="flex-1 overflow-y-auto relative">
      <ResourceSection
        title="Triggers"
        icon={Clock}
        iconColor="text-blue-500"
        description="Schedule when automations run — cron presets, active hours, or manual-only triggers."
        count={triggerPresets.length}
        defaultOpen
      >
        <TriggerPresetsSection />
      </ResourceSection>

      <ResourceSection
        title="Data Sources"
        icon={Database}
        iconColor="text-blue-500"
        description="Built-in and custom SQL data sources that feed context into automations."
        count={customSources.length}
        defaultOpen
      >
        <DataSourcesSection />
      </ResourceSection>

      <ResourceSection
        title="Skills"
        icon={Puzzle}
        iconColor="text-indigo-500"
        description="Claude skills that get loaded into the automation prompt for specialized tasks."
        count={0}
      >
        <div className="px-6 pb-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Skills are configured on each automation's Skills node. Browse available skills in the skill registry.
          </p>
        </div>
      </ResourceSection>

      <ResourceSection
        title="Actions"
        icon={Zap}
        iconColor="text-amber-500"
        description="Data operations — add, update, or delete records in Supabase tables without AI."
        count={0}
      >
        <ActionTemplatesSection />
      </ResourceSection>

      <ResourceSection
        title="Instructions"
        icon={Brain}
        iconColor="text-purple-500"
        description="Reusable AI instruction templates — model, system prompt, and personality presets."
        count={instructionTemplates.length}
      >
        <InstructionTemplatesSection />
      </ResourceSection>

      <ResourceSection
        title="Outputs"
        icon={Send}
        iconColor="text-teal-500"
        description="Where automation results get posted — threading mode, bot author, and title templates."
        count={outputConfigs.length}
      >
        <OutputConfigsSection />
      </ResourceSection>
    </div>
  );
}
