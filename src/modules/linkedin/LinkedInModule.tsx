// LinkedIn Command Center - Compose, Feed, Analytics

import { useState } from "react";
import { PenSquare, LayoutList, BarChart3 } from "lucide-react";
import { useLinkedInAuth } from "../../hooks/useLinkedIn";
import { PageHeader } from "../../components/PageHeader";
import { ViewTab } from "../../components/ViewTab";
import { LinkedInSetup } from "./LinkedInSetup";
import { ComposeView } from "./ComposeView";
import { FeedView } from "./FeedView";

type Tab = "compose" | "feed" | "analytics";

export function LinkedInModule() {
  const { data: auth, isLoading } = useLinkedInAuth();
  const [activeTab, setActiveTab] = useState<Tab>("compose");

  // Not authenticated — show setup
  if (!isLoading && !auth?.isAuthenticated) {
    return <LinkedInSetup />;
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      <PageHeader
        description="Compose posts, browse your feed, and track analytics."
        tabs={<>
          <ViewTab icon={PenSquare} label="Compose" active={activeTab === "compose"} onClick={() => setActiveTab("compose")} />
          <ViewTab icon={LayoutList} label="Feed" active={activeTab === "feed"} onClick={() => setActiveTab("feed")} />
          <ViewTab icon={BarChart3} label="Analytics" active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} />
        </>}
        actions={auth?.userName ? (
          <span className="text-xs text-zinc-400">{auth.userName}</span>
        ) : undefined}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "compose" && <ComposeView />}
        {activeTab === "feed" && <FeedView />}
        {activeTab === "analytics" && <AnalyticsPlaceholder />}
      </div>
    </div>
  );
}

function AnalyticsPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center text-zinc-400">
        <BarChart3 size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium mb-1">Analytics</p>
        <p className="text-sm">Post performance tracking coming soon.</p>
      </div>
    </div>
  );
}
