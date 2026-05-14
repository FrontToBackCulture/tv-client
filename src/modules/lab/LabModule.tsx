// src/modules/lab/LabModule.tsx
// Lab module — master/authoring view across all artifact types.
// Tabs: Skills (global registry) + Tables/Workflows/Queries/Dashboards
// (scoped to the `lab` domain, which is treated as the canonical authoring
// surface). The `lab` row stays in the Domains module too — Lab is an
// additional view on top of it, not a replacement.

import { useEffect } from "react";
import { Sparkles, Database, Search, Workflow } from "lucide-react";
import { BarChart3 } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useDiscoverDomains } from "../../hooks/val-sync";
import { usePrimaryKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { SkillsModule } from "../skills/SkillsModule";
import { UnifiedReviewView } from "../domains/UnifiedReviewView";
import type { ReviewResourceType } from "../domains/reviewTypes";

const LAB_DOMAIN = "lab";

type LabTab = "skills" | "tables" | "queries" | "workflows" | "dashboards";

const ARTIFACT_FOLDER: Record<Exclude<LabTab, "skills">, string> = {
  tables: "data_models",
  queries: "queries",
  workflows: "workflows",
  dashboards: "dashboards",
};

const ARTIFACT_RESOURCE_TYPE: Record<Exclude<LabTab, "skills">, ReviewResourceType> = {
  tables: "table",
  queries: "query",
  workflows: "workflow",
  dashboards: "dashboard",
};

const TAB_LABELS: Record<LabTab, string> = {
  skills: "Skills",
  tables: "Tables",
  queries: "Queries",
  workflows: "Workflows",
  dashboards: "Dashboards",
};

function getUrlParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

function setUrlParams(updates: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(updates)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const target = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState({}, "", target);
}

export function LabModule() {
  // Default to skills since that's the most-used surface.
  const [activeTab, setActiveTab] = usePersistedModuleView<LabTab>("lab", "skills");

  // Honour ?tab= deep links (e.g. legacy ?module=skills redirect).
  useEffect(() => {
    const fromUrl = getUrlParam("tab") as LabTab | null;
    if (fromUrl && ["skills", "tables", "queries", "workflows", "dashboards"].includes(fromUrl)) {
      if (fromUrl !== activeTab) setActiveTab(fromUrl);
    }
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the active tab into the URL so deep links survive reloads.
  useEffect(() => {
    setUrlParams({ tab: activeTab });
  }, [activeTab]);

  // Help-bot context.
  const setViewContext = useViewContextStore((s) => s.setView);
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    setViewContext("lab", "Lab");
    setViewDetail(`Lab — ${TAB_LABELS[activeTab]}`);
  }, [setViewContext, setViewDetail, activeTab]);

  // Resolve lab's filesystem path. Prefer the discovered global_path; fall
  // back to the conventional location under tv-knowledge.
  const paths = usePrimaryKnowledgePaths();
  const domainsPath = paths ? `${paths.platform}/domains` : null;
  const domainsQuery = useDiscoverDomains(domainsPath);
  const labGlobalPath = domainsQuery.data?.find((d) => d.domain === LAB_DOMAIN)?.global_path
    ?? (paths ? `${paths.platform}/domains/${LAB_DOMAIN}` : null);

  return (
    <div className="h-full flex flex-col">
      {/* Tab strip — mirrors DomainsModule layout */}
      <div className="flex-shrink-0 px-4 pt-3 pb-0 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-1">
        <ViewTab label="Skills" icon={Sparkles} active={activeTab === "skills"} onClick={() => setActiveTab("skills")} />
        <ViewTab label="Tables" icon={Database} active={activeTab === "tables"} onClick={() => setActiveTab("tables")} />
        <ViewTab label="Workflows" icon={Workflow} active={activeTab === "workflows"} onClick={() => setActiveTab("workflows")} />
        <ViewTab label="Queries" icon={Search} active={activeTab === "queries"} onClick={() => setActiveTab("queries")} />
        <ViewTab label="Dashboards" icon={BarChart3} active={activeTab === "dashboards"} onClick={() => setActiveTab("dashboards")} />
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "skills" ? (
          <SkillsModule />
        ) : (
          labGlobalPath && (
            <UnifiedReviewView
              key={activeTab}
              resourceType={ARTIFACT_RESOURCE_TYPE[activeTab]}
              folderPath={`${labGlobalPath}/${ARTIFACT_FOLDER[activeTab]}`}
              domainName={LAB_DOMAIN}
              masterDomain={LAB_DOMAIN}
            />
          )
        )}
      </div>
    </div>
  );
}
