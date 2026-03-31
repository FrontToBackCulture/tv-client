// Compact entity context chip — navigates to the linked entity on click

import { Building2, CheckSquare, FolderOpen, Briefcase, FileText, Globe, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleId } from "../../stores/appStore";
import { useModuleTabStore } from "../../stores/moduleTabStore";
import { useNotificationNavStore } from "../../stores/notificationNavStore";

const entityConfig: Record<string, { icon: LucideIcon; label: string; accent: string; bg: string; module: ModuleId }> = {
  crm_company: { icon: Building2,  label: "Company",  accent: "text-[var(--color-info)]",    bg: "bg-[var(--color-info-light)]",    module: "projects" },
  crm_deal:    { icon: Briefcase,  label: "Deal",     accent: "text-[var(--color-success)]", bg: "bg-[var(--color-success-light)]", module: "projects" },
  task:        { icon: CheckSquare, label: "Task",     accent: "text-[var(--color-warning)]", bg: "bg-[var(--color-warning-light)]", module: "projects" },
  project:     { icon: FolderOpen,  label: "Project",  accent: "text-[var(--color-purple)]",  bg: "bg-[var(--color-purple-light)]",  module: "projects" },
  file:        { icon: FileText,    label: "File",     accent: "text-[var(--text-secondary)]", bg: "bg-[var(--bg-muted)]",           module: "library" },
  domain:      { icon: Globe,       label: "Domain",   accent: "text-[var(--color-teal)]",    bg: "bg-[var(--color-teal-light)]",    module: "domains" },
  campaign:    { icon: Mail,        label: "Campaign", accent: "text-[var(--color-magenta)]", bg: "bg-[var(--color-magenta-light)]", module: "email" },
};

interface ChatEntityCardProps {
  entityType: string;
  entityId: string;
  entityLabel?: string;
}

export function ChatEntityCard({ entityType, entityId, entityLabel }: ChatEntityCardProps) {
  const config = entityConfig[entityType];
  if (!config) return null;

  const Icon = config.icon;
  const openTab = useModuleTabStore((s) => s.openTab);
  const setNavTarget = useNotificationNavStore((s) => s.setTarget);

  function handleNavigate() {
    setNavTarget(entityType, entityId, false);
    openTab(config.module);
  }

  return (
    <button
      onClick={handleNavigate}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${config.accent} ${config.bg} hover:opacity-75 transition-opacity duration-150`}
      title={`Open ${config.label}`}
    >
      <Icon size={11} />
      <span>{entityLabel || `${config.label}`}</span>
    </button>
  );
}
