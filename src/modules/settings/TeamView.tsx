// src/modules/settings/TeamView.tsx
// Settings view for team management — admin only

import { useState } from "react";
import { useTeamConfigStore, TeamMember } from "../../stores/teamConfigStore";
import type { ModuleId } from "../../stores/appStore";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ModuleInfo {
  id: ModuleId;
  label: string;
  description: string;
}

const allModules: ModuleInfo[] = [
  { id: "library", label: "Library", description: "Knowledge base content and documents" },
  { id: "projects", label: "Projects", description: "Tasks, CRM, workspaces — unified project hub" },
  { id: "domains", label: "Domains", description: "VAL client domains and data" },
  { id: "metadata", label: "Metadata", description: "Data dictionary and field metadata" },
  { id: "product", label: "Product", description: "Product documentation" },
  { id: "gallery", label: "Gallery", description: "Media gallery" },
  { id: "bot", label: "Bots", description: "Bot management" },
  { id: "skills", label: "Skills", description: "Skill registry, catalog, and prompt builder" },
  { id: "scheduler", label: "Scheduler", description: "Task scheduler" },
  { id: "repos", label: "Repos", description: "Repository management" },
  { id: "email", label: "EDM", description: "Email campaigns" },
  { id: "blog", label: "Blog", description: "Blog article management" },
  { id: "s3browser", label: "S3 Browser", description: "Browse and manage S3 buckets" },
  { id: "inbox", label: "Inbox", description: "Email inbox" },
  { id: "portal", label: "Portal", description: "Client portal management" },
];

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function MemberAvatar({ member }: { member: TeamMember }) {
  const [imgError, setImgError] = useState(false);

  if (member.avatarUrl && !imgError) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.name}
        className="w-8 h-8 rounded-full"
        onError={() => setImgError(true)}
      />
    );
  }

  const initials = (member.name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-600 dark:text-zinc-300">
      {initials}
    </div>
  );
}

const DEFAULT_VISIBLE_MODULES: ModuleId[] = ["home", "library", "projects", "domains", "skills"];

function MemberModuleToggles({
  login,
  member,
}: {
  login: string;
  member: TeamMember;
}) {
  const setMemberModules = useTeamConfigStore((s) => s.setMemberModules);

  // null means "use defaults"
  const effectiveModules = member.visibleModules ?? DEFAULT_VISIBLE_MODULES;

  const handleToggle = (moduleId: ModuleId) => {
    const updated = effectiveModules.includes(moduleId)
      ? effectiveModules.filter((id) => id !== moduleId)
      : [...effectiveModules, moduleId];
    setMemberModules(login, updated);
  };

  return (
    <div className="mt-3 pl-10 space-y-1">
      {allModules.map((mod) => {
        const visible = effectiveModules.includes(mod.id);
        return (
          <label
            key={mod.id}
            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {mod.label}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {mod.description}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={visible}
              onClick={() => handleToggle(mod.id)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ml-3 ${
                visible ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-600"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  visible ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        );
      })}
    </div>
  );
}

export function TeamView() {
  const members = useTeamConfigStore((s) => s.getAllMembers());
  const [expandedLogin, setExpandedLogin] = useState<string | null>(null);

  const memberEntries = Object.entries(members);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Team
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {memberEntries.length} member{memberEntries.length !== 1 ? "s" : ""} — manage module visibility per team member.
        </p>
      </div>

      <div className="space-y-1">
        {memberEntries.map(([login, member]) => {
          const isExpanded = expandedLogin === login;

          return (
            <div key={login}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <MemberAvatar member={member} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {member.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      member.role === "admin"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}>
                      {member.role}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {member.email || login}
                  </div>
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                  {formatRelativeTime(member.lastSeen)}
                </div>
                <button
                  onClick={() => setExpandedLogin(isExpanded ? null : login)}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500"
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>
              {isExpanded && (
                <MemberModuleToggles login={login} member={member} />
              )}
            </div>
          );
        })}

        {memberEntries.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 px-3 py-4">
            No team members registered yet. Members are added automatically when they sign in.
          </p>
        )}
      </div>
    </div>
  );
}
