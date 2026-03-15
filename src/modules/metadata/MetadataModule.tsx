// Metadata Module — top-level module for managing operational data
// Companies, Contacts, Initiatives, Labels, Users, Lookup Values

import { MetadataView } from "../projects/MetadataView";

export function MetadataModule() {
  return (
    <div className="h-full bg-white dark:bg-zinc-950">
      <MetadataView />
    </div>
  );
}
