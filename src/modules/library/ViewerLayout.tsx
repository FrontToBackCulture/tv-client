// src/modules/library/ViewerLayout.tsx
// Shared layout component for consistent heading and tabs across domain viewers

import React from "react";
import { cn } from "../../lib/cn";

export interface ViewerTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface ViewerLayoutProps {
  title: string;
  subtitle?: string;
  tabs: ViewerTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function ViewerLayout({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  children,
  actions,
}: ViewerLayoutProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-zinc-800 bg-zinc-950">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
            {subtitle && (
              <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                activeTab === tab.id
                  ? "bg-teal-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "ml-1 px-1.5 py-0.5 text-xs rounded-full",
                    activeTab === tab.id
                      ? "bg-teal-500 text-white"
                      : "bg-zinc-700 text-zinc-400"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// Data Sources tab component - reusable across viewers
interface DataSource {
  name: string;
  path: string;
  description?: string;
  lastModified?: string;
  exists?: boolean;
}

interface DataSourcesTabProps {
  sources: DataSource[];
  basePath: string;
}

export function DataSourcesTab({ sources, basePath }: DataSourcesTabProps) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Sources List */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-200">Data Sources</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Files used to generate this report
            </p>
          </div>
          <div className="divide-y divide-zinc-800">
            {sources.map((source, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">
                      {source.name}
                    </p>
                    {source.description && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {source.description}
                      </p>
                    )}
                    <code className="text-xs text-zinc-400 font-mono mt-1 block truncate">
                      {source.path}
                    </code>
                  </div>
                  {source.lastModified && (
                    <span className="text-xs text-zinc-500 ml-4 flex-shrink-0">
                      {new Date(source.lastModified).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Base Path Info */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="text-xs text-zinc-500 mb-1">Base Path</div>
          <code className="text-xs text-zinc-400 font-mono bg-zinc-800 px-2 py-1 rounded block overflow-x-auto">
            {basePath}
          </code>
        </div>
      </div>
    </div>
  );
}
