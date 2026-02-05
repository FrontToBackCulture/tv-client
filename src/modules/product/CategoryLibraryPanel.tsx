// src/modules/product/CategoryLibraryPanel.tsx
// Panel showing the library of classification values for data models

import { useState } from "react";
import { Database, Tag, Folder, Activity, CheckCircle } from "lucide-react";
import { cn } from "../../lib/cn";

// Standard classification values used across data models
// These match the dropdown values in DataModelsAgGrid
const CLASSIFICATION_VALUES = {
  // Data Category - the business domain/entity type
  category: [
    "Mapping",
    "Master List",
    "Transaction",
    "Report",
    "Staging",
    "Archive",
    "System",
    "GL",
    "AP",
    "AR",
    "Receipt",
    "Payment",
    "Fee",
    "Tax",
    "Product",
    "Stock",
    "Order",
    "Delivery",
    "Customer",
    "Employee",
    "Other",
  ],
  // Data Sub Category - more specific classification within category
  subCategory: [
    "Outlet",
    "Brand",
    "Platform",
    "Fulfilment Type",
    "Other",
  ],
  // Tags - descriptive labels for the table
  tags: [
    "Mapping",
    "Outlet",
    "Brand",
    "Platform",
    "Manual Upload",
    "Outlet Mapping",
    "GL Entry",
    "Journal",
    "In Use",
    "Receipt",
    "Transaction",
    "POS",
    "Delivery",
    "Payment",
    "Refund",
    "Settlement",
    "Commission",
    "Fee",
    "Tax",
    "Master Data",
    "Configuration",
    "Historical",
    "Archive",
  ],
  // Data Source - where the data comes from
  dataSource: [
    "POS",
    "ERP",
    "Bank",
    "Manual Upload",
    "API",
    "File Import",
    "System Generated",
    "Unknown",
  ],
  // Data Type - the nature/behavior of the data
  dataType: [
    "Static",
    "Historical",
    "Transactional",
    "Mapping",
    "Configuration",
    "Report",
    "Staging",
  ],
  // Usage Status
  usageStatus: ["In Use", "Not Used", "Historically Used", "I Dunno"],
  // Review Action
  action: ["None", "To Review", "To Delete", "Approved"],
};

type TabType = "category" | "sub-category" | "tags" | "source" | "data-type" | "status" | "action";

export function CategoryLibraryPanel() {
  const [activeTab, setActiveTab] = useState<TabType>("category");

  const tabs: { id: TabType; label: string; icon: typeof Tag; values: string[] }[] = [
    { id: "category", label: "Category", icon: Folder, values: CLASSIFICATION_VALUES.category },
    { id: "sub-category", label: "Sub Category", icon: Tag, values: CLASSIFICATION_VALUES.subCategory },
    { id: "tags", label: "Tags", icon: Tag, values: CLASSIFICATION_VALUES.tags },
    { id: "source", label: "Data Source", icon: Activity, values: CLASSIFICATION_VALUES.dataSource },
    { id: "data-type", label: "Data Type", icon: Database, values: CLASSIFICATION_VALUES.dataType },
    { id: "status", label: "Usage Status", icon: CheckCircle, values: CLASSIFICATION_VALUES.usageStatus },
    { id: "action", label: "Action", icon: CheckCircle, values: CLASSIFICATION_VALUES.action },
  ];

  const activeTabData = tabs.find(t => t.id === activeTab);
  const activeValues = activeTabData?.values || [];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Category Library
        </h2>
        <p className="text-sm text-zinc-500">
          Classification values for data model tables
        </p>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-800 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
                isActive
                  ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
              )}
            >
              <Icon size={12} />
              {tab.label}
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] rounded-full",
                isActive
                  ? "bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200"
                  : "bg-slate-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
              )}>
                {tab.values.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {activeValues.map((value, i) => (
            <div
              key={i}
              className="px-3 py-2 bg-slate-50 dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800"
            >
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-zinc-800 text-xs text-zinc-500">
        These values are used as dropdown options when classifying data models
      </div>
    </div>
  );
}
