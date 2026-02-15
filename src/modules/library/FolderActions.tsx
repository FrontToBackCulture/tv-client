// src/modules/library/FolderActions.tsx
// Context-specific action buttons based on folder type

import {
  Bot,
  Mail,
  Building2,
  FileText,
  Layers,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { FolderType } from "../../lib/folderTypes";

export interface FolderActionHandlers {
  // Client actions
  onClientOverview?: () => void;
  onClientCards?: () => void;
  // Client root actions
  onSyncReport?: () => void;
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
            ? "text-teal-600/70 dark:text-teal-400/70 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-500/20"
            : "text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
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
