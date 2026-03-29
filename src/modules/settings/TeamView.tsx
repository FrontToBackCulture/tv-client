// src/modules/settings/TeamView.tsx
// Settings view for team management — admin only

import { useState } from "react";
import { useTeamConfigStore, TeamMember } from "../../stores/teamConfigStore";
import type { ModuleId } from "../../stores/appStore";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useTeams, useAddTeamMember, useRemoveTeamMember, useCreateTeam, useDeleteTeam } from "../../hooks/work/useTeams";
import { useUsers } from "../../hooks/work/useUsers";
import { toast } from "../../stores/toastStore";
import { supabase } from "../../lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { workKeys } from "../../hooks/work/keys";
import { invoke } from "@tauri-apps/api/core";

interface ModuleInfo {
  id: ModuleId;
  label: string;
  description: string;
}

const allModules: ModuleInfo[] = [
  { id: "library", label: "Library", description: "Knowledge base content and documents" },
  { id: "projects", label: "Projects", description: "Tasks, CRM, workspaces — unified project hub" },
  { id: "domains", label: "Domains", description: "VAL client domains and data" },
  { id: "analytics", label: "Analytics", description: "GA4 usage analytics for platform and website" },
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

function MemberIdentity({ login }: { login: string }) {
  const { data: users = [] } = useUsers("human");
  const qc = useQueryClient();

  // Find user by github_username or microsoft_email
  const user = users.find(u => u.github_username === login || u.microsoft_email === login);
  const [msEmail, setMsEmail] = useState(user?.microsoft_email || "");
  const [msId, setMsId] = useState(user?.microsoft_id || "");
  const [displayName, setDisplayName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  if (!user) return null;

  const handleLookup = async () => {
    if (!msEmail.trim()) { toast.error("Enter an email first"); return; }
    setLookingUp(true);
    try {
      const result = await invoke<{ microsoftId: string; displayName: string; email: string }>("outlook_lookup_user", { email: msEmail.trim() });
      setMsId(result.microsoftId);
      if (result.email && result.email !== msEmail) setMsEmail(result.email);
      toast.success(`Found: ${result.displayName} (${result.microsoftId.slice(0, 8)}...)`);
    } catch (err: any) {
      toast.error(`Lookup failed: ${err?.message || err}`);
    } finally {
      setLookingUp(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const updates: Record<string, string | null> = {};
    if (msEmail !== (user.microsoft_email || "")) updates.microsoft_email = msEmail || null;
    if (msId !== (user.microsoft_id || "")) updates.microsoft_id = msId || null;
    if (displayName !== (user.name || "")) updates.name = displayName;
    if (Object.keys(updates).length === 0) { setSaving(false); return; }
    const { error } = await supabase.from("users").update(updates).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: workKeys.users() });
  };

  const hasChanges = msEmail !== (user.microsoft_email || "") || msId !== (user.microsoft_id || "") || displayName !== (user.name || "");

  return (
    <div className="mt-3 pl-10 mb-2 space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium">Identity</div>
      <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-3 items-center">
        <span className="text-xs text-zinc-500">Display Name</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="text-xs px-2 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none border border-transparent focus:border-teal-500"
          placeholder="Display name..."
        />
        <span className="text-xs text-zinc-500">GitHub</span>
        <span className="text-xs text-zinc-400 px-2 py-1.5">{user.github_username || "—"}</span>
        <span className="text-xs text-zinc-500">MS Email</span>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={msEmail}
            onChange={(e) => setMsEmail(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none border border-transparent focus:border-teal-500"
            placeholder="name@company.com"
          />
          <button
            onClick={handleLookup}
            disabled={lookingUp || !msEmail.trim()}
            className="text-[10px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {lookingUp ? "Looking up..." : "Lookup"}
          </button>
        </div>
        <span className="text-xs text-zinc-500">MS ID</span>
        <span className="text-xs text-zinc-400 px-2 py-1.5 font-mono">
          {msId ? `${msId.slice(0, 8)}...${msId.slice(-4)}` : "—"}
        </span>
      </div>
      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-3 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}
    </div>
  );
}

function TeamsSection() {
  const { data: teams = [], isLoading } = useTeams();
  const { data: users = [] } = useUsers("human");
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) return;
    const slug = newTeamName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    createTeam.mutate({ name: newTeamName.trim(), slug }, {
      onSuccess: () => { setNewTeamName(""); setShowNewTeam(false); toast.success("Team created"); },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    });
  };

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Teams</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {teams.length} team{teams.length !== 1 ? "s" : ""} — group members for filtering tasks and views.
          </p>
        </div>
        <button
          onClick={() => setShowNewTeam(!showNewTeam)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
        >
          <Plus size={12} /> New Team
        </button>
      </div>

      {showNewTeam && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
            placeholder="Team name..."
            className="flex-1 text-sm bg-transparent outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
            autoFocus
          />
          <button onClick={handleCreateTeam} className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700">Create</button>
          <button onClick={() => { setShowNewTeam(false); setNewTeamName(""); }} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
        </div>
      )}

      <div className="space-y-1">
        {teams.map((team) => {
          const isExpanded = expandedTeamId === team.id;
          const memberUserIds = new Set(team.members.map(m => m.user_id));
          const memberUsers = users.filter(u => memberUserIds.has(u.id));
          const nonMembers = users.filter(u => !memberUserIds.has(u.id));

          return (
            <div key={team.id}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{team.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-medium">
                      {team.members.length} member{team.members.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {team.description && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{team.description}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteTeam.mutate(team.id, { onSuccess: () => toast.success("Team deleted") })}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-300 hover:text-red-500 transition-colors"
                  title="Delete team"
                >
                  <X size={14} />
                </button>
                <button
                  onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500"
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>

              {isExpanded && (
                <div className="ml-9 mt-1 space-y-1">
                  {/* Current members */}
                  {memberUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                        {(u.name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1">{u.name}</span>
                      <button
                        onClick={() => removeMember.mutate({ teamId: team.id, userId: u.id })}
                        className="text-[10px] px-1.5 py-0.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {/* Add member dropdown */}
                  {nonMembers.length > 0 && (
                    <div className="pt-1">
                      <select
                        className="w-full text-xs px-3 py-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-none outline-none cursor-pointer"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            addMember.mutate({ teamId: team.id, userId: e.target.value });
                          }
                        }}
                      >
                        <option value="">+ Add member...</option>
                        {nonMembers.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TeamView() {
  const members = useTeamConfigStore((s) => s.getAllMembers());
  const [expandedLogin, setExpandedLogin] = useState<string | null>(null);

  const memberEntries = Object.entries(members);

  return (
    <div className="space-y-6">
      <TeamsSection />

      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Members
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
                <>
                  <MemberIdentity login={login} />
                  <MemberModuleToggles login={login} member={member} />
                </>
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
