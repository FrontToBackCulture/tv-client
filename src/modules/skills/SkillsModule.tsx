// src/modules/skills/SkillsModule.tsx
// Main entry — central skill registry module

import { Loader2, AlertCircle, Download } from "lucide-react";
import {
  useSkillRegistry,
  useSkillCheckAll,
  useSkillInit,
} from "./useSkillRegistry";
import { SkillCatalogView } from "./SkillCatalogView";

export function SkillsModule() {
  const { data: registry, isLoading, error } = useSkillRegistry();
  const { data: driftStatuses = [] } = useSkillCheckAll();
  const init = useSkillInit();

  const handleInit = async () => {
    await init.mutateAsync();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="text-center">
          <Loader2 size={24} className="mx-auto mb-2 text-teal-600 animate-spin" />
          <p className="text-xs text-zinc-500">Loading skill registry...</p>
        </div>
      </div>
    );
  }

  // Error / not initialized — show init button
  if (error || !registry) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="text-center max-w-sm">
          <AlertCircle size={24} className="mx-auto mb-2 text-zinc-400" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
            Skill registry not found
          </p>
          <p className="text-xs text-zinc-400 mb-4">
            Initialize the registry to import all bot and platform skills into the central <code className="font-mono">_skills/</code> folder.
          </p>
          <button
            onClick={handleInit}
            disabled={init.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            {init.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Initialize Registry
          </button>
          {init.isSuccess && init.data && (
            <p className="mt-3 text-xs text-emerald-600">
              Created {init.data.skills_created} skills ({init.data.bot_skills} bot, {init.data.platform_skills} platform)
              {init.data.errors.length > 0 && ` with ${init.data.errors.length} errors`}
            </p>
          )}
          {init.isError && (
            <p className="mt-3 text-xs text-red-500">
              {(init.error as Error)?.message || "Failed to initialize"}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-zinc-950">
      <SkillCatalogView
        registry={registry}
        driftStatuses={driftStatuses}
        onInit={handleInit}
        isIniting={init.isPending}
      />
    </div>
  );
}
