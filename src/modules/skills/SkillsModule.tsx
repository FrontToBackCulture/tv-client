// src/modules/skills/SkillsModule.tsx
// Main entry — central skill registry module

import { AlertCircle, Download } from "lucide-react";
import {
  useSkillRegistry,
  useSkillCheckAll,
  useSkillInit,
} from "./useSkillRegistry";
import { SkillCatalogView } from "./SkillCatalogView";
import { Button } from "../../components/ui";
import { DetailLoading } from "../../components/ui/DetailStates";

export function SkillsModule() {
  const { data: registry, isLoading, error } = useSkillRegistry();
  const { data: driftStatuses = [] } = useSkillCheckAll();
  const init = useSkillInit();

  const handleInit = async () => {
    await init.mutateAsync();
  };

  // Loading state
  if (isLoading) {
    return <DetailLoading />;
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
          <Button
            onClick={handleInit}
            loading={init.isPending}
            icon={Download}
            size="md"
          >
            Initialize Registry
          </Button>
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
