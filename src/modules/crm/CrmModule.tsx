// src/modules/crm/CrmModule.tsx

import { Building2 } from "lucide-react";

export function CrmModule() {
  return (
    <div className="h-full flex items-center justify-center bg-zinc-950">
      <div className="text-center">
        <Building2 size={48} className="mx-auto mb-4 text-zinc-700" />
        <h2 className="text-xl font-semibold text-zinc-400">CRM</h2>
        <p className="text-sm text-zinc-600 mt-2">
          Companies, contacts, deals coming in Phase 6
        </p>
      </div>
    </div>
  );
}
