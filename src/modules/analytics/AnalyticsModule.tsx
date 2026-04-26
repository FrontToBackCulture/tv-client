// Analytics module — GA4 platform + website usage analytics
// Primary use case: identify unused pages/dashboards that can be safely removed

import { useEffect } from "react";
import { usePersistedModuleView } from "../../hooks/usePersistedModuleView";
import { BarChart3, Gauge, Globe } from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { PageHeader } from "../../components/PageHeader";
import { useViewContextStore } from "../../stores/viewContextStore";
import { usePlatformAnalytics, useWebsiteAnalytics } from "./useAnalytics";
import { AnalyticsOverview } from "./AnalyticsOverview";
import { AnalyticsTable } from "./AnalyticsTable";

type AnalyticsTab = "overview" | "platform" | "website";

export function AnalyticsModule() {
  const [activeTab, setActiveTab] = usePersistedModuleView<AnalyticsTab>("analytics", "overview");
  const platform = usePlatformAnalytics();
  const website = useWebsiteAnalytics();

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    const labels: Record<AnalyticsTab, string> = {
      overview: "Analytics Overview",
      platform: "VAL Platform Analytics",
      website: "Website Analytics",
    };
    setViewContext("analytics", labels[activeTab]);
  }, [activeTab, setViewContext]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        description="GA4 usage analytics — identify unused pages, dashboards, and content across platform and website."
        tabs={<>
          <ViewTab label="Overview" icon={Gauge} active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
          <ViewTab label="Platform" icon={BarChart3} active={activeTab === "platform"} onClick={() => setActiveTab("platform")} />
          <ViewTab label="Website" icon={Globe} active={activeTab === "website"} onClick={() => setActiveTab("website")} />
        </>}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "overview" && (
          <AnalyticsOverview platform={platform.data} website={website.data} isLoading={platform.isLoading || website.isLoading} />
        )}
        {activeTab === "platform" && (
          <AnalyticsTable pages={platform.data} isLoading={platform.isLoading} source="ga4" showDomain showUsers />
        )}
        {activeTab === "website" && (
          <AnalyticsTable pages={website.data} isLoading={website.isLoading} source="ga4-website" />
        )}
      </div>
    </div>
  );
}
