// src/modules/library/FolderActions.tsx
// Context-specific action buttons based on folder type

import {
  BarChart3,
  GitBranch,
  Clock,
  Activity,
  TrendingUp,
  Layers,
  Bot,
  Mail,
  Building2,
  FileText,
  Sparkles,
  Database,
  Workflow,
  LayoutDashboard,
  Search,
  Calendar,
  Table,
  Eye,
  Code,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { FolderType } from "../../lib/folderTypes";

export interface FolderActionHandlers {
  // Domain actions
  onOverview?: () => void;
  onLineage?: () => void;
  onSchedule?: () => void;
  onHealth?: () => void;
  onUsage?: () => void;
  onClaudeMd?: () => void;
  // Domain root actions
  onSyncReport?: () => void;
  onAllSchedules?: () => void;
  onSODStatus?: () => void;
  // Data models actions
  onTablesList?: () => void;
  onTablesHealth?: () => void;
  // Individual table actions
  onTableDetails?: () => void;
  onTableSample?: () => void;
  onTableAnalysis?: () => void;
  // Workflows actions
  onWorkflowsList?: () => void;
  onWorkflowsHealth?: () => void;
  // Individual workflow actions
  onWorkflowDetails?: () => void;
  onWorkflowHistory?: () => void;
  // Dashboards actions
  onDashboardsList?: () => void;
  // Individual dashboard actions
  onDashboardPreview?: () => void;
  // Queries actions
  onQueriesList?: () => void;
  // Individual query actions
  onQueryDetails?: () => void;
  onQueryRun?: () => void;
  // Monitoring actions
  onMonitoringOverview?: () => void;
  // Analytics actions
  onAnalyticsOverview?: () => void;
  // Client actions
  onClientOverview?: () => void;
  onClientCards?: () => void;
  // Bot actions
  onBotTasks?: () => void;
  // Email actions
  onEmailOverview?: () => void;
  // Notion actions
  onNotionOverview?: () => void;
}

interface FolderActionsProps {
  folderType: FolderType;
  handlers: FolderActionHandlers;
  activeAction?: string;
}

interface ActionButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick?: () => void;
  isActive?: boolean;
}

function ActionButton({ icon, title, onClick, isActive }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "p-2 rounded-full transition-all duration-200",
        isActive
          ? "bg-teal-500 text-white shadow-sm"
          : onClick
            ? "text-teal-400/70 hover:text-teal-400 hover:bg-teal-500/20"
            : "text-zinc-600 cursor-not-allowed"
      )}
      title={title}
    >
      {icon}
    </button>
  );
}

