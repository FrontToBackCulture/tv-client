// src/modules/work/WorkModule.tsx

import { CheckSquare } from "lucide-react";

export function WorkModule() {
  return (
    <div className="h-full flex items-center justify-center bg-zinc-950">
      <div className="text-center">
        <CheckSquare size={48} className="mx-auto mb-4 text-zinc-700" />
        <h2 className="text-xl font-semibold text-zinc-400">Work</h2>
        <p className="text-sm text-zinc-600 mt-2">
          Tasks & projects coming in Phase 5
        </p>
      </div>
    </div>
  );
}
