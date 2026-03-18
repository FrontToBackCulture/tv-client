// src/modules/domains/DomainsModule.tsx
// Domains module — two-level navigation: All Domains (tabbed) → Single Domain detail

import { useState, useCallback, useEffect } from "react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import {
  ArrowLeft,
  ChevronRight,
  Globe,
  HardDrive,
  FileText,
  Database,
  Search,
  BarChart3,
  Workflow,
} from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";
import { useDiscoverDomains } from "../../hooks/val-sync";
import { useKnowledgePaths } from "../../hooks/useKnowledgePaths";
import { UnifiedReviewView } from "./UnifiedReviewView";
import type { ReviewResourceType } from "./reviewTypes";
import { DomainsOverview } from "./DomainsOverview";
import { DomainDetailPanel } from "./DomainDetailPanel";
import { DriveTabView } from "./DriveTabView";
import { CrossDomainReportsView } from "./CrossDomainReportsView";

type Level1Tab = "overview" | "data-models" | "queries" | "workflows" | "dashboards" | "drive" | "reports";
type ReviewType = "data-models" | "queries" | "dashboards" | "workflows";

export function DomainsModule() {
  // Two-level navigation state
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [activeTab, setActiveTab] = usePersistedModuleView<Level1Tab>("domains", "overview");

  // Handle notification navigation
  const navTarget = useNotificationNavStore((s) => s.target);
  const clearNavTarget = useNotificationNavStore((s) => s.clearTarget);
  useEffect(() => {
    if (navTarget && (navTarget.entityType === "domain" || navTarget.entityType === "domain_artifact")) {
      setSelectedDomain(navTarget.entityId);
      clearNavTarget();
    }
  }, [navTarget, clearNavTarget]);

  // Report view context for help bot
  const setViewContext = useViewContextStore((s) => s.setView);
  const setViewDetail = useViewContextStore((s) => s.setDetail);
  useEffect(() => {
    setViewContext("domains", "Domains");
    if (!selectedDomain) {
      const tabLabels: Record<Level1Tab, string> = {
        overview: "All Domains",
        "data-models": "Data Models (cross-domain)",
        queries: "Queries (cross-domain)",
        workflows: "Workflows (cross-domain)",
        dashboards: "Dashboards (cross-domain)",
        drive: "Drive (cross-domain)",
        reports: "Reports (cross-domain)",
      };
      setViewDetail(tabLabels[activeTab]);
    }
  }, [setViewContext, setViewDetail, selectedDomain, activeTab]);

  // Review escape hatch (full-screen review for a specific domain's artifacts)
  const [reviewingDomain, setReviewingDomain] = useState<string | null>(null);
  const [reviewType, setReviewType] = useState<ReviewType>("data-models");

  // Report review mode context for help bot
  useEffect(() => {
    if (reviewingDomain) {
      const reviewLabels: Record<ReviewType, string> = {
        "data-models": "Data Models",
        queries: "Queries",
        workflows: "Workflows",
        dashboards: "Dashboards",
      };
      setViewContext("domains", "Domains");
      setViewDetail(`${reviewingDomain} → ${reviewLabels[reviewType]} Review Mode`);
    }
  }, [reviewingDomain, reviewType, setViewContext, setViewDetail]);

  // Domain discovery (for review escape hatch path resolution + Level 2)
  const paths = useKnowledgePaths();
  const domainsPath = paths ? `${paths.platform}/domains` : null;
  const domainsQuery = useDiscoverDomains(domainsPath);

  // Find the discovered domain object for Level 2
  const discoveredDomain =
    domainsQuery.data?.find((d) => d.domain === selectedDomain) ?? null;

  // Navigation handlers
  const handleSelectDomain = useCallback((domain: string) => {
    setSelectedDomain(domain);
  }, []);

  const handleBackToOverview = useCallback(() => {
    setSelectedDomain(null);
  }, []);

  // Review handlers
  const handleReviewDataModels = useCallback((domain: string) => {
    setReviewType("data-models");
    setReviewingDomain(domain);
  }, []);
  const handleReviewQueries = useCallback((domain: string) => {
    setReviewType("queries");
    setReviewingDomain(domain);
  }, []);
  const handleReviewWorkflows = useCallback((domain: string) => {
    setReviewType("workflows");
    setReviewingDomain(domain);
  }, []);
  const handleReviewDashboards = useCallback((domain: string) => {
    setReviewType("dashboards");
    setReviewingDomain(domain);
  }, []);
  const handleExitReview = useCallback(() => {
    setReviewingDomain(null);
  }, []);

  // ── Full-screen Review (Level 3: review escape hatch) ──
  if (reviewingDomain) {
    const reviewDomain = domainsQuery.data?.find(
      (d) => d.domain === reviewingDomain
    );
    const basePath = reviewDomain
      ? reviewDomain.global_path
      : paths
        ? `${paths.platform}/domains/${reviewingDomain}`
        : null;

    const REVIEW_FOLDER: Record<ReviewType, string> = {
      "data-models": "data_models",
      queries: "queries",
      workflows: "workflows",
      dashboards: "dashboards",
    };

    const REVIEW_LABEL: Record<ReviewType, string> = {
      "data-models": "Data Models",
      queries: "Queries",
      workflows: "Workflows",
      dashboards: "Dashboards",
    };

    const REVIEW_RESOURCE_TYPE: Record<ReviewType, ReviewResourceType> = {
      "data-models": "table",
      queries: "query",
      workflows: "workflow",
      dashboards: "dashboard",
    };

    const folderPath = basePath
      ? `${basePath}/${REVIEW_FOLDER[reviewType]}`
      : null;

    return (
      <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleExitReview}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <ArrowLeft size={14} />
            Back to {reviewingDomain}
          </button>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {reviewingDomain} — {REVIEW_LABEL[reviewType]}
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          {folderPath && (
            <UnifiedReviewView
              resourceType={REVIEW_RESOURCE_TYPE[reviewType]}
              folderPath={folderPath}
              domainName={reviewingDomain}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Level 2: Single Domain ──
  if (selectedDomain && discoveredDomain) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
        {/* Breadcrumb */}
        <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center gap-1.5">
          <button
            onClick={handleBackToOverview}
            className="text-sm text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          >
            Domains
          </button>
          <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-600" />
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {selectedDomain}
          </span>
        </div>

        {/* Domain detail */}
        <div className="flex-1 overflow-hidden">
          <DomainDetailPanel
            id={selectedDomain}
            onClose={handleBackToOverview}
            onReviewDataModels={() => handleReviewDataModels(selectedDomain)}
            onReviewQueries={() => handleReviewQueries(selectedDomain)}
            onReviewWorkflows={() => handleReviewWorkflows(selectedDomain)}
            onReviewDashboards={() => handleReviewDashboards(selectedDomain)}
            discoveredDomain={discoveredDomain}
          />
        </div>
      </div>
    );
  }

  // ── Level 1: All Domains (tabbed) ──
  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Description */}
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <p className="text-xs text-zinc-400">
          {activeTab === "overview" ? "All connected VAL domains — sync data, manage credentials, and monitor sync status."
            : activeTab === "data-models" ? "Cross-domain view of all table schemas — compare, classify, and manage data models across domains."
            : activeTab === "queries" ? "Cross-domain view of all saved queries — review SQL, check dashboard usage, and manage portal visibility."
            : activeTab === "workflows" ? "Cross-domain view of all automation workflows — review triggers, actions, and execution status."
            : activeTab === "dashboards" ? "Cross-domain view of all dashboards — review widgets, linked queries, and portal visibility."
            : activeTab === "drive" ? "Browse VAL Drive folders across domains — view uploaded files and workflow file processing."
            : activeTab === "reports" ? "Generated reports across all domains — HTML reports, analysis outputs, and documentation."
            : ""}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center border-b border-zinc-100 dark:border-zinc-800/50 px-4">
        <ViewTab
          label="Overview"
          icon={Globe}
          active={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          data-help-id="domains-tab-overview"
        />
        <ViewTab
          label="Data Models"
          icon={Database}
          active={activeTab === "data-models"}
          onClick={() => setActiveTab("data-models")}
          data-help-id="domains-tab-data-models"
        />
        <ViewTab
          label="Queries"
          icon={Search}
          active={activeTab === "queries"}
          onClick={() => setActiveTab("queries")}
          data-help-id="domains-tab-queries"
        />
        <ViewTab
          label="Workflows"
          icon={Workflow}
          active={activeTab === "workflows"}
          onClick={() => setActiveTab("workflows")}
          data-help-id="domains-tab-workflows"
        />
        <ViewTab
          label="Dashboards"
          icon={BarChart3}
          active={activeTab === "dashboards"}
          onClick={() => setActiveTab("dashboards")}
          data-help-id="domains-tab-dashboards"
        />
        <ViewTab
          label="Drive"
          icon={HardDrive}
          active={activeTab === "drive"}
          onClick={() => setActiveTab("drive")}
          data-help-id="domains-tab-drive"
        />
        <ViewTab
          label="Reports"
          icon={FileText}
          active={activeTab === "reports"}
          onClick={() => setActiveTab("reports")}
          data-help-id="domains-tab-reports"
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === "overview" && (
          <DomainsOverview onSelectDomain={handleSelectDomain} />
        )}

        {activeTab === "data-models" && (
          <div className="flex-1 overflow-hidden">
            <UnifiedReviewView crossDomain resourceType="table" />
          </div>
        )}

        {activeTab === "queries" && (
          <div className="flex-1 overflow-hidden">
            <UnifiedReviewView crossDomain resourceType="query" />
          </div>
        )}

        {activeTab === "workflows" && (
          <div className="flex-1 overflow-hidden">
            <UnifiedReviewView crossDomain resourceType="workflow" />
          </div>
        )}

        {activeTab === "dashboards" && (
          <div className="flex-1 overflow-hidden">
            <UnifiedReviewView crossDomain resourceType="dashboard" />
          </div>
        )}

        {activeTab === "drive" && <DriveTabView />}

        {activeTab === "reports" && (
          <div className="flex-1 overflow-hidden">
            <CrossDomainReportsView />
          </div>
        )}
      </div>
    </div>
  );
}
