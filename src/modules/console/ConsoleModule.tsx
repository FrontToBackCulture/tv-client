// src/modules/console/ConsoleModule.tsx

import { Settings } from "lucide-react";

export function ConsoleModule() {
  return (
    <div className="h-full flex items-center justify-center bg-zinc-950">
      <div className="text-center">
        <Settings size={48} className="mx-auto mb-4 text-zinc-700" />
        <h2 className="text-xl font-semibold text-zinc-400">Console</h2>
        <p className="text-sm text-zinc-600 mt-2">
          Admin & terminal coming in Phase 8
        </p>
      </div>
    </div>
  );
}
