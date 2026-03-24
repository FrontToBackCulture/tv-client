// LinkedIn Command Center - Compose, Feed, Analytics

import { useState } from "react";
import { PenSquare, LayoutList, BarChart3, LucideIcon } from "lucide-react";
import { useLinkedInAuth } from "../../hooks/useLinkedIn";
import { LinkedInSetup } from "./LinkedInSetup";
import { ComposeView } from "./ComposeView";
import { FeedView } from "./FeedView";

type Tab = "compose" | "feed" | "analytics";

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "compose", label: "Compose", icon: PenSquare },
  { id: "feed", label: "Feed", icon: LayoutList },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

export function LinkedInModule() {
  const { data: auth, isLoading } = useLinkedInAuth();
  const [activeTab, setActiveTab] = useState<Tab>("compose");

  // Not authenticated — show setup
  if (!isLoading && !auth?.isAuthenticated) {
    return <LinkedInSetup />;
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                isActive
                  ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}

        {auth?.userName && (
          <div className="ml-auto text-xs text-zinc-400">
            {auth.userName}
          </div>
        )}
      </div>

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