export function FolderActions({ folderType, handlers, activeAction }: FolderActionsProps) {
  // Don't render if default folder type (no actions)
  if (folderType === "default") {
    return null;
  }

  const renderActions = () => {
    switch (folderType) {
      case "domain":
        return (
          <>
            <ActionButton
              icon={<BarChart3 size={16} />}
              title="Overview"
              onClick={handlers.onOverview}
              isActive={activeAction === "overview"}
            />
            <ActionButton
              icon={<GitBranch size={16} />}
              title="Lineage"
              onClick={handlers.onLineage}
              isActive={activeAction === "lineage"}
            />
            <ActionButton
              icon={<Clock size={16} />}
              title="Schedule"
              onClick={handlers.onSchedule}
              isActive={activeAction === "schedule"}
            />
            <ActionButton
              icon={<Activity size={16} />}
              title="Health"
              onClick={handlers.onHealth}
              isActive={activeAction === "health"}
            />
            <ActionButton
              icon={<TrendingUp size={16} />}
              title="Usage"
              onClick={handlers.onUsage}
              isActive={activeAction === "usage"}
            />
            <ActionButton
              icon={<Sparkles size={16} />}
              title="AI Config (CLAUDE.md)"
              onClick={handlers.onClaudeMd}
              isActive={activeAction === "claude-md"}
            />
          </>
        );

      case "domain-root":
        return (
          <>
            <ActionButton
              icon={<FileText size={16} />}
              title="Sync Report"
              onClick={handlers.onSyncReport}
              isActive={activeAction === "sync-report"}
            />
            <ActionButton
              icon={<Clock size={16} />}
              title="All Schedules"
              onClick={handlers.onAllSchedules}
              isActive={activeAction === "all-schedules"}
            />
            <ActionButton
              icon={<Database size={16} />}
              title="SOD Table Status"
              onClick={handlers.onSODStatus}
              isActive={activeAction === "sod-status"}
            />
          </>
        );

      case "data-models":
        return (
          <>
            <ActionButton
              icon={<Table size={16} />}
              title="Tables List"
              onClick={handlers.onTablesList}
              isActive={activeAction === "tables-list"}
            />
            <ActionButton
              icon={<Activity size={16} />}
              title="Tables Health"
              onClick={handlers.onTablesHealth}
              isActive={activeAction === "tables-health"}
            />
          </>
        );

      case "table":
        return (
          <>
            <ActionButton
              icon={<Eye size={16} />}
              title="Table Details"
              onClick={handlers.onTableDetails}
              isActive={activeAction === "table-details"}
            />
            <ActionButton
              icon={<Database size={16} />}
              title="Sample Data"
              onClick={handlers.onTableSample}
              isActive={activeAction === "table-sample"}
            />
            <ActionButton
              icon={<Sparkles size={16} />}
              title="AI Analysis"
              onClick={handlers.onTableAnalysis}
              isActive={activeAction === "table-analysis"}
            />
          </>
        );

      case "workflows-list":
        return (
          <>
            <ActionButton
              icon={<Workflow size={16} />}
              title="Workflows List"
              onClick={handlers.onWorkflowsList}
              isActive={activeAction === "workflows-list"}
            />
            <ActionButton
              icon={<Activity size={16} />}
              title="Workflows Health"
              onClick={handlers.onWorkflowsHealth}
              isActive={activeAction === "workflows-health"}
            />
          </>
        );

      case "workflow":
        return (
          <>
            <ActionButton
              icon={<Eye size={16} />}
              title="Workflow Details"
              onClick={handlers.onWorkflowDetails}
              isActive={activeAction === "workflow-details"}
            />
            <ActionButton
              icon={<Clock size={16} />}
              title="Execution History"
              onClick={handlers.onWorkflowHistory}
              isActive={activeAction === "workflow-history"}
            />
          </>
        );

      case "dashboards-list":
        return (
          <ActionButton
            icon={<LayoutDashboard size={16} />}
            title="Dashboards List"
            onClick={handlers.onDashboardsList}
            isActive={activeAction === "dashboards-list"}
          />
        );

      case "dashboard":
        return (
          <ActionButton
            icon={<Eye size={16} />}
            title="Dashboard Preview"
            onClick={handlers.onDashboardPreview}
            isActive={activeAction === "dashboard-preview"}
          />
        );

      case "queries-list":
        return (
          <ActionButton
            icon={<Search size={16} />}
            title="Queries List"
            onClick={handlers.onQueriesList}
            isActive={activeAction === "queries-list"}
          />
        );

      case "query":
        return (
          <>
            <ActionButton
              icon={<Eye size={16} />}
              title="Query Details"
              onClick={handlers.onQueryDetails}
              isActive={activeAction === "query-details"}
            />
            <ActionButton
              icon={<Code size={16} />}
              title="Run Query"
              onClick={handlers.onQueryRun}
              isActive={activeAction === "query-run"}
            />
          </>
        );

      case "monitoring":
        return (
          <ActionButton
            icon={<Calendar size={16} />}
            title="Monitoring Overview"
            onClick={handlers.onMonitoringOverview}
            isActive={activeAction === "monitoring-overview"}
          />
        );

      case "analytics":
        return (
          <ActionButton
            icon={<TrendingUp size={16} />}
            title="Analytics Overview"
            onClick={handlers.onAnalyticsOverview}
            isActive={activeAction === "analytics-overview"}
          />
        );

      case "client":
        return (
          <>
            <ActionButton
              icon={<Building2 size={16} />}
              title="Client Overview"
              onClick={handlers.onClientOverview}
              isActive={activeAction === "client-overview"}
            />
            <ActionButton
              icon={<FileText size={16} />}
              title="Cards"
              onClick={handlers.onClientCards}
              isActive={activeAction === "client-cards"}
            />
          </>
        );

      case "client-root":
        return (
          <ActionButton
            icon={<FileText size={16} />}
            title="Sync Report"
            onClick={handlers.onSyncReport}
            isActive={activeAction === "sync-report"}
          />
        );

      case "bot":
        return (
          <ActionButton
            icon={<Bot size={16} />}
            title="Bot Tasks"
            onClick={handlers.onBotTasks}
            isActive={activeAction === "bot-tasks"}
          />
        );

      case "email":
        return (
          <ActionButton
            icon={<Mail size={16} />}
            title="Email Overview"
            onClick={handlers.onEmailOverview}
            isActive={activeAction === "email-overview"}
          />
        );

      case "notion":
        return (
          <ActionButton
            icon={<Layers size={16} />}
            title="Notion Overview"
            onClick={handlers.onNotionOverview}
            isActive={activeAction === "notion-overview"}
          />
        );

      default:
        return null;
    }
  };

  const actions = renderActions();
  if (!actions) return null;

  return (
    <div className="inline-flex items-center gap-0.5 px-1.5 py-1 bg-teal-500/10 rounded-full border border-teal-500/20">
      {actions}
    </div>
  );
}
