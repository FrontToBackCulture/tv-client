// Trigger node config — reuses ScheduleSection directly

import { ScheduleSection } from "../../ScheduleSection";
import type { TriggerConfig } from "../types";

interface Props {
  config: TriggerConfig;
  onChange: (config: TriggerConfig) => void;
}

export function TriggerConfigPanel({ config, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Trigger Settings</h3>
      </div>
      <ScheduleSection
        cron={config.cron_expression ?? ""}
        onCronChange={(cron) => onChange({ ...config, cron_expression: cron || null })}
        activeHours={config.active_hours}
        onActiveHoursChange={(ah) => onChange({ ...config, active_hours: ah })}
      />
    </div>
  );
}
